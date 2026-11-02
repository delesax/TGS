import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMITS,
  buildThreads,
  cooldownSecondsLeft,
  countReplies,
  describeDispatchError,
  editSecondsLeft,
  maxCharsFor,
  parseSources,
  postsLeftInRound,
  sanitiseSourceUrl,
  type DispatchRow,
} from "./dispatches";
import { dispatchInputSchema } from "./dispatch-schema";

describe("sanitiseSourceUrl", () => {
  it("accepts http and https, adding https:// when none is typed", () => {
    expect(sanitiseSourceUrl("https://www.ons.gov.uk/economy")).toEqual({ ok: true, url: "https://www.ons.gov.uk/economy", host: "ons.gov.uk" });
    expect(sanitiseSourceUrl("http://example.org/a")).toMatchObject({ ok: true, host: "example.org" });
    expect(sanitiseSourceUrl("  bbc.co.uk/news  ")).toEqual({ ok: true, url: "https://bbc.co.uk/news", host: "bbc.co.uk" });
  });

  it("rejects javascript:, data: and other schemes", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "ftp://example.com", "file:///etc/passwd", "mailto:a@b.com", "vbscript:x"]) {
      expect(sanitiseSourceUrl(bad).ok, bad).toBe(false);
    }
  });

  it("rejects spaces, credentials, hosts without a dot and very long links", () => {
    expect(sanitiseSourceUrl("https://exa mple.com").ok).toBe(false);
    expect(sanitiseSourceUrl("https://user:pass@example.com").ok).toBe(false);
    expect(sanitiseSourceUrl("https://localhost/x").ok).toBe(false);
    expect(sanitiseSourceUrl(`https://example.com/${"a".repeat(2100)}`).ok).toBe(false);
    expect(sanitiseSourceUrl("").ok).toBe(false);
  });

  it("strips tracking parameters and keeps the rest", () => {
    const result = sanitiseSourceUrl("https://example.com/report?id=7&utm_source=x&UTM_Medium=y&fbclid=abc&gclid=1&si=zz&page=2#section");
    expect(result).toEqual({ ok: true, url: "https://example.com/report?id=7&page=2#section", host: "example.com" });
  });
});

describe("parseSources", () => {
  it("ignores blank rows, drops duplicates and reports errors by row", () => {
    const { sources, errors } = parseSources([
      { url: "https://ons.gov.uk/a?utm_source=x", title: "ONS" },
      { url: "", title: "" },
      { url: "https://ons.gov.uk/a", title: "Same again" },
      { url: "javascript:alert(1)", title: "" },
    ]);
    expect(sources).toEqual([{ url: "https://ons.gov.uk/a", host: "ons.gov.uk", title: "ONS" }]);
    expect(Object.keys(errors)).toEqual(["source4"]);
  });

  it("allows at most five links", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ url: `https://example.com/${i}`, title: "" }));
    expect(parseSources(rows).errors.sources).toMatch(/at most 5/);
  });
});

describe("dispatchInputSchema", () => {
  const schema = dispatchInputSchema(DEFAULT_LIMITS);
  const base = { kind: "argument", body: "My case.", aiUse: "none", parentId: null, sources: [] };
  const source = { url: "https://ons.gov.uk/a", host: "ons.gov.uk" };
  const parent = "2b0f7f7e-8a38-4c0a-9a3e-3b1d1c0b5a11";

  it("uses the limit for each kind", () => {
    expect(maxCharsFor("argument", DEFAULT_LIMITS)).toBe(1500);
    expect(maxCharsFor("rebuttal", DEFAULT_LIMITS)).toBe(1000);
    expect(maxCharsFor("evidence", DEFAULT_LIMITS)).toBe(600);
    expect(schema.safeParse({ ...base, body: "x".repeat(1500) }).success).toBe(true);
    expect(schema.safeParse({ ...base, body: "x".repeat(1501) }).success).toBe(false);
    expect(schema.safeParse({ ...base, kind: "rebuttal", parentId: parent, body: "x".repeat(1001) }).success).toBe(false);
    expect(schema.safeParse({ ...base, kind: "evidence", sources: [source], body: "x".repeat(601) }).success).toBe(false);
  });

  it("requires an explicit AI-use declaration, with no default", () => {
    const result = schema.safeParse({ ...base, aiUse: undefined });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toMatch(/Say whether you used AI/);
  });

  it("applies the rules for each kind", () => {
    expect(schema.safeParse({ ...base, kind: "rebuttal" }).success).toBe(false);
    expect(schema.safeParse({ ...base, kind: "rebuttal", parentId: parent }).success).toBe(true);
    expect(schema.safeParse({ ...base, parentId: parent }).success).toBe(false);
    expect(schema.safeParse({ ...base, sources: [source] }).success).toBe(false);
    expect(schema.safeParse({ ...base, kind: "evidence" }).success).toBe(false);
    expect(schema.safeParse({ ...base, kind: "evidence", sources: [source] }).success).toBe(true);
    expect(schema.safeParse({ ...base, body: "   " }).success).toBe(false);
  });
});

