import { describe, expect, it } from "vitest";
import {
  announcementBucket,
  campaignInputSchema,
  currentRound,
  describeDuration,
  formatUkDateTime,
  fromUkInputValue,
  groupCampaigns,
  secondsLeft,
  slugify,
  statusAt,
  toUkInputValue,
} from "./campaigns";

const START = "2026-12-01T09:00:00.000Z";
const END = "2026-12-08T09:00:00.000Z";
const scheduled = { status: "scheduled" as const, starts_at: START, ends_at: END };
const ms = Date.parse;

describe("statusAt", () => {
  it("is scheduled one millisecond before the start", () => {
    expect(statusAt(scheduled, ms(START) - 1)).toBe("scheduled");
  });
  it("is open exactly at the start", () => {
    expect(statusAt(scheduled, ms(START))).toBe("open");
  });
  it("is open one millisecond before the end", () => {
    expect(statusAt(scheduled, ms(END) - 1)).toBe("open");
  });
  it("is closed exactly at the end", () => {
    expect(statusAt(scheduled, ms(END))).toBe("closed");
    expect(statusAt({ ...scheduled, status: "open" }, ms(END))).toBe("closed");
  });
  it("keeps drafts as drafts whatever the time", () => {
    expect(statusAt({ ...scheduled, status: "draft" }, ms(START) + 1000)).toBe("draft");
  });
  it("is the same answer the scheduler gives when it is late by a minute", () => {
    // Database still says 'scheduled' 30 seconds after the start: the page shows open.
    expect(statusAt(scheduled, ms(START) + 30_000)).toBe("open");
  });
});

describe("currentRound", () => {
  const rounds = [
    { position: 2, title: "Rebuttals", starts_at: "2026-12-03T09:00:00.000Z", ends_at: "2026-12-05T09:00:00.000Z" },
    { position: 1, title: "Openings", starts_at: START, ends_at: "2026-12-03T09:00:00.000Z" },
  ];
  it("finds round 1 exactly at its start", () => {
    expect(currentRound(rounds, ms(START))?.position).toBe(1);
  });
  it("switches to round 2 exactly when round 1 ends", () => {
    expect(currentRound(rounds, ms("2026-12-03T09:00:00.000Z"))?.position).toBe(2);
    expect(currentRound(rounds, ms("2026-12-03T09:00:00.000Z") - 1)?.position).toBe(1);
  });
  it("is null between and after rounds", () => {
    expect(currentRound(rounds, ms("2026-12-05T09:00:00.000Z"))).toBeNull();
    expect(currentRound(rounds, ms(START) - 1)).toBeNull();
  });
});

describe("groupCampaigns", () => {
  it("puts each Campaign in Open now, Opening soon or Closed and hides drafts", () => {
    const now = ms("2026-12-02T00:00:00.000Z");
    const g = groupCampaigns(
      [
        { id: "a", ...scheduled },
        { id: "b", status: "scheduled", starts_at: "2026-12-10T00:00:00.000Z", ends_at: "2026-12-17T00:00:00.000Z" },
        { id: "c", status: "closed", starts_at: "2026-11-01T00:00:00.000Z", ends_at: "2026-11-08T00:00:00.000Z" },
        { id: "d", status: "draft", starts_at: START, ends_at: END },
      ] as const,
      now,
    );
    expect(g.open.map((c) => c.id)).toEqual(["a"]);
    expect(g.soon.map((c) => c.id)).toEqual(["b"]);
    expect(g.closed.map((c) => c.id)).toEqual(["c"]);
  });
});

