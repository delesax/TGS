import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 4: screening, holds, removal, appeals, the review queue, mute, AI
// usage and caps, coach ratings and judging weights. LOCAL Supabase only.

let author: TestUser;
let other: TestUser;
let admin: TestUser;
let openId: string;
let sensitiveId: string;
const campaignIds: string[] = [];

async function post(user: TestUser, body: string, campaign = openId, extra: Record<string, unknown> = {}) {
  const { data, error } = await user.client.rpc("post_dispatch", { p_campaign_id: campaign, p_kind: "argument", p_body: body, p_ai_use: "none", ...extra });
  if (error) throw new Error(error.message);
  return data as string;
}

async function seenBy(client: ReturnType<typeof anonClient>, id: string) {
  const { data } = await client.from("dispatches").select("id, body, moderation_status").eq("id", id);
  return data ?? [];
}

async function settings(values: Record<string, unknown>) {
  const { error } = await service.from("community_settings").update(values).eq("id", true);
  if (error) throw error;
}

beforeAll(async () => {
  [author, other, admin] = await Promise.all([createUser(), createUser(), createUser({ admin: true })]);
  openId = await createCampaign({ title: "Moderation test Campaign" });
  sensitiveId = await createCampaign({ title: "Sensitive moderation test", is_sensitive: true, content_note: "Test note." });
  campaignIds.push(openId, sensitiveId);
  for (const u of [author, other, admin]) {
    for (const c of campaignIds) await u.client.from("campaign_positions").insert({ campaign_id: c, user_id: u.id, after_position: "for" });
  }
  await settings({ cooldown_seconds: 0, max_dispatches_per_round: 100 });
});

afterAll(async () => {
  await settings({ cooldown_seconds: 30, max_dispatches_per_round: 10, ai_enabled: true, ai_fallback_normal: "post_unscreened", ai_fallback_sensitive: "hold" });
  await deleteUsers([author, other, admin]);
  await service.from("campaigns").delete().in("id", campaignIds);
});

describe("pending, held and removed Dispatches", () => {
  it("are posted as pending and seen only by their author until screened", async () => {
    const id = await post(author, "A considered first argument.");
    expect(await seenBy(anonClient(), id)).toEqual([]);
    expect(await seenBy(other.client, id)).toEqual([]);
    expect((await seenBy(author.client, id))[0]).toMatchObject({ moderation_status: "pending" });
    expect(await applyScreening(id, "allow")).toBe("visible");
    expect(await seenBy(anonClient(), id)).toHaveLength(1);
  });

  it("stay hidden from others when held, and a block is only a high-priority hold", async () => {
    const id = await post(author, "Something the AI holds.");
    expect(await applyScreening(id, "block", { category: "threats" })).toBe("held");
    expect(await seenBy(anonClient(), id)).toEqual([]);
    expect(await seenBy(other.client, id)).toEqual([]);
    const { data } = await service.from("dispatches").select("moderation_status, hold_priority, held_reason, body").eq("id", id).single();
    expect(data).toMatchObject({ moderation_status: "held", hold_priority: "high", body: "Something the AI holds." });
    expect(data!.held_reason).toMatch(/A person will check this/);
    // The author is told by email (moderation preference, Sprint 3 outbox).
    const { data: mail } = await service.from("email_outbox").select("kind, payload").eq("user_id", author.id).eq("kind", "moderation_outcome");
    expect(mail!.some((m) => (m.payload as { dispatch_id: string; outcome: string }).dispatch_id === id && (m.payload as { outcome: string }).outcome === "held")).toBe(true);
  });

  it("is idempotent: a second result for the same Dispatch changes nothing", async () => {
    const id = await post(author, "Screened twice.");
    await applyScreening(id, "allow");
    expect(await applyScreening(id, "block")).toBe("visible");
    const { count } = await service.from("ai_decisions").select("id", { count: "exact", head: true }).eq("subject_id", id);
    expect(count).toBe(1);
  });

  it("can be applied only by the service role", async () => {
    const id = await post(author, "Only the server decides.");
    for (const client of [anonClient(), author.client, admin.client]) {
      const { error } = await client.rpc("apply_dispatch_screening", { p_dispatch_id: id, p_result: { outcome: "allow" } });
      expect(error).not.toBeNull();
    }
    for (const client of [anonClient(), author.client]) {
      expect((await client.rpc("claim_pending_screening", { p_limit: 5 })).error).not.toBeNull();
      expect((await client.rpc("ai_reserve_call", { p_feature: "coach", p_user_id: author.id })).error).not.toBeNull();
    }
  });

  it("are screened again after an edit, hidden from others meanwhile", async () => {
    const id = await post(author, "Before the edit.");
    await applyScreening(id);
    expect((await author.client.rpc("edit_dispatch", { p_id: id, p_body: "After the edit.", p_ai_use: "none", p_sources: [] })).error).toBeNull();
    expect(await seenBy(anonClient(), id)).toEqual([]);
    expect(await applyScreening(id)).toBe("visible");
  });

  it("cannot be replied to, reacted to or reported while not visible", async () => {
    const id = await post(author, "Still being checked.");
    expect((await other.client.rpc("post_dispatch", { p_campaign_id: openId, p_kind: "rebuttal", p_body: "Reply", p_ai_use: "none", p_parent_id: id })).error?.message).toMatch(/^TARGET_UNAVAILABLE/);
    expect((await other.client.rpc("toggle_reaction", { p_dispatch_id: id, p_reaction: "persuasive" })).error).not.toBeNull();
    expect((await other.client.rpc("report_dispatch", { p_dispatch_id: id, p_reason: "spam" })).error).not.toBeNull();
  });

  it("count towards the per-round limit while held", async () => {
    const fresh = await createUser();
    try {
      await fresh.client.from("campaign_positions").insert({ campaign_id: openId, user_id: fresh.id, after_position: "for" });
      await settings({ max_dispatches_per_round: 1 });
      const id = await post(fresh, "One held Dispatch.");
      await applyScreening(id, "hold");
      const { error } = await fresh.client.rpc("post_dispatch", { p_campaign_id: openId, p_kind: "argument", p_body: "Another.", p_ai_use: "none" });
      expect(error?.message).toMatch(/^ROUND_LIMIT/);
    } finally {
      await settings({ max_dispatches_per_round: 100 });
      await deleteUsers([fresh]);
    }
  });
});

