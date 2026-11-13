import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { anonClient, createInvite, createUser, deleteUsers, service, type TestUser } from "./helpers";

const users: TestUser[] = [];
const extraUserIds: string[] = [];
afterAll(async () => {
  await deleteUsers(users);
  for (const id of extraUserIds) await service.auth.admin.deleteUser(id);
});

function signUpWith(meta: Record<string, unknown>) {
  return anonClient().auth.signUp({
    email: `signup-${randomUUID()}@example.test`,
    password: "signup-test-password-1",
    options: { data: meta },
  });
}

describe("invite-only sign-up (enforced by the database trigger)", () => {
  it("rejects sign-up with no invite code, even straight through the Auth API", async () => {
    const { data, error } = await signUpWith({ age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("rejects an unknown invite code", async () => {
    const { error } = await signUpWith({ invite_code: "TGS-NOPE-NOPE-NOPE", age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" });
    expect(error).not.toBeNull();
  });

  it("rejects revoked and expired invites", async () => {
    const revoked = await createInvite({ revoked_at: new Date().toISOString() });
    const expired = await createInvite({ expires_at: new Date(Date.now() - 1000).toISOString() });
    for (const code of [revoked.code, expired.code]) {
      const { error } = await signUpWith({ invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" });
      expect(error).not.toBeNull();
    }
  });

  it("rejects sign-up without age and terms confirmation", async () => {
    const invite = await createInvite();
    const { error } = await signUpWith({ invite_code: invite.code });
    expect(error).not.toBeNull();
  });

  it("reserves the invite at sign-up and uses it up only when the email is confirmed", async () => {
    const invite = await createInvite({ max_uses: 1 });
    const first = await signUpWith({ invite_code: invite.code.toLowerCase(), age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" });
    expect(first.error).toBeNull();
    expect(first.data.user).not.toBeNull();
    const firstId = first.data.user!.id;
    extraUserIds.push(firstId);

    const { data: profile } = await service.from("profiles").select("handle, invite_id, invite_consumed_at").eq("id", firstId).single();
    expect(profile).toEqual({ handle: null, invite_id: invite.id, invite_consumed_at: null });

    // Not used up yet, but the place is held: a second person cannot take it.
    const { data: reserved } = await service.from("invites").select("use_count").eq("id", invite.id).single();
    expect(reserved!.use_count).toBe(0);
    const second = await signUpWith({ invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" });
    expect(second.error).not.toBeNull();

    // Confirming the email uses it up and records it.
    const { error: confirmError } = await service.auth.admin.updateUserById(firstId, { email_confirm: true });
    expect(confirmError).toBeNull();
    const { data: used } = await service.from("invites").select("use_count").eq("id", invite.id).single();
    expect(used!.use_count).toBe(1);
    const { data: consumed } = await service.from("profiles").select("invite_consumed_at").eq("id", firstId).single();
    expect(consumed!.invite_consumed_at).not.toBeNull();
    const { data: log } = await service.from("audit_log").select("action").eq("target_id", invite.id);
    expect(log!.map((l) => l.action)).toContain("invite.consumed");

    const third = await signUpWith({ invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" });
    expect(third.error).not.toBeNull();
  });

  it("releases an invite held by a sign-up that was never confirmed within 24 hours", async () => {
    const invite = await createInvite({ max_uses: 1 });
    const stale = await signUpWith({ invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" });
    expect(stale.error).toBeNull();
    extraUserIds.push(stale.data.user!.id);

    // Age the reservation past 24 hours.
    await service.from("profiles").update({ created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }).eq("id", stale.data.user!.id);
    const { data: usable } = await service.rpc("invite_is_usable", { p_code: invite.code });
    expect(usable).toBe(true);

    const fresh = await signUpWith({ invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" });
    expect(fresh.error).toBeNull();
    extraUserIds.push(fresh.data.user!.id);
    expect((await service.auth.admin.updateUserById(fresh.data.user!.id, { email_confirm: true })).error).toBeNull();

    // The late confirmation is refused: the invite filled up in the meantime.
    const late = await service.auth.admin.updateUserById(stale.data.user!.id, { email_confirm: true });
    expect(late.error).not.toBeNull();
    const { data: used } = await service.from("invites").select("use_count").eq("id", invite.id).single();
    expect(used!.use_count).toBe(1);
  });

  it("uses the invite straight away for an account created already confirmed", async () => {
    const user = await createUser();
    users.push(user);
    const { data } = await service.from("profiles").select("invite_id, invite_consumed_at").eq("id", user.id).single();
    expect(data!.invite_consumed_at).not.toBeNull();
    const { data: invite } = await service.from("invites").select("use_count").eq("id", data!.invite_id).single();
    expect(invite!.use_count).toBe(1);
  });

  it("does not let browsers check invites directly", async () => {
    const { error } = await anonClient().rpc("invite_is_usable", { p_code: "LOCAL-DEV-INVITE" });
    expect(error).not.toBeNull();
  });
});

describe("invites table", () => {
  it("is invisible to anonymous visitors and ordinary Strategists", async () => {
    const invite = await createInvite();
    const user = await createUser();
    users.push(user);

    for (const client of [anonClient(), user.client]) {
      const { data } = await client.from("invites").select("code").eq("id", invite.id);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("cannot be written by ordinary Strategists", async () => {
    const user = await createUser();
    users.push(user);
    const { error } = await user.client.from("invites").insert({ code: "TGS-HACK-HACK-HACK", max_uses: 500 });
    expect(error).not.toBeNull();
  });

  it("does not trust a role in user_metadata (which users can edit themselves)", async () => {
    const user = await createUser();
    users.push(user);
    await user.client.auth.updateUser({ data: { role: "admin" } });
    await user.client.auth.refreshSession();
    const { data } = await user.client.from("invites").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });

  it("can be read and created by an admin (role in app_metadata)", async () => {
    const admin = await createUser({ admin: true });
    users.push(admin);
    const invite = await createInvite();
    const { data } = await admin.client.from("invites").select("code").eq("id", invite.id);
    expect(data).toHaveLength(1);

    const code = `ADMIN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error } = await admin.client.from("invites").insert({ code, max_uses: 2 });
    expect(error).toBeNull();
  });
});
