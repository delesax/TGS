import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 7 (migration 20261113000600): app email cut to essentials, with a global daily cap. LOCAL Supabase only.

let member: TestUser;
let admin: TestUser;
let n = 0;
const key = () => `e2e-essentials-${Date.now()}-${n++}`;

const enqueue = (kind: string, sendAfter?: string) =>
  service.rpc("enqueue_email", { p_user_id: member.id, p_kind: kind, p_payload: { campaign_slug: "x", campaign_title: "T" }, p_dedupe_key: key(), p_send_after: sendAfter ?? null });
const rows = async () => (await service.from("email_outbox").select("kind, status, last_error, send_after").eq("user_id", member.id)).data ?? [];
const settings = (v: Record<string, unknown>) => service.from("community_settings").update(v).eq("id", true);
const clear = () => service.from("email_outbox").delete().eq("user_id", member.id);

beforeAll(async () => {
  [member, admin] = await Promise.all([createUser(), createUser({ admin: true })]);
  await settings({ email_essentials_only: true, email_global_daily_cap: 60 });
});

afterAll(async () => {
  await clear();
  await settings({ email_essentials_only: true, email_global_daily_cap: 60 });
  await deleteUsers([member, admin]);
});

describe("settings", () => {
  it("default to essentials only, a global cap of 60 a day, and the owner's five essential kinds", async () => {
    const { data } = await admin.client.rpc("admin_community_settings").single();
    const s = data as Record<string, unknown>;
    expect(s.email_essentials_only).toBe(true);
    expect(s.email_global_daily_cap).toBe(60);
    expect(s.email_essential_kinds).toEqual(["moderation_outcome", "verdict_published", "verdict_appeal_outcome", "judge_assigned", "peer_voting_open"]);
    // The per-person cap that already existed is untouched.
    expect(s.email_daily_cap).toBe(6);
  });

  it("are not readable as table columns by browser roles", async () => {
    for (const client of [anonClient(), member.client, admin.client]) {
      expect((await client.from("community_settings").select("email_essentials_only")).error?.message).toMatch(/permission denied/i);
    }
  });
});

describe("what is queued", () => {
  it("queues essential kinds and does not queue the rest while essentials only is on", async () => {
    await clear();
    for (const kind of ["verdict_published", "moderation_outcome", "verdict_appeal_outcome", "judge_assigned", "peer_voting_open"]) expect((await enqueue(kind)).error).toBeNull();
    for (const kind of ["reply", "campaign_opened", "campaign_round_changed", "campaign_closed", "campaign_closing_soon"]) expect((await enqueue(kind)).error).toBeNull();
    const kinds = (await rows()).map((r) => r.kind).sort();
    expect(kinds).toEqual(["judge_assigned", "moderation_outcome", "peer_voting_open", "verdict_appeal_outcome", "verdict_published"]);
  });

  it("queues everything again when essentials only is switched off", async () => {
    await clear();
    await settings({ email_essentials_only: false });
    expect((await enqueue("reply")).error).toBeNull();
    expect((await rows()).map((r) => r.kind)).toEqual(["reply"]);
    await settings({ email_essentials_only: true });
  });
});

describe("what is sent", () => {
  it("marks already-queued mail of a cut kind as skipped, not left to wait, and still sends essentials", async () => {
    await clear();
    await settings({ email_essentials_only: false });
    await enqueue("reply");
    await enqueue("campaign_opened");
    await enqueue("verdict_published");
    await settings({ email_essentials_only: true });
    const { data, error } = await service.rpc("claim_email_batch", { p_limit: 100 });
    expect(error).toBeNull();
    expect((data as { kind: string }[]).map((r) => r.kind)).toEqual(["verdict_published"]);
    const after = await rows();
    expect(after.filter((r) => r.status === "skipped").map((r) => [r.kind, r.last_error]).sort()).toEqual([["campaign_opened", "not_essential"], ["reply", "not_essential"]]);
  });

  it("stops at the global daily cap: cut kinds still due are skipped, essential ones wait until after midnight", async () => {
    await clear();
    await settings({ email_global_daily_cap: 2 });
    await enqueue("verdict_published");
    await enqueue("moderation_outcome");
    await enqueue("judge_assigned");
    const first = await service.rpc("claim_email_batch", { p_limit: 100 });
    expect((first.data as unknown[]).length).toBe(2); // only two places left today
    // Now the cap is reached: the third essential email is deferred, not dropped and not sent.
    const second = await service.rpc("claim_email_batch", { p_limit: 100 });
    expect((second.data as unknown[]).length).toBe(0);
    const waiting = (await rows()).filter((r) => r.status === "queued");
    expect(waiting).toHaveLength(1);
    expect(new Date(waiting[0].send_after).getTime()).toBeGreaterThan(Date.now() + 60_000);
    await settings({ email_global_daily_cap: 60 });
  });

  it("at the cap with essentials-only off, a due cut kind is skipped with the reason global_daily_cap (not left queued)", async () => {
    await clear();
    await settings({ email_essentials_only: false, email_global_daily_cap: 1 });
    await enqueue("verdict_published");
    const first = await service.rpc("claim_email_batch", { p_limit: 100 });
    expect((first.data as unknown[]).length).toBe(1);
    await settings({ email_essentials_only: false });
    await enqueue("reply"); // a cut kind (not in email_essential_kinds), queued because essentials-only is off
    const second = await service.rpc("claim_email_batch", { p_limit: 100 });
    expect((second.data as unknown[]).length).toBe(0);
    const skipped = (await rows()).filter((r) => r.status === "skipped");
    expect(skipped.map((r) => [r.kind, r.last_error])).toEqual([["reply", "global_daily_cap"]]);
    await settings({ email_essentials_only: true, email_global_daily_cap: 60 });
  });

  it("a cap of 0 sends nothing", async () => {
    await clear();
    await settings({ email_global_daily_cap: 0 });
    await enqueue("verdict_published");
    expect(((await service.rpc("claim_email_batch", { p_limit: 100 })).data as unknown[]).length).toBe(0);
    await settings({ email_global_daily_cap: 60 });
  });
});

describe("set_email_controls", () => {
  it("is admin only, needs a reason, validates the cap, and writes an audit entry", async () => {
    const args = { p_essentials_only: false, p_global_daily_cap: 30, p_reason: "launch test" };
    expect((await anonClient().rpc("set_email_controls", args)).error).not.toBeNull();
    expect((await member.client.rpc("set_email_controls", args)).error?.message).toMatch(/NOT_ADMIN/);
    expect((await admin.client.rpc("set_email_controls", { ...args, p_reason: "  " })).error?.message).toMatch(/REASON_REQUIRED/);
    expect((await admin.client.rpc("set_email_controls", { ...args, p_global_daily_cap: 5000 })).error?.message).toMatch(/BAD_INPUT/);
    expect((await admin.client.rpc("set_email_controls", args)).error).toBeNull();
    const s = (await admin.client.rpc("admin_community_settings").single()).data as Record<string, unknown>;
    expect(s.email_essentials_only).toBe(false);
    expect(s.email_global_daily_cap).toBe(30);
    const { data } = await service.from("audit_log").select("actor_id, details").eq("action", "site.email_controls_changed").order("created_at", { ascending: false }).limit(1).single();
    expect(data?.actor_id).toBe(admin.id);
    expect(data?.details).toMatchObject({ reason: "launch test", email_essentials_only: [true, false], email_global_daily_cap: [60, 30] });
    await settings({ email_essentials_only: true, email_global_daily_cap: 60 });
  });
});
