import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 5: judging and the Verdict. Who can read and write what, for judges,
// participants, outsiders and admins. LOCAL Supabase only.

let a: TestUser; // participant
let b: TestUser; // participant
let c: TestUser; // participant and judge (cannot score their own Dispatch)
let judge: TestUser;
let outsider: TestUser;
let admin: TestUser;
let campaignId: string;
let openCampaignId: string;
const d: Record<string, string> = {};
let openDispatch: string;
let verdictId: string;

const handleOf = async (u: TestUser) => (await service.from("profiles").select("handle").eq("id", u.id).single()).data!.handle as string;
const code = (error: { message: string } | null) => (error ? /^([A-Z_]+):/.exec(error.message)?.[1] ?? error.message : null);
const scores = (dispatchId: string, n = 3) => ({ dispatch_id: dispatchId, logic: n, evidence: n, originality: n, responsiveness: n });

async function post(user: TestUser, body: string, campaign: string) {
  // Main still asks for a position before posting (the legal-hardening branch drops this).
  await user.client.from("campaign_positions").insert({ campaign_id: campaign, user_id: user.id, after_position: "for" });
  const { data, error } = await user.client.rpc("post_dispatch", { p_campaign_id: campaign, p_kind: "argument", p_body: body, p_ai_use: "none" });
  if (error) throw new Error(error.message);
  await applyScreening(data as string, "allow");
  return data as string;
}

beforeAll(async () => {
  [a, b, c, judge, outsider, admin] = await Promise.all([createUser(), createUser(), createUser(), createUser(), createUser(), createUser({ admin: true })]);
  await service.from("community_settings").update({ cooldown_seconds: 0, max_dispatches_per_round: 100 }).eq("id", true);
  const now = Date.now();
  campaignId = await createCampaign({ title: "Judging RLS test Campaign", starts_at: new Date(now - 600_000).toISOString() });
  openCampaignId = await createCampaign({ title: "Judging RLS test, still open" });
  d.a = await post(a, "A's argument for the motion, with a reason because it matters.", campaignId);
  d.b = await post(b, "B's argument against the motion.", campaignId);
  d.c = await post(c, "C's evidence on the question.", campaignId);
  openDispatch = await post(a, "Posted in a Campaign that is still open.", openCampaignId);
  // Close the first Campaign now.
  const { error } = await service.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", campaignId);
  if (error) throw error;
});

afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30, max_dispatches_per_round: 10 }).eq("id", true);
  await service.from("judging_settings").update({ peer_vote_credits: 5 }).eq("id", true);
  await service.from("awards").delete().in("campaign_id", [campaignId, openCampaignId]);
  await deleteUsers([a, b, c, judge, outsider, admin]);
  await service.from("campaigns").delete().in("id", [campaignId, openCampaignId]);
});

const draftFor = (winner: string | null, attention = false) => ({
  needs_attention: attention,
  attention_reasons: attention ? [{ code: "no_peer_votes", detail: "No peer votes were cast." }] : [],
  weights_snapshot: { version: 1, panel: 40, peer: 25, ai_rubric: 25, mind_change: 10, source: "campaign" },
  component_scores: [],
  proposed_awards: winner ? [{ category: "grand_strategist", profile_id: winner, dispatch_id: null, rationale: `@{user:${winner}} won.` }] : [],
  winner_id: winner,
  rationale: winner ? `@{user:${winner}} is the Grand Strategist.` : "No winner yet.",
});

