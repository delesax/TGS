import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createInvite, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 7 (migration 20261113000400): integrity signals. Read-only flags for human review.
// LOCAL Supabase only.

let admin: TestUser;
let u: TestUser[]; // u[1] .. u[6]; u[0] unused
let campaignId: string;
const dispatches: Record<string, string[]> = {};
const extraAuthIds: string[] = [];

async function post(user: TestUser, body: string) {
  const { data, error } = await user.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: body, p_ai_use: "none" });
  if (error) throw new Error(error.message);
  await applyScreening(data as string, "allow");
  return data as string;
}

const vote = async (voter: TestUser, dispatchId: string) => {
  const { error } = await service.from("peer_votes").insert({ campaign_id: campaignId, dispatch_id: dispatchId, voter_id: voter.id });
  if (error) throw error;
};

async function report() {
  const { data, error } = await admin.client.rpc("admin_integrity_signals", { p_days: 30 });
  expect(error).toBeNull();
  return data as { signals: { code: string; campaign_id?: string; users: string[]; detail: string }[]; handles: Record<string, string>; campaigns: Record<string, unknown> };
}

const withUsers = (r: Awaited<ReturnType<typeof report>>, code: string, ...ids: string[]) =>
  r.signals.filter((s) => s.code === code && ids.every((id) => s.users.includes(id)));

beforeAll(async () => {
  admin = await createUser({ admin: true });
  u = [admin, ...(await Promise.all([1, 2, 3, 4, 5, 6].map(() => createUser())))];
  await service.from("community_settings").update({ cooldown_seconds: 0, max_dispatches_per_round: 100 }).eq("id", true);
  campaignId = await createCampaign({ title: "Integrity RLS test Campaign", starts_at: new Date(Date.now() - 600_000).toISOString() });
  for (const i of [1, 3, 4, 5, 6]) dispatches[i] = [await post(u[i], `Participant ${i} argues the motion in one short Dispatch.`)];
  dispatches[2] = [];
  for (const n of [1, 2, 3]) dispatches[2].push(await post(u[2], `Participant 2 argues point number ${n} of the motion at length.`));
  // A position recorded after the Campaign started can only be an after position; the database sets after_at itself.
  const inserted = await service.from("campaign_positions").insert({ campaign_id: campaignId, user_id: u[1].id, after_position: "against" });
  if (inserted.error) throw inserted.error;
  await service.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", campaignId);

  // 1 vote_concentration + 7b steelman_concentration: u1 sends all three votes, and all three confirmations, to u2.
  for (const d of dispatches[2]) {
    await vote(u[1], d);
    await service.from("steelman_flags").insert({ campaign_id: campaignId, dispatch_id: d, user_id: u[1].id });
  }
  // 2 mutual_votes, 7a reciprocal_picks, 7c reciprocal_steelman: u3 and u4 do it for each other.
  await vote(u[3], dispatches[4][0]);
  await vote(u[4], dispatches[3][0]);
  await service.from("mind_change_picks").insert([
    { campaign_id: campaignId, user_id: u[3].id, dispatch_id: dispatches[4][0] },
    { campaign_id: campaignId, user_id: u[4].id, dispatch_id: dispatches[3][0] },
  ]);
  await service.from("steelman_flags").insert([
    { campaign_id: campaignId, dispatch_id: dispatches[4][0], user_id: u[3].id },
    { campaign_id: campaignId, dispatch_id: dispatches[3][0], user_id: u[4].id },
  ]);
  // 3 shared_targets + 4 burst_votes: u5 and u6 vote for the same three, and u5 casts four at once.
  for (const d of dispatches[2]) {
    await vote(u[5], d);
    await vote(u[6], d);
  }
  await vote(u[5], dispatches[1][0]);

  // 5 invite_burst: three accounts on one invite. 6 email_family: plus tags, and Gmail dots.
  const invite = await createInvite({ max_uses: 5 });
  const make = async (email: string) => {
    const { data, error } = await service.auth.admin.createUser({
      email, password: "rls-test-password-123", email_confirm: true,
      user_metadata: { invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    });
    if (error) throw error;
    extraAuthIds.push(data.user.id);
    return data.user.id;
  };
  const tag = randomUUID().slice(0, 8);
  dispatches.burst = [await make(`family${tag}+one@example.test`), await make(`family${tag}+two@example.test`), await make(`first.last${tag}+x@gmail.com`)];
  dispatches.burst.push(await make(`firstlast${tag}@googlemail.com`));
});

afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30, max_dispatches_per_round: 10 }).eq("id", true);
  await deleteUsers(u);
  for (const id of extraAuthIds) await service.auth.admin.deleteUser(id);
  await service.from("campaigns").delete().eq("id", campaignId);
});

