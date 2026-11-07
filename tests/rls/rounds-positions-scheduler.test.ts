import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

let strategist: TestUser;
let other: TestUser;
let admin: TestUser;
const ids: string[] = [];
const minute = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

async function campaign(overrides: Record<string, unknown>) {
  const id = await createCampaign(overrides);
  ids.push(id);
  return id;
}

let scheduledId: string; // opens in an hour
let openId: string;
let closedId: string;
let draftId: string;

beforeAll(async () => {
  [strategist, other, admin] = await Promise.all([createUser(), createUser(), createUser({ admin: true })]);
  const now = Date.now();
  scheduledId = await campaign({ status: "scheduled", starts_at: iso(now + 60 * minute), ends_at: iso(now + 120 * minute) });
  openId = await campaign({});
  closedId = await campaign({ status: "closed", starts_at: iso(now - 120 * minute), ends_at: iso(now - 60 * minute) });
  draftId = await campaign({ status: "draft", starts_at: iso(now + 60 * minute), ends_at: iso(now + 120 * minute) });
});

afterAll(async () => {
  await deleteUsers([strategist, other, admin]);
  await service.from("campaigns").delete().in("id", ids);
  await sql.end();
});

describe("campaign_rounds", () => {
  it("can be written only by admins", async () => {
    const round = { campaign_id: openId, position: 1, title: "Openings", starts_at: iso(Date.now() - minute), ends_at: iso(Date.now() + 10 * minute) };
    const { error: strategistError } = await strategist.client.from("campaign_rounds").insert(round);
    expect(strategistError).not.toBeNull();
    const { error } = await admin.client.from("campaign_rounds").insert(round);
    expect(error).toBeNull();

    const { data: changed } = await strategist.client.from("campaign_rounds").update({ title: "Hijacked" }).eq("campaign_id", openId).select();
    expect(changed ?? []).toHaveLength(0);
    const { data: removed } = await strategist.client.from("campaign_rounds").delete().eq("campaign_id", openId).select();
    expect(removed ?? []).toHaveLength(0);
  });

  it("of drafts are invisible to non-admins", async () => {
    await service.from("campaign_rounds").insert({ campaign_id: draftId, position: 1, title: "Secret", starts_at: iso(Date.now() + 60 * minute), ends_at: iso(Date.now() + 90 * minute) });
    for (const client of [anonClient(), strategist.client]) {
      const { data } = await client.from("campaign_rounds").select("id").eq("campaign_id", draftId);
      expect(data ?? []).toHaveLength(0);
    }
    const { data } = await admin.client.from("campaign_rounds").select("id").eq("campaign_id", draftId);
    expect(data).toHaveLength(1);
  });

  it("cannot end after their Campaign", async () => {
    const { error } = await admin.client
      .from("campaign_rounds")
      .insert({ campaign_id: openId, position: 2, title: "Too long", starts_at: iso(Date.now()), ends_at: iso(Date.now() + 999 * minute) });
    expect(error?.message).toMatch(/ROUND_OUTSIDE_CAMPAIGN/);
  });
});

describe("campaigns", () => {
  it("drafts are invisible to non-admins", async () => {
    const { data } = await strategist.client.from("campaigns").select("id").eq("id", draftId);
    expect(data ?? []).toHaveLength(0);
  });

  it("can be saved through save_campaign only by admins", async () => {
    const payload = {
      slug: `rls-save-${Date.now()}`,
      title: "Saved through the form",
      summary: "s",
      category: "energy",
      format: "oxford",
      status: "draft",
      starts_at: iso(Date.now() + 60 * minute),
      ends_at: iso(Date.now() + 120 * minute),
      is_sensitive: false,
      opinion_not_advice: false,
    };
    const { error: denied } = await strategist.client.rpc("save_campaign", { p_id: null, p_campaign: payload, p_rounds: [] });
    expect(denied?.message).toMatch(/NOT_ADMIN/);
    const { data: id, error } = await admin.client.rpc("save_campaign", { p_id: null, p_campaign: payload, p_rounds: [] });
    expect(error).toBeNull();
    ids.push(id as string);

    const { data: log } = await service.from("audit_log").select("actor_id, action").eq("target_id", id as string);
    expect(log).toEqual([{ actor_id: admin.id, action: "campaign.created" }]);
  });

  it("cannot be scheduled while an owner decision is outstanding", async () => {
    const id = await campaign({ status: "draft", needs_owner_decision: "Pick a date" });
    const { error } = await service.from("campaigns").update({ status: "scheduled" }).eq("id", id);
    expect(error?.message).toMatch(/campaigns_no_schedule_while_undecided/);
  });
});