describe("panel assignment", () => {
  it("only admins can assign judges, by handle", async () => {
    expect(code((await a.client.rpc("assign_judge", { p_campaign_id: campaignId, p_handle: await handleOf(judge) })).error)).toBe("NOT_ADMIN");
    const first = await admin.client.rpc("assign_judge", { p_campaign_id: campaignId, p_handle: `@${await handleOf(judge)}` });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ judge_id: judge.id, already_assigned: false, is_participant: false });
    const second = await admin.client.rpc("assign_judge", { p_campaign_id: campaignId, p_handle: await handleOf(c) });
    expect(second.data).toMatchObject({ judge_id: c.id, is_participant: true });
  });

  it("is visible to the judge and admins only, and emails the judge", async () => {
    expect((await judge.client.from("judge_assignments").select("judge_id").eq("campaign_id", campaignId)).data).toEqual([{ judge_id: judge.id }]);
    expect((await outsider.client.from("judge_assignments").select("judge_id").eq("campaign_id", campaignId)).data).toEqual([]);
    expect((await anonClient().from("judge_assignments").select("judge_id")).data ?? []).toEqual([]);
    expect((await admin.client.from("judge_assignments").select("judge_id").eq("campaign_id", campaignId)).data).toHaveLength(2);
    const { data } = await service.from("email_outbox").select("kind").eq("user_id", judge.id).eq("kind", "judge_assigned");
    expect(data).toHaveLength(1);
  });

  it("writes user ids, never handles, to the audit log", async () => {
    const handle = await handleOf(judge);
    const { data } = await service.from("audit_log").select("details").eq("action", "judging.judge_assigned").eq("target_id", campaignId);
    expect(data!.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(data)).not.toContain(handle);
    expect(JSON.stringify(data)).toContain(judge.id);
  });
});

describe("panel scores", () => {
  it("cannot be written directly, only through save_panel_scores", async () => {
    const { error } = await judge.client.from("panel_scores").insert({ campaign_id: campaignId, ...scores(d.a), judge_id: judge.id });
    expect(error).not.toBeNull();
  });

  it("cannot be saved by someone who is not on the panel", async () => {
    expect(code((await outsider.client.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: [scores(d.a)] })).error)).toBe("NOT_A_JUDGE");
  });

  it("cannot score your own Dispatch", async () => {
    expect(code((await c.client.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: [scores(d.c)] })).error)).toBe("OWN_DISPATCH");
  });

  it("keeps a judge's draft private before lock: not other judges, not admins", async () => {
    expect((await judge.client.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: [scores(d.a, 4)] })).error).toBeNull();
    expect((await judge.client.from("panel_scores").select("logic").eq("judge_id", judge.id)).data).toEqual([{ logic: 4 }]);
    expect((await c.client.from("panel_scores").select("logic").eq("judge_id", judge.id)).data).toEqual([]);
    expect((await admin.client.from("panel_scores").select("logic").eq("judge_id", judge.id)).data).toEqual([]);
    expect((await a.client.from("panel_scores").select("logic")).data).toEqual([]);
    expect((await anonClient().from("panel_scores").select("logic")).data ?? []).toEqual([]);
  });

  it("refuses to submit until every Dispatch is scored, then locks for good", async () => {
    expect(code((await judge.client.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: [], p_submit: true })).error)).toBe("PANEL_INCOMPLETE");
    const done = await judge.client.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: [scores(d.b, 3), scores(d.c, 2)], p_submit: false });
    expect(done.error).toBeNull();
    expect((await judge.client.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: [], p_submit: true })).error).toBeNull();
    expect(code((await judge.client.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: [scores(d.a, 1)] })).error)).toBe("PANEL_LOCKED");
    // Even the service role cannot change locked scores.
    expect((await service.from("panel_scores").update({ logic: 1 }).eq("judge_id", judge.id).eq("dispatch_id", d.a)).error).not.toBeNull();
    expect(code((await admin.client.rpc("unassign_judge", { p_campaign_id: campaignId, p_judge_id: judge.id, p_reason: "test" })).error)).toBe("PANEL_LOCKED");
  });

  it("are readable by admins once submitted, but still not by other judges", async () => {
    expect((await admin.client.from("panel_scores").select("dispatch_id").eq("judge_id", judge.id)).data).toHaveLength(3);
    expect((await c.client.from("panel_scores").select("dispatch_id").eq("judge_id", judge.id)).data).toEqual([]);
  });

  it("cannot be saved while the Campaign is still open", async () => {
    await admin.client.rpc("assign_judge", { p_campaign_id: openCampaignId, p_handle: await handleOf(judge) });
    expect(code((await judge.client.rpc("save_panel_scores", { p_campaign_id: openCampaignId, p_scores: [scores(openDispatch)] })).error)).toBe("NOT_CLOSED");
  });
});

