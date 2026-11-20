// Plain constants, so the browser form can use them without pulling in the AI code (which reads prompt files).

/** The most characters of pasted notes accepted. Longer notes are refused before any call. */
export const CAMPAIGN_NOTES_MAX_CHARS = 12_000;
export const CAMPAIGN_NOTES_MIN_CHARS = 100;
