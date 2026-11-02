import type { DispatchScreening } from "./engine";

// The JSON that apply_dispatch_screening() expects, built from a screening
// result. Shared by the app and the local seed script.

const UNAVAILABLE_WORDS: Record<string, string> = {
  off: "AI screening is switched off.",
  global_cap: "The daily AI limit has been reached.",
  no_provider: "No AI provider is configured.",
  too_long: "The text is longer than the AI input limit.",
  timeout: "The AI did not answer in time.",
  invalid_output: "The AI's answer could not be used.",
  error: "The AI call failed.",
};

export function screeningPayload(result: DispatchScreening): Record<string, unknown> {
  if (result.outcome === "unavailable") {
    return { outcome: "unavailable", reason: UNAVAILABLE_WORDS[result.why] ?? "The AI was unavailable." };
  }
  return {
    outcome: result.outcome,
    model: result.record.model,
    prompt_version: result.record.promptVersion,
    provider: result.record.provider,
    reason: result.reason,
    category: result.category,
    confidence: result.confidence,
    output: result.output,
    input_tokens: result.record.inputTokens,
    output_tokens: result.record.outputTokens,
    latency_ms: result.record.latencyMs,
    undeclared_ai: result.undeclaredAi,
    undeclared_ai_reason: result.undeclaredAiReason,
  };
}

