/**
 * Legal facts in ONE place. Pages, the footer and emails read from here and
 * never hard-code these values.
 *
 * Every value the owner has not given is the empty string. `legalValue()`
 * returns the visible text "[to be added]" for an empty value, so a missing
 * fact is obvious on the page rather than silently blank.
 *
 * `reviewed` stays false until a solicitor has signed the pages off. While it
 * is false the DRAFT banner shows. A test (src/lib/legal.test.ts) fails if it
 * is flipped to true while any value is empty or any page still shows a
 * placeholder, so the flag cannot be turned on by accident.
 */
export const LEGAL = {
  companyName: "The Grand Strategist Limited",
  companyNumber: "",
  registeredOffice: "",
  jurisdiction: "England and Wales",
  icoNumber: "",
  privacyEmail: "contact@thegrandstrategist.com",
  contactEmail: "contact@thegrandstrategist.com",
  termsVersion: "2026-11-a",
  privacyVersion: "2026-11-a",
  effectiveDate: "",
  reviewed: false,
} as const;

export type LegalKey = Exclude<keyof typeof LEGAL, "reviewed">;

export const PLACEHOLDER_TEXT = "[to be added]";

/** The value, or the visible placeholder when the owner has not supplied it. */
export function legalValue(key: LegalKey): string {
  const value = LEGAL[key];
  return value === "" ? PLACEHOLDER_TEXT : value;
}

/** True when the value has been supplied. */
export function legalHas(key: LegalKey): boolean {
  return LEGAL[key] !== "";
}

/** "Registered in England and Wales, company number X". Shared by the footer and emails. */
export function registrationLine(): string {
  return `Registered in ${LEGAL.jurisdiction}, company number ${legalValue("companyNumber")}`;
}

/** Plain-text company block for emails: name, registration line, registered office. */
export function companyBlockLines(): string[] {
  return [LEGAL.companyName, registrationLine(), `Registered office: ${legalValue("registeredOffice")}`];
}

/** Keys whose values are empty. Used by the gate test. */
export function emptyLegalKeys(): LegalKey[] {
  return (Object.keys(LEGAL) as (keyof typeof LEGAL)[]).filter((k): k is LegalKey => k !== "reviewed" && LEGAL[k] === "");
}
