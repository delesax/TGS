import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Email notifications: preferences, the outbox and the triggers that fill it.

let author: TestUser;
let replier: TestUser;
let follower: TestUser;
let campaignId: string;
const campaignIds: string[] = [];
const hour = 3_600_000;

beforeAll(async () => {
  [author, replier, follower] = await Promise.all([createUser(), createUser(), createUser()]);
  campaignId = await createCampaign({ starts_at: new Date(Date.now() - 48 * hour).toISOString(), ends_at: new Date(Date.now() + 20 * hour).toISOString() });
  campaignIds.push(campaignId);
  for (const u of [author, replier]) {
    await u.client.from("campaign_positions").insert({ campaign_id: campaignId, user_id: u.id, after_position: "for" });
  }
  await service.from("community_settings").update({ cooldown_seconds: 0 }).eq("id", true);
});

afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30 }).eq("id", true);
  await deleteUsers([author, replier, follower]);
  await service.from("campaigns").delete().in("id", campaignIds);
});

describe("email preferences", () => {
  it("exist for every new Strategist, all on, and only the owner can read or change them", async () => {
    const { data } = await author.client.from("notification_preferences").select("replies, campaign_updates, closing_soon, unsubscribed_all_at").single();
    expect(data).toEqual({ replies: true, campaign_updates: true, closing_soon: true, unsubscribed_all_at: null });

    expect((await replier.client.from("notification_preferences").select("user_id").eq("user_id", author.id)).data ?? []).toHaveLength(0);
    await replier.client.from("notification_preferences").update({ replies: false }).eq("user_id", author.id);
    expect((await service.from("notification_preferences").select("replies").eq("user_id", author.id).single()).data!.replies).toBe(true);

    // The unsubscribe token is never readable from the browser.
    expect((await author.client.from("notification_preferences").select("unsubscribe_token")).error).not.toBeNull();
    expect((await anonClient().from("notification_preferences").select("user_id")).data ?? []).toHaveLength(0);
  });

  it("can be switched off with the token from an email (service role only)", async () => {
    const { data: prefs } = await service.from("notification_preferences").select("unsubscribe_token").eq("user_id", follower.id).single();
    expect((await anonClient().rpc("unsubscribe_by_token", { p_token: prefs!.unsubscribe_token, p_kind: "all" })).error).not.toBeNull();
    expect((await service.rpc("unsubscribe_by_token", { p_token: prefs!.unsubscribe_token, p_kind: "closing_soon" })).data).toBe(true);
    const { data } = await service.from("notification_preferences").select("closing_soon, replies").eq("user_id", follower.id).single();
    expect(data).toEqual({ closing_soon: false, replies: true });
    await service.from("notification_preferences").update({ closing_soon: true }).eq("user_id", follower.id);
  });
});

describe("email outbox", () => {
  it("is closed to browsers, and so are the processor's functions", async () => {
    for (const client of [anonClient(), author.client]) {
      expect((await client.from("email_outbox").select("id")).data ?? []).toHaveLength(0);
      expect((await client.from("email_outbox").insert({ user_id: author.id, kind: "reply", dedupe_key: "x" })).error).not.toBeNull();
      expect((await client.rpc("claim_email_batch", { p_limit: 1 })).error).not.toBeNull();
      expect((await client.rpc("email_recipients", { p_user_ids: [author.id] })).error).not.toBeNull();
    }
  });

  it("queues one reply email for the author being answered, never for replying to yourself", async () => {
    const { data: root } = await author.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: "My case.", p_ai_use: "none" });
    await applyScreening(root as string); // replies need a visible target (Sprint 4)
    const { data: reply } = await replier.client.rpc("post_dispatch", {
      p_campaign_id: campaignId,
      p_kind: "rebuttal",
      p_body: "A considered reply.",
      p_ai_use: "assisted",
      p_parent_id: root,
    });
    await author.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "rebuttal", p_body: "Replying to myself.", p_ai_use: "none", p_parent_id: root });

    const { data: queued } = await service.from("email_outbox").select("kind, user_id, dedupe_key, payload, send_after").eq("user_id", author.id);
    expect(queued).toHaveLength(1);
    expect(queued![0]).toMatchObject({ kind: "reply", dedupe_key: `reply:${reply}` });
    expect(queued![0].payload).toMatchObject({ excerpt: "A considered reply.", campaign_id: campaignId });
    // Held back for the digest window (10 minutes by default).
    expect(Date.parse(queued![0].send_after) - Date.now()).toBeGreaterThan(8 * 60_000);
  });

  it("queues open, round and close emails for followers, once each", async () => {
    const soon = await createCampaign({ status: "scheduled", starts_at: new Date(Date.now() - 1000).toISOString(), ends_at: new Date(Date.now() + 2 * hour).toISOString() });
    campaignIds.push(soon);
    await service.from("campaign_rounds").insert([
      { campaign_id: soon, position: 1, title: "Opening", starts_at: new Date(Date.now() - 1000).toISOString(), ends_at: new Date(Date.now() + hour).toISOString() },
    ]);
    await follower.client.from("campaign_follows").insert({ user_id: follower.id, campaign_id: soon });

    await service.rpc("campaign_tick");
    await service.rpc("campaign_tick"); // twice: nothing new
    const { data } = await service.from("email_outbox").select("kind").eq("user_id", follower.id).like("dedupe_key", `%${soon}%`);
    // Round 1 starts with the Campaign, so the "opened" email covers it.
    expect(data!.map((r) => r.kind)).toEqual(["campaign_opened"]);

    // Move the deadline into the past (the round goes first so it still fits inside the Campaign).
    await service.from("campaign_rounds").delete().eq("campaign_id", soon);
    const { error } = await service.from("campaigns").update({ ends_at: new Date(Date.now() - 500).toISOString() }).eq("id", soon);
    expect(error).toBeNull();
    await service.rpc("campaign_tick");
    const { data: after } = await service.from("email_outbox").select("kind").eq("user_id", follower.id).like("dedupe_key", `%${soon}%`).order("id");
    expect(after!.map((r) => r.kind)).toEqual(["campaign_opened", "campaign_closed"]);
  });

  it("queues a closing-soon reminder for everyone in a Campaign that closes within 24 hours, once", async () => {
    await service.rpc("queue_closing_soon_emails");
    await service.rpc("queue_closing_soon_emails");
    const { data } = await service.from("email_outbox").select("user_id").eq("kind", "campaign_closing_soon").like("dedupe_key", `%${campaignId}%`);
    expect(data!.map((r) => r.user_id).sort()).toEqual([author.id, replier.id].sort());
  });
});
