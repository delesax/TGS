import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 7 (migration 20261113000300): who may vote, confirm a steelman or pick a mind-changer.
// LOCAL Supabase only.

let old1: TestUser; // three days old, participant
let old2: TestUser;
let old3: TestUser;
let fresh: TestUser; // a new account, participant
let freshJudge: TestUser; // a new account, participant AND an assigned judge
let freshOnlyJudge: TestUser; // a new account, assigned judge, did not post
let admin: TestUser;
let campaignId: string;
const dispatch: Record<string, string> = {};

const code = (error: { message: string } | null) => (error ? (/^([A-Z_]+):/.exec(error.message)?.[1] ?? error.message) : null);
const handleOf = async (u: TestUser) => (await service.from("profiles").select("handle").eq("id", u.id).single()).data!.handle as string;

async function post(user: TestUser, body: string) {
  const { data, error } = await user.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: body, p_ai_use: "none" });
  if (error) throw new Error(error.message);
  await applyScreening(data as string, "allow");
  return data as string;
}

const vote = (u: TestUser, d: string) => u.client.rpc("cast_peer_vote", { p_dispatch_id: d });
const confirm = (u: TestUser, d: string, on = true) => u.client.rpc("set_steelman_confirmation", { p_dispatch_id: d, p_confirmed: on });
const pick = (u: TestUser, d: string) => u.client.rpc("pick_mind_changer", { p_dispatch_id: d });
const setting = (values: Record<string, number>) => service.from("judging_settings").update(values).eq("id", true);

beforeAll(async () => {
  [old1, old2, old3, admin] = await Promise.all([createUser(), createUser(), createUser(), createUser({ admin: true })]);
  [fresh, freshJudge, freshOnlyJudge] = await Promise.all([createUser({ newAccount: true }), createUser({ newAccount: true }), createUser({ newAccount: true })]);
  await service.from("community_settings").update({ cooldown_seconds: 0, max_dispatches_per_round: 100 }).eq("id", true);
  await setting({ min_voter_account_age_hours: 48, max_steelman_confirmations: 3, min_position_span_hours: 24, peer_vote_credits: 5 });
  campaignId = await createCampaign({ title: "Eligibility RLS test Campaign", starts_at: new Date(Date.now() - 600_000).toISOString() });
  dispatch.old1 = await post(old1, "Old account one writes an argument for the motion.");
  dispatch.old2 = await post(old2, "Old account two writes an argument against the motion.");
  dispatch.old3 = await post(old3, "Old account three writes an argument about costs.");
  dispatch.fresh = await post(fresh, "A new account writes an argument about fairness.");
  dispatch.judge = await post(freshJudge, "A new account that is also a judge writes an argument.");
  const closed = await service.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", campaignId);
  if (closed.error) throw closed.error;
  for (const j of [freshJudge, freshOnlyJudge]) {
    const r = await admin.client.rpc("assign_judge", { p_campaign_id: campaignId, p_handle: await handleOf(j) });
    if (r.error) throw new Error(r.error.message);
  }
});

afterAll(async () => {
  await setting({ min_voter_account_age_hours: 48, max_steelman_confirmations: 3, min_position_span_hours: 24, peer_vote_credits: 5 });
  await service.from("community_settings").update({ cooldown_seconds: 30, max_dispatches_per_round: 10 }).eq("id", true);
  await deleteUsers([old1, old2, old3, fresh, freshJudge, freshOnlyJudge, admin]);
  await service.from("campaigns").delete().eq("id", campaignId);
});

