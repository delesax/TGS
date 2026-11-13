import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { anonClient, service } from "./helpers";

// Sprint 7 (migration 20261113000500): an invite may be bound to one email address. LOCAL Supabase only.

const created: string[] = [];
const invites: string[] = [];

async function makeInvite(extra: Record<string, unknown> = {}) {
  const code = `TGS-BND-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await service.from("invites").insert({ code, max_uses: 1, note: "playwright bound", ...extra }).select("id, code").single();
  if (error) throw error;
  invites.push(data.id);
  return data as { id: string; code: string };
}

async function signUp(code: string, email: string) {
  const r = await service.auth.admin.createUser({
    email, password: "rls-test-password-123", email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
  });
  if (r.data?.user) created.push(r.data.user.id);
  return r;
}

const useCount = async (id: string) => (await service.from("invites").select("use_count").eq("id", id).single()).data!.use_count as number;
const fresh = (label: string) => `${label}-${randomUUID().slice(0, 8)}@example.test`;

afterAll(async () => {
  await service.from("community_settings").update({ signups_paused: false }).eq("id", true);
  for (const id of created) await service.auth.admin.deleteUser(id);
  if (invites.length) await service.from("invites").delete().in("id", invites);
});

describe("an invite bound to an email address", () => {
  it("accepts only that address (compared in lower case) and uses the invite exactly once", async () => {
    const wanted = fresh("bound");
    const invite = await makeInvite({ invited_email: wanted });
    const wrong = await signUp(invite.code, fresh("someone-else"));
    expect(wrong.error).not.toBeNull();
    expect(await useCount(invite.id)).toBe(0);
    const right = await signUp(invite.code, wanted.toUpperCase());
    expect(right.error).toBeNull();
    expect(await useCount(invite.id)).toBe(1);
    // Single use: a second sign-up with the right address is refused.
    expect((await signUp(invite.code, wanted)).error).not.toBeNull();
    expect(await useCount(invite.id)).toBe(1);
  });

  it("is refused by the database with INVITE_EMAIL_MISMATCH (the sign-up form shows it clearly)", async () => {
    const invite = await makeInvite({ invited_email: fresh("only") });
    const { data, error } = await service.rpc("invite_check", { p_code: invite.code, p_email: fresh("other") });
    expect(error).toBeNull();
    expect(data).toBe("email_mismatch");
  });

  it("stores the address in lower case only", async () => {
    const bad = await service.from("invites").insert({ code: `TGS-BND-${randomUUID().slice(0, 8).toUpperCase()}`, max_uses: 1, invited_email: "Mixed@Case.test" });
    expect(bad.error).not.toBeNull();
  });

  it("refuses an address with surrounding spaces, so a stored value always matches exactly", async () => {
    for (const bad of [" padded@example.test", "padded@example.test ", " padded@example.test "]) {
      const r = await service.from("invites").insert({ code: `TGS-BND-${randomUUID().slice(0, 8).toUpperCase()}`, max_uses: 1, invited_email: bad });
      expect(r.error, JSON.stringify(bad)).not.toBeNull();
    }
  });

  it("does not bypass the sign-up kill switch", async () => {
    const wanted = fresh("paused");
    const invite = await makeInvite({ invited_email: wanted });
    await service.from("community_settings").update({ signups_paused: true }).eq("id", true);
    expect((await signUp(invite.code, wanted)).error).not.toBeNull();
    expect(await useCount(invite.id)).toBe(0);
    await service.from("community_settings").update({ signups_paused: false }).eq("id", true);
    expect((await signUp(invite.code, wanted)).error).toBeNull();
  });
});

describe("an invite with no bound address behaves as before", () => {
  it("works for any address, counts uses exactly, and stops at max_uses", async () => {
    const invite = await makeInvite({ max_uses: 2 });
    expect((await signUp(invite.code, fresh("a"))).error).toBeNull();
    expect((await signUp(invite.code, fresh("b"))).error).toBeNull();
    expect(await useCount(invite.id)).toBe(2);
    expect((await signUp(invite.code, fresh("c"))).error).not.toBeNull();
    expect(await useCount(invite.id)).toBe(2);
  });

  it("invite_check says ok for any address, invalid for revoked, expired or unknown codes; invite_is_usable is unchanged", async () => {
    const open = await makeInvite();
    expect((await service.rpc("invite_check", { p_code: open.code, p_email: fresh("x") })).data).toBe("ok");
    expect((await service.rpc("invite_check", { p_code: "TGS-NOPE-NOPE-NOPE", p_email: fresh("x") })).data).toBe("invalid");
    const revoked = await makeInvite({ revoked_at: new Date().toISOString() });
    expect((await service.rpc("invite_check", { p_code: revoked.code, p_email: fresh("x") })).data).toBe("invalid");
    const expired = await makeInvite({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await service.rpc("invite_check", { p_code: expired.code, p_email: fresh("x") })).data).toBe("invalid");
    const bound = await makeInvite({ invited_email: fresh("bound") });
    expect((await service.rpc("invite_is_usable", { p_code: bound.code })).data).toBe(true);
  });

  it("invite_check is for the server only", async () => {
    expect((await anonClient().rpc("invite_check", { p_code: "x", p_email: "y" })).error).not.toBeNull();
  });
});