describe("when the AI is unavailable (owner decision 1 default)", () => {
  it("posts in a normal Campaign marked unscreened, with a flag for a human look", async () => {
    const id = await post(author, "Posted while the AI was down.");
    expect(await applyScreening(id, "unavailable")).toBe("visible");
    const { data } = await service.from("dispatches").select("screening").eq("id", id).single();
    expect(data!.screening).toBe("unscreened");
    const { data: flags } = await service.from("moderation_flags").select("kind, status").eq("dispatch_id", id);
    expect(flags).toEqual([{ kind: "unscreened", status: "open" }]);
    // No AI decision is invented.
    expect((await service.from("ai_decisions").select("id").eq("subject_id", id)).data).toEqual([]);
  });

  it("holds in a sensitive Campaign until a person looks", async () => {
    const id = await post(author, "Posted in a sensitive Campaign while the AI was down.", sensitiveId);
    expect(await applyScreening(id, "unavailable")).toBe("held");
    expect(await seenBy(anonClient(), id)).toEqual([]);
  });

  it("follows the setting when the owner changes it", async () => {
    await settings({ ai_fallback_normal: "hold" });
    try {
      const id = await post(author, "Normal Campaign, hold policy.");
      expect(await applyScreening(id, "unavailable")).toBe("held");
    } finally {
      await settings({ ai_fallback_normal: "post_unscreened" });
    }
  });

  it("reserves no calls when the kill switch is off, and enforces the global cap", async () => {
    await settings({ ai_enabled: false });
    expect((await service.rpc("ai_reserve_call", { p_feature: "screen_dispatch", p_user_id: null })).data).toBe("off");
    await settings({ ai_enabled: true, ai_daily_cap_global: 0 });
    expect((await service.rpc("ai_reserve_call", { p_feature: "screen_dispatch", p_user_id: null })).data).toBe("global_cap");
    await settings({ ai_daily_cap_global: 1000, ai_daily_cap_per_strategist: 0 });
    expect((await service.rpc("ai_reserve_call", { p_feature: "coach", p_user_id: author.id })).data).toBe("user_cap");
    // Screening is never capped per Strategist.
    expect((await service.rpc("ai_reserve_call", { p_feature: "screen_dispatch", p_user_id: author.id })).data).toBe("ok");
    await settings({ ai_daily_cap_per_strategist: 40 });
  });
});

