export type ScreeningOutcome = "allow" | "hold" | "block";

export type ScreeningResult = {
  outcome: ScreeningOutcome;
  /** Plain-English reason, safe to show to the Strategist. */
  reason: string;
  model: string;
  promptVersion: string;
  /** Raw model (or stub) output, stored for admin review. */
  output: Record<string, unknown>;
};

/** The four AI features, one entry point each (src/lib/ai/index.ts). */
export type AiFeature = "screen_handle" | "screen_profile" | "screen_dispatch" | "nudge" | "coach";

export type ProviderName = "anthropic" | "fake";

/** Why a call did not produce a usable answer. Each one triggers the fallback. */
export type Unavailable = "off" | "global_cap" | "user_cap" | "coach_cap" | "no_provider" | "too_long" | "timeout" | "invalid_output" | "error";

/** Everything stored with a decision (CLAUDE.md rule 6), whatever the outcome. */
export type CallRecord = {
  provider: ProviderName;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

/** The admin-editable part of community_settings that the AI module reads. */
export type AiSettings = {
  ai_enabled: boolean;
  ai_input_max_chars: number;
  hold_threshold: number;
  sensitive_hold_threshold: number;
  ai_model_screening: string | null;
  ai_model_nudge: string | null;
  ai_model_coach: string | null;
  coach_uses_per_draft: number;
  nudge_on_submit: boolean;
  screen_display_names: boolean;
  screen_bios: boolean;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  ai_enabled: true,
  ai_input_max_chars: 6000,
  hold_threshold: 0.7,
  sensitive_hold_threshold: 0.4,
  ai_model_screening: null,
  ai_model_nudge: null,
  ai_model_coach: null,
  coach_uses_per_draft: 3,
  nudge_on_submit: true,
  screen_display_names: false,
  screen_bios: false,
};
