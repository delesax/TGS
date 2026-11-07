import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Part 3: private positions need explicit consent (special category data).

let alice: TestUser; // consented
let bob: TestUser; // consented
let nobody: TestUser; // never consented
let openId: string;
let openId2: string;
let closedId: string;
const campaignIds: string[] = [];
const hour = 3_600_000;

beforeAll(async () => {
  [alice, bob, nobody] = await Promise.all([createUser(), createUser(), createUser({ positionsConsent: false })]);
  const now = Date.now();
  openId = await createCampaign();
  openId2 = await createCampaign();
  closedId = await createCampaign({ status: "closed", starts_at: new Date(now - 3 * hour).toISOString(), ends_at: new Date(now - hour).toISOString() });
  campaignIds.push(openId, openId2, closedId);
});

afterAll(async () => {
  await deleteUsers([alice, bob, nobody]);
  await service.from("campaigns").delete().in("id", campaignIds);
});

describe("recording a position needs consent", () => {
  it("is refused for a person who has not consented", async () => {
    const { error } = await nobody.client.from("campaign_positions").insert({ campaign_id: openId, user_id: nobody.id, after_position: "for" });
    expect(error?.code).toBe("42501");
    const { data } = await service.from("campaign_positions").select("campaign_id").eq("user_id", nobody.id);
    expect(data).toEqual([]);
  });

  it("works once consent is on record", async () => {
    const { error } = await alice.client.from("campaign_positions").insert({ campaign_id: openId, user_id: alice.id, after_position: "for" });
    expect(error).toBeNull();
  });

  it("does not need a position to post a Dispatch (and a person without consent can post)", async () => {
    const { data, error } = await nobody.client.rpc("post_dispatch", { p_campaign_id: openId, p_kind: "argument", p_body: "Posting without a position.", p_ai_use: "none" });
    expect(error).toBeNull();
    await service.from("dispatches").delete().eq("id", data as string);
  });
});

describe("privacy of positions and consent", () => {
  it("nobody can read or write another person's position", async () => {
    const read = await bob.client.from("campaign_positions").select("*").eq("user_id", alice.id);
    expect(read.data ?? []).toEqual([]);
    const forged = await bob.client.from("campaign_positions").insert({ campaign_id: openId2, user_id: alice.id, after_position: "against" });
    expect(forged.error).not.toBeNull();
    const change = await bob.client.from("campaign_positions").update({ after_position: "against" }).eq("user_id", alice.id).select();
    expect(change.data ?? []).toEqual([]);
    const del = await bob.client.from("campaign_positions").delete().eq("user_id", alice.id).select();
    expect(del.data ?? []).toEqual([]);
    const { data } = await service.from("campaign_positions").select("after_position").eq("user_id", alice.id);
    expect(data).toEqual([{ after_position: "for" }]);
  });

  it("the consent columns cannot be read or written from the browser, by anyone", async () => {
    for (const column of ["positions_consent_at", "positions_consent_version"]) {
      expect((await alice.client.from("profiles").select(column).eq("id", alice.id)).error, `own ${column}`).not.toBeNull();
      expect((await alice.client.from("profiles").select(column).eq("id", bob.id)).error, `other ${column}`).not.toBeNull();
    }
    expect((await nobody.client.from("profiles").update({ positions_consent_at: new Date().toISOString() }).eq("id", nobody.id)).error).not.toBeNull();
    expect((await nobody.client.from("profiles").update({ positions_consent_at: new Date().toISOString() }).eq("id", alice.id)).error).not.toBeNull();
    const { data } = await service.from("profiles").select("positions_consent_at").eq("id", nobody.id).single();
    expect(data!.positions_consent_at).toBeNull();
  });

  it("the consent check function and the withdrawal function are not callable from the browser or by visitors", async () => {
    expect((await alice.client.rpc("withdraw_positions_consent", { p_user_id: alice.id })).error).not.toBeNull();
    expect((await anonClient().rpc("withdraw_positions_consent", { p_user_id: alice.id })).error).not.toBeNull();
    expect((await anonClient().rpc("has_positions_consent", { p_user_id: alice.id })).error).not.toBeNull();
    const { data } = await service.from("campaign_positions").select("after_position").eq("user_id", alice.id);
    expect(data).toHaveLength(1);
  });

  it("the consented_positions view (for the mind-change measure) is for the server only", async () => {
    expect((await alice.client.from("consented_positions").select("*")).error).not.toBeNull();
    expect((await anonClient().from("consented_positions").select("*")).error).not.toBeNull();
  });
});

