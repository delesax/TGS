import { describe, expect, it } from "vitest";
import { cleanOverrideReason, winningCaseLabel } from "./winning-case";

describe("cleanOverrideReason", () => {
  it("strips trailing punctuation and spaces so the closing full stop is not doubled", () => {
    expect(cleanOverrideReason("Peer votes were thin. ")).toBe("Peer votes were thin");
    expect(cleanOverrideReason("Panel counted more!!")).toBe("Panel counted more");
    expect(cleanOverrideReason("Because of this...")).toBe("Because of this");
    expect(cleanOverrideReason("   ")).toBe("");
    expect(cleanOverrideReason(null)).toBe("");
  });
  it("leaves the inside of the reason alone", () => {
    expect(cleanOverrideReason("Version 2.1, agreed")).toBe("Version 2.1, agreed");
  });
});

describe("winningCaseLabel", () => {
  it("says who wrote it", () => {
    expect(winningCaseLabel(true)).toBe("Summary drafted by AI from the winner's Dispatches and reviewed by an admin");
    expect(winningCaseLabel(false)).toBe("Written by an admin");
  });
});
