import { createHash, randomInt } from "node:crypto";
import { ALPHABET } from "./invite-code";

// Codes for invites made from the admin screen. 20 characters from a 31-letter alphabet is about 99 bits
// (the older TGS-XXXX-XXXX-XXXX codes are about 60). Only the SHA-256 of a code is stored; the code is shown once.

/** Returns a code such as TGS-7KQM-X3PA-9WDE-4HTN-RB2V (28 characters, within the database limit of 32). */
export function generateStrongInviteCode(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `TGS-${group()}-${group()}-${group()}-${group()}-${group()}`;
}

/** The same value as public.invite_code_hash(): SHA-256 of the code in upper case, as lower-case hex. */
export function inviteCodeHash(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase(), "utf8").digest("hex");
}

/** The sign-up link an invitation carries. */
export function inviteLink(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/$/, "")}/signup?code=${encodeURIComponent(code)}`;
}
