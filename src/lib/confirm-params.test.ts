import { describe, expect, it } from "vitest";
import { readConfirmParams } from "./confirm-params";

describe("readConfirmParams", () => {
  it("reads a normal link", () => {
    const p = readConfirmParams(new URLSearchParams("code=abc&next=%2Fonboarding"));
    expect(p.get("code")).toBe("abc");
    expect(p.get("next")).toBe("/onboarding");
  });

  it("reads a link whose & were HTML-escaped by the email template", () => {
    const p = readConfirmParams(new URLSearchParams("token_hash=h1&amp;type=email&amp;next=%2Fonboarding"));
    expect(p.get("token_hash")).toBe("h1");
    expect(p.get("type")).toBe("email");
    expect(p.get("next")).toBe("/onboarding");
  });

  it("handles double escaping", () => {
    expect(readConfirmParams(new URLSearchParams("code=x&amp;amp;next=%2Fprofile")).get("next")).toBe("/profile");
  });
});
