// Small display helpers for the Verdict page. No data access here, so they can be unit tested.

/** The weights-override reason without trailing punctuation or spaces, so the closing full stop is never doubled. */
export function cleanOverrideReason(reason: string | null | undefined): string {
  return (reason ?? "").replace(/[\s.,;:!?\u2026-]+$/u, "").trim();
}

/** The label line under the winning case, by who wrote it. */
export function winningCaseLabel(aiAssisted: boolean): string {
  return aiAssisted ? "Summary drafted by AI from the winner's Dispatches and reviewed by an admin" : "Written by an admin";
}
