import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateStrongInviteCode, inviteCodeHash } from "../../src/lib/invite-codes";
import { anonClient, createInvite, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Join requests, email-bound hashed invites and invitation email (migration 20261116000100). LOCAL Supabase only.

let admin: TestUser;
let member: TestUser;
const users: TestUser[] = [];
const signedUp: string[] = [];
const emails: string[] = [];
const requestIds: string[] = [];
const inviteIds: string[] = [];
let originalSettings: Record<string, unknown>;

const fresh = (label: string) => {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  emails.push(email);
  return email;
};

type Made = { code: string; hash: string };
const makeCode = (): Made => {
  const code = generateStrongInviteCode();
  return { code, hash: inviteCodeHash(code) };
};

async function addRequest(email: string, note: string | null = null) {
  const { error } = await service.rpc("request_to_join", { p_email: email, p_note: note });
  if (error) throw error;
  const { data } = await service.from("join_requests").select("id, email, status").eq("email", email.toLowerCase().trim()).maybeSingle();
  if (data) requestIds.push(data.id);
  return data as { id: string; email: string; status: string } | null;
}

type Result = { request_id: string; email: string; status: string; invite_id: string | null; send_after: string | null; expires_at: string | null };
async function issue(items: object[], send: boolean, key: string = randomUUID()) {
  const r = await admin.client.rpc("issue_invites", { p_items: items, p_send_email: send, p_key: key });
  if (r.data?.results) for (const x of r.data.results as Result[]) if (x.invite_id) inviteIds.push(x.invite_id);
  return r as { data: { duplicate: boolean; results: Result[] } | null; error: { message: string } | null };
}

async function signUp(code: string, email: string) {
  const r = await service.auth.admin.createUser({
    email, password: "rls-test-password-123", email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
  });
  if (r.data?.user) signedUp.push(r.data.user.id);
  return r;
}

const outboxFor = async (email: string) => (await service.from("email_outbox").select("*").eq("to_email", email.toLowerCase())).data ?? [];

beforeAll(async () => {
  admin = await createUser({ admin: true });
  member = await createUser();
  users.push(admin, member);
  const { data } = await service.from("community_settings").select("invite_daily_email_limit, invite_expiry_days, email_essentials_only, email_essential_kinds, email_global_daily_cap, resend_daily_limit").eq("id", true).single();
  originalSettings = data!;
});

afterAll(async () => {
  await service.from("community_settings").update(originalSettings).eq("id", true);
  if (emails.length) await service.from("email_outbox").delete().in("to_email", emails.map((e) => e.toLowerCase()));
  if (inviteIds.length) await service.from("invites").delete().in("id", inviteIds);
  if (emails.length) await service.from("join_requests").delete().in("email", emails.map((e) => e.toLowerCase()));
  for (const id of signedUp) await service.auth.admin.deleteUser(id);
  await deleteUsers(users);
});

describe("who can read or call what", () => {
  it("join requests and invites are admin only: anon is refused, a member sees nothing, an admin sees the row", async () => {
    const email = fresh("read");
    await addRequest(email);
    // Anonymous visitors get an error or nothing, never a row.
    for (const table of ["join_requests", "invites"] as const) {
      const r = await anonClient().from(table).select("id");
      expect(r.error !== null || (r.data ?? []).length === 0, table).toBe(true);
    }
    expect((await member.client.from("join_requests").select("id")).data).toEqual([]);
    expect((await member.client.from("invites").select("id, code_hash")).data).toEqual([]);
    const seen = await admin.client.from("join_requests").select("email").eq("email", email);
    expect(seen.data).toEqual([{ email }]);
    // No browser role can write the tables directly.
    expect((await admin.client.from("join_requests").insert({ email: fresh("direct") })).error).not.toBeNull();
    expect((await member.client.from("join_requests").update({ status: "approved" }).eq("email", email)).data ?? []).toEqual([]);
  });

  it("only the service role can call request_to_join; the admin functions need an admin", async () => {
    const email = fresh("who");
    expect((await anonClient().rpc("request_to_join", { p_email: email, p_note: null })).error).not.toBeNull();
    expect((await member.client.rpc("request_to_join", { p_email: email, p_note: null })).error).not.toBeNull();
    const item = [{ email: fresh("nope"), code_hash: makeCode().hash }];
    expect((await anonClient().rpc("issue_invites", { p_items: item, p_send_email: false, p_key: randomUUID() })).error).not.toBeNull();
    expect((await member.client.rpc("issue_invites", { p_items: item, p_send_email: false, p_key: randomUUID() })).error?.message).toMatch(/NOT_ADMIN/);
    expect((await member.client.rpc("reject_join_requests", { p_ids: [randomUUID()] })).error?.message).toMatch(/NOT_ADMIN/);
    expect((await member.client.rpc("revoke_invite", { p_invite_id: randomUUID() })).error?.message).toMatch(/NOT_ADMIN/);
    expect((await member.client.rpc("reissue_invite", { p_invite_id: randomUUID(), p_code_hash: makeCode().hash, p_code: null, p_send_email: false, p_key: randomUUID() })).error?.message).toMatch(/NOT_ADMIN/);
    expect((await member.client.rpc("admin_invites_overview")).error?.message).toMatch(/NOT_ADMIN/);
    expect((await member.client.rpc("invite_email_budget")).error?.message).toMatch(/NOT_ADMIN/);
    // Internal helpers are not callable from the browser at all.
    expect((await admin.client.rpc("enqueue_invite_email", { p_to_email: email, p_payload: {}, p_dedupe_key: randomUUID(), p_send_after: new Date().toISOString() })).error).not.toBeNull();
    expect((await admin.client.rpc("invite_send_times", { p_count: 1 })).error).not.toBeNull();
    expect((await admin.client.rpc("purge_join_requests")).error).not.toBeNull();
    expect((await admin.client.rpc("invite_code_hash", { p_code: "x" })).error).not.toBeNull();
  });
});

describe("request_to_join (the public form's database function)", () => {
  it("saves a pending request in lower case with a cleaned note, and says nothing different for a repeat", async () => {
    const email = fresh("Mixed.Case");
    await addRequest(email.toUpperCase(), "  hello\nthere\u0007  ");
    const first = (await service.from("join_requests").select("email, note, status, source").eq("email", email.toLowerCase())).data!;
    expect(first).toEqual([{ email: email.toLowerCase(), note: "hello there", status: "pending", source: "form" }]);
    // The same address in another case: no error, no second row.
    expect((await service.rpc("request_to_join", { p_email: email, p_note: "again" })).error).toBeNull();
    expect((await service.from("join_requests").select("id").eq("email", email.toLowerCase())).data).toHaveLength(1);
  });

  it("does nothing, silently, for a current member and for someone rejected, and cuts a long note to 200 characters", async () => {
    expect((await service.rpc("request_to_join", { p_email: member.email.toUpperCase(), p_note: null })).error).toBeNull();
    expect((await service.from("join_requests").select("id").eq("email", member.email)).data).toEqual([]);

    const email = fresh("rejected");
    const req = await addRequest(email);
    expect((await admin.client.rpc("reject_join_requests", { p_ids: [req!.id] })).data).toBe(1);
    expect((await service.rpc("request_to_join", { p_email: email, p_note: null })).error).toBeNull();
    expect((await service.from("join_requests").select("status").eq("email", email)).data).toEqual([{ status: "rejected" }]);

    const long = fresh("long");
    await addRequest(long, "x".repeat(500));
    expect((await service.from("join_requests").select("note").eq("email", long).single()).data!.note).toHaveLength(200);
  });

  it("refuses a value that is not an email address, and the table refuses a non-lower-case address or a duplicate live request", async () => {
    expect((await service.rpc("request_to_join", { p_email: "not an email", p_note: null })).error?.message).toMatch(/BAD_EMAIL/);
    expect((await service.from("join_requests").insert({ email: "Upper@example.test" })).error).not.toBeNull();
    const email = fresh("unique");
    await addRequest(email);
    expect((await service.from("join_requests").insert({ email })).error).not.toBeNull();
  });
});

describe("issuing invites", () => {
  it("makes a hashed single-use invite bound to the address, expiring in 7 days, and queues the email without leaking the code", async () => {
    const email = fresh("approve");
    const req = (await addRequest(email, "a note"))!;
    const { code, hash } = makeCode();
    const r = await issue([{ request_id: req.id, code_hash: hash, code }], true);
    expect(r.error).toBeNull();
    expect(r.data!.duplicate).toBe(false);
    expect(r.data!.results[0]).toMatchObject({ request_id: req.id, email, status: "issued" });

    const invite = (await service.from("invites").select("*").eq("id", r.data!.results[0].invite_id!).single()).data!;
    expect(invite.code).toBeNull(); // stored hashed only
    expect(invite.code_hash).toBe(hash);
    expect(invite).toMatchObject({ invited_email: email, max_uses: 1, use_count: 0, revoked_at: null });
    const days = (Date.parse(invite.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);

    expect((await service.from("join_requests").select("status, invite_id").eq("id", req.id).single()).data).toEqual({ status: "approved", invite_id: invite.id });
    const queued = await outboxFor(email);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "invite", user_id: null, status: "queued" });
    expect(queued[0].payload).toMatchObject({ code, invite_id: invite.id });

    // The audit log carries ids and counts, never the address or the code.
    const audit = (await service.from("audit_log").select("action, details, target_id").in("action", ["invite.issued", "invite.batch_issued"]).order("created_at", { ascending: false }).limit(20)).data!;
    const text = JSON.stringify(audit);
    expect(text).not.toContain(email);
    expect(text).not.toContain(code);
    expect(audit.some((a) => a.action === "invite.issued" && a.target_id === invite.id)).toBe(true);
  });

  it("is safe to submit twice: a repeated key makes nothing new", async () => {
    const email = fresh("twice");
    const req = (await addRequest(email))!;
    const key = randomUUID();
    const item = [{ request_id: req.id, code_hash: makeCode().hash }];
    const first = await issue(item, false, key);
    expect(first.data!.duplicate).toBe(false);
    const second = await issue([{ request_id: req.id, code_hash: makeCode().hash }], false, key);
    expect(second.data).toEqual({ duplicate: true, results: [] });
    expect((await service.from("invites").select("id").eq("invited_email", email)).data).toHaveLength(1);
  });

  it("allows 50 people at a time, not 51 or none", async () => {
    const many = (n: number) => Array.from({ length: n }, () => ({ email: fresh("bulk"), code_hash: makeCode().hash }));
    expect((await issue(many(51), false)).error?.message).toMatch(/BATCH_SIZE/);
    expect((await issue([], false)).error?.message).toMatch(/BATCH_SIZE/);
    const fifty = await issue(many(50), false);
    expect(fifty.error).toBeNull();
    expect(fifty.data!.results.filter((x) => x.status === "issued")).toHaveLength(50);
    const rejected = await admin.client.rpc("reject_join_requests", { p_ids: Array.from({ length: 51 }, () => randomUUID()) });
    expect(rejected.error?.message).toMatch(/BATCH_SIZE/);
  });

  it("accepts pasted addresses, and reports members, repeats and bad addresses instead of inviting them", async () => {
    const pasted = fresh("Pasted.One");
    const r = await issue(
      [
        { email: pasted.toUpperCase(), code_hash: makeCode().hash },
        { email: member.email, code_hash: makeCode().hash },
        { email: "nonsense", code_hash: makeCode().hash },
      ],
      false,
    );
    expect(r.error).toBeNull();
    expect(r.data!.results.map((x) => x.status)).toEqual(["issued", "already_member", "bad_email"]);
    expect((await service.from("join_requests").select("source, status").eq("email", pasted.toLowerCase()).single()).data).toEqual({ source: "admin", status: "approved" });
    const again = await issue([{ email: pasted, code_hash: makeCode().hash }], false);
    expect(again.data!.results[0].status).toBe("already_invited");
    const missing = await issue([{ request_id: randomUUID(), code_hash: makeCode().hash }], false);
    expect(missing.data!.results[0].status).toBe("not_found");
  });

  it("sets nothing to be emailed when asked not to, and refuses to email when invite email is not an essential kind", async () => {
    const email = fresh("noemail");
    const r = await issue([{ email, code_hash: makeCode().hash }], false);
    expect(r.data!.results[0].send_after).toBeNull();
    expect(await outboxFor(email)).toEqual([]);

    await service.from("community_settings").update({ email_essentials_only: true, email_essential_kinds: ["moderation_outcome"] }).eq("id", true);
    const off = await issue([{ email: fresh("off"), code_hash: makeCode().hash, code: makeCode().code }], true);
    expect(off.error?.message).toMatch(/INVITE_EMAIL_OFF/);
    await service.from("community_settings").update({ email_essentials_only: originalSettings.email_essentials_only, email_essential_kinds: originalSettings.email_essential_kinds }).eq("id", true);
  });
});