describe("UK time across the clocks changing", () => {
  it("reads winter times as GMT and summer times as BST", () => {
    expect(fromUkInputValue("2026-12-01T09:00")).toBe("2026-12-01T09:00:00.000Z");
    expect(fromUkInputValue("2026-07-01T09:00")).toBe("2026-07-01T08:00:00.000Z");
  });
  it("refuses a time skipped when the clocks go forward (29 March 2026, 1am to 2am)", () => {
    expect(fromUkInputValue("2026-03-29T01:30")).toBeNull();
    expect(fromUkInputValue("2026-03-29T02:00")).toBe("2026-03-29T01:00:00.000Z");
  });
  it("reads a repeated time when the clocks go back (25 October 2026) as the first, BST, one", () => {
    expect(fromUkInputValue("2026-10-25T01:30")).toBe("2026-10-25T00:30:00.000Z");
  });
  it("round-trips through the form input", () => {
    for (const iso of ["2026-12-01T09:00:00.000Z", "2026-07-01T08:00:00.000Z", "2026-10-25T02:30:00.000Z"]) {
      expect(fromUkInputValue(toUkInputValue(iso))).toBe(iso);
    }
  });
  it("counts a week spanning the clock change as exactly 7 x 24 hours of real time", () => {
    const start = fromUkInputValue("2026-10-22T09:00")!;
    const end = fromUkInputValue("2026-10-29T09:00")!;
    // 9am to 9am UK time is 7 days plus the extra hour when the clocks go back.
    expect(secondsLeft(ms(end), ms(start))).toBe(7 * 86_400 + 3_600);
  });
  it("shows deadlines in UK time", () => {
    expect(formatUkDateTime("2026-12-01T09:00:00.000Z")).toBe("Tuesday 1 December 2026, 9:00am (UK time)");
    expect(formatUkDateTime("2026-07-01T08:00:00.000Z")).toBe("Wednesday 1 July 2026, 9:00am (UK time)");
  });
});

describe("countdown wording", () => {
  it("describes time left in plain words", () => {
    expect(describeDuration(2 * 86_400 + 4 * 3_600 + 5)).toBe("2 days 4 hours");
    expect(describeDuration(3 * 3_600 + 12 * 60)).toBe("3 hours 12 minutes");
    expect(describeDuration(5 * 60 + 3)).toBe("5 minutes 3 seconds");
    expect(describeDuration(1)).toBe("1 second");
  });
  it("never goes below zero", () => {
    expect(secondsLeft(1000, 5000)).toBe(0);
  });
  it("announces hourly, then every 10 minutes, every minute, every 10 seconds", () => {
    expect(announcementBucket(2 * 86_400 - 10)).toBe(announcementBucket(2 * 86_400 - 1000));
    expect(announcementBucket(5000)).not.toBe(announcementBucket(4000));
    expect(announcementBucket(305)).toBe(360);
    expect(announcementBucket(301)).toBe(360);
    expect(announcementBucket(299)).toBe(300);
    expect(announcementBucket(45)).toBe(50);
  });
});

describe("campaignInputSchema", () => {
  const valid = {
    title: "Should the four-day week become the norm?",
    slug: "four-day-week",
    summary: "A question about work.",
    rules: "",
    category: "technology",
    format: "progressive",
    status: "scheduled",
    startsAt: "2026-12-01T09:00",
    endsAt: "2026-12-08T09:00",
    isSensitive: false,
    contentNote: "",
    opinionNotAdvice: false,
    notes: "",
    rounds: [
      { title: "Openings", startsAt: "2026-12-01T09:00", endsAt: "2026-12-04T09:00" },
      { title: "Closings", startsAt: "2026-12-04T09:00", endsAt: "2026-12-08T09:00" },
    ],
  };

  it("accepts a valid Campaign and converts UK time to UTC", () => {
    const r = campaignInputSchema.parse(valid);
    expect(r.startsAt).toBe("2026-12-01T09:00:00.000Z");
  });
  it("refuses a round ending after its Campaign", () => {
    const r = campaignInputSchema.safeParse({
      ...valid,
      rounds: [{ title: "Too long", startsAt: "2026-12-01T09:00", endsAt: "2026-12-09T09:00" }],
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toMatch(/within the Campaign/);
  });
  it("refuses overlapping rounds", () => {
    const r = campaignInputSchema.safeParse({
      ...valid,
      rounds: [valid.rounds[0], { ...valid.rounds[1], startsAt: "2026-12-03T09:00" }],
    });
    expect(r.error!.issues[0].message).toMatch(/must not start before round 1 ends/);
  });
  it("needs a content note when sensitive", () => {
    const r = campaignInputSchema.safeParse({ ...valid, isSensitive: true });
    expect(r.error!.issues[0].path).toEqual(["contentNote"]);
  });
  it("refuses an end before the start", () => {
    const r = campaignInputSchema.safeParse({ ...valid, endsAt: "2026-11-30T09:00", rounds: [] });
    expect(r.error!.issues[0].path).toEqual(["endsAt"]);
  });
});

describe("slugify", () => {
  it("makes a web address from a title", () => {
    expect(slugify("Should the UK ban under-16s from social media?")).toBe("should-the-uk-ban-under-16s-from-social-media");
  });
});