describe("peer votes", () => {
  it("cannot be written directly", async () => {
    expect((await a.client.from("peer_votes").insert({ campaign_id: campaignId, dispatch_id: d.b, voter_id: a.id })).error).not.toBeNull();
  });

  it("are refused on your own Dispatch, from outsiders, and before the close", async () => {
    expect(code((await a.client.rpc("cast_peer_vote", { p_dispatch_id: d.a })).error)).toBe("OWN_DISPATCH");
    expect(code((await outsider.client.rpc("cast_peer_vote", { p_dispatch_id: d.a })).error)).toBe("NOT_A_PARTICIPANT");
    expect(code((await judge.client.rpc("cast_peer_vote", { p_dispatch_id: d.a })).error)).toBe("NOT_A_PARTICIPANT");
    expect(code((await b.client.rpc("cast_peer_vote", { p_dispatch_id: openDispatch })).error)).toBe("VOTING_CLOSED");
    expect(code((await anonClient().rpc("cast_peer_vote", { p_dispatch_id: d.a })).error)).not.toBeNull();
  });

  it("are one per voter per Dispatch, within the vote credits", async () => {
    expect((await a.client.rpc("cast_peer_vote", { p_dispatch_id: d.b })).data).toBe(4);
    expect((await a.client.rpc("cast_peer_vote", { p_dispatch_id: d.b })).data).toBe(4);
    await service.from("judging_settings").update({ peer_vote_credits: 1 }).eq("id", true);
    expect(code((await a.client.rpc("cast_peer_vote", { p_dispatch_id: d.c })).error)).toBe("NO_CREDITS");
    await service.from("judging_settings").update({ peer_vote_credits: 5 }).eq("id", true);
    expect((await b.client.rpc("cast_peer_vote", { p_dispatch_id: d.a })).error).toBeNull();
    expect((await c.client.rpc("cast_peer_vote", { p_dispatch_id: d.a })).error).toBeNull();
  });

  it("are private: voters see their own, admins see all, nobody else sees any", async () => {
    expect((await a.client.from("peer_votes").select("dispatch_id").eq("campaign_id", campaignId)).data).toEqual([{ dispatch_id: d.b }]);
    expect((await b.client.from("peer_votes").select("voter_id").eq("dispatch_id", d.b)).data).toEqual([]);
    expect((await anonClient().from("peer_votes").select("voter_id")).data ?? []).toEqual([]);
    expect((await admin.client.from("peer_votes").select("voter_id").eq("campaign_id", campaignId)).data).toHaveLength(3);
  });
});

