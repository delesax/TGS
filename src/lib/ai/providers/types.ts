import type { ProviderName } from "../types";

export type AiTask = "screen_dispatch" | "screen_text" | "nudge" | "coach" | "judge_rubric" | "judge_rationale";

export type ProviderRequest = {
  task: AiTask;
  model: string;
  /** The versioned prompt (prompts/<name>.vN.md). Stable, so it can be cached. */
  system: string;
  /** Trusted context plus the untrusted text between delimiters (untrusted.ts). */
  user: string;
  /** JSON schema for structured output. */
  schema: Record<string, unknown>;
  maxTokens: number;
  signal: AbortSignal;
};

export type ProviderResponse = { text: string; inputTokens: number; outputTokens: number };

export interface AiProvider {
  name: ProviderName;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}
