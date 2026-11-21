import { describe, expect, it } from "vitest";
import { campaignDraftProblems } from "./campaign-draft";
import { normText } from "./campaign-draft-normalise";
import type { CampaignDraftOutput } from "./schemas";

// The normalisation table and the month check from docs/CAMPAIGN_DRAFT_HELPER_SPEC.md, both directions: every equivalent pair passes
// and every near miss fails. A sentence is put in a summary (20+ words, no quotes) and checked against notes.

const FILLER = "The notes describe a plan that supporters and critics both discuss at some length in public meetings every year.";
const summaryProblems = (sentence: string, notes: string) => {
  const draft: CampaignDraftOutput = {
    summary: `${FILLER} ${sentence}`,
    claims: [{ claim: "x", source_line: "filler line", exact_quote: "filler", status: "unverified" }],
    recheck_lines: [],
  };
  return campaignDraftProblems(draft, `${notes}\nfiller line`).filter((p) => p.startsWith("summary"));
};
const ok = (sentence: string, notes: string) => expect(summaryProblems(sentence, notes), `${sentence} | ${notes}`).toEqual([]);
const bad = (sentence: string, notes: string) => expect(summaryProblems(sentence, notes).length, `${sentence} | ${notes}`).toBeGreaterThan(0);

describe("numbers", () => {
  it.each([
    ["It cost 1000 pounds.", "It cost 1,000 pounds."],
    ["It cost 1,000 pounds.", "It cost 1000 pounds."],
    ["It cost 1 000 pounds.", "It cost 1,000 pounds."],
    ["It cost 1 000 pounds.", "It cost 1000 pounds."],
    ["It cost £1.2 million.", "It cost £1.2m."],
    ["It cost £1.2m.", "It cost £1,200,000."],
    ["It cost £1,200,000.", "It cost £1.2 million."],
    ["It was the 3rd case.", "It was case 3."],
    ["It was case 3.", "It was the 3rd case."],
  ])("treats %s and %s as the same", (a, b) => ok(a, b));

  it.each([
    ["It cost 1,000 pounds.", "It cost 100 pounds."],
    ["It cost £2.4 million.", "It cost £24 million."],
    ["It cost £1.2 million.", "It cost £12 million."],
    ["It cost 1.0 pounds.", "It cost 10 pounds."],
  ])("does not treat %s as supported by %s", (a, b) => bad(a, b));
});

describe("percentages", () => {
  it.each([
    ["Support was 10%.", "Support was 10 percent."],
    ["Support was 10 %.", "Support was 10%."],
    ["Support was 10 per cent.", "Support was 10%."],
    ["Support was 10 per-cent.", "Support was 10%."],
    ["Support was 10 percent.", "Support was 10 %."],
  ])("treats %s and %s as the same", (a, b) => ok(a, b));
  it("does not treat 10% as 1.0%", () => bad("Support was 10%.", "Support was 1.0%."));
  it("does not let a percentage in the output rest on a plain figure only... in the other direction a plain figure may rest on a percentage", () => {
    bad("Support was 10%.", "Support was 10 people.");
    ok("Support was 10.", "Support was 10%.");
  });
});

