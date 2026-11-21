import { describe, expect, it } from "vitest";
import { AGREEMENT_MIN_VOTES, agreementByVoter, agreementRate, DEFAULT_FACTOR_BOUNDS, voteWeightFactor } from "./agreement";

const quality = { d1: 90, d2: 80, d3: 40, d4: 30 }; // median 60: d1 and d2 are the top half

describe("agreementByVoter", () => {
  it("counts a vote as agreeing when it went to a Dispatch at or above the median quality", () => {
    const r = agreementByVoter(
      [
        { voter_id: "a", dispatch_id: "d1" },
        { voter_id: "a", dispatch_id: "d3" },
        { voter_id: "b", dispatch_id: "d4" },
      ],
      quality,
    );
    expect(r.get("a")).toEqual({ votes: 2, agreed: 1 });
    expect(r.get("b")).toEqual({ votes: 1, agreed: 0 });
  });

  it("skips votes for Dispatches with no quality, and counts nothing under 2 scored Dispatches", () => {
    expect(agreementByVoter([{ voter_id: "a", dispatch_id: "dx" }], quality).size).toBe(0);
    expect(agreementByVoter([{ voter_id: "a", dispatch_id: "d1" }], { d1: 90 }).size).toBe(0);
  });

  it("is built from quality only: the function has no way to see other peer votes", () => {
    const votes = [{ voter_id: "a", dispatch_id: "d3" }];
    const crowd = Array.from({ length: 50 }, (_, i) => ({ voter_id: `v${i}`, dispatch_id: "d3" }));
    expect(agreementByVoter([...votes, ...crowd], quality).get("a")).toEqual({ votes: 1, agreed: 0 });
  });
});

describe("agreementRate", () => {
  it("is null until the voter has enough votes, so one Campaign cannot move it", () => {
    expect(AGREEMENT_MIN_VOTES).toBe(10);
    expect(agreementRate([{ votes: 9, agreed: 9 }])).toBeNull();
    expect(agreementRate([{ votes: 6, agreed: 6 }, { votes: 4, agreed: 0 }])).toBe(0.6);
  });
  it("uses only the most recent Campaigns in the window (newest first)", () => {
    const history = [{ votes: 10, agreed: 10 }, ...Array.from({ length: 10 }, () => ({ votes: 10, agreed: 0 }))];
    expect(agreementRate(history, { window: 2 })).toBe(0.5);
  });
});

describe("voteWeightFactor", () => {
  it("gives a new voter exactly 1", () => expect(voteWeightFactor(null)).toBe(1));
  it("stays inside the bounds: nobody is silenced and nobody can swamp", () => {
    expect(voteWeightFactor(0)).toBe(DEFAULT_FACTOR_BOUNDS.min);
    expect(voteWeightFactor(1)).toBe(DEFAULT_FACTOR_BOUNDS.max);
    expect(voteWeightFactor(-3)).toBe(DEFAULT_FACTOR_BOUNDS.min);
    expect(voteWeightFactor(7)).toBe(DEFAULT_FACTOR_BOUNDS.max);
    expect(voteWeightFactor(0.5)).toBe(1);
  });
  it("a crowd of low-agreement voters is worth at most a third of the same number of high-agreement voters", () => {
    expect((100 * voteWeightFactor(0)) / (100 * voteWeightFactor(1))).toBeCloseTo(1 / 3);
  });
});
