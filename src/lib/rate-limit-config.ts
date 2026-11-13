// Rate limits (Sprint 7). Fixed windows, counted in Postgres (migration
// 20261113000200). Values are deliberately generous for real members and tight
// for scripts. Edit here; no migration needed.

export const LIMITS = {
  // Per-IP limits are generous on purpose: a pilot class or an office shares one address.
  sign_in_ip: { max: 100, windowSeconds: 600 },
  sign_in_email: { max: 8, windowSeconds: 600 },
  sign_up_ip: { max: 60, windowSeconds: 3600 },
  reset_ip: { max: 30, windowSeconds: 3600 },
  reset_email: { max: 3, windowSeconds: 3600 },
  report_user: { max: 20, windowSeconds: 3600 },
  follow_user: { max: 60, windowSeconds: 3600 },
  react_user: { max: 120, windowSeconds: 3600 },
  position_user: { max: 30, windowSeconds: 3600 },
  // CSP reports (public route): one caller, and all callers together, so a flood cannot fill the event log.
  csp_ip: { max: 60, windowSeconds: 600 },
  csp_all: { max: 600, windowSeconds: 3600 },
} as const;

export type Bucket = keyof typeof LIMITS;

export const TOO_FAST = "You are doing that very quickly. Please wait a little and try again.";