describe("campaign_positions", () => {
  it("lets a Strategist record a before position on a scheduled Campaign, and only their own", async () => {
    const { error } = await strategist.client.from("campaign_positions").insert({ campaign_id: scheduledId, user_id: strategist.id, before_position: "for" });
    expect(error).toBeNull();
    const { error: forged } = await strategist.client.from("campaign_positions").insert({ campaign_id: scheduledId, user_id: other.id, before_position: "for" });
    expect(forged).not.toBeNull();
  });

  it("are private: others cannot read or change them", async () => {
    const { data } = await other.client.from("campaign_positions").select("*").eq("campaign_id", scheduledId);
    expect(data ?? []).toHaveLength(0);
    const { data: changed } = await other.client
      .from("campaign_positions")
      .update({ before_position: "against" })
      .eq("campaign_id", scheduledId)
      .eq("user_id", strategist.id)
      .select();
    expect(changed ?? []).toHaveLength(0);
    const { data: admins } = await admin.client.from("campaign_positions").select("before_position").eq("campaign_id", scheduledId);
    expect(admins).toEqual([{ before_position: "for" }]);
  });

  it("do not allow an after position before the Campaign starts", async () => {
    const { error } = await strategist.client.from("campaign_positions").update({ after_position: "against" }).eq("campaign_id", scheduledId).eq("user_id", strategist.id);
    expect(error?.message).toMatch(/POSITION_TOO_EARLY/);
  });

  it("allow an after position, but not a new before position, once open", async () => {
    const { error: lateBefore } = await strategist.client.from("campaign_positions").insert({ campaign_id: openId, user_id: strategist.id, before_position: "for" });
    expect(lateBefore?.message).toMatch(/POSITION_BEFORE_LOCKED/);
    const { error } = await strategist.client.from("campaign_positions").insert({ campaign_id: openId, user_id: strategist.id, after_position: "undecided" });
    expect(error).toBeNull();
  });

  it("cannot be recorded on drafts", async () => {
    const { error } = await admin.client.from("campaign_positions").insert({ campaign_id: draftId, user_id: admin.id, before_position: "for" });
    expect(error?.message).toMatch(/POSITION_LOCKED/);
  });

  it("cannot be changed after close", async () => {
    const id = await campaign({ status: "open", starts_at: iso(Date.now() - 10 * minute), ends_at: iso(Date.now() + 10 * minute) });
    await strategist.client.from("campaign_positions").insert({ campaign_id: id, user_id: strategist.id, after_position: "for" });
    await service.from("campaigns").update({ status: "closed", starts_at: iso(Date.now() - 20 * minute), ends_at: iso(Date.now() - minute) }).eq("id", id);

    const { error } = await strategist.client.from("campaign_positions").update({ after_position: "against" }).eq("campaign_id", id).eq("user_id", strategist.id);
    expect(error?.message).toMatch(/POSITION_LOCKED/);
    const { error: insertError } = await other.client.from("campaign_positions").insert({ campaign_id: closedId, user_id: other.id, after_position: "for" });
    expect(insertError?.message).toMatch(/POSITION_LOCKED/);
  });

  it("cannot be deleted once the Campaign has closed (open ones can be cleared: see positions-consent.test.ts)", async () => {
    const id = await campaign({ status: "open", starts_at: iso(Date.now() - 10 * minute), ends_at: iso(Date.now() + 10 * minute) });
    await strategist.client.from("campaign_positions").insert({ campaign_id: id, user_id: strategist.id, after_position: "for" });
    await service.from("campaigns").update({ status: "closed", starts_at: iso(Date.now() - 20 * minute), ends_at: iso(Date.now() - minute) }).eq("id", id);
    const { data } = await strategist.client.from("campaign_positions").delete().eq("campaign_id", id).eq("user_id", strategist.id).select();
    expect(data ?? []).toHaveLength(0);
    const { data: still } = await service.from("campaign_positions").select("campaign_id").eq("campaign_id", id).eq("user_id", strategist.id);
    expect(still).toHaveLength(1);
  });
});

