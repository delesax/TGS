import { describe, expect, it } from "vitest";
import { META_DESCRIPTION_MAX, metaDescription } from "./meta-description";

describe("metaDescription", () => {
  it("returns a short summary unchanged, with whitespace collapsed", () => {
    expect(metaDescription("  Should the UK\n\nban under-16s?  ")).toBe("Should the UK ban under-16s?");
  });
  it("adds a prefix", () => {
    expect(metaDescription("The question.", "Verdict: ")).toBe("Verdict: The question.");
  });
  it("cuts a long summary at a word boundary with an ellipsis, within the limit", () => {
    const long = "word ".repeat(80);
    const out = metaDescription(long)!;
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    expect(out.endsWith("word…")).toBe(true);
  });
  it("counts the prefix towards the limit", () => {
    const out = metaDescription("abc def ".repeat(40), "Verdict: ")!;
    expect(out.startsWith("Verdict: ")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
  });
  it("hard-cuts one very long word instead of returning nothing", () => {
    const out = metaDescription("x".repeat(400))!;
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
    expect(out.endsWith("…")).toBe(true);
  });
  it("gives null for empty, missing or DRAFT summaries", () => {
    expect(metaDescription("")).toBeNull();
    expect(metaDescription(null)).toBeNull();
    expect(metaDescription(undefined)).toBeNull();
    expect(metaDescription("DRAFT: background to be refreshed by the owner")).toBeNull();
  });
});
