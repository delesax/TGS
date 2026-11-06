import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Migration 20261104000400: once deleted_at is set it can never be cleared, by any role.
// LOCAL Supabase only.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const users: TestUser[] = [];
let campaignId: string;

async function tombstone(): Promise<TestUser> {
  const user = await createUser({ handle: null });
  users.push(user);
  expect((await service.rpc("anonymise_profile", { p_user_id: user.id, p_via: "test" })).error).toBeNull();
  return user;
}

beforeAll(async () => {
  campaignId = await createCampaign({ title: "Tombstone hardening test" });
});

afterAll(async () => {
  await sql.end();
  await deleteUsers(users);
  await service.from("community_settings").update({ cooldown_seconds: 30 }).eq("id", true);
  await service.from("campaigns").delete().eq("id", campaignId);
});

describe("deleted_at can never be cleared", () => {
  it("is refused for the service role", async () => {
    const gone = await tombstone();
    const { error } = await service.from("profiles").update({ deleted_at: null }).eq("id", gone.id);
    expect(error?.message).toMatch(/^ACCOUNT_DELETED/);
    expect((await service.from("profiles").select("deleted_at").eq("id", gone.id).single()).data!.deleted_at).not.toBeNull();
  });

  it("is refused even when a handle is set in the same statement", async () => {
    const gone = await tombstone();
    const { error } = await service.from("profiles").update({ deleted_at: null, handle: "Back_From_Dead" }).eq("id", gone.id);
    expect(error?.message).toMatch(/^ACCOUNT_DELETED/);
    expect((await service.from("profiles").select("handle, deleted_at").eq("id", gone.id).single()).data).toMatchObject({ handle: null });
  });

  it("is refused for the database owner too (direct SQL, not just the API)", async () => {
    const gone = await tombstone();
    await expect(sql`update public.profiles set deleted_at = null where id = ${gone.id}`).rejects.toThrow(/ACCOUNT_DELETED/);
    await expect(sql`update public.profiles set deleted_at = null, handle = 'Back_Again' where id = ${gone.id}`).rejects.toThrow(/ACCOUNT_DELETED/);
    const [row] = await sql`select deleted_at, handle from public.profiles where id = ${gone.id}`;
    expect(row.deleted_at).not.toBeNull();
    expect(row.handle).toBeNull();
  });

  it("cannot be done by a signed-in Strategist at all", async () => {
    const gone = await tombstone();
    const live = await createUser();
    users.push(live);
    // Browsers have no update right on this column, and no row of someone else.
    expect((await live.client.from("profiles").update({ deleted_at: null }).eq("id", gone.id).select()).data ?? []).toEqual([]);
    expect((await live.client.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", live.id)).error).not.toBeNull();
  });

  it("still allows a profile to be deleted once, and the same value to stay", async () => {
    const live = await createUser({ handle: null });
    users.push(live);
    const first = await service.rpc("anonymise_profile", { p_user_id: live.id, p_via: "test" });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ found: true });
    // A second deletion changes nothing and does not error.
    expect((await service.rpc("anonymise_profile", { p_user_id: live.id, p_via: "test" })).data).toMatchObject({ already_deleted: true });
    // Other columns of a tombstone can still be touched by the server (the trigger is only about handle and deleted_at).
    expect((await service.from("profiles").update({ posting_muted_reason: null }).eq("id", live.id)).error).toBeNull();
  });
});

describe("account deletion still works end to end", () => {
  it("deleting the sign-in anonymises the profile and keeps it when Dispatches depend on it", async () => {
    const author = await createUser();
    users.push(author);
    await service.from("community_settings").update({ cooldown_seconds: 0 }).eq("id", true);
    await author.client.from("campaign_positions").insert({ campaign_id: campaignId, user_id: author.id, after_position: "for" });
    const { data: id, error } = await author.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: "Outlives its author.", p_ai_use: "none" });
    expect(error).toBeNull();
    await applyScreening(id as string);

    expect((await service.auth.admin.deleteUser(author.id)).error).toBeNull();
    const { data: profile } = await service.from("profiles").select("handle, deleted_at").eq("id", author.id).single();
    expect(profile!.deleted_at).not.toBeNull();
    expect(profile!.handle).toBeNull();
    expect((await service.from("dispatches").select("body").eq("id", id as string).single()).data).toEqual({ body: "Outlives its author." });
    // And the tombstone is still locked.
    expect((await service.from("profiles").update({ deleted_at: null }).eq("id", author.id)).error?.message).toMatch(/^ACCOUNT_DELETED/);
  });

  it("deleting the sign-in of an account with nothing depending on it removes the profile row", async () => {
    const lurker = await createUser();
    await service.auth.admin.deleteUser(lurker.id);
    expect((await service.from("profiles").select("id").eq("id", lurker.id)).data).toEqual([]);
  });
});
