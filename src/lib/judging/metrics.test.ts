import { describe, expect, it } from "vitest";
import { agreement, passes, ranks, spearman } from "./metrics";

describe("gold-set metrics", () => {
  it("ranks ties with their average position", () => {
    expect(ranks([3, 1, 3, 2])).toEqual([3.5, 1, 3.5, 2]);
  });

  it("Spearman is 1 for the same order, -1 for reversed, null when one side is constant", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 2, 3], [2, 2, 2])).toBeNull();
  });

  it("reports mean absolute error and share within one point", () => {
    const a = agreement([1, 2, 3, 4, 5], [1, 3, 5, 4, 4]);
    expect(a.mae).toBeCloseTo(4 / 5);
    expect(a.withinOne).toBeCloseTo(4 / 5);
    expect(a.n).toBe(5);
  });

  it("passes only at 80% within one and Spearman of at least 0.7", () => {
    expect(passes({ n: 10, mae: 0.5, withinOne: 0.8, spearman: 0.7 })).toBe(true);
    expect(passes({ n: 10, mae: 0.5, withinOne: 0.79, spearman: 0.9 })).toBe(false);
    expect(passes({ n: 10, mae: 0.5, withinOne: 0.9, spearman: 0.69 })).toBe(false);
    expect(passes({ n: 10, mae: 0.5, withinOne: 0.9, spearman: null })).toBe(false);
  });
});