describe("dates", () => {
  it.each([
    ["It was on 3 Dec 2026.", "It was on 3 December 2026."],
    ["It was on 3rd December, 2026.", "It was on 3 December 2026."],
    ["It was on December 3, 2026.", "It was on 3 December 2026."],
    ["It was on 3/12/2026.", "It was on 3 December 2026."],
    ["It was on 2026-12-03.", "It was on 3 December 2026."],
    ["It was on 3 December 2026.", "It was on 03/12/2026."],
    ["It was on 3 December.", "It was on 3 December 2026."], // the output is silent about the year
    ["It was on 3 December 2026.", "It was on 3 December."], // the notes are silent about the year
    ["It was in December 2026.", "It was on 3 December 2026."], // a month and year: the notes have a date in it
  ])("treats %s and %s as the same", (a, b) => ok(a, b));

  it.each([
    ["It was on 3 December.", "It was on 13 December."],
    ["It was on 3 Dec 2026.", "It was on 3 Dec 2025."],
    ["It was on 3 December 2026.", "It was in December 2026."], // a day the notes never gave
    ["It was in December 2025.", "It was on 3 December 2026."],
    ["It was on 3/12/2026.", "It was on 12/3/2026."], // day first: 3 December is not 12 March
    ["It was on 4 December.", "It was on 3 December."],
  ])("does not treat %s as supported by %s", (a, b) => bad(a, b));

  it("does not interpret a two-digit year: it is just a number", () => bad("It was on 3/12/26.", "It was on 3 December 2026."));
});

describe("the month check: ordinary words are not dates", () => {
  const notes = "The consultation covers libraries.";
  it.each([["Parliament may vote on it."], ["The march was peaceful."], ["That was an august body."], ["May I ask what it costs?"], ["The March vote was close."]])("accepts %s whatever the notes say", (s) => ok(s, notes));
  it("checks a month with a year: 'The vote is in August 2026'", () => {
    bad("The vote is in August 2026.", notes);
    ok("The vote is in August 2026.", "Voting is on 14 August 2026.");
    ok("The vote is in August 2026.", "The vote is in August 2026.");
  });
  it("checks a day and month: 'A hearing on 3 May'", () => {
    bad("A hearing on 3 May.", notes);
    ok("A hearing on 3 May.", "A hearing on 3 May 2027.");
  });
  it("checks 'March 3'", () => {
    bad("The consultation opens on March 3.", notes);
    ok("The consultation opens on March 3.", "It opens on 3 March.");
  });
  it("checks only the date in 'it may change in May 2026'", () => {
    bad("She said it may change in May 2026.", notes);
    ok("She said it may change in May 2026.", "A decision is due in May 2026.");
  });
  it("accepts an invented bare month (accepted consequence in the spec)", () => ok("A vote in September.", notes));
});

describe("quotes, source lines and the rest", () => {
  const notes = "The minister said “we will not close any library” on Tuesday.\nThe plan was published online.";
  const claim = (source_line: string, exact_quote: string): CampaignDraftOutput => ({
    summary: `${FILLER} The minister spoke on Tuesday about the plan.`,
    claims: [{ claim: "x", source_line, exact_quote, status: "unverified" }],
    recheck_lines: [],
  });
  const claimProblems = (source_line: string, exact_quote: string) => campaignDraftProblems(claim(source_line, exact_quote), notes).filter((p) => p.startsWith("claims"));

  it("treats curly and straight quotes, dashes and spacing as the same in a quote", () => {
    expect(claimProblems('The minister said "we will not close any library" on Tuesday.', "we will not close  any library")).toEqual([]);
    expect(claimProblems("The minister said “we will not close any library” on Tuesday.", "WE WILL NOT CLOSE ANY LIBRARY")).toEqual([]);
  });
  it("rejects a quote with a changed word", () => {
    expect(claimProblems("The minister said “we will not close any library” on Tuesday.", "we will not close every library").join("|")).toMatch(/exact quote is not in the notes/);
  });
  it("rejects a quote joined with an ellipsis or a bracketed gap", () => {
    expect(claimProblems("The minister said “we will not close any library” on Tuesday.", "we will not ... library").join("|")).toMatch(/exact quote/);
    expect(claimProblems("The minister said “we will not close any library” on Tuesday.", "we will [...] library").join("|")).toMatch(/exact quote/);
  });
  it("treats an ellipsis character and three full stops as the same", () => {
    expect(normText("wait… what")).toBe(normText("wait... what"));
    expect(normText("2026–27")).toBe(normText("2026-27"));
    expect(normText("a b c\n\td")).toBe("a b c d");
  });
});
