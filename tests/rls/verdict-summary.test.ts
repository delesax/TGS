import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// The winner's summary ("The winning case"): additive columns on verdicts, an admin-only drafts table and three functions.
// Who can do what, the draft-only rule for approval, removal at any status, and that publishing and judging are unchanged.
// LOCAL Supabase only.

let winner: TestUser;
let other: TestUser;
let outsider: TestUser;
let admin: TestUser;
let campaignId: string;
let winnerDispatch: string;
let otherDispatch: string;
let verdictId: string;
const code = (error: { message: string } | null) => (error ? /^([A-Z_]+):/.exec(error.message)?.[1] ?? error.message : null);
const TEXT =
  "The winner argues that libraries should open on Sundays because that is when working families are free. They point to a survey showing demand is highest then, and they accept that staff overtime is a fair worry, suggesting a volunteer rota could cover it.";

async function post(user: TestUser, body: string) {
  await user.client.from("campaign_positions").insert({ campaign_id: campaignId, user_id: user.id, after_position: "for" });
  const { data, error } = await user.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: body, p_ai_use: "none" });
  if (error) throw new Error(error.message);
  await applyScreening(data as string, "allow");
  return data as string;
}

const draftFor = (winnerId: string) => ({
  needs_attention: false,
  attention_reasons: [],
  weights_snapshot: { version: 1, panel: 40, peer: 25, ai_rubric: 25, mind_change: 10, source: "campaign" },
  component_scores: [],
  proposed_awards: [{ category: "grand_strategist", profile_id: winnerId, dispatch_id: null, rationale: `@{user:${winnerId}} won.` }],
  winner_id: winnerId,
  rationale: `@{user:${winnerId}} is the Grand Strategist.`,
});
const aiDraft = (winnerId: string | null, extra: Record<string, unknown> = {}) => ({
  winner_id: winnerId,
  summary: TEXT,
  best_dispatch_id: winnerDispatch,
  model: "claude-sonnet-5-5",
  prompt_version: "judge-summary.v1",
  input_dispatch_ids: [winnerDispatch],
  output: { usage: { input_tokens: 900, output_tokens: 160, estimated_cost_usd: 0.0034 } },
  ...extra,
});
async function newDraftVerdict() {
  const { data, error } = await service.rpc("store_verdict_draft", { p_campaign_id: campaignId, p_actor: admin.id, p_draft: draftFor(winner.id) });
  if (error) throw new Error(error.message);
  return data as string;
}
const summaryRow = async (id: string) =>
  (await service.from("verdicts").select("status, winner_summary, winner_summary_dispatch_id, winner_summary_ai_assisted, winner_summary_model, winner_summary_prompt_version, winner_summary_edited_at, winner_summary_approved_at").eq("id", id).single()).data!;
const audits = async (action: string) => ((await service.from("audit_log").select("details, actor_id").eq("action", action).eq("target_id", verdictId)).data ?? []);

beforeAll(async () => {
  [winner, other, outsider, admin] = await Promise.all([createUser(), createUser(), createUser(), createUser({ admin: true })]);
  await service.from("community_settings").update({ cooldown_seconds: 0, max_dispatches_per_round: 100 }).eq("id", true);
  campaignId = await createCampaign({ title: "Summary RLS Campaign", starts_at: new Date(Date.now() - 600_000).toISOString() });
  winnerDispatch = await post(winner, "Libraries should open on Sundays because that is when working families are free.");
  otherDispatch = await post(other, "Sunday opening costs staff overtime.");
  await service.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", campaignId);
  verdictId = await newDraftVerdict();
});

afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30, max_dispatches_per_round: 10 }).eq("id", true);
  await service.from("awards").delete().eq("campaign_id", campaignId);
  await deleteUsers([winner, other, outsider, admin]);
  await service.from("campaigns").delete().eq("id", campaignId);
});

