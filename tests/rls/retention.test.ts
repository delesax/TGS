import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createInvite, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Part 6: retention jobs. Dates are faked by back-dating rows directly in the local database.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const DAY = "interval '1 day'";

let author: TestUser;
let reporter: TestUser;
let campaignId: string;
let heldDispatch: string; // has an open appeal
let flaggedDispatch: string; // has an open flag
let plainDispatch: string; // nothing open
const cleanup: (() => Promise<unknown>)[] = [];

beforeAll(async () => {
  [author, reporter] = await Promise.all([createUser(), createUser()]);
  campaignId = await createCampaign();
  await service.from("community_settings").update({ cooldown_seconds: 0, max_dispatches_per_round: 50 }).eq("id", true);
  const post = async () => {
    const { data, error } = await author.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: `Retention ${randomUUID()}`, p_ai_use: "none" });
    if (error) throw error;
    await applyScreening(data as string);
    return data as string;
  };
  heldDispatch = await post();
  flaggedDispatch = await post();
  plainDispatch = await post();
  await sql`insert into public.dispatch_appeals (dispatch_id, author_id, reason, original_status, status) values (${heldDispatch}, ${author.id}, 'please', 'held', 'open')`;
  await sql`insert into public.moderation_flags (kind, dispatch_id, status) values ('unscreened', ${flaggedDispatch}, 'open')`;
});

afterAll(async () => {
  for (const fn of cleanup) await fn().catch(() => undefined);
  await service.from("community_settings").update({ cooldown_seconds: 30, max_dispatches_per_round: 10 }).eq("id", true);
  await sql`delete from public.moderation_flags where dispatch_id in (${heldDispatch}, ${flaggedDispatch}, ${plainDispatch})`;
  await sql`delete from public.dispatch_appeals where dispatch_id = ${heldDispatch}`;
  await service.from("dispatches").delete().eq("author_id", author.id);
  await deleteUsers([author, reporter]);
  await service.from("campaigns").delete().eq("id", campaignId);
  await sql.end();
});

async function run(fn: string): Promise<number> {
  const { data, error } = await service.rpc(fn);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as number;
}

async function lastLog(job: string) {
  const { data } = await service.from("audit_log").select("action, actor_id, target_id, details").eq("action", "retention.purged").eq("details->>job", job).order("id", { ascending: false }).limit(1);
  return data![0];
}

const decision = (over: Record<string, string>, ageDays: number) =>
  sql`insert into public.ai_decisions (subject_type, subject_id, user_id, model, prompt_version, outcome, reason, created_at)
      values (${over.type}, ${over.subject}, ${over.user ?? null}, 'm', 'p', 'allow', 'because', now() - ${ageDays} * ${sql.unsafe(DAY)}) returning id`;

describe("every job is for the service role only", () => {
  const jobs = ["purge_unconfirmed_signups", "purge_ai_decisions", "purge_reports_flags", "purge_coach_feedback", "purge_emails", "purge_webauthn_challenges", "purge_privacy_requests", "purge_expired_audit_log"];
  it.each(jobs)("%s cannot be called by visitors or Strategists", async (fn) => {
    expect((await anonClient().rpc(fn)).error).not.toBeNull();
    expect((await author.client.rpc(fn)).error).not.toBeNull();
  });
  it("are all scheduled daily, off the hour, with pg_cron", async () => {
    const rows = await sql`select jobname, schedule from cron.job where jobname like 'retention-%' order by jobname`;
    expect(rows.map((r) => r.jobname)).toEqual([
      "retention-ai-decisions", "retention-audit-log", "retention-coach-feedback", "retention-emails", "retention-privacy-requests",
      "retention-reports-flags", "retention-unconfirmed-signups", "retention-webauthn-challenges",
    ]);
    for (const r of rows) expect(r.schedule).toMatch(/^[1-5]?[1-9] 3 \* \* \*$/); // minute is never 0, hour is 3
  });
});