describe("signing up with an invite", () => {
  it("a hashed code works once, only for its address in any case, and is single use", async () => {
    const email = fresh("signup");
    const { code, hash } = makeCode();
    await issue([{ email, code_hash: hash }], false);
    expect((await service.rpc("invite_check", { p_code: code.toLowerCase(), p_email: fresh("other") })).data).toBe("email_mismatch");
    expect((await signUp(code, fresh("other2"))).error).not.toBeNull();
    const right = await signUp(code.toLowerCase(), email.toUpperCase());
    expect(right.error).toBeNull();
    const invite = (await service.from("invites").select("id, use_count").eq("code_hash", hash).single()).data!;
    expect(invite.use_count).toBe(1);
    // A used code is refused, even for the same address.
    expect((await service.rpc("invite_check", { p_code: code, p_email: email })).data).toBe("invalid");
    expect((await signUp(code, email)).error).not.toBeNull();
  });

  it("an old plaintext invite still works exactly as before", async () => {
    const invite = await createInvite();
    const email = fresh("legacy");
    expect((await service.rpc("invite_check", { p_code: invite.code, p_email: email })).data).toBe("ok");
    expect((await signUp(invite.code, email)).error).toBeNull();
    await service.from("invites").delete().eq("id", invite.id);
  });

  it("an expired invite is refused from the second it expires", async () => {
    const email = fresh("expiry");
    const { code, hash } = makeCode();
    await issue([{ email, code_hash: hash }], false);
    expect((await service.rpc("invite_check", { p_code: code, p_email: email })).data).toBe("ok");
    await service.from("invites").update({ expires_at: new Date(Date.now() + 5_000).toISOString() }).eq("code_hash", hash);
    expect((await service.rpc("invite_check", { p_code: code, p_email: email })).data).toBe("ok");
    await service.from("invites").update({ expires_at: new Date(Date.now() - 1_000).toISOString() }).eq("code_hash", hash);
    expect((await service.rpc("invite_check", { p_code: code, p_email: email })).data).toBe("invalid");
    expect((await signUp(code, email)).error).not.toBeNull();
  });

  it("the code is not stored: asking for the hash string as if it were a code finds nothing", async () => {
    const email = fresh("hashprobe");
    const { hash } = makeCode();
    await issue([{ email, code_hash: hash }], false);
    expect((await service.rpc("invite_check", { p_code: hash, p_email: email })).data).toBe("invalid");
  });
});

