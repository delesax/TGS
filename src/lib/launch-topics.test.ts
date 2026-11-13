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

  it("loads the owner's content note for assisted dying, and a placeholder for any sensitive topic that has none", () => {
    const dying = rows.find((r) => r.slug === "assisted-dying-or-fix-care-first")!;
    expect(dying.is_sensitive).toBe(true);
    expect(dying.content_note).toMatch(/^This Campaign is about assisted dying, death and terminal illness\./);
    expect(dying.content_note).toContain("Samaritans 116 123 (free, any time); Cruse Bereavement Support 0808 808 1677; Marie Curie Support Line 0800 090 2309.");
    expect(dying.content_note!.length).toBeLessThanOrEqual(1000);
    for (const r of rows.filter((x) => !x.is_sensitive)) expect(r.content_note).toBeNull();
    const synthetic = buildTopicRows({ ...file, topics: [{ ...file.topics[0], is_sensitive: true, content_note: undefined }] }, "2026-12-01");
    expect(synthetic[0].content_note).toBe(SENSITIVE_NOTE_PLACEHOLDER);
  });

  it("Bank of England: new title, open arena, finance, opinion not advice, no date, placeholder summary, decision cleared", () => {
    const r = rows.find((x) => x.slug === "bank-of-england-rate-decision-november")!;
    expect(r.title).toBe("Should the Bank of England keep interest rates high until inflation is firmly back at 2%, even if that slows growth?");
    expect(r.format).toBe("open_arena");
    expect(r.category).toBe("financial_services");
    expect(r.opinion_not_advice).toBe(true);
    expect(r.needs_owner_decision).toBeNull();
    expect(r.summary).toBe("As of [opening date], Bank Rate is [x]% and CPI inflation is [y]%. The Bank's target is 2%. [One sentence on the latest decision and vote.]");
    expect(r.brief.argument_for).toBe("Stable prices protect savers and wages over time, and cutting too early risks inflation returning.");
    expect(r.brief.argument_against).toBe("High rates hurt mortgage holders and businesses now, and a weak economy can bring inflation down by itself.");
    expect(`${r.title} ${r.summary}`).not.toMatch(/November|\b5 Nov|2026/);
  });

  it("Rosebank: reworded, wave 4, still needs an owner decision, with the three opening conditions in the admin notes", () => {
    const r = rows.find((x) => x.slug === "rosebank-after-jackdaw")!;
    expect(r.title).toBe("Should the UK approve new North Sea oil and gas projects such as Rosebank?");
    expect(r.wave).toBe(4);
    expect(r.needs_owner_decision).toBeTruthy();
    expect(r.notes).toContain("Open only when ALL are true: (1) eval:moderation --real met its targets; (2) at least two wave-1 Campaigns have finished with every hold and appeal answered within 48 hours; (3) a second reviewer is in place.");
  });

  it("assisted dying: Oxford, wave 4, sensitive, still an owner decision, with the admin note", () => {
    const r = rows.find((x) => x.slug === "assisted-dying-or-fix-care-first")!;
    expect(r.format).toBe("oxford");
    expect(r.wave).toBe(4);
    expect(r.is_sensitive).toBe(true);
    expect(r.needs_owner_decision).toBeTruthy();
    expect(r.notes).toContain("Check each phone number on the day it opens. Open only after the three Rosebank conditions, with the second reviewer on call for the first 48 hours.");
    expect(r.notes).toMatch(/three rounds/);
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

  it("--concurrent: every wave 1 Campaign shares one start and one end, 7 days; the rest follow; the default is unchanged", () => {
    const c = buildTopicRows(file, "2026-12-01", { concurrent: true });
    const wave1 = c.filter((r) => r.wave === 1);
    expect(wave1).toHaveLength(3);
    expect(wave1.map((r) => r.slug).sort()).toEqual(["in-person-exams-ai-cheating", "lifelong-learning-loans-age-60", "under-16-social-media-ban"]);
    for (const r of wave1) {
      expect(r.starts_at).toBe("2026-12-01T00:00:00.000Z");
      expect(r.ends_at).toBe("2026-12-08T00:00:00.000Z");
    }
    const rest = c.filter((r) => r.wave !== 1);
    expect(rest[0].starts_at).toBe("2026-12-08T00:00:00.000Z");
    for (let i = 1; i < rest.length; i++) expect(rest[i].starts_at).toBe(rest[i - 1].ends_at);
    expect(c).toHaveLength(rows.length);
    // Default (no option) is exactly what it was.
    expect(buildTopicRows(file, "2026-12-01")).toEqual(rows);
    expect(buildTopicRows(file, "2026-12-01", { concurrent: false })).toEqual(rows);
  });

  it("refuses a missing or malformed start date", () => {
    expect(() => buildTopicRows(file, "1 Dec")).toThrow(/YYYY-MM-DD/);
  });
});
