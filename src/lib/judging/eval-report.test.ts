import { describe, expect, it } from "vitest";
import { claimsSection, evalReportPath } from "./eval-report";

describe("evalReportPath", () => {
  it("puts the UTC date and time in the filename, so a second run the same day cannot overwrite the first", () => {
    const a = evalReportPath({ real: true, prompt: 2, now: new Date("2026-11-13T12:11:02Z") });
    const b = evalReportPath({ real: true, prompt: 2, now: new Date("2026-11-13T12:11:03Z") });
    expect(a).toBe("evals/out/judging-real-v2-2026-11-13T121102Z.md");
    expect(b).toBe("evals/out/judging-real-v2-2026-11-13T121103Z.md");
    expect(a).not.toBe(b);
  });

  it("still tells fake from real and v1 from v2", () => {
    const now = new Date("2026-11-13T09:05:00Z");
    expect(evalReportPath({ real: false, prompt: 1, now })).toBe("evals/out/judging-fake-2026-11-13T090500Z.md");
    expect(evalReportPath({ real: true, prompt: 1, now })).toBe("evals/out/judging-real-2026-11-13T090500Z.md");
    expect(evalReportPath({ real: false, prompt: 2, now })).toBe("evals/out/judging-fake-v2-2026-11-13T090500Z.md");
  });
});

describe("claimsSection", () => {
  const scores = { logic: 3 };
  it("lists the counts and every claim string per item, including items with none", () => {
    const out = claimsSection([
      { item: { id: "fs-01" }, got: scores, claims: ["Unemployment fell 12% in 2024", "A 2022 UK pilot of 61 companies"] },
      { item: { id: "fs-02" }, got: scores, claims: [] },
      { item: { id: "fs-03" }, got: scores },
      { item: { id: "fs-04" }, got: scores, claims: ["One   claim\nwith a newline"] },
    ]);
    expect(out[0]).toBe("## Unverified claims, per item (2 of 4 items, 3 claims)");
    expect(out).toContain("- fs-01: 2 claims");
    expect(out).toContain('  - "Unemployment fell 12% in 2024"');
    expect(out).toContain('  - "A 2022 UK pilot of 61 companies"');
    expect(out).toContain("- fs-02: 0 claims");
    expect(out).toContain("- fs-03: 0 claims");
    expect(out).toContain("- fs-04: 1 claim");
    expect(out).toContain('  - "One claim with a newline"');
  });

  it("ignores items that were not scored", () => {
    const out = claimsSection([{ item: { id: "x-01" }, got: null, claims: ["never scored"] }]);
    expect(out[0]).toBe("## Unverified claims, per item (0 of 0 items, 0 claims)");
    expect(out.join("\n")).not.toContain("x-01");
  });
});