describe("steelman confirmations and mind-change picks", () => {
  it("cannot be given to your own Dispatch", async () => {
    expect(code((await c.client.rpc("set_steelman_confirmation", { p_dispatch_id: d.c, p_confirmed: true })).error)).toBe("OWN_DISPATCH");
    expect(code((await c.client.rpc("pick_mind_changer", { p_dispatch_id: d.c })).error)).toBe("OWN_DISPATCH");
  });

  it("are open to participants and the Campaign's judges, not outsiders", async () => {
    expect((await a.client.rpc("set_steelman_confirmation", { p_dispatch_id: d.c, p_confirmed: true })).error).toBeNull();
    expect((await judge.client.rpc("set_steelman_confirmation", { p_dispatch_id: d.c, p_confirmed: true })).error).toBeNull();
    expect(code((await outsider.client.rpc("set_steelman_confirmation", { p_dispatch_id: d.c, p_confirmed: true })).error)).toBe("NOT_A_PARTICIPANT");
    expect(code((await outsider.client.rpc("pick_mind_changer", { p_dispatch_id: d.c })).error)).toBe("NOT_A_PARTICIPANT");
    expect((await a.client.rpc("pick_mind_changer", { p_dispatch_id: d.b })).error).toBeNull();
    expect((await a.client.rpc("pick_mind_changer", { p_dispatch_id: d.c })).error).toBeNull();
    expect((await a.client.from("mind_change_picks").select("dispatch_id").eq("campaign_id", campaignId)).data).toEqual([{ dispatch_id: d.c }]);
    expect((await b.client.from("mind_change_picks").select("dispatch_id").eq("campaign_id", campaignId)).data).toEqual([]);
    expect((await b.client.from("steelman_flags").select("user_id").eq("dispatch_id", d.c)).data).toEqual([]);
  });
});

describe("AI rubric queue and scores", () => {
  it("queues every eligible Dispatch of a closed Campaign once, and is hidden from browsers", async () => {
    await service.rpc("judging_tick");
    await service.rpc("judging_tick");
    const { data } = await service.from("ai_rubric_jobs").select("dispatch_id").eq("campaign_id", campaignId);
    expect(data!.map((j) => j.dispatch_id).sort()).toEqual([d.a, d.b, d.c].sort());
    expect((await admin.client.from("ai_rubric_jobs").select("dispatch_id")).data ?? []).toEqual([]);
    expect((await service.from("ai_rubric_jobs").select("dispatch_id").eq("campaign_id", openCampaignId)).data).toEqual([]);
  });

  it("stores each score once per prompt version (retry-safe), readable by admins only", async () => {
    const result = { provider: "fake", model: "test-model", prompt_version: "judge-rubric.v1", logic: 4, evidence: 3, originality: 3, responsiveness: 4, rationale: "Test rationale.", steelman_detected: true, steelman_confidence: 0.9 };
    expect((await service.rpc("store_rubric_score", { p_dispatch_id: d.c, p_result: result })).data).toBe(true);
    expect((await service.rpc("store_rubric_score", { p_dispatch_id: d.c, p_result: { ...result, logic: 1 } })).data).toBe(false);
    expect((await service.from("ai_rubric_scores").select("logic").eq("dispatch_id", d.c)).data).toEqual([{ logic: 4 }]);
    expect((await a.client.from("ai_rubric_scores").select("id")).data).toEqual([]);
    expect((await admin.client.from("ai_rubric_scores").select("id").eq("dispatch_id", d.c)).data).toHaveLength(1);
    expect((await service.from("ai_rubric_jobs").select("status").eq("dispatch_id", d.c).single()).data!.status).toBe("done");
  });

  it("counts judging towards the global daily AI cap", async () => {
    expect((await service.rpc("ai_reserve_call", { p_feature: "judge_rubric", p_user_id: null })).data).toBe("ok");
  });
});