describe("time windows and limits", () => {
  const posted = "2026-11-02T10:00:00.000Z";
  const at = (s: number) => Date.parse(posted) + s * 1000;

  it("counts down the 5-minute edit window to exactly zero", () => {
    expect(editSecondsLeft(posted, at(0), DEFAULT_LIMITS)).toBe(300);
    expect(editSecondsLeft(posted, at(299.5), DEFAULT_LIMITS)).toBe(1);
    expect(editSecondsLeft(posted, at(300), DEFAULT_LIMITS)).toBe(0);
    expect(editSecondsLeft(posted, at(900), DEFAULT_LIMITS)).toBe(0);
  });

  it("counts down the cooldown and the posts left in a round", () => {
    expect(cooldownSecondsLeft(null, at(0), DEFAULT_LIMITS)).toBe(0);
    expect(cooldownSecondsLeft(posted, at(10), DEFAULT_LIMITS)).toBe(20);
    expect(cooldownSecondsLeft(posted, at(30), DEFAULT_LIMITS)).toBe(0);
    expect(postsLeftInRound(3, DEFAULT_LIMITS)).toBe(7);
    expect(postsLeftInRound(12, DEFAULT_LIMITS)).toBe(0);
  });
});

describe("describeDispatchError", () => {
  it("turns database codes into plain English with a next step", () => {
    const cooldown = describeDispatchError({ message: "COOLDOWN: wait 12 seconds", details: "12" });
    expect(cooldown).toMatchObject({ code: "COOLDOWN", waitSeconds: 12 });
    expect(cooldown.message).toBe("Please wait 12 seconds before posting again.");
    expect(describeDispatchError({ message: "ROUND_LIMIT: you have posted 10", details: "10" }).message).toMatch(/limit of 10 Dispatches/);
    expect(describeDispatchError({ message: "BODY_TOO_LONG: keep it to 1500", details: "1500" }).message).toMatch(/1,500 characters/);
    expect(describeDispatchError({ message: "CAMPAIGN_CLOSED: closed" }).hint).toBeTruthy();
    expect(describeDispatchError({ message: "Network down" }).code).toBe("UNKNOWN");
  });
});

describe("buildThreads", () => {
  let t = 0;
  const row = (id: string, parent: string | null, display: string | null, depth: number, handle = id): DispatchRow => ({
    id,
    campaign_id: "c",
    author_id: `u-${handle}`,
    parent_id: parent,
    display_parent_id: display,
    root_id: "r",
    depth,
    kind: parent ? "rebuttal" : "argument",
    position: "for",
    body: id,
    moderation_status: "visible",
    held_reason: null,
    sources: [],
    ai_use: "none",
    round_position: null,
    reaction_counts: {},
    created_at: new Date(Date.UTC(2026, 10, 2, 10, 0, t++)).toISOString(),
    edited_at: null,
    withdrawn_at: null,
    hidden_at: null,
    author: { handle },
  });

  it("puts roots newest first and replies oldest first, flattening below depth 4", () => {
    const rows = [
      row("a", null, null, 0),
      row("b", null, null, 0),
      row("a1", "a", "a", 1),
      row("a2", "a1", "a1", 2),
      row("a3", "a2", "a2", 3),
      row("a4", "a3", "a3", 4),
      row("a5", "a4", "a3", 4, "eve"), // replies to a4 but sits flat under a3
      row("a1b", "a", "a", 1),
    ];
    const threads = buildThreads(rows);
    expect(threads.map((n) => n.id)).toEqual(["b", "a"]);
    const a = threads[1];
    expect(a.children.map((n) => n.id)).toEqual(["a1", "a1b"]);
    const a3 = a.children[0].children[0].children[0];
    expect(a3.children.map((n) => n.id)).toEqual(["a4", "a5"]);
    expect(a3.children[1].replyingTo).toEqual({ id: "a4", handle: "a4" });
    expect(a3.children[0].replyingTo).toBeNull();
    expect(countReplies(a)).toBe(6);
  });

  it("drops replies whose parent is not loaded instead of misplacing them", () => {
    expect(buildThreads([row("x", null, null, 0), row("orphan", "gone", "gone", 1)]).map((n) => n.id)).toEqual(["x"]);
  });
});
