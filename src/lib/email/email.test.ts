import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, idempotencyKey, planDelivery, retryDelayMinutes, type OutboxRow, type RecipientInfo } from "./plan";
import { campaignEmail, moderationEmail, replyDigest } from "./templates";
import { resolveTransport } from "./transport";

const recipient: RecipientInfo = {
  user_id: "u1",
  email: "a@example.test",
  confirmed: true,
  handle: "Ada",
  replies: true,
  campaign_updates: true,
  closing_soon: true,
  moderation: true,
  unsubscribed_all: false,
  unsubscribe_token: "11111111-2222-3333-4444-555555555555",
  sent_last_24h: 0,
  daily_cap: 6,
};
const reply = (id: number, dispatch = `d${id}`): OutboxRow => ({
  id,
  user_id: "u1",
  kind: "reply",
  attempts: 1,
  payload: { dispatch_id: dispatch, campaign_slug: "c", campaign_title: "C", replier_handle: "Bo", excerpt: "Hi" },
});
const event = (id: number, kind: OutboxRow["kind"], payload: Record<string, unknown> = {}): OutboxRow => ({ id, user_id: "u1", kind, attempts: 1, payload });
const ctx = { now: Date.parse("2026-11-03T12:00:00Z"), unavailableReplies: new Set<string>() };

describe("planDelivery", () => {
  it("batches every waiting reply into one digest", () => {
    const plan = planDelivery([reply(1), reply(2), reply(3)], recipient, ctx);
    expect(plan.messages).toHaveLength(1);
    expect(plan.messages[0].rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("sends nothing to an unconfirmed or unsubscribed address", () => {
    expect(planDelivery([reply(1)], { ...recipient, confirmed: false }, ctx).skipped).toEqual([{ id: 1, reason: "email address not confirmed" }]);
    expect(planDelivery([reply(1)], { ...recipient, unsubscribed_all: true }, ctx).messages).toEqual([]);
    expect(planDelivery([reply(1)], undefined, ctx).skipped[0].reason).toBe("no account");
  });

  it("respects each preference and drops withdrawn replies and stale reminders", () => {
    const plan = planDelivery(
      [reply(1), reply(2, "gone"), event(3, "campaign_opened"), event(4, "campaign_closing_soon", { ends_at: "2026-11-03T11:00:00Z" })],
      { ...recipient, campaign_updates: false },
      { ...ctx, unavailableReplies: new Set(["gone"]) },
    );
    expect(plan.messages.map((m) => m.rows.map((r) => r.id))).toEqual([[1]]);
    expect(plan.skipped.map((s) => s.id).sort()).toEqual([2, 3, 4]);
  });

  it("caps emails per day, sending the most urgent first and keeping the rest queued", () => {
    const rows = [reply(1), event(2, "campaign_closed"), event(3, "campaign_closing_soon", { ends_at: "2026-11-04T00:00:00Z" }), event(4, "campaign_opened")];
    const plan = planDelivery(rows, { ...recipient, sent_last_24h: 4 }, ctx);
    expect(plan.messages.map((m) => m.kind)).toEqual(["campaign_closing_soon", "campaign_opened"]);
    expect(plan.deferred.sort()).toEqual([1, 2]);
    expect(planDelivery(rows, { ...recipient, sent_last_24h: 6 }, ctx).messages).toEqual([]);
  });

  it("gives a retry the same idempotency key and backs off", () => {
    const a = planDelivery([reply(2), reply(1)], recipient, ctx).messages[0];
    const b = planDelivery([reply(1), reply(2)], recipient, ctx).messages[0];
    expect(idempotencyKey(a)).toBe(idempotencyKey(b));
    expect([1, 2, 3, 4, 9].map(retryDelayMinutes)).toEqual([5, 10, 20, 40, 40]);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});

describe("templates", () => {
  const who = { handle: "Ada", unsubscribeToken: recipient.unsubscribe_token };

  it("write a reply digest in plain text and escaped HTML, with an unsubscribe link", () => {
    const email = replyDigest("https://tgs.example", who, [
      { dispatch_id: "d1", campaign_slug: "four-day-week", campaign_title: "Four-day week?", replier_handle: "Bo", excerpt: "<script>alert(1)</script> fair point" },
      { dispatch_id: "d2", campaign_slug: "four-day-week", campaign_title: "Four-day week?", replier_handle: "Cy", excerpt: "Agreed." },
    ]);
    expect(email.subject).toBe("2 replies to your Dispatches");
    expect(email.text).toContain("https://tgs.example/campaigns/four-day-week#dispatch-d1");
    expect(email.text).toContain("Stop these emails: https://tgs.example/email/unsubscribe?token=11111111-2222-3333-4444-555555555555&kind=replies");
    expect(email.html).toContain('<html lang="en-GB">');
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("use the project vocabulary for Campaign events", () => {
    const email = campaignEmail("https://tgs.example", who, "campaign_round_changed", { campaign_slug: "x", campaign_title: "Should X?", round: 2, round_title: "Rebuttals", ends_at: "2026-12-08T00:00:00Z" });
    expect(email.subject).toBe("Round 2: Rebuttals – Should X?");
    expect(email.text).toContain("A Campaign you follow has moved to its next round.");
    expect(email.preference).toBe("campaign_updates");
    expect(campaignEmail("https://tgs.example", who, "campaign_closing_soon", { campaign_slug: "x", campaign_title: "X" }).preference).toBe("closing_soon");
  });
});

describe("resolveTransport", () => {
  it("fails safely when Resend has no sender, or nothing is configured", () => {
    expect(resolveTransport({ RESEND_API_KEY: "re_test" })).toEqual({ kind: "misconfigured", reason: expect.stringContaining("EMAIL_FROM") });
    expect(resolveTransport({}).kind).toBe("misconfigured");
    expect(resolveTransport({ EMAIL_TRANSPORT: "mailpit" }).kind).toBe("misconfigured");
  });

  it("uses Resend when configured, and Mailpit locally", () => {
    expect(resolveTransport({ RESEND_API_KEY: "re_test", EMAIL_FROM: "TGS <n@example.com>" }).kind).toBe("resend");
    expect(resolveTransport({ MAILPIT_URL: "http://127.0.0.1:54324" }).kind).toBe("mailpit");
    expect(resolveTransport({ EMAIL_TRANSPORT: "mailpit", MAILPIT_URL: "http://x", RESEND_API_KEY: "re" }).kind).toBe("mailpit");
  });
});

describe("moderation emails", () => {
  it("say the outcome in plain words, never a private reason, with the moderation unsubscribe", () => {
    const who = { handle: "Ada", unsubscribeToken: "11111111-2222-3333-4444-555555555555" };
    const base = { dispatch_id: "d1", campaign_slug: "c", campaign_title: "Should <b>x</b> happen?" };
    const held = moderationEmail("https://tgs.test", who, { ...base, outcome: "held" });
    expect(held.subject).toBe("Your Dispatch is waiting for a check");
    expect(held.text).toMatch(/appeal once/);
    expect(held.preference).toBe("moderation");
    expect(held.unsubscribeUrl).toContain("kind=moderation");
    expect(held.html).not.toContain("<b>x</b>");
    expect(moderationEmail("https://tgs.test", who, { ...base, outcome: "released", appeal: true }).subject).toBe("Your appeal was upheld");
    const removed = moderationEmail("https://tgs.test", who, { ...base, outcome: "removed", appeal: true });
    expect(removed.subject).toBe("Your appeal was not upheld");
    expect(removed.text).toMatch(/not deleted/);
  });
});