describe("Verdicts", () => {

  it("drafts are stored by the server only, and unreadable by participants and outsiders", async () => {
    expect((await admin.client.rpc("store_verdict_draft", { p_campaign_id: campaignId, p_actor: admin.id, p_draft: draftFor(a.id, true) })).error).not.toBeNull();
    const { data, error } = await service.rpc("store_verdict_draft", { p_campaign_id: campaignId, p_actor: admin.id, p_draft: draftFor(a.id, true) });
    expect(error).toBeNull();
    verdictId = data as string;
    expect((await anonClient().from("verdicts").select("id").eq("campaign_id", campaignId)).data).toEqual([]);
    expect((await a.client.from("verdicts").select("id").eq("campaign_id", campaignId)).data).toEqual([]);
    expect((await admin.client.from("verdicts").select("id").eq("campaign_id", campaignId)).data).toHaveLength(1);
  });

  it("cannot be published by non-admins, or while the draft needs attention", async () => {
    expect(code((await a.client.rpc("publish_verdict", { p_verdict_id: verdictId })).error)).toBe("NOT_ADMIN");
    expect(code((await admin.client.rpc("publish_verdict", { p_verdict_id: verdictId })).error)).toBe("NEEDS_ATTENTION");
  });

  it("a recompute discards the old draft and adds a version", async () => {
    const { data } = await service.rpc("store_verdict_draft", { p_campaign_id: campaignId, p_actor: admin.id, p_draft: draftFor(a.id) });
    const old = await service.from("verdicts").select("status").eq("id", verdictId).single();
    expect(old.data!.status).toBe("discarded");
    verdictId = data as string;
    expect((await service.from("verdicts").select("version").eq("id", verdictId).single()).data!.version).toBe(2);
  });

  it("once published is public, issues awards, updates reputation and emails participants", async () => {
    expect((await admin.client.rpc("edit_verdict_rationale", { p_verdict_id: verdictId, p_rationale: `@{user:${a.id}} is the Grand Strategist. Edited.` })).error).toBeNull();
    expect((await admin.client.rpc("publish_verdict", { p_verdict_id: verdictId })).error).toBeNull();
    const pub = await anonClient().from("verdicts").select("status, rationale").eq("campaign_id", campaignId);
    expect(pub.data).toEqual([{ status: "published", rationale: `@{user:${a.id}} is the Grand Strategist. Edited.` }]);
    expect((await anonClient().from("awards").select("category, profile_id").eq("campaign_id", campaignId)).data).toEqual([{ category: "grand_strategist", profile_id: a.id }]);
    expect((await anonClient().from("reputation").select("titles, points").eq("user_id", a.id).single()).data).toEqual({ titles: 1, points: 11 });
    expect((await service.from("email_outbox").select("kind").eq("user_id", b.id).eq("kind", "verdict_published")).data).toHaveLength(1);
    const board = await anonClient().rpc("leaderboard", { p_category: null, p_limit: 200 });
    expect((board.data as { user_id: string }[]).some((r) => r.user_id === a.id)).toBe(true);
    // A published Verdict cannot be recomputed except through an appeal.
    expect(code((await service.rpc("store_verdict_draft", { p_campaign_id: campaignId, p_actor: admin.id, p_draft: draftFor(b.id) })).error)).toBe("VERDICT_PUBLISHED");
  });

  it("keeps handles out of the audit trail for compute, edit and publish", async () => {
    const { data } = await service.from("audit_log").select("action, details").in("action", ["verdict.computed", "verdict.rationale_edited", "verdict.published"]).eq("details->>campaign_id", campaignId);
    expect(new Set(data!.map((r) => r.action))).toEqual(new Set(["verdict.computed", "verdict.rationale_edited", "verdict.published"]));
    const text = JSON.stringify(data);
    for (const u of [a, b, c]) expect(text).not.toContain(await handleOf(u));
  });
});