describe("the columns and the drafts table", () => {
  it("are additive: an existing Verdict has no summary and is untouched", async () => {
    const row = await summaryRow(verdictId);
    expect(row).toMatchObject({ winner_summary: null, winner_summary_ai_assisted: false, winner_summary_model: null, winner_summary_approved_at: null });
    expect(row.status).toBe("draft");
  });

  it("verdicts has no admin id column for the summary (published rows are world-readable)", async () => {
    const probe = await service.from("verdicts").select("winner_summary_approved_by").limit(1);
    expect(probe.error).not.toBeNull();
  });

  it("drafts are admin-readable only", async () => {
    const draft = await service.rpc("store_verdict_summary_draft", { p_verdict_id: verdictId, p_actor: admin.id, p_draft: aiDraft(winner.id) });
    expect(draft.error).toBeNull();
    const asAdmin = await admin.client.from("verdict_summary_drafts").select("id, summary").eq("verdict_id", verdictId);
    expect(asAdmin.data?.length).toBe(1);
    for (const client of [winner.client, outsider.client, anonClient()]) {
      const r = await client.from("verdict_summary_drafts").select("id, summary").eq("verdict_id", verdictId);
      expect(r.data ?? []).toEqual([]);
    }
    expect((await winner.client.from("verdict_summary_drafts").insert({ verdict_id: verdictId, winner_id: winner.id, summary: "x", model: "m", prompt_version: "p" })).error).not.toBeNull();
  });
});

describe("store_verdict_summary_draft", () => {
  it("is service-role only", async () => {
    for (const client of [admin.client, winner.client, anonClient()]) {
      expect((await client.rpc("store_verdict_summary_draft", { p_verdict_id: verdictId, p_actor: admin.id, p_draft: aiDraft(winner.id) })).error).not.toBeNull();
    }
  });

  it("rejects a draft with no winner, a different winner, and a Dispatch that is not the winner's", async () => {
    expect(code((await service.rpc("store_verdict_summary_draft", { p_verdict_id: verdictId, p_actor: admin.id, p_draft: aiDraft(null) })).error)).toBe("NO_WINNER");
    expect(code((await service.rpc("store_verdict_summary_draft", { p_verdict_id: verdictId, p_actor: admin.id, p_draft: aiDraft(other.id) })).error)).toBe("WINNER_MISMATCH");
    expect(code((await service.rpc("store_verdict_summary_draft", { p_verdict_id: verdictId, p_actor: admin.id, p_draft: aiDraft(winner.id, { best_dispatch_id: otherDispatch }) })).error)).toBe("BAD_DISPATCH");
  });

  it("discards the previous pending draft, keeps history, audits each, and stops at five", async () => {
    const before = (await service.from("verdict_summary_drafts").select("id, status").eq("verdict_id", verdictId)).data!;
    expect(before.filter((r) => r.status === "pending").length).toBe(1);
    const second = await service.rpc("store_verdict_summary_draft", { p_verdict_id: verdictId, p_actor: admin.id, p_draft: aiDraft(winner.id) });
    expect(second.error).toBeNull();
    const rows = (await service.from("verdict_summary_drafts").select("id, status").eq("verdict_id", verdictId)).data!;
    expect(rows.filter((r) => r.status === "pending").length).toBe(1);
    expect(rows.filter((r) => r.status === "discarded").length).toBe(1);
    expect((await audits("verdict.summary_drafted")).length).toBe(2);
    expect(((await audits("verdict.summary_drafted"))[0].details as { usage: unknown }).usage).toMatchObject({ input_tokens: 900 });
    for (let i = 0; i < 3; i++) expect((await service.rpc("store_verdict_summary_draft", { p_verdict_id: verdictId, p_actor: admin.id, p_draft: aiDraft(winner.id) })).error).toBeNull();
    expect(code((await service.rpc("store_verdict_summary_draft", { p_verdict_id: verdictId, p_actor: admin.id, p_draft: aiDraft(winner.id) })).error)).toBe("DRAFT_LIMIT");
  });
});

