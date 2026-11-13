import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 7 batch 2b (migration 20261113000700): judge prompt v2 storage, claims access and the version setting.
// LOCAL Supabase only.

let admin: TestUser;
let judge: TestUser;
let author: TestUser;
let outsider: TestUser;
let campaignId: string;
let dispatchA: string;
let dispatchB: string;

const code = (error: { message: string } | null) => (error ? (/^([A-Z_]+):/.exec(error.message)?.[1] ?? error.message) : null);
const handleOf = async (u: TestUser) => (await service.from("profiles").select("handle").eq("id", u.id).single()).data!.handle as string;
const result = (extra: Record<string, unknown> = {}, prompt = "judge-rubric.v2") => ({
  provider: "fake", model: "stand-in", prompt_version: prompt, logic: 3, evidence: 3, originality: 3, responsiveness: 3,
  rationale: "A plain rationale for the test.", steelman_detected: false, steelman_confidence: 0, steelman_note: "", output: {}, input_tokens: 10, output_tokens: 10, latency_ms: 5, ...extra,
});

async function post(user: TestUser, body: string) {
  const { data, error } = await user.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: body, p_ai_use: "none" });
  if (error) throw new Error(error.message);
  await applyScreening(data as string, "allow");
  return data as string;
}

beforeAll(async () => {
  [admin, judge, author, outsider] = await Promise.all([createUser({ admin: true }), createUser(), createUser(), createUser()]);
  await service.from("community_settings").update({ cooldown_seconds: 0, max_dispatches_per_round: 100 }).eq("id", true);
  campaignId = await createCampaign({ title: "Prompt v2 RLS test Campaign", starts_at: new Date(Date.now() - 600_000).toISOString() });
  dispatchA = await post(author, "A 2023 UK trial of 61 firms found 92% kept the shorter week.");
  dispatchB = await post(author, "A second argument with no figures in it at all.");
  await service.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", campaignId);
  const r = await admin.client.rpc("assign_judge", { p_campaign_id: campaignId, p_handle: await handleOf(judge) });
  if (r.error) throw new Error(r.error.message);
});

afterAll(async () => {
  await service.from("judging_settings").update({ judge_prompt_version: 2 }).eq("id", true);
  await service.from("community_settings").update({ cooldown_seconds: 30, max_dispatches_per_round: 10 }).eq("id", true);
  await deleteUsers([admin, judge, author, outsider]);
  await service.from("campaigns").delete().eq("id", campaignId);
});

describe("storage", () => {
  it("stores up to three claims, stores null for a v1 result or an old-shaped result, and refuses more than three in the table", async () => {
    expect((await service.rpc("store_rubric_score", { p_dispatch_id: dispatchA, p_result: result({ unverified_claims: ["92% kept the shorter week", "a 2023 UK trial of 61 firms"] }) })).data).toBe(true);
    expect((await service.rpc("store_rubric_score", { p_dispatch_id: dispatchB, p_result: result({}, "judge-rubric.v1") })).data).toBe(true);
    const rows = (await service.from("ai_rubric_scores").select("dispatch_id, prompt_version, unverified_claims").eq("campaign_id", campaignId)).data!;
    expect(rows.find((r) => r.dispatch_id === dispatchA)?.unverified_claims).toEqual(["92% kept the shorter week", "a 2023 UK trial of 61 firms"]);
    expect(rows.find((r) => r.dispatch_id === dispatchB)?.unverified_claims).toBeNull();
    // A JSON null stores SQL null; a v1 row and a v2 row for one Dispatch can coexist.
    expect((await service.rpc("store_rubric_score", { p_dispatch_id: dispatchB, p_result: result({ unverified_claims: null }) })).data).toBe(true);
    const direct = await service.from("ai_rubric_scores").update({ unverified_claims: ["a", "b", "c", "d"] }).eq("dispatch_id", dispatchA);
    expect(direct.error).not.toBeNull();
  });

  it("keeps ai_rubric_scores itself admin-only: a judge cannot read the table", async () => {
    expect((await judge.client.from("ai_rubric_scores").select("id")).data).toEqual([]);
    expect(((await admin.client.from("ai_rubric_scores").select("id")).data ?? []).length).toBeGreaterThan(0);
  });
});

