import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

let author: TestUser;
let reader: TestUser;
let admin: TestUser;
let noHandle: TestUser;
let openId: string;
let draftId: string;
let closedId: string;
const campaignIds: string[] = [];

beforeAll(async () => {
  [author, reader, admin, noHandle] = await Promise.all([
    createUser(),
    createUser(),
    createUser({ admin: true }),
    createUser({ handle: null }),
  ]);
  openId = await createCampaign();
  draftId = await createCampaign({ status: "draft" });
  const past = Date.now() - 7_200_000;
  closedId = await createCampaign({
    status: "closed",
    starts_at: new Date(past).toISOString(),
    ends_at: new Date(past + 3_600_000).toISOString(),
  });
  campaignIds.push(openId, draftId, closedId);
});

afterAll(async () => {
  await deleteUsers([author, reader, admin, noHandle]); // cascades their Dispatches and awards
  await service.from("dispatches").delete().in("campaign_id", campaignIds);
  await service.from("awards").delete().in("campaign_id", campaignIds);
  await service.from("campaigns").delete().in("id", campaignIds);
});

const dispatch = (campaignId: string, authorId: string, extra: Record<string, unknown> = {}) => ({
  campaign_id: campaignId,
  author_id: authorId,
  kind: "argument",
  body: "A considered argument.",
  ai_use: "none",
  ...extra,
});

describe("campaigns", () => {
  it("hide drafts from everyone but admins", async () => {
    for (const client of [anonClient(), reader.client]) {
      const { data } = await client.from("campaigns").select("id").eq("id", draftId);
      expect(data ?? []).toHaveLength(0);
      const { data: open } = await client.from("campaigns").select("id").eq("id", openId);
      expect(open).toHaveLength(1);
    }
    const { data } = await admin.client.from("campaigns").select("id").eq("id", draftId);
    expect(data).toHaveLength(1);
  });

  it("keep admin notes, hidden facts and owner decisions private to admins", async () => {
    await service.from("campaigns").update({ notes: "Admin only.", needs_owner_decision: null }).eq("id", openId);
    for (const client of [anonClient(), reader.client, admin.client]) {
      for (const column of ["notes", "brief", "needs_owner_decision", "created_by"]) {
        const { error } = await client.from("campaigns").select(column).eq("id", openId);
        expect(error, column).not.toBeNull();
      }
    }
    expect((await reader.client.rpc("campaign_admin_fields", { p_ids: [openId] })).error).not.toBeNull();
    const { data } = await admin.client.rpc("campaign_admin_fields", { p_ids: [openId] });
    expect(data![0].notes).toBe("Admin only.");
  });

  it("can be created and edited only by admins", async () => {
    const row = {
      slug: `rls-user-${Date.now()}`,
      title: "Not allowed",
      category: "energy",
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 1000).toISOString(),
    };
    const { error } = await reader.client.from("campaigns").insert(row);
    expect(error).not.toBeNull();

    await reader.client.from("campaigns").update({ title: "Hijacked title" }).eq("id", openId);
    const { data } = await service.from("campaigns").select("title").eq("id", openId).single();
    expect(data!.title).not.toBe("Hijacked title");

    const { data: created, error: adminError } = await admin.client
      .from("campaigns")
      .insert({ ...row, slug: `rls-admin-${Date.now()}`, title: "Admin Campaign" })
      .select("id")
      .single();
    expect(adminError).toBeNull();
    campaignIds.push(created!.id);
  });
});

// Dispatch rules (posting through post_dispatch(), edits, withdraw, hide,
// reactions, follows, reports and search) are tested in dispatches.test.ts.
describe("dispatches", () => {
  it("cannot be inserted, updated or deleted directly from the browser", async () => {
    const { error } = await author.client.from("dispatches").insert(dispatch(openId, author.id));
    expect(error).not.toBeNull();

    const { data: posted } = await service
      .from("dispatches")
      .insert({ ...dispatch(openId, author.id), moderation_status: "visible" })
      .select("id")
      .single();
    await author.client.from("dispatches").update({ body: "Edited directly." }).eq("id", posted!.id);
    await author.client.from("dispatches").delete().eq("id", posted!.id);
    const { data } = await service.from("dispatches").select("body").eq("id", posted!.id);
    expect(data).toEqual([{ body: "A considered argument." }]);
  });

  it("stay hidden from others until moderation makes them visible", async () => {
    const { data: mine } = await service.from("dispatches").insert(dispatch(openId, author.id)).select("id, moderation_status").single();
    expect(mine!.moderation_status).toBe("pending");
    const { data: own } = await author.client.from("dispatches").select("id").eq("id", mine!.id);
    expect(own).toHaveLength(1);
    const { data: before } = await reader.client.from("dispatches").select("id").eq("id", mine!.id);
    expect(before ?? []).toHaveLength(0);

    await service.from("dispatches").update({ moderation_status: "visible" }).eq("id", mine!.id);
    const { data: after } = await anonClient().from("dispatches").select("id").eq("id", mine!.id);
    expect(after).toHaveLength(1);
  });
});

describe("awards", () => {
  it("are public to read but only admins can grant them", async () => {
    const award = { campaign_id: closedId, profile_id: author.id, category: "best_rebuttal", rationale: "Clear and fair." };
    const { error: selfAward } = await author.client.from("awards").insert(award);
    expect(selfAward).not.toBeNull();

    const { error: adminError } = await admin.client.from("awards").insert(award);
    expect(adminError).toBeNull();

    const { data } = await anonClient().from("awards").select("id").eq("campaign_id", closedId);
    expect(data).toHaveLength(1);
  });
});