describe("never-confirmed sign-ups: 30 days", () => {
  async function signup(confirmed: boolean, ageDays: number) {
    const invite = await createInvite();
    const email = `unconf-${randomUUID()}@example.test`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: "unconfirmed-test-password",
      email_confirm: confirmed,
      user_metadata: { invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    });
    if (error) throw error;
    await sql`update auth.users set created_at = now() - ${ageDays} * ${sql.unsafe(DAY)} where id = ${data.user.id}`;
    await sql`update public.profiles set created_at = now() - ${ageDays} * ${sql.unsafe(DAY)} where id = ${data.user.id}`;
    cleanup.push(() => service.auth.admin.deleteUser(data.user.id));
    return { id: data.user.id, email, invite };
  }
  const exists = async (id: string) => (await sql`select 1 from auth.users where id = ${id}`).length === 1;
  const profileExists = async (id: string) => (await sql`select 1 from public.profiles where id = ${id}`).length === 1;

  it("deletes old unconfirmed accounts and their profile, and nobody else", async () => {
    const old = await signup(false, 31);
    const recent = await signup(false, 10);
    const oldConfirmed = await signup(true, 400);
    const held = await signup(false, 60);
    await sql`insert into public.privacy_requests (type, email, message) values ('question', ${held.email}, 'still open')`;
    cleanup.push(() => sql`delete from public.privacy_requests where email = ${held.email}`);

    const n = await run("purge_unconfirmed_signups");
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await exists(old.id)).toBe(false);
    expect(await profileExists(old.id)).toBe(false);
    expect(await exists(recent.id)).toBe(true);
    expect(await exists(oldConfirmed.id)).toBe(true); // a confirmed user is never touched
    expect(await profileExists(oldConfirmed.id)).toBe(true);
    expect(await exists(held.id)).toBe(true); // an open privacy request protects it

    const log = await lastLog("retention-unconfirmed-signups");
    expect(log.details).toEqual({ job: "retention-unconfirmed-signups", count: n });
    expect(log.actor_id).toBeNull();
    expect(log.target_id).toBeNull();
  });

  it("leaves the invite usable: an unconfirmed sign-up never used it up", async () => {
    const old = await signup(false, 35);
    await run("purge_unconfirmed_signups");
    expect(await exists(old.id)).toBe(false);
    const { data: usable } = await service.rpc("invite_is_usable", { p_code: old.invite.code });
    expect(usable).toBe(true);
    const { data: inv } = await service.from("invites").select("use_count").eq("id", old.invite.id).single();
    expect(inv!.use_count).toBe(0);
  });

  it("a confirmed user stays even if the confirmation was late (confirmed_at set, created long ago)", async () => {
    const late = await signup(false, 90);
    await sql`update auth.users set email_confirmed_at = now() where id = ${late.id}`;
    await run("purge_unconfirmed_signups");
    expect(await exists(late.id)).toBe(true);
  });
});

describe("decisions about Dispatches and handles: 12 months", () => {
  it("deletes old ones, keeps recent ones, and keeps anything linked to an open flag or appeal or privacy request", async () => {
    const [old] = await decision({ type: "dispatch", subject: plainDispatch }, 400);
    const [recent] = await decision({ type: "dispatch", subject: plainDispatch }, 300);
    const [oldHandle] = await decision({ type: "handle", subject: "someone" }, 400);
    const [oldAppealed] = await decision({ type: "dispatch", subject: heldDispatch }, 400);
    const [oldFlagged] = await decision({ type: "dispatch", subject: flaggedDispatch }, 400);
    const [linkedToFlag] = await decision({ type: "handle", subject: "pending-handle" }, 400);
    await sql`insert into public.moderation_flags (kind, user_id, ai_decision_id, status) values ('held_handle', ${author.id}, ${linkedToFlag.id}, 'open')`;
    const [oldCoach] = await decision({ type: "coach", subject: "draft" }, 400); // not this job's data
    const [heldByRequest] = await decision({ type: "handle", subject: "requester", user: reporter.id }, 400);
    await sql`insert into public.privacy_requests (type, email, user_id, message) values ('access', ${reporter.email}, ${reporter.id}, 'open')`;
    cleanup.push(() => sql`delete from public.privacy_requests where user_id = ${reporter.id}`);
    cleanup.push(() => sql`delete from public.moderation_flags where user_id = ${author.id} and kind = 'held_handle'`);

    const n = await run("purge_ai_decisions");
    expect(n).toBeGreaterThanOrEqual(2);
    const alive = async (id: string) => (await sql`select 1 from public.ai_decisions where id = ${id}`).length === 1;
    expect(await alive(old.id)).toBe(false);
    expect(await alive(oldHandle.id)).toBe(false);
    expect(await alive(recent.id)).toBe(true);
    expect(await alive(oldAppealed.id)).toBe(true);
    expect(await alive(oldFlagged.id)).toBe(true);
    expect(await alive(linkedToFlag.id)).toBe(true);
    expect(await alive(oldCoach.id)).toBe(true);
    expect(await alive(heldByRequest.id)).toBe(true);
    expect((await lastLog("retention-ai-decisions")).details).toEqual({ job: "retention-ai-decisions", count: n });
    // Once the request is closed, the protection ends.
    await sql`update public.privacy_requests set status = 'closed', closed_at = now() where user_id = ${reporter.id}`;
    await run("purge_ai_decisions");
    expect(await alive(heldByRequest.id)).toBe(false);
    expect(await alive(oldAppealed.id)).toBe(true); // the appeal is still open
  });
});

