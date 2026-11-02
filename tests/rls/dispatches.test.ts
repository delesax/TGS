import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 3: Dispatches through post_dispatch(), edits, withdraw, hide, reports,
// reactions, follows, settings and search. Everything runs against LOCAL Supabase.

let author: TestUser;
let reader: TestUser;
let admin: TestUser;
let noHandle: TestUser;
let noPosition: TestUser;
let openId: string;
let oxfordId: string;
let closedId: string;
let draftId: string;
let scheduledId: string;
let roundsId: string;
let otherOpenId: string;
const campaignIds: string[] = [];
const hour = 3_600_000;

type PostArgs = { kind?: string; body?: string; ai_use?: string | null; parent?: string | null; sources?: unknown[]; campaign?: string };

async function post(user: TestUser | SupabaseClient, args: PostArgs = {}) {
  const client = "client" in user ? user.client : user;
  return client.rpc("post_dispatch", {
    p_campaign_id: args.campaign ?? openId,
    p_kind: args.kind ?? "argument",
    p_body: args.body ?? "A considered argument about the question.",
    p_ai_use: args.ai_use === undefined ? "none" : args.ai_use,
    p_parent_id: args.parent ?? null,
    p_sources: args.sources ?? [],
  });
}

async function postOk(user: TestUser, args: PostArgs = {}): Promise<string> {
  const { data, error } = await post(user, args);
  if (error) throw new Error(`post_dispatch failed: ${error.message}`);
  return data as string;
}

async function setPosition(user: TestUser, campaignId: string, position: string) {
  const { error } = await user.client.from("campaign_positions").insert({ campaign_id: campaignId, user_id: user.id, after_position: position });
  if (error) throw error;
}

/** Most tests post several times in a row: lift the cooldown and per-round limit, restoring them afterwards. */
async function setSettings(values: Record<string, number>) {
  const { error } = await service.from("community_settings").update(values).eq("id", true);
  if (error) throw error;
}

const SOURCE = { url: "https://www.ons.gov.uk/report", host: "ons.gov.uk", title: "ONS report" };

beforeAll(async () => {
  [author, reader, admin, noHandle, noPosition] = await Promise.all([
    createUser(),
    createUser(),
    createUser({ admin: true }),
    createUser({ handle: null }),
    createUser(),
  ]);
  const now = Date.now();
  openId = await createCampaign({ title: "Should zebra crossings glow at night?" });
  otherOpenId = await createCampaign();
  oxfordId = await createCampaign({ format: "oxford" });
  closedId = await createCampaign({ status: "closed", starts_at: new Date(now - 3 * hour).toISOString(), ends_at: new Date(now - hour).toISOString() });
  draftId = await createCampaign({ status: "draft", title: "Draft about quokka welfare" });
  scheduledId = await createCampaign({ status: "scheduled", starts_at: new Date(now + hour).toISOString(), ends_at: new Date(now + 3 * hour).toISOString() });
  roundsId = await createCampaign({ format: "progressive", starts_at: new Date(now - 2 * hour).toISOString(), ends_at: new Date(now + 2 * hour).toISOString() });
  campaignIds.push(openId, otherOpenId, oxfordId, closedId, draftId, scheduledId, roundsId);

  const { error: roundsError } = await service.from("campaign_rounds").insert([
    { campaign_id: roundsId, position: 1, title: "Opening", starts_at: new Date(now - 2 * hour).toISOString(), ends_at: new Date(now - hour).toISOString(), allowed_kinds: ["argument", "rebuttal", "evidence"] },
    {
      campaign_id: roundsId,
      position: 2,
      title: "Rebuttals",
      starts_at: new Date(now - hour).toISOString(),
      ends_at: new Date(now + 2 * hour).toISOString(),
      allowed_kinds: ["rebuttal", "evidence"],
    },
  ]);
  if (roundsError) throw roundsError;

  for (const user of [author, reader, admin]) {
    for (const id of [openId, otherOpenId, roundsId]) await setPosition(user, id, user === reader ? "against" : "for");
  }
  await setPosition(author, oxfordId, "undecided");
  await setSettings({ cooldown_seconds: 0, max_dispatches_per_round: 100 });
});