describe("revoke and re-issue", () => {
  it("revoking stops the link working, drops an email still waiting and clears its code, and a used invite cannot be revoked", async () => {
    const email = fresh("revoke");
    const { code, hash } = makeCode();
    const r = await issue([{ email, code_hash: hash, code }], true);
    const inviteId = r.data!.results[0].invite_id!;
    expect((await admin.client.rpc("revoke_invite", { p_invite_id: inviteId })).error).toBeNull();
    expect((await service.rpc("invite_check", { p_code: code, p_email: email })).data).toBe("invalid");
    expect((await signUp(code, email)).error).not.toBeNull();
    expect((await service.from("join_requests").select("status").eq("email", email).single()).data).toEqual({ status: "revoked" });
    const row = (await outboxFor(email))[0];
    expect(row).toMatchObject({ status: "skipped", last_error: "invite revoked", payload: {} });
    // Revoking again is harmless.
    expect((await admin.client.rpc("revoke_invite", { p_invite_id: inviteId })).error).toBeNull();

    const used = makeCode();
    const usedEmail = fresh("used");
    const u = await issue([{ email: usedEmail, code_hash: used.hash }], false);
    expect((await signUp(used.code, usedEmail)).error).toBeNull();
    expect((await admin.client.rpc("revoke_invite", { p_invite_id: u.data!.results[0].invite_id! })).error?.message).toMatch(/ALREADY_USED/);
  });

  it("re-issuing revokes the old invite, makes a new one for the same address and is safe to repeat", async () => {
    const email = fresh("reissue");
    const old = makeCode();
    const first = await issue([{ email, code_hash: old.hash }], false);
    const oldId = first.data!.results[0].invite_id!;
    const fresh2 = makeCode();
    const key = randomUUID();
    const re = await admin.client.rpc("reissue_invite", { p_invite_id: oldId, p_code_hash: fresh2.hash, p_code: fresh2.code, p_send_email: true, p_key: key });
    expect(re.error).toBeNull();
    expect(re.data.duplicate).toBe(false);
    inviteIds.push(re.data.invite_id);
    expect((await service.rpc("invite_check", { p_code: old.code, p_email: email })).data).toBe("invalid");
    expect((await service.rpc("invite_check", { p_code: fresh2.code, p_email: email })).data).toBe("ok");
    expect((await service.from("invites").select("revoked_at").eq("id", oldId).single()).data!.revoked_at).not.toBeNull();
    const queued = await outboxFor(email);
    expect(queued.filter((q) => q.status === "queued")).toHaveLength(1);
    expect((await admin.client.rpc("reissue_invite", { p_invite_id: oldId, p_code_hash: makeCode().hash, p_code: null, p_send_email: false, p_key: key })).data).toEqual({ duplicate: true });
    // An invite that was never bound to an address cannot be re-issued this way.
    const legacy = await createInvite();
    expect((await admin.client.rpc("reissue_invite", { p_invite_id: legacy.id, p_code_hash: makeCode().hash, p_code: null, p_send_email: false, p_key: randomUUID() })).error?.message).toMatch(/NOT_FOUND/);
    await service.from("invites").delete().eq("id", legacy.id);
  });

  it("rejecting records the decision, sends nothing and makes no invite", async () => {
    const email = fresh("reject");
    const req = (await addRequest(email))!;
    expect((await admin.client.rpc("reject_join_requests", { p_ids: [req.id] })).data).toBe(1);
    expect((await admin.client.rpc("reject_join_requests", { p_ids: [req.id] })).data).toBe(0);
    expect(await outboxFor(email)).toEqual([]);
    expect((await service.from("invites").select("id").eq("invited_email", email)).data).toEqual([]);
  });
});