describe("undeclared AI text (rule 9)", () => {
  it("adds a review flag only, never a hold, and only for 'none'", async () => {
    const id = await post(author, "Text that reads like pasted AI output.");
    expect(await applyScreening(id, "allow", { undeclared_ai: true, undeclared_ai_reason: "Assistant phrasing." })).toBe("visible");
    const { data: flags } = await service.from("moderation_flags").select("kind").eq("dispatch_id", id);
    expect(flags).toEqual([{ kind: "undeclared_ai" }]);
  });
});

describe("the review queue", () => {
  it("keeps AI decisions, flags, appeals and usage for admins only", async () => {
    const id = await post(author, "For the queue.");
    await applyScreening(id, "hold");
    for (const table of ["ai_decisions", "moderation_flags", "ai_usage"]) {
      expect((await author.client.from(table).select("*").limit(5)).data ?? []).toEqual([]);
      expect((await anonClient().from(table).select("*").limit(5)).data ?? []).toEqual([]);
    }
    expect(((await admin.client.from("ai_decisions").select("id").eq("subject_id", id)).data ?? []).length).toBe(1);
  });

  it("lets only admins decide, and refuses a decision without a reason", async () => {
    const id = await post(author, "Waiting for a person.");
    await applyScreening(id, "hold");
    expect((await other.client.rpc("moderate_dispatch", { p_dispatch_id: id, p_action: "release", p_reason: "Looks fine" })).error?.message).toMatch(/^NOT_ADMIN/);
    expect((await author.client.rpc("moderate_dispatch", { p_dispatch_id: id, p_action: "release", p_reason: "Mine" })).error?.message).toMatch(/^NOT_ADMIN/);
    expect((await admin.client.rpc("moderate_dispatch", { p_dispatch_id: id, p_action: "release", p_reason: "  " })).error?.message).toMatch(/^REASON_REQUIRED/);
    // Override columns cannot be written directly by non-admins either.
    const { data: updated } = await other.client.from("ai_decisions").update({ override_reason: "x" }).eq("subject_id", id).select("id");
    expect(updated ?? []).toEqual([]);
  });

  it("release overrides the AI, is audited, and tells the author", async () => {
    const id = await post(author, "Held but fine.");
    await applyScreening(id, "hold");
    expect((await admin.client.rpc("moderate_dispatch", { p_dispatch_id: id, p_action: "release", p_reason: "Robust but fair." })).error).toBeNull();
    expect(await seenBy(anonClient(), id)).toHaveLength(1);
    const { data: decision } = await service.from("ai_decisions").select("overridden_by, override_outcome, override_reason").eq("subject_id", id).single();
    expect(decision).toEqual({ overridden_by: admin.id, override_outcome: "allow", override_reason: "Robust but fair." });
    const { data: log } = await service.from("audit_log").select("action, actor_id, details").eq("target_id", id).eq("action", "moderation.released").single();
    expect(log).toMatchObject({ actor_id: admin.id, details: { reason: "Robust but fair.", overrode_ai: true } });
    const { data: mail } = await service.from("email_outbox").select("payload").eq("user_id", author.id).eq("kind", "moderation_outcome");
    expect(mail!.some((m) => (m.payload as { dispatch_id: string; outcome: string }).dispatch_id === id && (m.payload as { outcome: string }).outcome === "released")).toBe(true);
  });

  it("remove seals the content, never deletes it, and shows a placeholder", async () => {
    const id = await post(author, "Text a person removes.");
    await applyScreening(id, "allow");
    await other.client.rpc("report_dispatch", { p_dispatch_id: id, p_reason: "harassment" });
    expect((await admin.client.rpc("moderate_dispatch", { p_dispatch_id: id, p_action: "remove", p_reason: "Personal attack." })).error).toBeNull();
    const seen = await seenBy(anonClient(), id);
    expect(seen).toEqual([{ id, body: "Removed by a moderator.", moderation_status: "removed" }]);
    const { data: sealed } = await admin.client.from("dispatch_sealed_content").select("body").eq("dispatch_id", id);
    expect(sealed).toEqual([{ body: "Text a person removes." }]);
    const { data: report } = await admin.client.from("dispatch_reports").select("status").eq("dispatch_id", id).single();
    expect(report!.status).toBe("actioned");
    // The AI allowed it; removing it overrides that decision.
    const { data: decision } = await service.from("ai_decisions").select("override_outcome").eq("subject_id", id).single();
    expect(decision!.override_outcome).toBe("block");
  });

  it("dismiss closes reports and flags and changes nothing", async () => {
    const id = await post(author, "Reported but fine.");
    await applyScreening(id, "unavailable");
    await other.client.rpc("report_dispatch", { p_dispatch_id: id, p_reason: "spam" });
    expect((await admin.client.rpc("moderate_dispatch", { p_dispatch_id: id, p_action: "dismiss", p_reason: "Not spam." })).error).toBeNull();
    expect(await seenBy(anonClient(), id)).toHaveLength(1);
    expect((await service.from("moderation_flags").select("status").eq("dispatch_id", id).single()).data!.status).toBe("resolved");
  });
});

