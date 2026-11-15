import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckBeforeRelying } from "./check-before-relying";

// Judge prompt v1 (the launch setting) never produces "unverified claims": the column is null for every score.
// These tests make sure judges and admins still see a clean page when the list is missing, null or empty.

const html = (props: { body: string; sources?: { url: string; title?: string | null }[] | null; claims?: string[] | null }) =>
  renderToStaticMarkup(createElement(CheckBeforeRelying, props));

const PLAIN = "I think the policy is unfair, because it treats similar people differently and nobody explained why.";
const WITH_FIGURES = "A 2023 UK trial of 61 firms found 92% kept the shorter week, and it cost £2 million.";

describe("CheckBeforeRelying without v2 claims (prompt v1)", () => {
  it("renders nothing for a plain Dispatch, whether claims are undefined, null or empty", () => {
    expect(html({ body: PLAIN })).toBe("");
    expect(html({ body: PLAIN, claims: null })).toBe("");
    expect(html({ body: PLAIN, claims: [] })).toBe("");
    expect(html({ body: PLAIN, claims: ["", ""] })).toBe("");
  });

  it("still shows the plain counts for a Dispatch with figures, but no AI claims list", () => {
    const missing: (string[] | null | undefined)[] = [undefined, null, []];
    for (const claims of missing) {
      const out = html({ body: WITH_FIGURES, claims });
      expect(out).toContain("Check before relying");
      expect(out).toContain("The AI cannot check any source");
      expect(out).not.toContain("Claims the AI flagged");
      expect(out).not.toContain("undefined");
      expect(out).not.toContain("null");
    }
  });

  it("shows a list of linked sources as a count even when claims are missing", () => {
    const out = html({ body: PLAIN, sources: [{ url: "https://example.org/a" }], claims: null });
    expect(out).toContain("1 link");
    expect(out).not.toContain("Claims the AI flagged");
  });

  it("lists the claims when prompt v2 supplied them", () => {
    const out = html({ body: WITH_FIGURES, claims: ["92% kept the shorter week"] });
    expect(out).toContain("Claims the AI flagged for checking:");
    expect(out).toContain("92% kept the shorter week");
  });
});