describe("the email budget", () => {
  it("shows the numbers, and holds invites over today's room for later days instead of dropping them", async () => {
    await service.from("community_settings").update({ invite_daily_email_limit: 2, email_global_daily_cap: 60, resend_daily_limit: 100000 }).eq("id", true);
    const budget = (await admin.client.rpc("invite_email_budget")).data;
    expect(budget).toMatchObject({ invite_limit: 2, expiry_days: 7 });
    expect(budget.room_today).toBeGreaterThanOrEqual(0);
    expect(budget.room_today).toBeLessThanOrEqual(2);

    const people = Array.from({ length: 5 }, () => ({ email: fresh("budget"), ...makeCode() }));
    const r = await issue(people.map((p) => ({ email: p.email, code_hash: p.hash, code: p.code })), true);
    expect(r.error).toBeNull();
    const times = r.data!.results.map((x) => Date.parse(x.send_after!));
    const now = Date.now();
    const today = times.filter((t) => t <= now + 60_000).length;
    expect(today).toBe(budget.room_today > 5 ? 5 : Math.min(5, budget.room_today));
    // Later days come in order, five past midnight UK time, and no later than 2 per day.
    const later = times.filter((t) => t > now + 60_000);
    expect([...later].sort((a, b) => a - b)).toEqual(later);
    const perDay = new Map<string, number>();
    for (const t of later) perDay.set(new Date(t).toISOString().slice(0, 10), (perDay.get(new Date(t).toISOString().slice(0, 10)) ?? 0) + 1);
    for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(2);
    // The invite lasts 7 days from when it is sent, not from when it was approved.
    for (const x of r.data!.results) expect(Date.parse(x.expires_at!) - Date.parse(x.send_after!)).toBe(7 * 86_400_000);
    // Each is a queued row with that send time: nothing was dropped.
    for (const p of people) expect((await outboxFor(p.email))[0]).toMatchObject({ status: "queued", kind: "invite" });
  });

  it("an invite row must be for an address and a member row for a member", async () => {
    const bad1 = await service.from("email_outbox").insert({ kind: "invite", user_id: member.id, payload: {}, dedupe_key: randomUUID() });
    expect(bad1.error).not.toBeNull();
    const bad2 = await service.from("email_outbox").insert({ kind: "reply", user_id: null, to_email: "a@example.test", payload: {}, dedupe_key: randomUUID() });
    expect(bad2.error).not.toBeNull();
    const bad3 = await service.from("email_outbox").insert({ kind: "invite", user_id: null, to_email: "Upper@Example.test", payload: {}, dedupe_key: randomUUID() });
    expect(bad3.error).not.toBeNull();
  });
});

