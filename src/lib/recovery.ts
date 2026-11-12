/**
 * Password recovery. /auth/confirm sets this short-lived cookie only after it
 * has verified a recovery link, and /reset-password needs it as well as a
 * signed-in session. That stops an ordinary signed-in session from reaching the
 * "set a new password without the old one" page.
 */
export const RECOVERY_COOKIE = "tgs-recovery";
export const RECOVERY_MAX_AGE_SECONDS = 15 * 60;
export const RESET_PATH = "/reset-password";

/** A confirmation link is a recovery link when it says so, or when it leads to the reset page (the code-link form carries no type). */
export function isRecoveryLink(type: string | null, next: string | null): boolean {
  return type === "recovery" || next === RESET_PATH;
}
