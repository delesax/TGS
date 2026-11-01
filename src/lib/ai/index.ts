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
