import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { chooseProvider } from "./config";
import {
  coachWith,
  nudgeWith,
  screenDispatchWith,
  screenNameWith,
  type CoachResult,
  type DispatchInput,
  type DispatchScreening,
  type EngineDeps,
  type NameScreening,
} from "./engine";
import { createAnthropicProvider } from "./providers/anthropic";
import { fakeProvider } from "./providers/fake";
import type { AiProvider } from "./providers/types";
import { DEFAULT_AI_SETTINGS, type AiSettings, type CallRecord } from "./types";

export type { ScreeningResult } from "./types";
export type { DispatchScreening, NameScreening, CoachResult } from "./engine";

/**
 * The single entry point for AI features (CLAUDE.md: never call the AI API
 * from the browser, and keep it behind src/lib/ai). One function per feature:
 * screenHandle, screenDispatch, nudgeDispatch, coachDispatch (plus
 * screenProfileText for display names and bios when switched on).
 * Every call is stored in ai_decisions with its model, prompt version, output
 * and a plain-English reason (rule 6); Dispatch screening is stored by
 * apply_dispatch_screening() together with its effect.
 */

function provider(): AiProvider | null {
  const name = chooseProvider();
  if (name === "fake") return fakeProvider;
  if (name === "anthropic") return createAnthropicProvider(process.env.ANTHROPIC_API_KEY!);
  return null;
}

export async function getAiSettings(): Promise<AiSettings> {
  const { data } = await createAdminClient()
    .from("community_settings")
    .select(Object.keys(DEFAULT_AI_SETTINGS).join(", "))
    .maybeSingle<AiSettings>();
  return data ? { ...data, hold_threshold: Number(data.hold_threshold), sensitive_hold_threshold: Number(data.sensitive_hold_threshold) } : DEFAULT_AI_SETTINGS;
}

async function deps(): Promise<EngineDeps> {
  const db = createAdminClient();
  return {
    provider: provider(),
    settings: await getAiSettings(),
    async reserve(feature, userId) {
      const { data, error } = await db.rpc("ai_reserve_call", { p_feature: feature, p_user_id: userId });
      if (error) {
        console.error("ai_reserve_call failed", error.code);
        return "error";
      }
      return String(data);
    },
    async record(feature, userId, inputTokens, outputTokens, failed) {
      const { error } = await db.rpc("ai_record_usage", { p_feature: feature, p_user_id: userId, p_input_tokens: inputTokens, p_output_tokens: outputTokens, p_failed: failed });
      if (error) console.error("ai_record_usage failed", error.code);
    },
  };
}

function decisionColumns(record: CallRecord | null) {
  return record
    ? { model: record.model, prompt_version: record.promptVersion, provider: record.provider, input_tokens: record.inputTokens, output_tokens: record.outputTokens, latency_ms: record.latencyMs }
    : null;
}

/** Screens a Dispatch. Stored, with its effect, by apply_dispatch_screening(). */
export async function screenDispatch(input: DispatchInput): Promise<DispatchScreening> {
  return screenDispatchWith(await deps(), input);
}

export type StoredNameScreening = NameScreening & { decisionId: string | null };

async function screenAndStoreName(kind: "handle" | "display_name" | "bio", text: string, userId: string): Promise<StoredNameScreening> {
  const result = await screenNameWith(await deps(), kind, text, userId);
  if (result.outcome === "unavailable") return { ...result, decisionId: null };
  const cols = decisionColumns(result.record) ?? { model: "stub-denylist", prompt_version: "handle-screen-stub-v1", provider: "denylist" };
  const { data, error } = await createAdminClient()
    .from("ai_decisions")
    .insert({
      subject_type: kind,
      subject_id: text,
      user_id: userId,
      outcome: result.outcome,
      reason: result.reason,
      output: result.output,
      feature: kind === "handle" ? "screen_handle" : "screen_profile",
      category: result.category,
      confidence: result.confidence,
      ...cols,
      provider: result.provider,
    })
    .select("id")
    .single();
  if (error) console.error("Could not store a screening decision", error.code);
  return { ...result, decisionId: data?.id ?? null };
}

/** Screens a handle: deny-list first, then the model. */
export async function screenHandle(handle: string, userId: string): Promise<StoredNameScreening> {
  return screenAndStoreName("handle", handle, userId);
}

/** Display names and bios, when switched on in Settings (owner decision 9). */
export async function screenProfileText(kind: "display_name" | "bio", text: string, userId: string): Promise<StoredNameScreening | null> {
  const settings = await getAiSettings();
  if ((kind === "display_name" && !settings.screen_display_names) || (kind === "bio" && !settings.screen_bios)) return null;
  return screenAndStoreName(kind, text, userId);
}

/**
 * A private nudge on a draft. Never blocks posting and is shown to nobody
 * else. Stored without the draft text: only the nudge itself.
 */
export async function nudgeDispatch(draft: string, campaign: { id: string; title: string }, userId: string): Promise<{ nudge: string | null; available: boolean }> {
  const result = await nudgeWith(await deps(), draft, campaign.title, userId);
  if (!result.ok) return { nudge: null, available: false };
  const { error } = await createAdminClient()
    .from("ai_decisions")
    .insert({
      subject_type: "nudge",
      subject_id: campaign.id,
      user_id: userId,
      campaign_id: campaign.id,
      outcome: "allow",
      reason: result.nudge ?? "No nudge needed.",
      output: result.output,
      feature: "nudge",
      category: result.output.kind,
      ...decisionColumns(result.record),
    });
  if (error) console.error("Could not store a nudge", error.code);
  return { nudge: result.nudge, available: true };
}

export type CoachAnswer =
  | { ok: true; decisionId: string; feedback: Extract<CoachResult, { ok: true }>["feedback"]; usesLeft: number }
  | { ok: false; reason: "draft_limit" | "daily_limit" | "unavailable" | "too_long"; usesLeft: number };

/**
 * Private feedback on a draft: up to coach_uses_per_draft times per draft and
 * a daily cap. Stores the feedback, never the draft.
 */
export async function coachDispatch(
  draft: string,
  campaign: { id: string; title: string },
  kind: string,
  userId: string,
  draftKey: string,
): Promise<CoachAnswer> {
  const d = await deps();
  const db = createAdminClient();
  const { count } = await db.from("coach_feedback").select("ai_decision_id", { count: "exact", head: true }).eq("user_id", userId).eq("draft_key", draftKey);
  const used = count ?? 0;
  const perDraft = d.settings.coach_uses_per_draft;
  if (used >= perDraft) return { ok: false, reason: "draft_limit", usesLeft: 0 };

  const result = await coachWith(d, draft, { title: campaign.title, kind }, userId);
  if (!result.ok) {
    const reason = result.why === "coach_cap" || result.why === "user_cap" ? "daily_limit" : result.why === "too_long" ? "too_long" : "unavailable";
    return { ok: false, reason, usesLeft: perDraft - used };
  }
  const { data, error } = await db
    .from("ai_decisions")
    .insert({
      subject_type: "coach",
      subject_id: draftKey,
      user_id: userId,
      campaign_id: campaign.id,
      outcome: "allow",
      reason: "Private feedback on a draft.",
      output: result.feedback,
      feature: "coach",
      ...decisionColumns(result.record),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Could not store coach feedback", error?.code);
    return { ok: false, reason: "unavailable", usesLeft: perDraft - used };
  }
  await db.from("coach_feedback").insert({ ai_decision_id: data.id, user_id: userId, campaign_id: campaign.id, draft_key: draftKey });
  return { ok: true, decisionId: data.id, feedback: result.feedback, usesLeft: perDraft - used - 1 };
}
