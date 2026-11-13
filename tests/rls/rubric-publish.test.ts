import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Rule 7 (migration 20261113000800): the rubric is published before a Campaign opens. LOCAL Supabase only.

let admin: TestUser;
let member: TestUser;
const ids: string[] = [];
const hour = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const code = (error: { message: string } | null) => (error ? (/^([A-Z_]+):/.exec(error.message)?.[1] ?? error.message) : null);
const payload = (status: string, extra: Record<string, unknown> = {}) => ({
  slug: `rls-rubric-${Math.random().toString(36).slice(2, 10)}`, title: "Rubric test Campaign", summary: "s", category: "energy", format: "oxford", status,
  starts_at: iso(Date.now() + 24 * hour), ends_at: iso(Date.now() + 48 * hour), is_sensitive: false, opinion_not_advice: false, ...extra,
});

beforeAll(async () => {
  [admin, member] = await Promise.all([createUser({ admin: true }), createUser()]);
});
afterAll(async () => {
  await deleteUsers([admin, member]);
  for (const id of ids) await service.from("campaigns").delete().eq("id", id);
});

async function draft(): Promise<string> {
  const { data, error } = await admin.client.rpc("save_campaign", { p_id: null, p_campaign: payload("draft"), p_rounds: [] });
  if (error) throw new Error(error.message);
  ids.push(data as string);
  return data as string;
}

describe("publish_campaign_rubric", () => {
  it("is for admins only", async () => {
    const id = await draft();
    expect(code((await member.client.rpc("publish_campaign_rubric", { p_campaign_id: id })).error)).toBe("NOT_ADMIN");
    expect((await anonClient().rpc("publish_campaign_rubric", { p_campaign_id: id })).error).not.toBeNull();
    expect((await service.from("campaigns").select("rubric_published_at").eq("id", id).single()).data?.rubric_published_at).toBeNull();
  });

  it("sets the time once, pins the current weights version, and writes one audit entry", async () => {
    const id = await draft();
    const first = await admin.client.rpc("publish_campaign_rubric", { p_campaign_id: id });
    expect(first.error).toBeNull();
    const row = (await service.from("campaigns").select("rubric_published_at, judging_weights_version, status").eq("id", id).single()).data!;
    expect(row.rubric_published_at).not.toBeNull();
    expect(row.status).toBe("draft"); // publishing never changes the status
    const latest = (await service.from("judging_weights").select("version").order("version", { ascending: false }).limit(1).single()).data!.version;
    expect(row.judging_weights_version).toBe(latest);
    // A later weights edit does not change what this Campaign published.
    await service.from("judging_weights").insert({ panel: 30, peer: 30, ai_rubric: 30, mind_change: 10, note: "rubric test" });
    const second = await admin.client.rpc("publish_campaign_rubric", { p_campaign_id: id });
    expect(second.error).toBeNull();
    expect(Date.parse(second.data as string)).toBe(Date.parse(row.rubric_published_at!));
    expect((await service.from("campaigns").select("judging_weights_version").eq("id", id).single()).data?.judging_weights_version).toBe(latest);
    await service.from("judging_weights").delete().eq("note", "rubric test");
    const { data: log } = await service.from("audit_log").select("actor_id, details").eq("action", "campaign.rubric_published").eq("target_id", id);
    expect(log).toHaveLength(1);
    expect(log![0].actor_id).toBe(admin.id);
    expect(log![0].details).toMatchObject({ judging_weights_version: latest, status: "draft" });
  });

  it("refuses a closed Campaign and an unknown one", async () => {
    const closed = await createCampaign({ status: "closed", starts_at: iso(Date.now() - 3 * hour), ends_at: iso(Date.now() - hour) });
    ids.push(closed);
    expect(code((await admin.client.rpc("publish_campaign_rubric", { p_campaign_id: closed })).error)).toBe("CAMPAIGN_CLOSED");
    expect(code((await admin.client.rpc("publish_campaign_rubric", { p_campaign_id: "00000000-0000-0000-0000-000000000000" })).error)).toBe("NOT_FOUND");
  });

  it("is public to read once published (the column and the weights)", async () => {
    const id = await draft();
    await admin.client.rpc("publish_campaign_rubric", { p_campaign_id: id });
    // Drafts are hidden from the public, so the published rubric is read on a scheduled Campaign.
    await admin.client.rpc("save_campaign", { p_id: id, p_campaign: payload("scheduled", { slug: "rls-rubric-public-" + id.slice(0, 6) }), p_rounds: [] });
    const { data } = await anonClient().from("campaigns").select("rubric_published_at, judging_weights_version").eq("id", id).single();
    expect(data?.rubric_published_at).not.toBeNull();
    const w = await anonClient().from("judging_weights").select("panel, peer, ai_rubric, mind_change").eq("version", data!.judging_weights_version!).single();
    expect(w.error).toBeNull();
  });
});

describe("scheduling needs a published rubric (save_campaign)", () => {
  it("refuses to create a Campaign as scheduled, and to schedule an unpublished draft", async () => {
    const created = await admin.client.rpc("save_campaign", { p_id: null, p_campaign: payload("scheduled"), p_rounds: [] });
    expect(code(created.error)).toBe("RUBRIC_NOT_PUBLISHED");
    const id = await draft();
    const attempt = await admin.client.rpc("save_campaign", { p_id: id, p_campaign: payload("scheduled", { slug: "rls-rubric-x-" + id.slice(0, 6) }), p_rounds: [] });
    expect(code(attempt.error)).toBe("RUBRIC_NOT_PUBLISHED");
    expect((await service.from("campaigns").select("status").eq("id", id).single()).data?.status).toBe("draft");
  });

  it("allows scheduling once the rubric is published", async () => {
    const id = await draft();
    await admin.client.rpc("publish_campaign_rubric", { p_campaign_id: id });
    const ok = await admin.client.rpc("save_campaign", { p_id: id, p_campaign: payload("scheduled", { slug: "rls-rubric-ok-" + id.slice(0, 6) }), p_rounds: [] });
    expect(ok.error).toBeNull();
    expect((await service.from("campaigns").select("status").eq("id", id).single()).data?.status).toBe("scheduled");
  });

  it("does not touch Campaigns that are already scheduled, open or closed, and saving a draft as a draft is unchanged", async () => {
    const scheduled = await createCampaign({ status: "scheduled", starts_at: iso(Date.now() + hour), ends_at: iso(Date.now() + 2 * hour) });
    const open = await createCampaign({});
    ids.push(scheduled, open);
    for (const id of [scheduled, open]) {
      const { error } = await admin.client.rpc("save_campaign", { p_id: id, p_campaign: payload("scheduled", { slug: "rls-rubric-keep-" + id.slice(0, 6), starts_at: iso(Date.now() + hour), ends_at: iso(Date.now() + 5 * hour) }), p_rounds: [] });
      expect(error).toBeNull();
    }
    expect((await service.from("campaigns").select("status").eq("id", open).single()).data?.status).toBe("open");
    const d = await draft();
    expect((await admin.client.rpc("save_campaign", { p_id: d, p_campaign: payload("draft", { slug: "rls-rubric-d-" + d.slice(0, 6) }), p_rounds: [] })).error).toBeNull();
  });
});
