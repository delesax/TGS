import { describe, expect, it } from "vitest";
import { generateInviteCode } from "./invite-code";
import { handleSchema, inviteCodeSchema, safeNextPath, signUpSchema } from "./validation";

describe("handleSchema", () => {
  it.each(["Jane", "jane_smith", "J42", "a_b_c_d_e_f_g_h_i_j"])("accepts %s", (h) => {
    expect(handleSchema.safeParse(h).success).toBe(true);
  });

  it.each(["ab", "1jane", "_jane", "jane smith", "jane-smith", "a".repeat(21), "jané"])("rejects %s", (h) => {
    expect(handleSchema.safeParse(h).success).toBe(false);
  });
});

describe("invite codes", () => {
  it("generates codes that pass validation and look readable", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^TGS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(inviteCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it("upper-cases and trims what people type", () => {
    expect(inviteCodeSchema.parse("  tgs-abcd-efgh ")).toBe("TGS-ABCD-EFGH");
  });
});

describe("signUpSchema", () => {
  const valid = {
    email: "Jane@Example.com ",
    password: "correct horse battery",
    inviteCode: "TGS-ABCD-EFGH",
    ageConfirmed: true,
    publicAcknowledged: true,
    termsAccepted: true,
  };

  it("accepts a complete form and normalises the email", () => {
    expect(signUpSchema.parse(valid).email).toBe("jane@example.com");
  });

  it("requires 18+ and terms", () => {
    expect(signUpSchema.safeParse({ ...valid, ageConfirmed: false }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, termsAccepted: false }).success).toBe(false);
  });

  it("requires a 10 character password", () => {
    expect(signUpSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/profile", "/profile"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    [null, "/"],
    // Control characters are stripped by browsers and URL parsers, which would turn these into "//evil.example".
    ["/\t/evil.example", "/"],
    ["/\n/evil.example", "/"],
    ["/\r/evil.example", "/"],
    ["/\u0000/evil.example", "/"],
    ["/ok\tpath", "/"],
    ["/a/\\evil.example", "/"],
    ["", "/"],
    // Ordinary paths, queries and encoded characters still work.
    ["/campaigns/some-slug?tab=votes#top", "/campaigns/some-slug?tab=votes#top"],
    ["/%2F%2Fevil.example", "/%2F%2Fevil.example"],
    ["/%09/evil.example", "/%09/evil.example"],
  ])("%j -> %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it("defaults to the home page, and a caller-supplied fallback is still used", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("https://evil.example", "/onboarding")).toBe("/onboarding");
  });

  it("never lets a new URL() leave our origin, whatever the input", () => {
    const attempts = ["/\t/evil.example", "/\n/evil.example", "/ /evil.example", "/\u00a0/evil.example", "/\u200b/evil.example"];
    for (const a of attempts) {
      const out = safeNextPath(a);
      expect(new URL(out, "https://thegrandstrategist.com").origin).toBe("https://thegrandstrategist.com");
    }
  });
});