describe("campaign_tick (the pg_cron scheduler)", () => {
  it("opens, moves rounds and closes by server time, idempotently, with each step in the audit log", async () => {
    const now = Date.now();
    const id = await campaign({ status: "scheduled", starts_at: iso(now - 2 * minute), ends_at: iso(now + 4 * minute) });
    await service.from("campaign_rounds").insert([
      { campaign_id: id, position: 1, title: "One", starts_at: iso(now - 2 * minute), ends_at: iso(now + minute) },
      { campaign_id: id, position: 2, title: "Two", starts_at: iso(now + minute), ends_at: iso(now + 4 * minute) },
    ]);

    await sql`select public.campaign_tick()`;
    let [row] = await sql`select status, current_round from public.campaigns where id = ${id}`;
    expect(row).toEqual({ status: "open", current_round: 1 });

    // Running again in the same minute changes nothing.
    await sql`select public.campaign_tick()`;
    const opened = await sql`select count(*)::int as n from public.audit_log where target_id = ${id} and action = 'campaign.opened'`;
    expect(opened[0].n).toBe(1);

    // Move the clock on by moving the Campaign back in time (server time is the only clock).
    await sql.begin(async (tx) => {
      await tx`set constraints all deferred`;
      await tx`update public.campaigns set starts_at = starts_at - interval '2 minutes', ends_at = ends_at - interval '2 minutes' where id = ${id}`;
      await tx`update public.campaign_rounds set starts_at = starts_at - interval '2 minutes', ends_at = ends_at - interval '2 minutes' where campaign_id = ${id}`;
    });
    await sql`select public.campaign_tick()`;
    [row] = await sql`select status, current_round from public.campaigns where id = ${id}`;
    expect(row).toEqual({ status: "open", current_round: 2 });

    await sql.begin(async (tx) => {
      await tx`set constraints all deferred`;
      await tx`update public.campaigns set starts_at = starts_at - interval '1 hour', ends_at = ends_at - interval '1 hour' where id = ${id}`;
      await tx`update public.campaign_rounds set starts_at = starts_at - interval '1 hour', ends_at = ends_at - interval '1 hour' where campaign_id = ${id}`;
    });
    await sql`select public.campaign_tick()`;
    await sql`select public.campaign_tick()`;
    [row] = await sql`select status, current_round from public.campaigns where id = ${id}`;
    expect(row).toEqual({ status: "closed", current_round: null });

    const log = await sql`select action, details from public.audit_log where target_id = ${id} and actor_id is null and action in ('campaign.opened', 'campaign.closed', 'campaign.round_changed') order by id`;
    expect(log.map((l) => l.action)).toEqual([
      "campaign.opened",
      "campaign.round_changed",
      "campaign.round_changed",
      "campaign.closed",
      "campaign.round_changed",
    ]);
  });

  it("is scheduled every minute with pg_cron", async () => {
    const jobs = await sql`select schedule, command from cron.job where jobname = 'campaign-tick'`;
    expect(jobs).toEqual([{ schedule: "* * * * *", command: "select public.campaign_tick()" }]);
  });

  it("cannot be run by browser roles", async () => {
    const { error } = await strategist.client.rpc("campaign_tick");
    expect(error).not.toBeNull();
  });
});
