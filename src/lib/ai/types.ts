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