describe("appeals", () => {
  it("lets the author appeal a held Dispatch once, with a reason", async () => {
    const id = await post(author, "Please look again.");
    await applyScreening(id, "hold");
    expect((await other.client.rpc("appeal_dispatch", { p_dispatch_id: id, p_reason: "Not mine" })).error?.message).toMatch(/^NOT_YOURS/);
    expect((await author.client.rpc("appeal_dispatch", { p_dispatch_id: id, p_reason: "" })).error?.message).toMatch(/^REASON_REQUIRED/);
    expect((await author.client.rpc("appeal_dispatch", { p_dispatch_id: id, p_reason: "It quotes abuse to criticise it." })).error).toBeNull();
    expect((await author.client.rpc("appeal_dispatch", { p_dispatch_id: id, p_reason: "Again" })).error?.message).toMatch(/^ALREADY_APPEALED/);
    expect(((await other.client.from("dispatch_appeals").select("id").eq("dispatch_id", id)).data ?? []).length).toBe(0);
    expect(((await author.client.from("dispatch_appeals").select("id").eq("dispatch_id", id)).data ?? []).length).toBe(1);
  });

  it("refuses an appeal on a visible Dispatch", async () => {
    const id = await post(author, "Nothing to appeal.");
    await applyScreening(id);
    expect((await author.client.rpc("appeal_dispatch", { p_dispatch_id: id, p_reason: "Why not" })).error?.message).toMatch(/^NOT_APPEALABLE/);
  });

  it("records who decided, and marks it when the same admin decided the original and the appeal", async () => {
    const id = await post(author, "Kept held, then appealed.");
    await applyScreening(id, "hold");
    await admin.client.rpc("moderate_dispatch", { p_dispatch_id: id, p_action: "keep_held", p_reason: "Still over the line." });
    await author.client.rpc("appeal_dispatch", { p_dispatch_id: id, p_reason: "Please reconsider." });
    expect((await admin.client.rpc("moderate_dispatch", { p_dispatch_id: id, p_action: "keep_held", p_reason: "Decision stands." })).error).toBeNull();
    const { data } = await service.from("dispatch_appeals").select("status, decided_by, same_admin, original_actor").eq("dispatch_id", id).single();
    expect(data).toEqual({ status: "rejected", decided_by: admin.id, same_admin: true, original_actor: admin.id });
  });
});

