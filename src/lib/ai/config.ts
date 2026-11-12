import type { AiSettings, ProviderName } from "./types";

// Which provider and which models. Models come from the settings row first,
// then the environment, then these defaults (CLAUDE.md: Haiku for screening
// and nudges, Sonnet for the coach). Switching the coach to Haiku is a
// settings change in the admin console, not a release.

export const DEFAULT_MODELS = {
  screening: "claude-haiku-5-5",
  nudge: "claude-haiku-5-5",
  coach: "claude-sonnet-5-5",
  // Sprint 5: the AI rubric and the optional rationale wording.
  judging: "claude-sonnet-5-5",
} as const;

export type ModelRole = keyof typeof DEFAULT_MODELS;

/** Price per million tokens in US dollars, for the spend log and evaluation caps. */
export const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** Estimated cost in US dollars. Unknown models are priced like Sonnet, to err high. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES_PER_MTOK[model] ?? { input: 3, output: 15 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

type Env = Record<string, string | undefined>;

export function resolveModel(role: ModelRole, settings: Pick<AiSettings, "ai_model_screening" | "ai_model_nudge" | "ai_model_coach">, env: Env = process.env): string {
  // Judging has no settings column (yet): AI_MODEL_JUDGING or the default.
  const fromSettings =
    role === "screening" ? settings.ai_model_screening : role === "nudge" ? settings.ai_model_nudge : role === "coach" ? settings.ai_model_coach : null;
  const fromEnv = env[`AI_MODEL_${role.toUpperCase()}`];
  return fromSettings || fromEnv || DEFAULT_MODELS[role];
}

/**
 * The real provider runs only when ANTHROPIC_API_KEY is set and AI_PROVIDER
 * is not "fake". Tests and CI never reach it: under Vitest or CI it is never
 * chosen, whatever the environment says. With no key and no fake provider
 * there is no provider, and every call takes the fallback.
 */
export function chooseProvider(env: Env = process.env): ProviderName | null {
  const wanted = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (wanted === "fake") return "fake";
  const underTest = Boolean(env.VITEST) || env.CI === "true" || env.NODE_ENV === "test";
  if (underTest) return null;
  if (env.ANTHROPIC_API_KEY && (wanted === "" || wanted === "anthropic")) return "anthropic";
  return null;
}

/** Hard time limits per call (one retry follows a failure). */
export const TIMEOUT_MS = { screening: 4_000, nudge: 4_000, coach: 20_000, judging: 45_000 } as const;