describe("approve_verdict_summary", () => {
  it("is admin only", async () => {
    for (const client of [winner.client, outsider.client, anonClient()]) {
      expect((await client.rpc("approve_verdict_summary", { p_verdict_id: verdictId, p_text: TEXT, p_dispatch_id: winnerDispatch })).error).not.toBeNull();
    }
  });

  it("checks length and that the Dispatch is the winner's and visible", async () => {
    expect(code((await admin.client.rpc("approve_verdict_summary", { p_verdict_id: verdictId, p_text: "too short", p_dispatch_id: null })).error)).toBe("SUMMARY_LENGTH");
    expect(code((await admin.client.rpc("approve_verdict_summary", { p_verdict_id: verdictId, p_text: "x ".repeat(800), p_dispatch_id: null })).error)).toBe("SUMMARY_LENGTH");
    expect(code((await admin.client.rpc("approve_verdict_summary", { p_verdict_id: verdictId, p_text: TEXT, p_dispatch_id: otherDispatch })).error)).toBe("BAD_DISPATCH");
    expect(code((await admin.client.rpc("approve_verdict_summary", { p_verdict_id: verdictId, p_text: TEXT, p_dispatch_id: randomUUID() })).error)).toBe("BAD_DISPATCH");
  });

  it("approves an AI draft as AI-assisted with its model and prompt version, notes an edit, and audits it", async () => {
    const edited = TEXT + " They also say the cost is small.";
    const { error } = await admin.client.rpc("approve_verdict_summary", { p_verdict_id: verdictId, p_text: edited, p_dispatch_id: winnerDispatch });
    expect(error).toBeNull();
    const row = await summaryRow(verdictId);
    expect(row).toMatchObject({
      winner_summary: edited,
      winner_summary_dispatch_id: winnerDispatch,
      winner_summary_ai_assisted: true,
      winner_summary_model: "claude-sonnet-5-5",
      winner_summary_prompt_version: "judge-summary.v1",
    });
    expect(row.winner_summary_edited_at).not.toBeNull();
    expect(row.winner_summary_approved_at).not.toBeNull();
    expect((await service.from("verdict_summary_drafts").select("status").eq("verdict_id", verdictId).eq("status", "approved")).data?.length).toBe(1);
    const log = await audits("verdict.summary_approved");
    expect(log.length).toBe(1);
    expect(log[0].actor_id).toBe(admin.id);
    expect(log[0].details).toMatchObject({ ai_assisted: true, edited: true, winner_id: winner.id });
  });

  it("keeps the AI label, model and prompt version when an AI-drafted summary is re-approved with no new draft", async () => {
    const again = TEXT + " They also say the cost is small. Reworded once more by the admin.";
    const { error } = await admin.client.rpc("approve_verdict_summary", { p_verdict_id: verdictId, p_text: again, p_dispatch_id: null });
    expect(error).toBeNull();
    const row = await summaryRow(verdictId);
    expect(row.winner_summary).toBe(again);
    expect(row.winner_summary_ai_assisted).toBe(true);
    expect(row.winner_summary_model).toBe("claude-sonnet-5-5");
    expect(row.winner_summary_prompt_version).toBe("judge-summary.v1");
    expect(row.winner_summary_edited_at).not.toBeNull();
    expect(row.winner_summary_dispatch_id).toBeNull();
  });

  it("removal on a draft Verdict marks the drafts removed but keeps every row", async () => {
    const before = (await service.from("verdict_summary_drafts").select("id").eq("verdict_id", verdictId)).data!.length;
    const { error } = await admin.client.rpc("remove_verdict_summary", { p_verdict_id: verdictId, p_reason: "Starting again with a fresh draft." });
    expect(error).toBeNull();
    expect((await summaryRow(verdictId)).winner_summary).toBeNull();
    const rows = (await service.from("verdict_summary_drafts").select("status").eq("verdict_id", verdictId)).data!;
    expect(rows.length).toBe(before);
    expect(rows.filter((r) => r.status === "removed").length).toBe(1);
    expect(rows.filter((r) => r.status === "pending" || r.status === "approved").length).toBe(0);
  });

  it("flags a summary with no AI involvement as not AI-assisted", async () => {
    const id = await (async () => {
      // A fresh draft Verdict (the old one is discarded by store_verdict_draft).
      return newDraftVerdict();
    })();
    const { error } = await admin.client.rpc("approve_verdict_summary", { p_verdict_id: id, p_text: TEXT, p_dispatch_id: winnerDispatch });
    expect(error).toBeNull();
    const row = await summaryRow(id);
    expect(row).toMatchObject({ winner_summary_ai_assisted: false, winner_summary_model: null, winner_summary_prompt_version: null, winner_summary_edited_at: null });
    verdictId = id;
  });
});

