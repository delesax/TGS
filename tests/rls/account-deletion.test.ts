import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createUser, deleteUsers, purgeUsers, service, type TestUser } from "./helpers";

// Sprint 4: deleting an account anonymises it and never touches Dispatches.

let author: TestUser;
let friend: TestUser;
let openId: string;
let closedId: string;
const hour = 3_600_000;

beforeAll(async () => {
  [author, friend] = await Promise.all([createUser(), createUser()]);
  const now = Date.now();
  openId = await createCampaign({ title: "Deletion test Campaign" });
  // Created open so positions can be recorded, then closed below.
  closedId = await createCampaign({ title: "Closed deletion test", starts_at: new Date(now - 2 * hour).toISOString(), ends_at: new Date(now + hour).toISOString() });
  await service.from("community_settings").update({ cooldown_seconds: 0 }).eq("id", true);
});

afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30 }).eq("id", true);
  await deleteUsers([friend]);
  await service.from("dispatches").delete().eq("author_id", author.id);
  await service.from("profiles").delete().eq("id", author.id);
  await service.from("campaigns").delete().in("id", [openId, closedId]);
});

describe("deleting an account", () => {
  it("can only be started by the service role", async () => {
    for (const client of [anonClient(), author.client, friend.client]) {
      expect((await client.rpc("anonymise_profile", { p_user_id: author.id, p_via: "test" })).error).not.toBeNull();
    }
  });

  it("anonymises the profile and keeps every Dispatch, even when deleted from the dashboard", async () => {
    for (const c of [openId, closedId]) await author.client.from("campaign_positions").insert({ campaign_id: c, user_id: author.id, after_position: "for" });
    await friend.client.from("campaign_positions").insert({ campaign_id: openId, user_id: friend.id, after_position: "against" });
    const { data: id } = await author.client.rpc("post_dispatch", { p_campaign_id: openId, p_kind: "argument", p_body: "An argument that outlives its author.", p_ai_use: "none" });
    await applyScreening(id as string);
    await friend.client.rpc("toggle_reaction", { p_dispatch_id: id, p_reaction: "persuasive" });
    await friend.client.from("strategist_follows").insert({ follower_id: friend.id, followed_id: author.id });
    await service.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", closedId);

    // As if an admin deleted the user in the Supabase dashboard.
    const { error } = await service.auth.admin.deleteUser(author.id);
    expect(error).toBeNull();

    const { data: dispatch } = await anonClient().from("dispatches").select("id, body, author:profiles!dispatches_author_id_fkey(handle, deleted_at)").eq("id", id).single();
    expect(dispatch!.body).toBe("An argument that outlives its author.");
    expect(dispatch!.author).toMatchObject({ handle: null });
    expect((dispatch!.author as unknown as { deleted_at: string }).deleted_at).not.toBeNull();

    const { data: profile } = await service.from("profiles").select("handle, display_name, bio, expertise_tag, deleted_at").eq("id", author.id).single();
    expect(profile).toMatchObject({ handle: null, display_name: null, bio: null, expertise_tag: null });
    expect((await service.from("campaign_positions").select("campaign_id").eq("user_id", author.id)).data).toEqual([]);
    const { data: archived } = await service.from("anonymous_positions").select("campaign_id, after_position").eq("campaign_id", closedId);
    expect(archived).toEqual([{ campaign_id: closedId, after_position: "for" }]);
    expect((await service.from("strategist_follows").select("follower_id").eq("followed_id", author.id)).data).toEqual([]);
    expect((await service.from("notification_preferences").select("user_id").eq("user_id", author.id)).data).toEqual([]);
    // Others' reactions to the kept Dispatch stay; the deleted account's own would go.
    expect((await service.from("dispatch_reactions").select("user_id").eq("dispatch_id", id)).data).toEqual([{ user_id: friend.id }]);
    const { data: log } = await service.from("audit_log").select("action, details").eq("target_id", author.id).eq("action", "account.deleted").single();
    expect(log!.details).toMatchObject({ kept_dispatches: 1, archived_positions: 1, removed_positions: 1 });
  });

  it("never lets a profile deletion cascade into Dispatches", async () => {
    const { error } = await service.from("profiles").delete().eq("id", author.id);
    expect(error?.message).toMatch(/foreign key|violates/);
    expect((await service.from("dispatches").select("id").eq("author_id", author.id)).data).toHaveLength(1);
  });

  it("removes the profile entirely when nothing depends on it", async () => {
    const lurker = await createUser();
    await purgeUsers([lurker]);
    expect((await service.from("profiles").select("id").eq("id", lurker.id)).data).toEqual([]);
  });

  it("is switched off by default", async () => {
    const fresh = await service.from("community_settings").select("account_deletion_enabled").single();
    expect(fresh.data!.account_deletion_enabled).toBe(false);
  });
});
