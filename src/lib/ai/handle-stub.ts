import type { ScreeningResult } from "./types";

export const HANDLE_STUB_MODEL = "stub-denylist";
export const HANDLE_STUB_PROMPT_VERSION = "handle-screen-stub-v1";

// Names that could pass for staff, the platform or an official account.
const IMPERSONATION_TERMS = [
  "admin",
  "administrator",
  "moderator",
  "mod",
  "staff",
  "support",
  "official",
  "system",
  "root",
  "tgs",
  "grandstrategist",
  "thegrandstrategist",
  "verdict",
  "anthropic",
  "claude",
];

// A short placeholder list of hateful or violent terms. Sprint 4 replaces this
// stub with model-based screening; it is not meant to be complete.
const ABUSIVE_TERMS = ["nazi", "hitler", "kkk", "isis", "genocide", "rapist", "pedo", "paedo", "kill", "murder", "terrorist"];

// Terms that are blocked even inside a longer word.
const ALWAYS_BLOCK_SUBSTRINGS = ["grandstrategist", "nazi", "hitler", "paedo", "pedo", "rapist", "genocide"];

const LOOKALIKES: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s" };

/** Lower-cases and undoes common look-alike characters, e.g. "Adm1n" becomes "admin". */
export function normaliseHandle(handle: string): string {
  return handle
    .toLowerCase()
    .split("")
    .map((ch) => LOOKALIKES[ch] ?? ch)
    .join("");
}

/** Splits on underscores and digits so "kill_bill" gives ["kill", "bill"]. */
function tokens(handle: string): string[] {
  return handle
    .toLowerCase()
    .split(/[_\d]+/)
    .filter(Boolean)
    .map(normaliseHandle);
}

export function screenHandleWithStub(handle: string): ScreeningResult {
  const normalised = normaliseHandle(handle).replace(/_/g, "");
  const parts = tokens(handle);
  const base = { model: HANDLE_STUB_MODEL, promptVersion: HANDLE_STUB_PROMPT_VERSION };

  const impersonation = IMPERSONATION_TERMS.find((term) => normalised === term || parts.includes(term));
  if (impersonation) {
    return {
      ...base,
      outcome: "block",
      reason: "This name could be mistaken for an official or staff account. Please choose another.",
      output: { matched: impersonation, category: "impersonation" },
    };
  }

  const abusive =
    ALWAYS_BLOCK_SUBSTRINGS.find((term) => normalised.includes(term)) ??
    ABUSIVE_TERMS.find((term) => normalised === term || parts.includes(term));
  if (abusive) {
    return {
      ...base,
      outcome: "block",
      reason: "This name breaks our community rules on hate and harassment. Please choose another.",
      output: { matched: abusive, category: "abuse" },
    };
  }

  return { ...base, outcome: "allow", reason: "No problems found.", output: { matched: null } };
}
