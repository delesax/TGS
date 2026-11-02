import { describe, expect, it } from "vitest";
import { splitHighlights } from "./highlight";

describe("splitHighlights", () => {
  it("splits marked matches and keeps HTML as plain text", () => {
    expect(splitHighlights("The ⟦tram⟧ and <b>⟦bus⟧</b>")).toEqual([
      { text: "The ", match: false },
      { text: "tram", match: true },
      { text: " and <b>", match: false },
      { text: "bus", match: true },
      { text: "</b>", match: false },
    ]);
    expect(splitHighlights("")).toEqual([]);
  });
});