describe("reports and moderation flags: 12 months after they are resolved", () => {
  it("deletes old resolved ones; keeps open, recently resolved, and those on a Dispatch with an open appeal or flag", async () => {
    const mkReport = async (dispatch: string, status: string, resolvedDaysAgo: number | null, by = reporter.id) =>
      (
        await sql`insert into public.dispatch_reports (dispatch_id, reporter_id, reason, status, resolved_at)
                  values (${dispatch}, ${by}, 'other', ${status}, ${resolvedDaysAgo === null ? null : sql`now() - ${resolvedDaysAgo} * ${sql.unsafe(DAY)}`}) returning id`
      )[0].id as string;
    // One report per (dispatch, reporter): use the author as a second reporter where needed.
    const oldResolved = await mkReport(plainDispatch, "dismissed", 400);
    const onAppealed = await mkReport(heldDispatch, "actioned", 400);
    const onFlagged = await mkReport(flaggedDispatch, "actioned", 400);
    const recent = await mkReport(plainDispatch, "dismissed", 100, author.id);
    const oldFlag = (await sql`insert into public.moderation_flags (kind, dispatch_id, status, resolution, resolved_at) values ('undeclared_ai', ${plainDispatch}, 'resolved', 'dismissed', now() - 400 * ${sql.unsafe(DAY)}) returning id`)[0].id as string;
    const recentFlag = (await sql`insert into public.moderation_flags (kind, dispatch_id, status, resolution, resolved_at) values ('unscreened', ${plainDispatch}, 'resolved', 'dismissed', now() - 100 * ${sql.unsafe(DAY)}) returning id`)[0].id as string;
    const openFlag = (await sql`select id from public.moderation_flags where dispatch_id = ${flaggedDispatch} and status = 'open' limit 1`)[0].id as string;
    cleanup.push(() => sql`delete from public.dispatch_reports where dispatch_id in (${plainDispatch}, ${heldDispatch}, ${flaggedDispatch})`);

    const n = await run("purge_reports_flags");
    expect(n).toBeGreaterThanOrEqual(2);
    const has = async (table: string, id: string) => (await sql`select 1 from ${sql(table)} where id = ${id}`).length === 1;
    expect(await has("dispatch_reports", oldResolved)).toBe(false);
    expect(await has("moderation_flags", oldFlag)).toBe(false);
    expect(await has("dispatch_reports", onAppealed)).toBe(true);
    expect(await has("dispatch_reports", onFlagged)).toBe(true);
    expect(await has("dispatch_reports", recent)).toBe(true);
    expect(await has("moderation_flags", recentFlag)).toBe(true);
    expect(await has("moderation_flags", openFlag)).toBe(true);
    expect((await lastLog("retention-reports-flags")).details).toEqual({ job: "retention-reports-flags", count: n });
  });
});

