import { describe, expect, it } from "vitest";
import { criteriaByAuthor, MIN_PANEL_JUDGES, MIN_POSITIONS_FOR_CHART, positionsChart } from "./verdict-extras";

const c = (n: number) => ({ logic: n, evidence: n, originality: n, responsiveness: n });
const dispatches = [
  { id: "d1", author_id: "a" },
  { id: "d2", author_id: "a" },
  { id: "d3", author_id: "b" },
];

describe("criteriaByAuthor", () => {
  it("averages judges per Dispatch, then Dispatches, per criterion", () => {
    const panel = [
      { dispatch_id: "d1", judge_id: "j1", ...c(5) },
      { dispatch_id: "d1", judge_id: "j2", ...c(3) },
      { dispatch_id: "d1", judge_id: "j3", ...c(4) },
      { dispatch_id: "d2", judge_id: "j1", ...c(2) },
      { dispatch_id: "d2", judge_id: "j2", ...c(2) },
      { dispatch_id: "d2", judge_id: "j3", ...c(2) },
    ];
    const r = criteriaByAuthor(dispatches, panel, [{ dispatch_id: "d1", ...c(4) }, { dispatch_id: "d2", ...c(2) }]).get("a")!;
    expect(r.panel?.logic).toBe(3); // (4 + 2) / 2
    expect(r.ai?.evidence).toBe(3);
    expect(r.panelJudges).toBe(3);
  });

  it("hides the panel figure when fewer than the minimum judges contributed", () => {
    expect(MIN_PANEL_JUDGES).toBe(3);
    const panel = [
      { dispatch_id: "d3", judge_id: "j1", ...c(5) },
      { dispatch_id: "d3", judge_id: "j2", ...c(1) },
    ];
    const r = criteriaByAuthor(dispatches, panel, [{ dispatch_id: "d3", ...c(4) }]).get("b")!;
    expect(r.panel).toBeNull();
    expect(r.ai?.logic).toBe(4);
    expect(JSON.stringify(r)).not.toContain("j1");
  });

  it("returns nulls for a Strategist with no scores", () => {
    const r = criteriaByAuthor(dispatches, [], []).get("a")!;
    expect(r.panel).toBeNull();
    expect(r.ai).toBeNull();
  });
});

describe("positionsChart", () => {
  const rows = (n: number, before: "for" | "against" | null, after: "for" | "against" | "undecided" | null) => Array.from({ length: n }, () => ({ before, after }));

  it("is suppressed under the minimum", () => {
    expect(positionsChart(rows(MIN_POSITIONS_FOR_CHART - 1, "for", "against"))).toEqual({ shown: false });
    expect(positionsChart([])).toEqual({ shown: false });
  });

  it("shows totals at the minimum", () => {
    const r = positionsChart([...rows(6, "for", "against"), ...rows(4, "against", "against")]);
    expect(r).toMatchObject({ shown: true, recorded: 10, beforeN: 10, afterN: 10 });
    if (r.shown) {
      expect(r.before).toEqual({ for: 6, against: 4, undecided: 0 });
      expect(r.after).toEqual({ for: 0, against: 10, undecided: 0 });
    }
  });

  it("withholds a side that fewer than the minimum recorded", () => {
    const r = positionsChart([...rows(9, "for", null), ...rows(1, "for", "against")]);
    expect(r).toMatchObject({ shown: true, beforeN: 10, afterN: 1, after: null });
  });
});
