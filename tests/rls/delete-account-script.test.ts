import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDeleteAccount } from "../../scripts/lib/delete-account-cli";
import { applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

let person: TestUser;
let campaignId: string;
let dispatchId: string;

beforeAll(async () => {
  person = await createUser();
  campaignId = await createCampaign();
  await service.from("community_settings").update({ cooldown_seconds: 0 }).eq("id", true);
  await person.client.from("campaign_positions").insert({ campaign_id: campaignId, user_id: person.id, after_position: "for" });
  const { data } = await person.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: "Stays in the record.", p_ai_use: "none" });
  dispatchId = data as string;
  await applyScreening(dispatchId);
});

afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30 }).eq("id", true);
  await service.from("dispatches").delete().eq("author_id", person.id);
  await service.from("profiles").delete().eq("id", person.id);
  await service.from("campaigns").delete().eq("id", campaignId);
});

async function run(email: string, confirm: boolean) {
  const lines: string[] = [];
  const code = await runDeleteAccount({ admin: service, email, confirm, log: (l) => lines.push(l) });
  return { code, out: lines.join("\n") };
}

describe("npm run account:delete", () => {
  it("refuses an account that does not exist, in dry run and with --confirm", async () => {
    for (const confirm of [false, true]) {
      const r = await run("nobody-at-all@example.test", confirm);
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/No account with the email address nobody-at-all@example.test/);
    }
  });

  it("dry run shows counts, prints no other personal data and changes nothing", async () => {
    const { data: before } = await service.from("profiles").select("handle").eq("id", person.id).single();
    const r = await run(person.email.toUpperCase(), false);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/DRY RUN/);
    expect(r.out).toMatch(/1 positions on open Campaigns/);
    expect(r.out).toMatch(/1 Dispatch\b/);
    expect(r.out).not.toContain(before!.handle as string);
    expect(r.out).not.toContain(person.id);
    expect(r.out).toMatch(/Add --confirm to delete/);
    const { data: after } = await service.from("profiles").select("handle, deleted_at").eq("id", person.id).single();
    expect(after).toEqual({ handle: before!.handle, deleted_at: null });
    expect((await service.auth.admin.getUserById(person.id)).data.user).not.toBeNull();
  });

  it("with --confirm uses the same path as self-service: anonymises, keeps the Dispatch, deletes the sign-in, audits", async () => {
    const r = await run(person.email, true);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^DELETING/m);
    expect(r.out).toMatch(/Deleted\./);
    const { data: profile } = await service.from("profiles").select("handle, deleted_at").eq("id", person.id).single();
    expect(profile!.handle).toBeNull();
    expect(profile!.deleted_at).not.toBeNull();
    expect((await service.from("dispatches").select("body").eq("id", dispatchId).single()).data!.body).toBe("Stays in the record.");
    expect((await service.auth.admin.getUserById(person.id)).data.user).toBeNull();
    const { data: log } = await service.from("audit_log").select("details").eq("action", "account.deleted").eq("target_id", person.id).single();
    expect(log!.details).toMatchObject({ via: "by_hand", kept_dispatches: 1 });
  });

  it("then refuses to delete the same email again", async () => {
    const r = await run(person.email, true);
    expect(r.code).toBe(1);
  });
});
