import type { ProviderName } from "../types";

export type AiTask = "screen_dispatch" | "screen_text" | "nudge" | "coach" | "judge_rubric" | "judge_rationale" | "judge_summary";

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

/**
 * Thrown when the model stops without a usable answer (a refusal, or cut off at max_tokens). The message is what the engine has
 * always seen; the stop reason and any text are kept so an evaluation can say exactly what happened.
 */
export class ProviderStopError extends Error {
  constructor(
    message: string,
    readonly stopReason: string,
    readonly rawText: string,
  ) {
    super(message);
  }
}

export interface AiProvider {
  name: ProviderName;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}
