import { describe, expect, it } from "vitest";
import { isRecoveryLink, RESET_PATH } from "./recovery";
import { forgotPasswordSchema, resetPasswordSchema } from "./validation";

describe("recovery links", () => {
  it("recognises the token link and the code link", () => {
    expect(isRecoveryLink("recovery", null)).toBe(true);
    expect(isRecoveryLink(null, RESET_PATH)).toBe(true);
  });
  it("does not treat a sign-up confirmation as recovery", () => {
    expect(isRecoveryLink("email", "/onboarding")).toBe(false);
    expect(isRecoveryLink(null, null)).toBe(false);
  });
});

describe("forgot and reset password forms", () => {
  it("normalises the email and rejects a malformed one", () => {
    expect(forgotPasswordSchema.parse({ email: "  Name@Example.COM " }).email).toBe("name@example.com");
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
  it("uses the sign-up password rules", () => {
    const short = resetPasswordSchema.safeParse({ password: "short", confirmPassword: "short" });
    expect(short.success).toBe(false);
    const long = resetPasswordSchema.safeParse({ password: "x".repeat(73), confirmPassword: "x".repeat(73) });
    expect(long.success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "a long pilot password", confirmPassword: "a long pilot password" }).success).toBe(true);
  });
  it("needs the two passwords to match, with the message on the second field", () => {
    const r = resetPasswordSchema.safeParse({ password: "a long pilot password", confirmPassword: "a different one!" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["confirmPassword"]);
  });
});