describe("dispatch_unverified_claims", () => {
  it("lets an admin and an assigned judge read the claims only, and refuses everyone else", async () => {
    for (const reader of [admin, judge]) {
      const { data, error } = await reader.client.rpc("dispatch_unverified_claims", { p_campaign_id: campaignId });
      expect(error).toBeNull();
      const rows = data as { dispatch_id: string; unverified_claims: string[] }[];
      expect(rows.map((r) => r.dispatch_id)).toEqual([dispatchA]); // the Dispatch with no claims is not listed
      expect(rows[0].unverified_claims).toEqual(["92% kept the shorter week", "a 2023 UK trial of 61 firms"]);
      // Only the claims come back: no scores, rationale or model.
      expect(Object.keys(rows[0]).sort()).toEqual(["dispatch_id", "unverified_claims"]);
    }
    expect(code((await author.client.rpc("dispatch_unverified_claims", { p_campaign_id: campaignId })).error)).toBe("NOT_ALLOWED");
    expect(code((await outsider.client.rpc("dispatch_unverified_claims", { p_campaign_id: campaignId })).error)).toBe("NOT_ALLOWED");
    expect((await anonClient().rpc("dispatch_unverified_claims", { p_campaign_id: campaignId })).error).not.toBeNull();
  });

  it("does not list claims for a Dispatch that has been hidden", async () => {
    await service.from("dispatches").update({ hidden_at: new Date().toISOString() }).eq("id", dispatchA);
    const { data } = await judge.client.rpc("dispatch_unverified_claims", { p_campaign_id: campaignId });
    expect(data).toEqual([]);
    await service.from("dispatches").update({ hidden_at: null }).eq("id", dispatchA);
  });
});

describe("judge_prompt_version", () => {
  it("defaults to 2 (the real evaluation passed) and is readable with the other judging settings", async () => {
    const { data } = await anonClient().from("judging_settings").select("judge_prompt_version").single();
    expect(data?.judge_prompt_version).toBe(2);
  });

  it("is changed only by an admin, with a reason, to 1 or 2, and the change is audited", async () => {
    const args = { p_version: 1, p_reason: "fall back to v1 for the test" };
    expect((await anonClient().rpc("set_judge_prompt_version", args)).error).not.toBeNull();
    expect(code((await judge.client.rpc("set_judge_prompt_version", args)).error)).toBe("NOT_ADMIN");
    expect(code((await admin.client.rpc("set_judge_prompt_version", { ...args, p_reason: "  " })).error)).toBe("REASON_REQUIRED");
    expect(code((await admin.client.rpc("set_judge_prompt_version", { ...args, p_version: 3 })).error)).toBe("BAD_INPUT");
    expect((await admin.client.rpc("set_judge_prompt_version", args)).error).toBeNull();
    expect((await service.from("judging_settings").select("judge_prompt_version").single()).data?.judge_prompt_version).toBe(1);
    const { data } = await service.from("audit_log").select("actor_id, details").eq("action", "judging_settings.prompt_version_changed").order("created_at", { ascending: false }).limit(1).single();
    expect(data?.actor_id).toBe(admin.id);
    expect(data?.details).toMatchObject({ judge_prompt_version: [2, 1], reason: "fall back to v1 for the test" });
    expect((await admin.client.rpc("set_judge_prompt_version", { p_version: 2, p_reason: "back to v2" })).error).toBeNull();
  });

  it("can be forced out of range only through the table check", async () => {
    expect((await service.from("judging_settings").update({ judge_prompt_version: 5 }).eq("id", true)).error).not.toBeNull();
  });
});
