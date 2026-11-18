import { describe, expect, it } from "vitest";
import {
  MAX_BATCH,
  canReissue,
  canRevoke,
  cleanNote,
  describeInvite,
  inviteMessage,
  joinRequestSchema,
  normaliseEmail,
  parseEmailList,
  splitBySendDay,
  type OverviewRow,
} from "./join-requests";

describe("normaliseEmail", () => {
  it("lower-cases and trims, and refuses anything that is not an address", () => {
    expect(normaliseEmail("  Name@Example.COM ")).toBe("name@example.com");
    for (const bad of ["", "name", "name@", "@example.com", "a b@example.com", "a@b", "x".repeat(321) + "@example.com"]) expect(normaliseEmail(bad), bad).toBeNull();
  });
});

describe("cleanNote and the form schema", () => {
  it("turns control characters and line breaks into single spaces", () => {
    expect(cleanNote("  hello\r\nthere\u0007\tyou  ")).toBe("hello there you");
  });

  it("accepts an address with an optional note, normalised", () => {
    expect(joinRequestSchema.parse({ email: " A@B.CO ", note: "" })).toEqual({ email: "a@b.co", note: "" });
    expect(joinRequestSchema.parse({ email: "a@b.co", note: "How I heard" }).note).toBe("How I heard");
  });

  it("refuses a bad address and a note over 200 characters", () => {
    expect(joinRequestSchema.safeParse({ email: "nope", note: "" }).success).toBe(false);
    expect(joinRequestSchema.safeParse({ email: "a@b.co", note: "x".repeat(201) }).success).toBe(false);
    expect(joinRequestSchema.safeParse({ email: "a@b.co", note: "x".repeat(200) }).success).toBe(true);
  });
});

describe("parseEmailList", () => {
  it("reads one per line or separated by commas, drops repeats in any case and reports what is not an address", () => {
    const r = parseEmailList("a@x.com\nB@x.com, a@X.com; <c@x.com>\n\nnot-an-email  d@x");
    expect(r.emails).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(r.invalid).toEqual(["not-an-email", "d@x"]);
  });

  it("has a batch limit of 50", () => {
    expect(MAX_BATCH).toBe(50);
  });
});

describe("splitBySendDay", () => {
  it("sends what fits in today's room now and the rest on later days", () => {
    expect(splitBySendDay(10, 4)).toEqual({ today: 4, later: 6 });
    expect(splitBySendDay(3, 40)).toEqual({ today: 3, later: 0 });
    expect(splitBySendDay(5, 0)).toEqual({ today: 0, later: 5 });
    expect(splitBySendDay(5, -2)).toEqual({ today: 0, later: 5 });
  });
});

describe("describeInvite", () => {
  const now = Date.parse("2026-12-01T12:00:00Z");
  const row = (over: Partial<OverviewRow>): OverviewRow => ({
    request_id: "r", email: "a@b.co", status: "approved", source: "form", created_at: "2026-11-30T10:00:00Z", decided_at: "2026-11-30T11:00:00Z",
    invite_id: "i", expires_at: "2026-12-07T00:00:00Z", revoked_at: null, used: false, email_state: "sent", send_after: null, ...over,
  });

  it("names where each invitation stands", () => {
    expect(describeInvite(row({}), now)).toBe("emailed");
    expect(describeInvite(row({ email_state: "queued" }), now)).toBe("waiting");
    expect(describeInvite(row({ email_state: "failed" }), now)).toBe("failed");
    expect(describeInvite(row({ email_state: "skipped" }), now)).toBe("not_sent");
    expect(describeInvite(row({ email_state: null }), now)).toBe("link_shown");
    expect(describeInvite(row({ used: true }), now)).toBe("joined");
    expect(describeInvite(row({ revoked_at: "2026-12-01T00:00:00Z" }), now)).toBe("revoked");
    expect(describeInvite(row({ expires_at: "2026-12-01T11:59:59Z" }), now)).toBe("expired");
    expect(describeInvite(row({ status: "rejected", invite_id: null }), now)).toBe("rejected");
  });

  it("lets an admin revoke a live invite, and re-issue a live, revoked or expired one, but not one that was used", () => {
    for (const s of ["emailed", "waiting", "link_shown", "failed", "not_sent"] as const) {
      expect(canRevoke(s), s).toBe(true);
      expect(canReissue(s), s).toBe(true);
    }
    expect(canRevoke("revoked")).toBe(false);
    expect(canReissue("revoked")).toBe(true);
    expect(canReissue("expired")).toBe(true);
    expect(canReissue("joined")).toBe(false);
    expect(canRevoke("joined")).toBe(false);
    expect(canReissue("rejected")).toBe(false);
  });
});

describe("inviteMessage", () => {
  it("carries the link, says the invite is single use and for one address, and names the days when known", () => {
    const text = inviteMessage("https://example.test/signup?code=TGS-AAAA", 7);
    expect(text).toContain("Create your account: https://example.test/signup?code=TGS-AAAA");
    expect(text).toContain("Use the email address this was sent to. The invite works once and lasts 7 days.");
    expect(inviteMessage("https://example.test/x")).toContain("The invite works once.");
  });
});