afterAll(async () => {
  await setSettings({ cooldown_seconds: 30, max_dispatches_per_round: 10, argument_max_chars: 1500, edit_window_seconds: 300 });
  await deleteUsers([author, reader, admin, noHandle, noPosition]); // cascades Dispatches, reactions, follows, reports
  await service.from("campaigns").delete().in("id", campaignIds);
});

describe("posting through post_dispatch()", () => {
  it("posts a visible argument with the author's position, audits it and follows the Campaign", async () => {
    const id = await postOk(author);
    const { data } = await anonClient().from("dispatches").select("kind, position, moderation_status, round_position, depth, root_id").eq("id", id).single();
    expect(data).toEqual({ kind: "argument", position: "for", moderation_status: "visible", round_position: null, depth: 0, root_id: id });

    const { data: log } = await service.from("audit_log").select("action, actor_id").eq("target_id", id);
    expect(log).toEqual([{ action: "dispatch.created", actor_id: author.id }]);
    const { data: follow } = await author.client.from("campaign_follows").select("campaign_id").eq("campaign_id", openId);
    expect(follow).toHaveLength(1);
  });

  it("refuses visitors who are not signed in, and Strategists without a handle", async () => {
    expect((await post(anonClient())).error).not.toBeNull();
    expect((await post(noHandle)).error?.message).toMatch(/^NOT_ONBOARDED/);
  });

  it("needs a recorded position, and For or Against in an Oxford-style Campaign", async () => {
    expect((await post(noPosition)).error?.message).toMatch(/^POSITION_REQUIRED/);
    expect((await post(author, { campaign: oxfordId })).error?.message).toMatch(/^POSITION_SIDE_REQUIRED/);
  });

  it("refuses draft, scheduled and closed Campaigns by server time", async () => {
    expect((await post(author, { campaign: draftId })).error?.message).toMatch(/^CAMPAIGN_NOT_FOUND/);
    expect((await post(author, { campaign: scheduledId })).error?.message).toMatch(/^CAMPAIGN_NOT_OPEN/);
    expect((await post(author, { campaign: closedId })).error?.message).toMatch(/^CAMPAIGN_CLOSED/);
  });

  it("requires an explicit AI-use declaration", async () => {
    expect((await post(author, { ai_use: null })).error?.message).toMatch(/^AI_USE_REQUIRED/);
  });

  it("enforces the rules for each kind", async () => {
    const target = await postOk(author);
    expect((await post(author, { kind: "rebuttal" })).error?.message).toMatch(/^REBUTTAL_NEEDS_TARGET/);
    expect((await post(author, { sources: [SOURCE] })).error?.message).toMatch(/^ARGUMENT_NO_SOURCES/);
    expect((await post(author, { kind: "evidence" })).error?.message).toMatch(/^EVIDENCE_NEEDS_SOURCE/);
    expect((await post(author, { kind: "evidence", parent: target, sources: [SOURCE] })).error?.message).toMatch(/^ONLY_REBUTTALS_REPLY/);
    const elsewhere = await postOk(author, { campaign: otherOpenId });
    expect((await post(reader, { kind: "rebuttal", parent: elsewhere })).error?.message).toMatch(/^TARGET_NOT_IN_CAMPAIGN/);
    expect(await postOk(author, { kind: "evidence", body: "The ONS figures.", sources: [SOURCE] })).toBeTruthy();
  });

  it("rejects source links that are not http or https, and more than five", async () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com/file", "https://exa mple.com"]) {
      const { error } = await post(author, { kind: "evidence", sources: [{ url, host: "example.com" }] });
      expect(error, url).not.toBeNull();
    }
    const six = Array.from({ length: 6 }, (_, i) => ({ ...SOURCE, url: `https://ons.gov.uk/${i}` }));
    expect((await post(author, { kind: "evidence", sources: six })).error).not.toBeNull();
  });

  it("uses the length limits from the settings table, which only admins can change", async () => {
    await reader.client.from("community_settings").update({ argument_max_chars: 5000 }).eq("id", true);
    const { data: unchanged } = await service.from("community_settings").select("argument_max_chars").single();
    expect(unchanged!.argument_max_chars).toBe(1500);

    expect((await post(author, { body: "x".repeat(1501) })).error?.message).toMatch(/^BODY_TOO_LONG/);
    const { error } = await admin.client.from("community_settings").update({ argument_max_chars: 2000 }).eq("id", true);
    expect(error).toBeNull();
    expect((await post(author, { body: "x".repeat(1501) })).error).toBeNull();
    await setSettings({ argument_max_chars: 1500 });

    const { data: log } = await service.from("audit_log").select("action").eq("action", "settings.updated").eq("actor_id", admin.id);
    expect(log!.length).toBeGreaterThan(0);
  });

  it("applies the per-round limit and the cooldown", async () => {
    const fresh = await createUser();
    await setPosition(fresh, otherOpenId, "for");
    try {
      await setSettings({ max_dispatches_per_round: 2, cooldown_seconds: 0 });
      await postOk(fresh, { campaign: otherOpenId });
      await postOk(fresh, { campaign: otherOpenId });
      expect((await post(fresh, { campaign: otherOpenId })).error?.message).toMatch(/^ROUND_LIMIT/);

      await setSettings({ max_dispatches_per_round: 100, cooldown_seconds: 60 });
      const { error } = await post(fresh, { campaign: otherOpenId });
      expect(error?.message).toMatch(/^COOLDOWN/);
      expect(Number(error?.details)).toBeGreaterThan(50);
    } finally {
      await setSettings({ cooldown_seconds: 0, max_dispatches_per_round: 100 });
      await deleteUsers([fresh]);
    }
  });

  it("only accepts the kinds the current round allows, and records the round", async () => {
    expect((await post(author, { campaign: roundsId })).error?.message).toMatch(/^KIND_NOT_IN_ROUND/);
    const id = await postOk(author, { campaign: roundsId, kind: "evidence", sources: [SOURCE] });
    const { data } = await service.from("dispatches").select("round_position").eq("id", id).single();
    expect(data!.round_position).toBe(2);
  });
});