describe("admin_integrity_signals", () => {
  it("is admin only", async () => {
    expect((await anonClient().rpc("admin_integrity_signals")).error).not.toBeNull();
    expect((await u[1].client.rpc("admin_integrity_signals")).error?.message).toMatch(/NOT_ADMIN/);
  });

  it("flags vote concentration, mutual votes, shared targets and burst voting for the right people", async () => {
    const r = await report();
    expect(withUsers(r, "vote_concentration", u[1].id, u[2].id)).toHaveLength(1);
    expect(withUsers(r, "mutual_votes", u[3].id, u[4].id)).toHaveLength(1);
    expect(withUsers(r, "shared_targets", u[5].id, u[6].id)).toHaveLength(1);
    expect(withUsers(r, "burst_votes", u[5].id)).toHaveLength(1);
    // Ordinary voting is not flagged: u3's single vote is not concentration (fewer than three votes).
    expect(withUsers(r, "vote_concentration", u[3].id)).toHaveLength(0);
  });

  it("flags reciprocal mind-change picks, steelman concentration and reciprocal steelman confirmations", async () => {
    const r = await report();
    expect(withUsers(r, "reciprocal_picks", u[3].id, u[4].id)).toHaveLength(1);
    expect(withUsers(r, "steelman_concentration", u[1].id, u[2].id)).toHaveLength(1);
    expect(withUsers(r, "reciprocal_steelman", u[3].id, u[4].id)).toHaveLength(1);
  });

  it("flags an invite burst and mailbox families without showing any address", async () => {
    const r = await report();
    const burst = r.signals.filter((s) => s.code === "invite_burst" && dispatches.burst.every((id) => s.users.includes(id)));
    expect(burst).toHaveLength(1);
    const plus = withUsers(r, "email_family", dispatches.burst[0], dispatches.burst[1]);
    expect(plus).toHaveLength(1);
    expect(plus[0].users).not.toContain(dispatches.burst[2]);
    expect(withUsers(r, "email_family", dispatches.burst[2], dispatches.burst[3])).toHaveLength(1); // Gmail dots and googlemail.com
    expect(JSON.stringify(r)).not.toMatch(/@example\.test|@gmail\.com|@googlemail\.com/);
  });

  it("only reads: running it twice changes nothing, and it stores nothing new", async () => {
    const before = await service.from("audit_log").select("id", { count: "exact", head: true });
    const a = await report();
    const b = await report();
    expect(b.signals.length).toBe(a.signals.length);
    const after = await service.from("audit_log").select("id", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
  });
});

describe("integrity_signals and judging_inputs", () => {
  it("integrity_signals is for the server only", async () => {
    for (const client of [anonClient(), u[1].client, admin.client]) expect((await client.rpc("integrity_signals", { p_campaign_id: campaignId })).error).not.toBeNull();
    const { data, error } = await service.rpc("integrity_signals", { p_campaign_id: campaignId, p_days: 30 });
    expect(error).toBeNull();
    expect((data as { code: string }[]).some((s) => s.code === "mutual_votes")).toBe(true);
  });

  it("judging_inputs carries the Campaign's signals, picker reputation and position times", async () => {
    const { data, error } = await service.rpc("judging_inputs", { p_campaign_id: campaignId });
    expect(error).toBeNull();
    const inputs = data as { integrity: { code: string }[]; positions: { user_id: string; before_at?: string; after_at?: string }[]; settings: Record<string, unknown> };
    expect(inputs.integrity.length).toBeGreaterThan(0);
    expect(inputs.integrity.every((s) => typeof s.code === "string")).toBe(true);
    const mine = inputs.positions.find((p) => p.user_id === u[1].id);
    expect(mine).toBeDefined();
    expect(mine).toHaveProperty("before_at");
    expect(mine?.after_at).toBeTruthy();
    expect(inputs.settings).toMatchObject({ min_voter_account_age_hours: 48, min_position_span_hours: 24 });
  });
});
