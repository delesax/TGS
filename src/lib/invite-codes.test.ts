import { describe, expect, it } from "vitest";
import { generateStrongInviteCode, inviteCodeHash, inviteLink } from "./invite-codes";

describe("strong invite codes", () => {
  it("are 28 characters in the database's allowed alphabet, grouped in fours, and fit its 8 to 32 limit", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateStrongInviteCode();
      expect(code).toMatch(/^TGS(-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}){5}$/);
      expect(code).toHaveLength(28);
      expect(code).toMatch(/^[A-Z0-9-]{8,32}$/);
    }
  });

  it("do not repeat in a large batch (about 99 bits)", () => {
    const seen = new Set(Array.from({ length: 5000 }, () => generateStrongInviteCode()));
    expect(seen.size).toBe(5000);
  });
});

describe("inviteCodeHash", () => {
  it("is the SHA-256 of the upper-case code as lower-case hex, whatever case or spacing it is typed in", () => {
    // sha256("TGS-ABCD-EFGH-JKMN-PQRS-TUVW")
    const code = "TGS-ABCD-EFGH-JKMN-PQRS-TUVW";
    const hash = inviteCodeHash(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(inviteCodeHash(code.toLowerCase())).toBe(hash);
    expect(inviteCodeHash(`  ${code}  `)).toBe(hash);
    expect(inviteCodeHash("TGS-ABCD-EFGH-JKMN-PQRS-TUVX")).not.toBe(hash);
  });
});

describe("inviteLink", () => {
  it("puts the code in the sign-up link of the live site, with no double slash", () => {
    expect(inviteLink("https://thegrandstrategist.com", "TGS-A")).toBe("https://thegrandstrategist.com/signup?code=TGS-A");
    expect(inviteLink("https://thegrandstrategist.com/", "TGS-A")).toBe("https://thegrandstrategist.com/signup?code=TGS-A");
  });
});