describe("threads", () => {
  it("nest rebuttals to depth 4, then continue flat under the last level", async () => {
    const root = await postOk(author);
    const ids = [root];
    for (let i = 0; i < 6; i++) {
      ids.push(await postOk(i % 2 ? author : reader, { kind: "rebuttal", parent: ids[ids.length - 1], body: `Reply ${i + 1}` }));
    }
    const { data } = await service.from("dispatches").select("id, parent_id, display_parent_id, depth, root_id").in("id", ids);
    const byId = new Map(data!.map((d) => [d.id, d]));
    expect(ids.map((id) => byId.get(id)!.depth)).toEqual([0, 1, 2, 3, 4, 4, 4]);
    expect(ids.every((id) => byId.get(id)!.root_id === root)).toBe(true);
    // Replies 5 and 6 point at their real target but are shown under reply 3 (the last nested level).
    expect(byId.get(ids[5])!.parent_id).toBe(ids[4]);
    expect(byId.get(ids[5])!.display_parent_id).toBe(ids[3]);
    expect(byId.get(ids[6])!.display_parent_id).toBe(ids[3]);
  });
});

describe("editing, withdrawing and history", () => {
  it("lets the author edit within the window, keeps history and audits it", async () => {
    const id = await postOk(author, { body: "First version." });
    const { error } = await author.client.rpc("edit_dispatch", { p_id: id, p_body: "Second version.", p_ai_use: "assisted", p_sources: [] });
    expect(error).toBeNull();

    const { data } = await anonClient().from("dispatches").select("body, ai_use, edited_at").eq("id", id).single();
    expect(data!.body).toBe("Second version.");
    expect(data!.ai_use).toBe("assisted");
    expect(data!.edited_at).not.toBeNull();

    const { data: history } = await author.client.from("dispatch_revisions").select("body, ai_use").eq("dispatch_id", id);
    expect(history).toEqual([{ body: "First version.", ai_use: "none" }]);
    const { data: others } = await reader.client.from("dispatch_revisions").select("body").eq("dispatch_id", id);
    expect(others ?? []).toHaveLength(0);

    const { data: log } = await service.from("audit_log").select("action").eq("target_id", id).order("id");
    expect(log!.map((l) => l.action)).toEqual(["dispatch.created", "dispatch.edited"]);
  });

  it("refuses edits by anyone else, and after the edit window", async () => {
    const id = await postOk(author, { body: "Mine." });
    expect((await reader.client.rpc("edit_dispatch", { p_id: id, p_body: "Hijacked.", p_ai_use: "none" })).error?.message).toMatch(/^NOT_YOURS/);

    await service.from("dispatches").update({ created_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq("id", id);
    expect((await author.client.rpc("edit_dispatch", { p_id: id, p_body: "Too late.", p_ai_use: "none" })).error?.message).toMatch(/^EDIT_WINDOW_OVER/);
    const { data } = await service.from("dispatches").select("body").eq("id", id).single();
    expect(data!.body).toBe("Mine.");
  });

  it("withdraws: the public sees a placeholder, the content is sealed for admins and judging, never deleted", async () => {
    const id = await postOk(author, { body: "Something I regret." });
    expect((await reader.client.rpc("withdraw_dispatch", { p_id: id })).error?.message).toMatch(/^NOT_YOURS/);
    expect((await author.client.rpc("withdraw_dispatch", { p_id: id })).error).toBeNull();

    const { data } = await anonClient().from("dispatches").select("body, withdrawn_at").eq("id", id).single();
    expect(data!.body).toBe("Withdrawn by author.");
    expect(data!.withdrawn_at).not.toBeNull();

    const { data: sealedForReader } = await reader.client.from("dispatch_sealed_content").select("body").eq("dispatch_id", id);
    expect(sealedForReader ?? []).toHaveLength(0);
    const { data: sealed } = await admin.client.from("dispatch_sealed_content").select("body, sealed_for").eq("dispatch_id", id);
    expect(sealed).toEqual([{ body: "Something I regret.", sealed_for: "withdrawn" }]);

    expect((await post(reader, { kind: "rebuttal", parent: id })).error?.message).toMatch(/^TARGET_UNAVAILABLE/);
    expect((await author.client.rpc("edit_dispatch", { p_id: id, p_body: "Back again.", p_ai_use: "none" })).error?.message).toMatch(/^NOT_EDITABLE/);
    const { data: log } = await service.from("audit_log").select("action").eq("target_id", id).order("id");
    expect(log!.map((l) => l.action)).toContain("dispatch.withdrawn");
  });

  it("does not expose moderator notes on Dispatches", async () => {
    const { error } = await reader.client.from("dispatches").select("hidden_reason").limit(1);
    expect(error).not.toBeNull();
    const { error: byError } = await anonClient().from("dispatches").select("hidden_by").limit(1);
    expect(byError).not.toBeNull();
  });
});

describe("reports and hiding", () => {
  it("lets a Strategist report once; only the reporter and admins see the report", async () => {
    const id = await postOk(author, { body: "A provocative claim." });
    expect((await author.client.rpc("report_dispatch", { p_dispatch_id: id, p_reason: "spam" })).error?.message).toMatch(/^OWN_DISPATCH/);
    expect((await reader.client.rpc("report_dispatch", { p_dispatch_id: id, p_reason: "harassment", p_details: "Personal attack." })).error).toBeNull();
    expect((await reader.client.rpc("report_dispatch", { p_dispatch_id: id, p_reason: "spam" })).error).toBeNull(); // updates, not duplicates

    expect((await reader.client.from("dispatch_reports").select("reason").eq("dispatch_id", id)).data).toEqual([{ reason: "spam" }]);
    expect((await author.client.from("dispatch_reports").select("id").eq("dispatch_id", id)).data ?? []).toHaveLength(0);
    expect((await admin.client.from("dispatch_reports").select("id").eq("dispatch_id", id)).data).toHaveLength(1);
    expect((await reader.client.from("dispatch_reports").insert({ dispatch_id: id, reporter_id: reader.id, reason: "other" })).error).not.toBeNull();
  });

  it("lets only admins hide and restore; hidden content is sealed, never deleted, and audited", async () => {
    const id = await postOk(author, { body: "Text a moderator will hide." });
    await reader.client.rpc("report_dispatch", { p_dispatch_id: id, p_reason: "hate" });

    expect((await reader.client.rpc("hide_dispatch", { p_id: id, p_reason: "No." })).error?.message).toMatch(/^NOT_ADMIN/);
    expect((await admin.client.rpc("hide_dispatch", { p_id: id, p_reason: "Breaks the civility rule." })).error).toBeNull();

    const { data: hidden } = await anonClient().from("dispatches").select("body, hidden_at").eq("id", id).single();
    expect(hidden!.body).toBe("Hidden by a moderator.");
    expect(hidden!.hidden_at).not.toBeNull();
    const { data: report } = await admin.client.from("dispatch_reports").select("status").eq("dispatch_id", id).single();
    expect(report!.status).toBe("actioned");
    expect((await reader.client.rpc("toggle_reaction", { p_dispatch_id: id, p_reaction: "persuasive" })).error?.message).toMatch(/^NOT_AVAILABLE/);

    expect((await admin.client.rpc("restore_dispatch", { p_id: id })).error).toBeNull();
    const { data: restored } = await anonClient().from("dispatches").select("body, hidden_at").eq("id", id).single();
    expect(restored).toEqual({ body: "Text a moderator will hide.", hidden_at: null });

    const { data: log } = await service.from("audit_log").select("action, actor_id").eq("target_id", id).order("id");
    expect(log!.map((l) => l.action)).toEqual(["dispatch.created", "dispatch.reported", "dispatch.hidden", "dispatch.restored"]);
    expect(log![2].actor_id).toBe(admin.id);
  });

  it("lets admins dismiss reports", async () => {
    const id = await postOk(author, { body: "A fair but blunt point." });
    await reader.client.rpc("report_dispatch", { p_dispatch_id: id, p_reason: "off_topic" });
    expect((await reader.client.rpc("dismiss_reports", { p_dispatch_id: id })).error).not.toBeNull();
    expect((await admin.client.rpc("dismiss_reports", { p_dispatch_id: id })).data).toBe(1);
  });
});

describe("reactions", () => {
  it("toggle one reaction of each type, update the counts, and stay private per Strategist", async () => {
    const id = await postOk(author);
    expect((await reader.client.rpc("toggle_reaction", { p_dispatch_id: id, p_reaction: "persuasive" })).data).toBe(true);
    expect((await admin.client.rpc("toggle_reaction", { p_dispatch_id: id, p_reaction: "persuasive" })).data).toBe(true);
    expect((await reader.client.rpc("toggle_reaction", { p_dispatch_id: id, p_reaction: "fair_point" })).data).toBe(true);
    let { data } = await anonClient().from("dispatches").select("reaction_counts").eq("id", id).single();
    expect(data!.reaction_counts).toEqual({ persuasive: 2, fair_point: 1 });

    expect((await reader.client.rpc("toggle_reaction", { p_dispatch_id: id, p_reaction: "persuasive" })).data).toBe(false);
    ({ data } = await anonClient().from("dispatches").select("reaction_counts").eq("id", id).single());
    expect(data!.reaction_counts).toEqual({ persuasive: 1, fair_point: 1 });

    expect((await author.client.from("dispatch_reactions").select("user_id").eq("dispatch_id", id)).data ?? []).toHaveLength(0);
    expect((await reader.client.from("dispatch_reactions").select("reaction").eq("dispatch_id", id)).data).toEqual([{ reaction: "fair_point" }]);
  });

  it("refuse your own Dispatch, unknown reactions, direct writes and closed Campaigns", async () => {
    const id = await postOk(author);
    expect((await author.client.rpc("toggle_reaction", { p_dispatch_id: id, p_reaction: "persuasive" })).error?.message).toMatch(/^OWN_DISPATCH/);
    expect((await reader.client.rpc("toggle_reaction", { p_dispatch_id: id, p_reaction: "changed_my_mind" })).error?.message).toMatch(/^UNKNOWN_REACTION/);
    expect((await reader.client.from("dispatch_reactions").insert({ dispatch_id: id, user_id: reader.id, reaction: "persuasive" })).error).not.toBeNull();

    const { data: old } = await service
      .from("dispatches")
      .insert({ campaign_id: closedId, author_id: author.id, kind: "argument", body: "Posted before the close.", ai_use: "none", moderation_status: "visible" })
      .select("id")
      .single();
    expect((await reader.client.rpc("toggle_reaction", { p_dispatch_id: old!.id, p_reaction: "persuasive" })).error?.message).toMatch(/^CAMPAIGN_CLOSED/);
  });

  it("offer the default set, which only admins can change", async () => {
    const { data } = await anonClient().from("reaction_types").select("key").eq("active", true).order("sort");
    expect(data!.map((r) => r.key)).toEqual(["persuasive", "well_sourced", "fair_point"]);
    expect((await reader.client.from("reaction_types").insert({ key: "changed_my_mind", label: "Changed my mind", description: "x" })).error).not.toBeNull();
  });
});

describe("follows", () => {
  it("let a Strategist follow and unfollow Campaigns and Strategists, privately", async () => {
    expect((await reader.client.from("campaign_follows").insert({ user_id: reader.id, campaign_id: otherOpenId })).error).toBeNull();
    expect((await reader.client.from("campaign_follows").insert({ user_id: author.id, campaign_id: otherOpenId })).error).not.toBeNull();
    expect((await reader.client.from("campaign_follows").insert({ user_id: reader.id, campaign_id: draftId })).error).not.toBeNull();

    expect((await reader.client.from("strategist_follows").insert({ follower_id: reader.id, followed_id: author.id })).error).toBeNull();
    expect((await reader.client.from("strategist_follows").insert({ follower_id: reader.id, followed_id: reader.id })).error).not.toBeNull();
    expect((await reader.client.from("strategist_follows").insert({ follower_id: reader.id, followed_id: noHandle.id })).error).not.toBeNull();

    // Others cannot see who follows whom.
    expect((await author.client.from("strategist_follows").select("follower_id").eq("followed_id", author.id)).data ?? []).toHaveLength(0);
    expect((await anonClient().from("campaign_follows").select("user_id")).data ?? []).toHaveLength(0);

    await reader.client.from("strategist_follows").delete().eq("followed_id", author.id);
    expect((await reader.client.from("strategist_follows").select("followed_id")).data ?? []).toHaveLength(0);
    // Someone else's follow cannot be removed.
    await reader.client.from("campaign_follows").delete().eq("user_id", author.id);
    expect((await service.from("campaign_follows").select("user_id").eq("user_id", author.id).eq("campaign_id", openId)).data).toHaveLength(1);
  });
});

describe("search", () => {
  it("finds visible Dispatches, Campaigns and handles, and respects visibility", async () => {
    const word = `xylophonic${Date.now()}`;
    const visible = await postOk(author, { body: `The ${word} argument stands.` });
    const withdrawn = await postOk(author, { body: `A withdrawn ${word} argument.` });
    const hidden = await postOk(author, { body: `A hidden ${word} argument.` });
    await author.client.rpc("withdraw_dispatch", { p_id: withdrawn });
    await admin.client.rpc("hide_dispatch", { p_id: hidden, p_reason: "Test." });

    const { data, error } = await anonClient().rpc("search_tgs", { p_query: word, p_type: "dispatches" });
    expect(error).toBeNull();
    expect(data!.map((r: { id: string }) => r.id)).toEqual([visible]);
    expect(data![0].snippet).toContain(`⟦${word}⟧`);

    const zebra = await anonClient().rpc("search_tgs", { p_query: "zebra crossings", p_type: "campaigns" });
    expect(zebra.data!.map((r: { id: string }) => r.id)).toContain(openId);

    // Drafts are found only by admins.
    expect((await reader.client.rpc("search_tgs", { p_query: "quokka" })).data ?? []).toHaveLength(0);
    expect((await admin.client.rpc("search_tgs", { p_query: "quokka" })).data!.map((r: { id: string }) => r.id)).toContain(draftId);

    const { data: handle } = await service.from("profiles").select("handle").eq("id", author.id).single();
    const people = await anonClient().rpc("search_tgs", { p_query: handle!.handle.slice(0, 6), p_type: "strategists" });
    expect(people.data!.map((r: { id: string }) => r.id)).toContain(author.id);
    expect((await anonClient().rpc("search_tgs", { p_query: "", p_type: "all" })).data).toEqual([]);
  });
});
