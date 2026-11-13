import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { anonClient, createInvite, createUser, deleteUsers, service, type TestUser } from "./helpers";

const users: TestUser[] = [];
const extraIds: string[] = [];
afterAll(async () => {
  await deleteUsers(users);
  for (const id of extraIds) await service.auth.admin.deleteUser(id);
});

function signUpWith(meta: Record<string, unknown>) {
  return anonClient().auth.signUp({
    email: `consent-${randomUUID()}@example.test`,
    password: "consent-test-password-1",
    options: { data: meta },
  });
}

describe("sign-up consents (database trigger)", () => {
  it("refuses an account without the public-record acknowledgement", async () => {
    const invite = await createInvite();
    const { error } = await signUpWith({ invite_code: invite.code, age_confirmed: true, terms_accepted: true });
    expect(error).not.toBeNull();
    const { data } = await service.rpc("invite_is_usable", { p_code: invite.code });
    expect(data).toBe(true);
  });

  it("refuses when any one of the three consents is false", async () => {
    const invite = await createInvite({ max_uses: 3 });
    const all = { invite_code: invite.code, age_confirmed: true, public_acknowledged: true, terms_accepted: true };
    for (const key of ["age_confirmed", "public_acknowledged", "terms_accepted"]) {
      const { error } = await signUpWith({ ...all, [key]: false });
      expect(error, key).not.toBeNull();
    }
  });

  it("stores the versions and the acknowledgement time on the profile", async () => {
    const invite = await createInvite();
    const { data, error } = await signUpWith({
      invite_code: invite.code,
      age_confirmed: true,
      public_acknowledged: true,
      terms_accepted: true,
      terms_version: "2026-11-a",
      privacy_version: "2026-11-b",
    });
    expect(error).toBeNull();
    extraIds.push(data.user!.id);
    const { data: profile } = await service
      .from("profiles")
      .select("terms_version, privacy_version, public_acknowledged_at")
      .eq("id", data.user!.id)
      .single();
    expect(profile!.terms_version).toBe("2026-11-a");
    expect(profile!.privacy_version).toBe("2026-11-b");
    expect(profile!.public_acknowledged_at).not.toBeNull();
  });

  it("keeps the consent columns out of the browser: nobody can read or write them, not even their owner", async () => {
    const alice = await createUser();
    const bob = await createUser();
    users.push(alice, bob);
    for (const column of ["terms_version", "privacy_version", "public_acknowledged_at"]) {
      expect((await alice.client.from("profiles").select(column).eq("id", alice.id)).error, `read ${column}`).not.toBeNull();
      expect((await alice.client.from("profiles").select(column).eq("id", bob.id)).error, `read other ${column}`).not.toBeNull();
    }
    expect((await alice.client.from("profiles").update({ terms_version: "x" }).eq("id", alice.id)).error).not.toBeNull();
    expect((await alice.client.from("profiles").update({ terms_version: "x" }).eq("id", bob.id)).error).not.toBeNull();
  });
});