describe("posting mute", () => {
  it("only admins mute; a muted Strategist cannot post, sees the reason, and others cannot see it", async () => {
    const muted = await createUser();
    try {
      await muted.client.from("campaign_positions").insert({ campaign_id: openId, user_id: muted.id, after_position: "for" });
      expect((await other.client.rpc("set_posting_mute", { p_user_id: muted.id, p_muted: true, p_reason: "No" })).error?.message).toMatch(/^NOT_ADMIN/);
      expect((await admin.client.rpc("set_posting_mute", { p_user_id: muted.id, p_muted: true, p_reason: "Repeated personal attacks." })).error).toBeNull();
      expect((await muted.client.rpc("post_dispatch", { p_campaign_id: openId, p_kind: "argument", p_body: "Hello", p_ai_use: "none" })).error?.message).toMatch(/^MUTED/);
      const { data: status } = await muted.client.rpc("my_account_status").single();
      expect(status).toMatchObject({ posting_muted_reason: "Repeated personal attacks." });
      expect((await other.client.from("profiles").select("posting_muted_reason").eq("id", muted.id)).error).not.toBeNull();
      const { data: log } = await service.from("audit_log").select("action").eq("target_id", muted.id).eq("action", "strategist.muted");
      expect(log).toHaveLength(1);
      // Reversible.
      expect((await admin.client.rpc("set_posting_mute", { p_user_id: muted.id, p_muted: false, p_reason: "Served its time." })).error).toBeNull();
      expect((await muted.client.rpc("post_dispatch", { p_campaign_id: openId, p_kind: "argument", p_body: "Hello again", p_ai_use: "none" })).error).toBeNull();
    } finally {
      await deleteUsers([muted]);
    }
  });

  it("lists Strategists for admins only", async () => {
    expect((await other.client.rpc("admin_strategists", {})).error?.message).toMatch(/^NOT_ADMIN/);
    const { data } = await admin.client.rpc("admin_strategists", { p_query: null, p_limit: 200 });
    expect((data as { id: string }[]).some((r) => r.id === author.id)).toBe(true);
  });
});

describe("coach feedback", () => {
  it("is readable by its Strategist and admins only, and rated only by its Strategist", async () => {
    const { data: decision } = await service
      .from("ai_decisions")
      .insert({ subject_type: "coach", subject_id: crypto.randomUUID(), user_id: author.id, model: "fake", prompt_version: "coach.v1", outcome: "allow", reason: "Private feedback on a draft.", feature: "coach" })
      .select("id")
      .single();
    await service.from("coach_feedback").insert({ ai_decision_id: decision!.id, user_id: author.id, draft_key: crypto.randomUUID() });
    expect((await other.client.rpc("rate_coach_feedback", { p_decision_id: decision!.id, p_helpful: false })).error?.message).toMatch(/^NOT_YOURS/);
    expect((await author.client.rpc("rate_coach_feedback", { p_decision_id: decision!.id, p_helpful: true, p_comment: "Good questions." })).error).toBeNull();
    expect(((await other.client.from("coach_feedback").select("*")).data ?? []).length).toBe(0);
    const { data: mine } = await author.client.from("coach_feedback").select("helpful, comment").eq("ai_decision_id", decision!.id).single();
    expect(mine).toEqual({ helpful: true, comment: "Good questions." });
    // No column holds the draft text.
    expect(Object.keys((await admin.client.from("coach_feedback").select("*").limit(1)).data![0])).not.toContain("draft");
  });
});

describe("judging weights", () => {
  it("default to 40/25/25/10, must sum to 100, and only admins add versions", async () => {
    const { data: v1 } = await anonClient().from("judging_weights").select("panel, peer, ai_rubric, mind_change").eq("version", 1).single();
    expect(v1).toEqual({ panel: 40, peer: 25, ai_rubric: 25, mind_change: 10 });
    expect((await other.client.rpc("save_judging_weights", { p_panel: 40, p_peer: 25, p_ai_rubric: 25, p_mind_change: 10, p_note: null })).error?.message).toMatch(/^NOT_ADMIN/);
    expect((await admin.client.rpc("save_judging_weights", { p_panel: 50, p_peer: 25, p_ai_rubric: 25, p_mind_change: 10, p_note: null })).error?.message).toMatch(/^WEIGHTS_SUM/);
    expect((await admin.client.from("judging_weights").insert({ panel: 25, peer: 25, ai_rubric: 25, mind_change: 25 })).error).not.toBeNull();
  });

  it("lock a Campaign to the version it opened with", async () => {
    const { data: c } = await service.from("campaigns").select("judging_weights_version").eq("id", openId).single();
    expect(c!.judging_weights_version).not.toBeNull();
    const { data: newVersion, error } = await admin.client.rpc("save_judging_weights", { p_panel: 45, p_peer: 20, p_ai_rubric: 25, p_mind_change: 10, p_note: "test" });
    expect(error).toBeNull();
    expect((await service.from("campaigns").update({ judging_weights_version: newVersion }).eq("id", openId)).error?.message).toMatch(/WEIGHTS_LOCKED/);
    await admin.client.rpc("save_judging_weights", { p_panel: 40, p_peer: 25, p_ai_rubric: 25, p_mind_change: 10, p_note: "back to defaults" });
  });
});