describe("clearing a position", () => {
  it("lets a person clear their own position on an open Campaign, and no one else's", async () => {
    await bob.client.from("campaign_positions").insert({ campaign_id: openId2, user_id: bob.id, after_position: "against" });
    const other = await alice.client.from("campaign_positions").delete().eq("campaign_id", openId2).eq("user_id", bob.id).select();
    expect(other.data ?? []).toEqual([]);
    const own = await bob.client.from("campaign_positions").delete().eq("campaign_id", openId2).eq("user_id", bob.id).select();
    expect(own.data).toHaveLength(1);
  });
});

describe("withdrawing consent", () => {
  it("deletes open positions, unlinks closed ones, clears the consent and writes one audit entry", async () => {
    const carol = await createUser();
    try {
      // A position on a Campaign that has since closed (inserted by the server, since the browser is locked out of closed Campaigns).
      const justClosing = await createCampaign();
      campaignIds.push(justClosing);
      await carol.client.from("campaign_positions").insert({ campaign_id: justClosing, user_id: carol.id, after_position: "against" });
      await service.from("campaigns").update({ status: "closed", starts_at: new Date(Date.now() - 2 * hour).toISOString(), ends_at: new Date(Date.now() - hour).toISOString() }).eq("id", justClosing);
      await carol.client.from("campaign_positions").insert({ campaign_id: openId, user_id: carol.id, after_position: "for" });
      const before = await service.from("anonymous_positions").select("id").eq("campaign_id", justClosing);

      const { data, error } = await service.rpc("withdraw_positions_consent", { p_user_id: carol.id });
      expect(error).toBeNull();
      expect(data).toEqual({ open_positions_deleted: 1, closed_positions_unlinked: 1 });

      expect((await service.from("campaign_positions").select("campaign_id").eq("user_id", carol.id)).data).toEqual([]);
      const after = await service.from("anonymous_positions").select("id, before_position, after_position").eq("campaign_id", justClosing);
      expect(after.data!.length).toBe(before.data!.length + 1);
      const { data: profile } = await service.from("profiles").select("positions_consent_at, positions_consent_version").eq("id", carol.id).single();
      expect(profile).toEqual({ positions_consent_at: null, positions_consent_version: null });

      // Without consent she cannot record again.
      const again = await carol.client.from("campaign_positions").insert({ campaign_id: openId2, user_id: carol.id, after_position: "for" });
      expect(again.error?.code).toBe("42501");

      const { data: log } = await service.from("audit_log").select("action, actor_id, details").eq("target_id", carol.id).eq("action", "positions.consent_withdrawn");
      expect(log).toHaveLength(1);
      expect(log![0].details).toEqual({ open_positions_deleted: 1, closed_positions_unlinked: 1 });
    } finally {
      await deleteUsers([carol]);
    }
  });

  it("the mind-change view counts only people who consented", async () => {
    const dave = await createUser({ positionsConsent: false });
    try {
      await service.from("campaign_positions").insert({ campaign_id: openId2, user_id: dave.id, after_position: "for" }); // a legacy row with no consent
      const { data } = await service.from("consented_positions").select("user_id").eq("campaign_id", openId2);
      expect(data!.map((r) => r.user_id)).not.toContain(dave.id);
      const { data: all } = await service.from("consented_positions").select("user_id").eq("campaign_id", openId);
      expect(all!.map((r) => r.user_id)).toContain(alice.id);
    } finally {
      await deleteUsers([dave]);
    }
  });
});
