import { describe, expect, it } from "vitest";
import { countCheckSignals, describeCounts, leansOnUnlinkedClaims } from "./check-before-relying";

describe("countCheckSignals", () => {
  it("counts listed links and web addresses typed into the text, once each", () => {
    const c = countCheckSignals("See https://www.ons.gov.uk/a and (https://www.ons.gov.uk/a) plus https://ifs.org.uk/b.", [{ url: "https://ifs.org.uk/b" }, { url: "https://example.org/c", title: "Report" }]);
    expect(c.links).toBe(3);
  });

  it("counts money, percentages and big numbers as figures, not years, small numbers or numbers inside a web address", () => {
    const c = countCheckSignals("It cost £2.5bn, rose 12% and affected 1,200,000 people in 2023. There were 3 schools. See https://example.org/p/45678%.");
    expect(c.figures).toBe(3);
  });

  it("recognises named studies, surveys and reports", () => {
    const c = countCheckSignals("A 2023 UK trial found it works. The IFS report was clear, and a survey by Ofcom agreed. According to the OBR it holds.");
    expect(c.namedStudies).toBeGreaterThanOrEqual(3);
  });

  it("finds nothing in plain reasoning", () => {
    expect(countCheckSignals("I think schools should start later because tired pupils learn less, so the rule is unfair.")).toEqual({ links: 0, figures: 0, namedStudies: 0 });
  });

  it("flags figures and studies with no link, and says so plainly, but only as a pointer", () => {
    const c = countCheckSignals("A 2023 UK trial of 61 firms found 92% kept the policy.");
    expect(c.links).toBe(0);
    expect(leansOnUnlinkedClaims(c)).toBe(true);
    expect(describeCounts(c)).toMatch(/0 links, \d+ figures?, \d+ named stud/);
    expect(leansOnUnlinkedClaims(countCheckSignals("A 2023 UK trial found 92% kept it.", [{ url: "https://example.org/x" }]))).toBe(false);
  });
});
