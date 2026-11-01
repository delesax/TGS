import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SENSITIVE_NOTE_PLACEHOLDER, buildTopicRows, topicFileSchema } from "./launch-topics";

const file = topicFileSchema.parse(JSON.parse(readFileSync("supabase/data/launch-topics.json", "utf8")));
const rows = buildTopicRows(file, "2026-12-01");

describe("launch topics file", () => {
  it("validates against the schema limits", () => {
    expect(file.topics).toHaveLength(15);
    for (const t of file.topics) {
      expect(t.title.length).toBeGreaterThanOrEqual(5);
      expect(t.title.length).toBeLessThanOrEqual(160);
      expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("has three topics in each of the five categories", () => {
    const counts: Record<string, number> = {};
    for (const t of file.topics) counts[t.category] = (counts[t.category] ?? 0) + 1;
    expect(Object.values(counts)).toEqual([3, 3, 3, 3, 3]);
  });
});

describe("buildTopicRows", () => {
  it("creates drafts only", () => {
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(["draft"]));
  });

  it("gives sensitive topics the placeholder content note and nothing else", () => {
    for (const r of rows) {
      expect(r.content_note).toBe(r.is_sensitive ? SENSITIVE_NOTE_PLACEHOLDER : null);
    }
    expect(rows.find((r) => r.slug === "assisted-dying-or-fix-care-first")?.is_sensitive).toBe(true);
  });

  it("flags the Bank of England topic for an owner decision", () => {
    expect(rows.find((r) => r.slug === "bank-of-england-rate-decision-november")?.needs_owner_decision).toMatch(/MPC/);
  });

  it("loads closed, moderated debate as open arena with a note", () => {
    const r = rows.find((x) => x.slug === "assisted-dying-or-fix-care-first")!;
    expect(r.format).toBe("open_arena");
    expect(r.notes).toMatch(/Closed, moderated debate/);
  });

  it("runs topics back to back in wave order, 7 days each, from midnight UK time on the start date", () => {
    expect(rows[0].starts_at).toBe("2026-12-01T00:00:00.000Z");
    expect(rows[0].ends_at).toBe("2026-12-08T00:00:00.000Z");
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].starts_at).toBe(rows[i - 1].ends_at);
      expect(rows[i].wave).toBeGreaterThanOrEqual(rows[i - 1].wave);
    }
  });

  it("keeps midnight UK time across the clocks changing", () => {
    const summer = buildTopicRows(file, "2027-03-20");
    // 20 March is GMT; the next topic starts 27 March (GMT); the one after, 3 April, is BST.
    expect(summer[0].starts_at).toBe("2027-03-20T00:00:00.000Z");
    expect(summer[2].starts_at).toBe("2027-04-02T23:00:00.000Z");
  });

  it("copies opinion_not_advice from the file and keeps facts out of the public summary", () => {
    for (const t of file.topics) {
      const r = rows.find((x) => x.slug === t.slug)!;
      expect(r.opinion_not_advice).toBe(t.opinion_not_advice);
      expect(r.summary).not.toContain(t.summary);
      expect(r.brief.summary).toBe(t.summary);
    }
  });

  it("refuses a missing or malformed start date", () => {
    expect(() => buildTopicRows(file, "1 Dec")).toThrow(/YYYY-MM-DD/);
  });
});