describe("appeals", () => {
  it("only participants can appeal, once each", async () => {
    expect(code((await outsider.client.rpc("appeal_verdict", { p_verdict_id: verdictId, p_reason: "I disagree." })).error)).toBe("NOT_A_PARTICIPANT");
    expect(code((await b.client.rpc("appeal_verdict", { p_verdict_id: verdictId, p_reason: "  " })).error)).toBe("REASON_REQUIRED");
    expect((await b.client.rpc("appeal_verdict", { p_verdict_id: verdictId, p_reason: "The panel missed my evidence." })).error).toBeNull();
    expect(code((await b.client.rpc("appeal_verdict", { p_verdict_id: verdictId, p_reason: "Again." })).error)).toBe("ALREADY_APPEALED");
    expect((await anonClient().from("verdicts").select("status").eq("id", verdictId).single()).data!.status).toBe("appealed");
  });

  it("are private to the appellant and admins", async () => {
    expect((await b.client.from("verdict_appeals").select("reason").eq("verdict_id", verdictId)).data).toHaveLength(1);
    expect((await a.client.from("verdict_appeals").select("reason").eq("verdict_id", verdictId)).data).toEqual([]);
    expect((await anonClient().from("verdict_appeals").select("reason")).data ?? []).toEqual([]);
  });

  it("are decided by an admin with a reason; a rejection returns the Verdict to published and tells the appellant", async () => {
    const { data: appeal } = await admin.client.from("verdict_appeals").select("id").eq("verdict_id", verdictId).single();
    expect(code((await a.client.rpc("decide_verdict_appeal", { p_appeal_id: appeal!.id, p_outcome: "rejected", p_reason: "x" })).error)).toBe("NOT_ADMIN");
    expect(code((await admin.client.rpc("decide_verdict_appeal", { p_appeal_id: appeal!.id, p_outcome: "rejected", p_reason: "" })).error)).toBe("REASON_REQUIRED");
    expect((await admin.client.rpc("decide_verdict_appeal", { p_appeal_id: appeal!.id, p_outcome: "rejected", p_reason: "The evidence was scored." })).error).toBeNull();
    expect((await anonClient().from("verdicts").select("status").eq("id", verdictId).single()).data!.status).toBe("published");
    expect((await service.from("email_outbox").select("payload").eq("user_id", b.id).eq("kind", "verdict_appeal_outcome").single()).data!.payload).toMatchObject({ outcome: "rejected" });
    const { data: log } = await service.from("audit_log").select("details").eq("action", "verdict.appeal_decided").eq("target_id", verdictId);
    expect(log![0].details).toMatchObject({ outcome: "rejected", reason: "The evidence was scored.", same_admin: true });
  });

  it("an upheld appeal lets an admin publish a revised Verdict that supersedes the old one", async () => {
    expect((await c.client.rpc("appeal_verdict", { p_verdict_id: verdictId, p_reason: "Reconsider." })).error).toBeNull();
    const { data: appeal } = await admin.client.from("verdict_appeals").select("id").eq("verdict_id", verdictId).eq("appellant_id", c.id).single();
    expect((await admin.client.rpc("decide_verdict_appeal", { p_appeal_id: appeal!.id, p_outcome: "upheld", p_reason: "A scoring error." })).error).toBeNull();
    expect((await anonClient().from("verdicts").select("status").eq("id", verdictId).single()).data!.status).toBe("appealed");
    const { data: revised } = await service.rpc("store_verdict_draft", {
      p_campaign_id: campaignId,
      p_actor: admin.id,
      p_draft: { ...draftFor(b.id), proposed_awards: [{ category: "grand_strategist", profile_id: b.id, dispatch_id: null, rationale: "Revised." }] },
    });
    expect((await admin.client.rpc("publish_verdict", { p_verdict_id: revised })).error).toBeNull();
    expect((await service.from("verdicts").select("status").eq("id", verdictId).single()).data!.status).toBe("superseded");
    expect((await anonClient().from("awards").select("profile_id").eq("campaign_id", campaignId).eq("category", "grand_strategist").single()).data!.profile_id).toBe(b.id);
    expect((await anonClient().from("reputation").select("titles").eq("user_id", a.id).maybeSingle()).data?.titles ?? 0).toBe(0);
  });

  it("a Verdict becomes final once its appeal window has passed", async () => {
    await service.from("verdicts").update({ appeal_closes_at: new Date(Date.now() - 1000).toISOString() }).eq("campaign_id", campaignId).eq("status", "published");
    await service.rpc("judging_tick");
    expect((await anonClient().from("verdicts").select("status").eq("campaign_id", campaignId).in("status", ["published", "appealed", "final"]).single()).data!.status).toBe("final");
    expect(code((await a.client.rpc("appeal_verdict", { p_verdict_id: verdictId, p_reason: "Late." })).error)).toBe("NOT_APPEALABLE");
  });
});