describe("coach feedback and ratings: 90 days", () => {
  it("deletes the coach record and its rating after 90 days, keeps newer ones", async () => {
    const [oldC] = await decision({ type: "coach", subject: "draft", user: author.id }, 100);
    const [newC] = await decision({ type: "coach", subject: "draft", user: author.id }, 30);
    await sql`insert into public.coach_feedback (ai_decision_id, user_id, draft_key, helpful, created_at) values (${oldC.id}, ${author.id}, ${randomUUID()}, true, now() - 100 * ${sql.unsafe(DAY)})`;
    await sql`insert into public.coach_feedback (ai_decision_id, user_id, draft_key, helpful) values (${newC.id}, ${author.id}, ${randomUUID()}, false)`;
    const n = await run("purge_coach_feedback");
    expect(n).toBeGreaterThanOrEqual(2); // the decision and its rating
    expect((await sql`select 1 from public.ai_decisions where id = ${oldC.id}`).length).toBe(0);
    expect((await sql`select 1 from public.coach_feedback where ai_decision_id = ${oldC.id}`).length).toBe(0);
    expect((await sql`select 1 from public.ai_decisions where id = ${newC.id}`).length).toBe(1);
    expect((await sql`select 1 from public.coach_feedback where ai_decision_id = ${newC.id}`).length).toBe(1);
  });
});

describe("queued and sent emails: 30 days", () => {
  it("deletes emails older than 30 days (sent or still queued), keeps recent ones", async () => {
    const mk = async (age: number, status: string) =>
      (await sql`insert into public.email_outbox (user_id, kind, payload, dedupe_key, status, created_at) values (${author.id}, 'reply', '{}'::jsonb, ${randomUUID()}, ${status}, now() - ${age} * ${sql.unsafe(DAY)}) returning id`)[0].id as string;
    const oldSent = await mk(40, "sent");
    const oldQueued = await mk(35, "queued");
    const recent = await mk(5, "sent");
    const sending = await mk(40, "sending");
    const n = await run("purge_emails");
    expect(n).toBeGreaterThanOrEqual(2);
    const has = async (id: string) => (await sql`select 1 from public.email_outbox where id = ${id}`).length === 1;
    expect(await has(oldSent)).toBe(false);
    expect(await has(oldQueued)).toBe(false);
    expect(await has(recent)).toBe(true);
    expect(await has(sending)).toBe(true);
    await sql`delete from public.email_outbox where id in (${recent}, ${sending})`;
  });
});

describe("expired passkey challenges: 1 day", () => {
  it("deletes challenges that expired more than a day ago", async () => {
    const old = (await sql`insert into public.webauthn_challenges (user_id, kind, challenge, expires_at) values (${author.id}, 'login', 'c1', now() - 2 * ${sql.unsafe(DAY)}) returning id`)[0].id as string;
    const live = (await sql`insert into public.webauthn_challenges (user_id, kind, challenge) values (${author.id}, 'login', 'c2') returning id`)[0].id as string;
    await run("purge_webauthn_challenges");
    expect((await sql`select 1 from public.webauthn_challenges where id = ${old}`).length).toBe(0);
    expect((await sql`select 1 from public.webauthn_challenges where id = ${live}`).length).toBe(1);
  });
});

describe("privacy requests: six years after they are closed", () => {
  it("deletes requests closed over six years ago; keeps recent closed ones and any open one however old", async () => {
    const mk = async (status: string, closedYearsAgo: number | null, createdYearsAgo = 1) =>
      (
        await sql`insert into public.privacy_requests (type, email, message, status, created_at, closed_at)
                  values ('question', ${`pr-${randomUUID()}@example.test`}, 'm', ${status}, now() - ${createdYearsAgo} * interval '1 year',
                          ${closedYearsAgo === null ? null : sql`now() - ${closedYearsAgo} * interval '1 year'`}) returning id`
      )[0].id as string;
    const oldClosed = await mk("closed", 7, 8);
    const recentClosed = await mk("closed", 1, 2);
    const oldOpen = await mk("in_progress", null, 9);
    const n = await run("purge_privacy_requests");
    expect(n).toBeGreaterThanOrEqual(1);
    const has = async (id: string) => (await sql`select 1 from public.privacy_requests where id = ${id}`).length === 1;
    expect(await has(oldClosed)).toBe(false);
    expect(await has(recentClosed)).toBe(true);
    expect(await has(oldOpen)).toBe(true);
    await sql`delete from public.privacy_requests where id in (${recentClosed}, ${oldOpen})`;
  });
});

