import type { z } from "zod";
import { TIMEOUT_MS, resolveModel } from "./config";
import { normaliseHandle, screenHandleWithStub } from "./handle-stub";
import { containsReplacementText, decideScreeningOutcome } from "./policy";
import { loadPrompt, type PromptKey } from "./prompts";
import type { AiProvider, AiTask } from "./providers/types";
import {
  JSON_SCHEMAS,
  coachSchema,
  dispatchScreenSchema,
  nudgeSchema,
  parseStrict,
  textScreenSchema,
  type CoachOutput,
  type DispatchScreenOutput,
  type NudgeOutput,
  type TextScreenOutput,
} from "./schemas";
import type { AiFeature, AiSettings, CallRecord, Unavailable } from "./types";
import { buildUserMessage } from "./untrusted";

// The AI features without any database or framework code, so they can be unit
// tested and run by the evaluation scripts. src/lib/ai/index.ts (server only)
// supplies the real dependencies: settings, caps and the usage log.

export type EngineDeps = {
  provider: AiProvider | null;
  settings: AiSettings;
  /** Reserves one call against the caps: "ok", or why not. */
  reserve: (feature: AiFeature, userId: string | null) => Promise<string>;
  /** Adds tokens to the spend log. */
  record: (feature: AiFeature, userId: string | null, inputTokens: number, outputTokens: number, failed: boolean) => Promise<void>;
  env?: Record<string, string | undefined>;
  /** Shorter limits for tests. */
  timeouts?: Partial<typeof TIMEOUT_MS>;
};

type CallOk<T> = { ok: true; value: T; record: CallRecord };
type CallFailed = { ok: false; why: Unavailable; record: CallRecord | null };

/**
 * One structured call: a hard time limit, one retry, JSON validated with zod.
 * Anything that does not validate is discarded, never partly used.
 */
export async function callStructured<T>(
  provider: AiProvider,
  opts: { task: AiTask; prompt: PromptKey; model: string; user: string; schema: z.ZodType<T>; timeoutMs: number; maxTokens: number; accept?: (value: T) => boolean },
): Promise<CallOk<T> | CallFailed> {
  const { text: system, version } = loadPrompt(opts.prompt);
  const record: CallRecord = { provider: provider.name, model: opts.model, promptVersion: version, inputTokens: 0, outputTokens: 0, latencyMs: 0 };
  let why: Unavailable = "error";
  const started = Date.now();

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timeout"));
      }, opts.timeoutMs);
    });
    try {
      const response = await Promise.race([
        provider.complete({
          task: opts.task,
          model: opts.model,
          system,
          user: opts.user,
          schema: JSON_SCHEMAS[opts.task === "screen_text" ? "screen_text" : opts.task],
          maxTokens: opts.maxTokens,
          signal: controller.signal,
        }),
        timeout,
      ]);
      record.inputTokens += response.inputTokens;
      record.outputTokens += response.outputTokens;
      const value = parseStrict(opts.schema, response.text);
      if (value !== null && (!opts.accept || opts.accept(value))) {
        record.latencyMs = Date.now() - started;
        return { ok: true, value, record };
      }
      why = "invalid_output";
    } catch (e) {
      why = e instanceof Error && e.message === "timeout" ? "timeout" : "error";
    } finally {
      clearTimeout(timer);
    }
  }
  record.latencyMs = Date.now() - started;
  return { ok: false, why, record };
}

/** Caps, kill switch and input length, then the call, then the spend log. */
async function guarded<T>(
  deps: EngineDeps,
  feature: AiFeature,
  userId: string | null,
  inputLength: number,
  run: (provider: AiProvider) => Promise<CallOk<T> | CallFailed>,
): Promise<CallOk<T> | CallFailed> {
  if (!deps.settings.ai_enabled) return { ok: false, why: "off", record: null };
  if (!deps.provider) return { ok: false, why: "no_provider", record: null };
  // Longer input is refused, never cut short (a cut could hide the abuse).
  if (inputLength > deps.settings.ai_input_max_chars) return { ok: false, why: "too_long", record: null };
  const reserved = await deps.reserve(feature, userId);
  if (reserved !== "ok") return { ok: false, why: (["off", "global_cap", "user_cap", "coach_cap"].includes(reserved) ? reserved : "error") as Unavailable, record: null };
  const result = await run(deps.provider);
  if (result.record) await deps.record(feature, userId, result.record.inputTokens, result.record.outputTokens, !result.ok);
  return result;
}

// ---------------------------------------------------------------------------
// Dispatch screening
// ---------------------------------------------------------------------------

export type DispatchInput = {
  body: string;
  aiUse: "none" | "assisted" | "generated";
  campaign: { title: string; category: string; isSensitive: boolean };
};

export type DispatchScreening =
  | {
      outcome: "allow" | "hold" | "block";
      reason: string;
      category: DispatchScreenOutput["category"];
      confidence: number;
      undeclaredAi: boolean;
      undeclaredAiReason: string;
      output: DispatchScreenOutput;
      record: CallRecord;
    }
  | { outcome: "unavailable"; why: Unavailable; record: CallRecord | null };

/**
 * Privacy: the model sees the Dispatch text and the Campaign's title and kind
 * only. Never names, emails, bios or IDs.
 */
