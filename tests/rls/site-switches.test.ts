import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createCampaign, createUser, createInvite, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 7 kill switches (migration 20261113000100). LOCAL Supabase only.

let member: TestUser;
let admin: TestUser;
let campaignId: string;

async function setSwitches(client: TestUser["client"], posting: boolean, signups: boolean, emails: boolean, reason = "test") {
  return client.rpc("set_site_switches", { p_posting: posting, p_signups: signups, p_emails: emails, p_reason: reason });
}

beforeAll(async () => {
  [member, admin] = await Promise.all([createUser(), createUser({ admin: true })]);
  campaignId = await createCampaign();
});

afterAll(async () => {
  await service.from("community_settings").update({ posting_paused: false, signups_paused: false, emails_paused: false }).eq("id", true);
  await deleteUsers([member, admin]);
  await service.from("campaigns").delete().eq("id", campaignId);
});

describe("site switches", () => {
  it("are all off by default and readable by anyone through site_switches()", async () => {
    const { data, error } = await anonClient().rpc("site_switches").single();
    expect(error).toBeNull();
    expect(data).toEqual({ posting_paused: false, signups_paused: false, emails_paused: false });
  });

  it("are not readable as table columns by browser roles", async () => {
    for (const client of [anonClient(), member.client, admin.client]) {
      const { error } = await client.from("community_settings").select("posting_paused");
      expect(error?.message).toMatch(/permission denied/i);
    }
  });

  it("can be changed only by an admin, and only with a reason", async () => {
    expect((await setSwitches(anonClient(), true, false, false)).error).not.toBeNull();
    expect((await setSwitches(member.client, true, false, false)).error?.message).toMatch(/NOT_ADMIN/);
    expect((await setSwitches(admin.client, true, false, false, "   ")).error?.message).toMatch(/REASON_REQUIRED/);
    expect((await setSwitches(admin.client, true, false, false, "x".repeat(501))).error?.message).toMatch(/REASON_REQUIRED/);
    const { data } = await anonClient().rpc("site_switches").single();
    expect(data).toEqual({ posting_paused: false, signups_paused: false, emails_paused: false });
  });

  it("records an audit entry with the reason and the before and after", async () => {
    expect((await setSwitches(admin.client, true, false, false, "launch hour burst")).error).toBeNull();
    const { data } = await service.from("audit_log").select("actor_id, details").eq("action", "site.switches_changed").order("created_at", { ascending: false }).limit(1).single();
    expect(data?.actor_id).toBe(admin.id);
    expect(data?.details).toMatchObject({ reason: "launch hour burst", posting_paused: [false, true] });
    expect((await setSwitches(admin.client, false, false, false, "back to normal")).error).toBeNull();
  });
});

describe("posting switch", () => {
  const post = (body: string) => member.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: body, p_ai_use: "none" });

  it("refuses a new Dispatch while on, and allows it again when off", async () => {
    expect((await setSwitches(admin.client, true, false, false, "pause posting")).error).toBeNull();
    const refused = await post("A new argument while posting is paused.");
    expect(refused.error?.message).toMatch(/POSTING_PAUSED/);
    expect((await setSwitches(admin.client, false, false, false, "resume")).error).toBeNull();
    const allowed = await post("A new argument once posting is back on.");
    expect(allowed.error).toBeNull();
  });
});

describe("sign-up switch", () => {
  it("refuses a new account while on (even with a valid invite), and allows it when off", async () => {
    const invite = await createInvite();
    const make = () =>
      service.auth.admin.createUser({
        email: `rls-switch-${crypto.randomUUID()}@example.test`,
        password: "rls-test-password-123",
        email_confirm: true,
        user_metadata: { invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
      });
    expect((await setSwitches(admin.client, false, true, false, "pause sign-ups")).error).toBeNull();
    const refused = await make();
    expect(refused.error).not.toBeNull();
    expect((await setSwitches(admin.client, false, false, false, "resume")).error).toBeNull();
    const allowed = await make();
    expect(allowed.error).toBeNull();
    if (allowed.data?.user) await service.auth.admin.deleteUser(allowed.data.user.id);
  });
});