describe("audit record: six years, through one deliberate exception", () => {
  const audit = async (ageYears: number, target: string | null = null) =>
    (
      await sql`insert into public.audit_log (actor_id, action, target_table, target_id, details, created_at)
                values (null, 'test.entry', null, ${target}, '{}'::jsonb, now() - ${ageYears} * interval '1 year') returning id`
    )[0].id as number;
  const has = async (id: number) => (await sql`select 1 from public.audit_log where id = ${id}`).length === 1;

  it("an ordinary update or delete still fails, however old the row is", async () => {
    const id = await audit(8);
    await expect(sql`delete from public.audit_log where id = ${id}`).rejects.toThrow(/AUDIT_LOG_APPEND_ONLY/);
    await expect(sql`update public.audit_log set details = '{"x":1}'::jsonb where id = ${id}`).rejects.toThrow(/AUDIT_LOG_APPEND_ONLY/);
    await expect(sql`truncate public.audit_log`).rejects.toThrow(/AUDIT_LOG_APPEND_ONLY/);
    expect(await has(id)).toBe(true);
    const viaApi = await service.from("audit_log").delete().eq("id", id);
    expect(viaApi.error).not.toBeNull();
  });

  it("a forged flag does not open the door: wrong value, or a row that is not yet six years old", async () => {
    const old = await audit(8);
    const young = await audit(5);
    await expect(
      sql.begin(async (tx) => {
        await tx`select set_config('tgs.audit_purge', 'on', true)`;
        await tx`delete from public.audit_log where id = ${old}`;
      }),
    ).rejects.toThrow(/AUDIT_LOG_APPEND_ONLY/);
    await expect(
      sql.begin(async (tx) => {
        await tx`select set_config('tgs.audit_purge', txid_current()::text, true)`;
        await tx`delete from public.audit_log where id = ${young}`; // right flag, but only five years old
      }),
    ).rejects.toThrow(/AUDIT_LOG_APPEND_ONLY/);
    expect(await has(old)).toBe(true);
    expect(await has(young)).toBe(true);
    // The flag does not outlive its transaction.
    const [{ v }] = await sql`select current_setting('tgs.audit_purge', true) as v`;
    expect(v === null || v === "").toBe(true);
  });

  it("purge_expired_audit_log() removes rows over six years old, keeps the rest, protects open items, and records one summary row", async () => {
    const old = await audit(7);
    const young = await audit(5);
    const openReq = (await sql`insert into public.privacy_requests (type, email, message, status) values ('complaint', 'open-audit@example.test', 'm', 'new') returning id`)[0].id as string;
    cleanup.push(() => sql`delete from public.privacy_requests where id = ${openReq}`);
    const protectedRow = await audit(9, openReq);
    const before = (await sql`select count(*)::int as n from public.audit_log where action = 'retention.purged' and details->>'job' = 'retention-audit-log'`)[0].n as number;

    const n = await run("purge_expired_audit_log");
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await has(old)).toBe(false);
    expect(await has(young)).toBe(true);
    expect(await has(protectedRow)).toBe(true);

    const after = (await sql`select count(*)::int as n from public.audit_log where action = 'retention.purged' and details->>'job' = 'retention-audit-log'`)[0].n as number;
    expect(after).toBe(before + 1); // exactly one summary row per run
    expect((await lastLog("retention-audit-log")).details).toEqual({ job: "retention-audit-log", count: n });

    // And the door is shut again afterwards.
    await expect(sql`delete from public.audit_log where id = ${protectedRow}`).rejects.toThrow(/AUDIT_LOG_APPEND_ONLY/);
  });
});
