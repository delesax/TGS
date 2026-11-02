import { randomInt } from "node:crypto";

// No 0/O or 1/I/L, so codes are easy to read out and type.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Returns a code such as TGS-7KQM-X3PA-9WDE (about 60 bits of randomness). */
export function generateInviteCode(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `TGS-${group()}-${group()}-${group()}`;
}