describe("minimum account age (judging_settings.min_voter_account_age_hours, default 48)", () => {
  it("is a setting with the owner's default of 48 hours", async () => {
    const { data } = await anonClient().from("judging_settings").select("min_voter_account_age_hours, max_steelman_confirmations, min_position_span_hours").single();
    expect(data).toEqual({ min_voter_account_age_hours: 48, max_steelman_confirmations: 3, min_position_span_hours: 24 });
  });

  it("refuses a peer vote from a new account, with the number of hours as the error detail", async () => {
    const r = await vote(fresh, dispatch.old1);
    expect(code(r.error)).toBe("ACCOUNT_TOO_NEW");
    expect(r.error?.details).toBe("48");
  });

  it("accepts a peer vote from an account older than the setting", async () => {
    expect((await vote(old1, dispatch.old2)).error).toBeNull();
  });

  it("exempts an assigned panel judge (an admin chose them): a new judge who is also a participant can vote", async () => {
    expect((await vote(freshJudge, dispatch.old1)).error).toBeNull();
  });

  it("is measured at the moment of the vote: lowering the setting lets the same new account vote", async () => {
    expect(code((await vote(fresh, dispatch.old3)).error)).toBe("ACCOUNT_TOO_NEW");
    await setting({ min_voter_account_age_hours: 0 });
    expect((await vote(fresh, dispatch.old3)).error).toBeNull();
    await setting({ min_voter_account_age_hours: 48 });
    // Raising it again does not undo a vote already cast, and a new vote is refused.
    expect(code((await vote(fresh, dispatch.old2)).error)).toBe("ACCOUNT_TOO_NEW");
  });

  it("applies to steelman confirmations and mind-change picks too, with the same exemption for judges", async () => {
    expect(code((await confirm(fresh, dispatch.old1)).error)).toBe("ACCOUNT_TOO_NEW");
    expect(code((await pick(fresh, dispatch.old1)).error)).toBe("ACCOUNT_TOO_NEW");
    expect((await confirm(freshOnlyJudge, dispatch.old1)).error).toBeNull(); // judge, not a participant
    expect((await pick(old1, dispatch.old2)).error).toBeNull();
    expect((await pick(freshJudge, dispatch.old2)).error).toBeNull();
  });
});

describe("steelman confirmations per person per Campaign (max_steelman_confirmations, default 3)", () => {
  it("allows three, refuses the fourth with the limit as the error detail, and does not count a repeat", async () => {
    const targets = [dispatch.old2, dispatch.old3, dispatch.fresh, dispatch.judge];
    expect((await confirm(old1, targets[0])).error).toBeNull();
    expect((await confirm(old1, targets[1])).error).toBeNull();
    expect((await confirm(old1, targets[2])).error).toBeNull();
    expect((await confirm(old1, targets[0])).error).toBeNull(); // the same one again: not a new confirmation
    const fourth = await confirm(old1, targets[3]);
    expect(code(fourth.error)).toBe("STEELMAN_LIMIT");
    expect(fourth.error?.details).toBe("3");
    // Removing one frees a place.
    expect((await confirm(old1, targets[1], false)).error).toBeNull();
    expect((await confirm(old1, targets[3])).error).toBeNull();
  });

  it("uses the setting, not a constant, and applies to judges too", async () => {
    await setting({ max_steelman_confirmations: 1 });
    expect((await confirm(old2, dispatch.old1)).error).toBeNull();
    expect(code((await confirm(old2, dispatch.old3)).error)).toBe("STEELMAN_LIMIT");
    expect((await confirm(freshOnlyJudge, dispatch.old2)).error?.message ?? "").toMatch(/STEELMAN_LIMIT/); // judge already used their one on old1
    await setting({ max_steelman_confirmations: 3 });
  });
});

describe("save_judging_settings with the new settings", () => {
  it("is admin only, saves the three new values, and the old five-argument call still works", async () => {
    const args = { p_peer_window_hours: 72, p_judging_window_hours: 96, p_peer_vote_credits: 5, p_appeal_window_days: 7, p_ai_rationale_wording: false };
    expect(code((await old1.client.rpc("save_judging_settings", { ...args, p_min_voter_account_age_hours: 1 })).error)).toBe("NOT_ADMIN");
    expect((await admin.client.rpc("save_judging_settings", { ...args, p_min_voter_account_age_hours: 10, p_max_steelman_confirmations: 2, p_min_position_span_hours: 12 })).error).toBeNull();
    let row = (await service.from("judging_settings").select("min_voter_account_age_hours, max_steelman_confirmations, min_position_span_hours").single()).data;
    expect(row).toEqual({ min_voter_account_age_hours: 10, max_steelman_confirmations: 2, min_position_span_hours: 12 });
    // The five-argument call (what the deployed code sends) leaves the new values alone.
    expect((await admin.client.rpc("save_judging_settings", args)).error).toBeNull();
    row = (await service.from("judging_settings").select("min_voter_account_age_hours, max_steelman_confirmations, min_position_span_hours").single()).data;
    expect(row).toEqual({ min_voter_account_age_hours: 10, max_steelman_confirmations: 2, min_position_span_hours: 12 });
    expect((await admin.client.rpc("save_judging_settings", { ...args, p_min_voter_account_age_hours: 999 })).error).not.toBeNull();
  });
});