export async function screenDispatchWith(deps: EngineDeps, input: DispatchInput, userId: string | null = null): Promise<DispatchScreening> {
  const model = resolveModel("screening", deps.settings, deps.env);
  const user = buildUserMessage(
    { "Campaign question": input.campaign.title, "Campaign kind": input.campaign.category.replace(/_/g, " "), "Sensitive topic": input.campaign.isSensitive ? "yes" : "no" },
    [{ label: "dispatch", text: input.body }],
  );
  // Screening is not capped per Strategist, so nobody can spend their own
  // allowance to post unscreened. It counts towards the global cap.
  void userId;
  const result = await guarded(deps, "screen_dispatch", null, input.body.length, (p) =>
    callStructured(p, { task: "screen_dispatch", prompt: "screen_dispatch", model, user, schema: dispatchScreenSchema, timeoutMs: deps.timeouts?.screening ?? TIMEOUT_MS.screening, maxTokens: 400 }),
  );
  if (!result.ok) return { outcome: "unavailable", why: result.why, record: result.record };
  const v = result.value;
  return {
    outcome: decideScreeningOutcome(v.category, v.confidence, input.campaign.isSensitive, deps.settings),
    reason: v.reason,
    category: v.category,
    confidence: Math.round(v.confidence * 100) / 100,
    // Rule 9: only meaningful when the author declared "none".
    undeclaredAi: input.aiUse === "none" && v.likely_ai_generated,
    undeclaredAiReason: v.ai_generated_reason,
    output: v,
    record: result.record,
  };
}

// ---------------------------------------------------------------------------
// Handles and profile wording
// ---------------------------------------------------------------------------

export type NameScreening =
  | { outcome: "allow" | "hold" | "block"; reason: string; category: string; confidence: number | null; output: Record<string, unknown>; record: CallRecord | null; provider: "denylist" | "anthropic" | "fake" }
  | { outcome: "unavailable"; why: Unavailable; record: CallRecord | null };

/**
 * The deny-list runs first (fast, free, catches look-alikes such as Adm1n);
 * anything it passes goes to the model. Any AI decision other than allow
 * waits for a person.
 */
export async function screenNameWith(deps: EngineDeps, kind: "handle" | "display_name" | "bio", text: string, userId: string | null): Promise<NameScreening> {
  if (kind === "handle") {
    const stub = screenHandleWithStub(text);
    if (stub.outcome !== "allow") {
      return { outcome: "block", reason: stub.reason, category: String(stub.output.category), confidence: null, output: stub.output, record: null, provider: "denylist" };
    }
  }
  const model = resolveModel("screening", deps.settings, deps.env);
  const label = kind === "handle" ? "Handle" : kind === "display_name" ? "Display name" : "Bio";
  const user = buildUserMessage({ "What this is": label }, [{ label: "name", text: kind === "handle" ? `${text} (read as: ${normaliseHandle(text)})` : text }]);
  const result = await guarded(deps, kind === "handle" ? "screen_handle" : "screen_profile", userId, text.length, (p) =>
    callStructured<TextScreenOutput>(p, { task: "screen_text", prompt: "screen_text", model, user, schema: textScreenSchema, timeoutMs: deps.timeouts?.screening ?? TIMEOUT_MS.screening, maxTokens: 300 }),
  );
  if (!result.ok) return { outcome: "unavailable", why: result.why, record: result.record };
  const v = result.value;
  const outcome = v.category === "none" || v.confidence < deps.settings.hold_threshold ? "allow" : "hold";
  return {
    outcome,
    reason: outcome === "allow" ? "No problems found." : v.reason,
    category: v.category,
    confidence: v.confidence,
    output: v,
    record: result.record,
    provider: deps.provider!.name,
  };
}

// ---------------------------------------------------------------------------
// Nudge (private, never blocks posting)
// ---------------------------------------------------------------------------

export type NudgeResult = { ok: true; nudge: string | null; output: NudgeOutput; record: CallRecord } | { ok: false; why: Unavailable; record: CallRecord | null };

export async function nudgeWith(deps: EngineDeps, draft: string, campaignTitle: string, userId: string | null): Promise<NudgeResult> {
  const model = resolveModel("nudge", deps.settings, deps.env);
  const user = buildUserMessage({ "Campaign question": campaignTitle }, [{ label: "draft", text: draft }]);
  const result = await guarded(deps, "nudge", userId, draft.length, (p) =>
    callStructured<NudgeOutput>(p, {
      task: "nudge",
      prompt: "nudge",
      model,
      user,
      schema: nudgeSchema,
      timeoutMs: deps.timeouts?.nudge ?? TIMEOUT_MS.nudge,
      maxTokens: 300,
      // A nudge must say something when it flags, and nothing when it does not.
      accept: (v) => (v.kind === "none") === (v.message.length === 0),
    }),
  );
  if (!result.ok) return result;
  return { ok: true, nudge: result.value.kind === "none" ? null : result.value.message, output: result.value, record: result.record };
}

// ---------------------------------------------------------------------------
// Coach (private feedback; asks questions, never writes replacement text)
// ---------------------------------------------------------------------------

export type CoachResult = { ok: true; feedback: CoachOutput; record: CallRecord } | { ok: false; why: Unavailable; record: CallRecord | null };

export async function coachWith(deps: EngineDeps, draft: string, campaign: { title: string; kind: string }, userId: string | null): Promise<CoachResult> {
  const model = resolveModel("coach", deps.settings, deps.env);
  const user = buildUserMessage({ "Campaign question": campaign.title, "Dispatch kind": campaign.kind }, [{ label: "draft", text: draft }]);
  const result = await guarded(deps, "coach", userId, draft.length, (p) =>
    callStructured<CoachOutput>(p, {
      task: "coach",
      prompt: "coach",
      model,
      user,
      schema: coachSchema,
      timeoutMs: deps.timeouts?.coach ?? TIMEOUT_MS.coach,
      maxTokens: 4000,
      accept: (v) => !containsReplacementText(v, draft),
    }),
  );
  if (!result.ok) return result;
  return { ok: true, feedback: result.value, record: result.record };
}