describe("housekeeping", () => {
  it("expires old pending requests and deletes decided ones 30 days after the decision, keeping recent ones", async () => {
    const old = fresh("oldpending");
    const rejectedOld = fresh("rejold");
    const rejectedNew = fresh("rejnew");
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const ins = await service.from("join_requests").insert([
      { email: old, status: "pending", created_at: ago(31), decided_at: null },
      { email: rejectedOld, status: "rejected", created_at: ago(40), decided_at: ago(31) },
      { email: rejectedNew, status: "rejected", created_at: ago(10), decided_at: ago(5) },
    ]);
    expect(ins.error).toBeNull();
    // Only the service role (the scheduler) can run it: the browser roles were refused above.
    expect((await service.rpc("purge_join_requests")).error).toBeNull();
    const rows = (await service.from("join_requests").select("email, status").in("email", [old, rejectedOld, rejectedNew])).data!;
    expect(rows.find((r) => r.email === old)?.status).toBe("expired"); // deleted 30 days after this
    expect(rows.find((r) => r.email === rejectedOld)).toBeUndefined();
    expect(rows.find((r) => r.email === rejectedNew)?.status).toBe("rejected");
  });

  it("marks an approved request whose invite was used as joined", async () => {
    const email = fresh("joined");
    const { code, hash } = makeCode();
    await issue([{ email, code_hash: hash }], false);
    expect((await signUp(code, email)).error).toBeNull();
    await service.rpc("purge_join_requests");
    expect((await service.from("join_requests").select("status").eq("email", email).single()).data).toEqual({ status: "joined" });
  });
});
