import { describe, expect, it } from "vitest";
import { anonymiseAll, anonymiseRationale, letterLabel } from "./anonymise-rationale";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("anonymiseRationale", () => {
  it("replaces every token and leaves no handle or id", () => {
    const r = anonymiseRationale(`@{user:${A}} won, ahead of @{user:${B}}. @{user:${A}} led on evidence.`);
    expect(r.text).toBe("Strategist A won, ahead of Strategist B. Strategist A led on evidence.");
    expect(r.people).toBe(2);
    expect(r.strayHandles).toEqual([]);
    expect(r.text).not.toMatch(/user:|[0-9a-f]{8}-/);
  });

  it("reports a handle typed into prose, so the page cannot be published until it is edited", () => {
    const r = anonymiseRationale(`@{user:${A}} agreed with @jane_doe and @bob. Mail a@b.co is not a handle.`);
    expect(r.strayHandles.sort()).toEqual(["@bob", "@jane_doe"]);
  });

  it("does not treat the replaced token's own braces as a stray handle", () => {
    expect(anonymiseRationale(`@{user:${A}}`).strayHandles).toEqual([]);
  });
});

describe("anonymiseAll", () => {
  it("uses one labelling across all the texts of a Verdict", () => {
    const r = anonymiseAll([`@{user:${A}} won.`, `Best rebuttal: @{user:${B}}.`, `@{user:${A}} also cited a source.`]);
    expect(r.texts).toEqual(["Strategist A won.", "Best rebuttal: Strategist B.", "Strategist A also cited a source."]);
    expect(r.people).toBe(2);
  });
});

describe("letterLabel", () => {
  it("counts A to Z, then AA", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(letterLabel)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });
});
