import "server-only";
import { screenHandleWithStub } from "./handle-stub";
import type { ScreeningResult } from "./types";

export type { ScreeningResult } from "./types";

/**
 * The single entry point for AI features (CLAUDE.md: never call the AI API from
 * the browser, and keep it behind src/lib/ai). Until Sprint 4 this uses a local
 * deny-list stub; the signature stays the same when the Haiku call replaces it.
 */
export async function screenHandle(handle: string): Promise<ScreeningResult> {
  return screenHandleWithStub(handle);
}

export type DispatchScreeningInput = { body: string; aiUse: "none" | "assisted" | "generated" };

/**
 * Sprint 4 hook for Dispatch screening, including the check for pasted AI
 * output that was not declared (CLAUDE.md rule 9). Not built yet: it allows
 * everything and records nothing, because no decision is made. When Sprint 4
 * replaces it, each result is stored in ai_decisions and a "hold" sets the
 * Dispatch to pending for review; AI never deletes (rule 6).
 */
export async function screenDispatch(input: DispatchScreeningInput): Promise<{ outcome: "allow" }> {
  void input;
  return { outcome: "allow" };
}
