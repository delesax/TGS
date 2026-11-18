/**
 * The ask-to-join form is OFF unless JOIN_FORM_ENABLED is exactly "true" (the owner turns it on only after the privacy
 * wording is settled). Read at call time, not at build time, so changing the setting needs a restart, not a rebuild.
 */
export function joinFormEnabled(): boolean {
  return process.env.JOIN_FORM_ENABLED === "true";
}