describe("visibility and the lifecycle", () => {
  it("a draft Verdict (and its summary) is hidden from the public; the approved text is public once published", async () => {
    expect((await anonClient().from("verdicts").select("winner_summary").eq("id", verdictId)).data ?? []).toEqual([]);
    expect((await outsider.client.from("verdicts").select("winner_summary").eq("id", verdictId)).data ?? []).toEqual([]);
    const published = await admin.client.rpc("publish_verdict", { p_verdict_id: verdictId });
    expect(published.error).toBeNull();
    const anon = await anonClient().from("verdicts").select("status, winner_summary, winner_summary_ai_assisted").eq("id", verdictId).single();
    expect(anon.data).toMatchObject({ status: "published", winner_summary: TEXT, winner_summary_ai_assisted: false });
  });

  it("publish_verdict is unchanged by a summary: scores, awards and weights are exactly as drafted", async () => {
    const v = (await service.from("verdicts").select("winner_id, weights_snapshot, component_scores, proposed_awards").eq("id", verdictId).single()).data!;
    expect(v.winner_id).toBe(winner.id);
    expect(v.weights_snapshot).toMatchObject({ panel: 40, peer: 25, ai_rubric: 25, mind_change: 10 });
    expect((await service.from("awards").select("category, profile_id").eq("campaign_id", campaignId)).data).toEqual([{ category: "grand_strategist", profile_id: winner.id }]);
  });

  it("approving or drafting after publication is refused", async () => {
    expect(code((await admin.client.rpc("approve_verdict_summary", { p_verdict_id: verdictId, p_text: TEXT + " Late edit.", p_dispatch_id: null })).error)).toBe("NOT_DRAFT");
    expect(code((await service.rpc("store_verdict_summary_draft", { p_verdict_id: verdictId, p_actor: admin.id, p_draft: aiDraft(winner.id) })).error)).toBe("NOT_DRAFT");
  });

  it("removal needs an admin and a reason of 10 or more characters, works on a published Verdict, audits it and keeps draft history", async () => {
    for (const client of [winner.client, outsider.client, anonClient()]) {
      expect((await client.rpc("remove_verdict_summary", { p_verdict_id: verdictId, p_reason: "Removing this for a good reason." })).error).not.toBeNull();
    }
    expect(code((await admin.client.rpc("remove_verdict_summary", { p_verdict_id: verdictId, p_reason: "short" })).error)).toBe("REASON_REQUIRED");
    const removed = await admin.client.rpc("remove_verdict_summary", { p_verdict_id: verdictId, p_reason: "The summary quoted a figure the Dispatch does not contain." });
    expect(removed.error).toBeNull();
    const anon = await anonClient().from("verdicts").select("status, winner_summary, winner_summary_ai_assisted, winner_summary_model").eq("id", verdictId).single();
    expect(anon.data).toMatchObject({ status: "published", winner_summary: null, winner_summary_ai_assisted: false, winner_summary_model: null });
    const log = await audits("verdict.summary_removed");
    expect(log.length).toBe(1);
    expect(log[0].details).toMatchObject({ status: "published", reason: "The summary quoted a figure the Dispatch does not contain." });
  });

});
