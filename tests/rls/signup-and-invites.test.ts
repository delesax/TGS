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
    const { data, error } = await signUpWith({ age_confirmed: true, terms_accepted: true });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it("rejects an unknown invite code", async () => {
    const { error } = await signUpWith({ invite_code: "TGS-NOPE-NOPE-NOPE", age_confirmed: true, terms_accepted: true });
    expect(error).not.toBeNull();
  });

  it("rejects revoked and expired invites", async () => {
    const revoked = await createInvite({ revoked_at: new Date().toISOString() });
    const expired = await createInvite({ expires_at: new Date(Date.now() - 1000).toISOString() });
    for (const code of [revoked.code, expired.code]) {
      const { error } = await signUpWith({ invite_code: code, age_confirmed: true, terms_accepted: true });
      expect(error).not.toBeNull();
    }
  });

  it("rejects sign-up without age and terms confirmation", async () => {
    const invite = await createInvite();
    const { error } = await signUpWith({ invite_code: invite.code });
    expect(error).not.toBeNull();
  });

  it("accepts a valid invite once, creates a profile without a handle, and then refuses reuse", async () => {
    const invite = await createInvite({ max_uses: 1 });
    const first = await signUpWith({ invite_code: invite.code.toLowerCase(), age_confirmed: true, terms_accepted: true });
    expect(first.error).toBeNull();
    expect(first.data.user).not.toBeNull();
    extraUserIds.push(first.data.user!.id);

    const { data: profile } = await service.from("profiles").select("handle, invite_id").eq("id", first.data.user!.id).single();
    expect(profile).toEqual({ handle: null, invite_id: invite.id });

    const { data: used } = await service.from("invites").select("use_count").eq("id", invite.id).single();
    expect(used!.use_count).toBe(1);

    const second = await signUpWith({ invite_code: invite.code, age_confirmed: true, terms_accepted: true });
    expect(second.error).not.toBeNull();
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
