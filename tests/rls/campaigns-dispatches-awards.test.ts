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

describe("dispatches", () => {
  it("can be posted by a Strategist as themselves while the Campaign is open, and start as pending", async () => {
    const { data, error } = await author.client.from("dispatches").insert(dispatch(openId, author.id)).select("id, moderation_status").single();
    expect(error).toBeNull();
    expect(data!.moderation_status).toBe("pending");
  });

  it("cannot be posted as someone else", async () => {
    const { error } = await reader.client.from("dispatches").insert(dispatch(openId, author.id));
    expect(error).not.toBeNull();
  });

  it("cannot be posted to a draft or closed Campaign (server time decides)", async () => {
    for (const id of [draftId, closedId]) {
      const { error } = await author.client.from("dispatches").insert(dispatch(id, author.id));
      expect(error).not.toBeNull();
    }
  });

  it("cannot be posted before choosing a handle", async () => {
    const { error } = await noHandle.client.from("dispatches").insert(dispatch(openId, noHandle.id));
    expect(error).not.toBeNull();
  });

  it("cannot skip moderation by setting their own status", async () => {
    const { error } = await author.client.from("dispatches").insert(dispatch(openId, author.id, { moderation_status: "visible" }));
    expect(error).not.toBeNull();

    const { data: mine } = await author.client.from("dispatches").insert(dispatch(openId, author.id)).select("id").single();
    const { error: updateError } = await author.client.from("dispatches").update({ moderation_status: "visible" }).eq("id", mine!.id);
    expect(updateError).not.toBeNull();
  });

  it("stay hidden from others until moderation makes them visible", async () => {
    const { data: mine } = await author.client.from("dispatches").insert(dispatch(openId, author.id)).select("id").single();
    const { data: before } = await reader.client.from("dispatches").select("id").eq("id", mine!.id);
    expect(before ?? []).toHaveLength(0);

    await service.from("dispatches").update({ moderation_status: "visible" }).eq("id", mine!.id);
    const { data: after } = await anonClient().from("dispatches").select("id").eq("id", mine!.id);
    expect(after).toHaveLength(1);
  });

  it("can be edited by their author only", async () => {
    const { data: mine } = await author.client.from("dispatches").insert(dispatch(openId, author.id)).select("id").single();
    const { error } = await author.client.from("dispatches").update({ body: "Edited by author." }).eq("id", mine!.id);
    expect(error).toBeNull();

    await reader.client.from("dispatches").update({ body: "Edited by someone else." }).eq("id", mine!.id);
    const { data } = await service.from("dispatches").select("body").eq("id", mine!.id).single();
    expect(data!.body).toBe("Edited by author.");
  });

  it("cannot be deleted from the browser, even by their author", async () => {
    const { data: mine } = await author.client.from("dispatches").insert(dispatch(openId, author.id)).select("id").single();
    await author.client.from("dispatches").delete().eq("id", mine!.id);
    const { data } = await service.from("dispatches").select("id").eq("id", mine!.id);
    expect(data).toHaveLength(1);
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
