import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 4 review fixes (migration 20261104000300). LOCAL Supabase only.

const SPRINT4_COLUMNS = [
  "ai_enabled", "ai_fallback_normal", "ai_fallback_sensitive", "ai_daily_cap_global", "ai_daily_cap_per_strategist",
  "coach_uses_per_draft", "coach_daily_cap", "nudge_on_submit", "ai_input_max_chars", "ai_model_screening",
  "ai_model_nudge", "ai_model_coach", "hold_threshold", "sensitive_hold_threshold", "undeclared_ai_flag",
  "screen_display_names", "screen_bios", "account_deletion_enabled",
];
const EARLIER_COLUMNS = [
  "id", "argument_max_chars", "rebuttal_max_chars", "evidence_max_chars", "max_dispatches_per_round",
  "cooldown_seconds", "edit_window_seconds", "email_daily_cap", "reply_digest_minutes", "updated_at",
];

let strategist: TestUser;
let admin: TestUser;
const extraUsers: TestUser[] = [];
const campaignIds: string[] = [];

beforeAll(async () => {
  [strategist, admin] = await Promise.all([createUser(), createUser({ admin: true })]);
});

afterAll(async () => {
  await service.from("community_settings").update({ ai_daily_cap_global: 3000, ai_daily_cap_per_strategist: 40, ai_enabled: true, cooldown_seconds: 30 }).eq("id", true);
  await deleteUsers([strategist, admin, ...extraUsers]);
  if (campaignIds.length) await service.from("campaigns").delete().in("id", campaignIds);
});

describe("1. community_settings: the Sprint 4 columns are not readable by browsers", () => {
  it.each(SPRINT4_COLUMNS)("refuses %s to signed-out visitors and signed-in Strategists, even admins", async (column) => {
    for (const client of [anonClient(), strategist.client, admin.client]) {
      const { data, error } = await client.from("community_settings").select(column);
      expect(error?.message, column).toMatch(/permission denied/i);
      expect(data).toBeNull();
    }
  });

  it("refuses select * (it would include the hidden columns)", async () => {
    for (const client of [anonClient(), strategist.client]) {
      expect((await client.from("community_settings").select("*")).error?.message).toMatch(/permission denied/i);
    }
  });

  it("keeps every earlier column readable by everyone", async () => {
    for (const client of [anonClient(), strategist.client, admin.client]) {
      const { data, error } = await client.from("community_settings").select(EARLIER_COLUMNS.join(", ")).single();
      expect(error).toBeNull();
      expect(Object.keys(data!).sort()).toEqual([...EARLIER_COLUMNS].sort());
    }
  });

  it("gives admins the whole row through admin_community_settings(), and nobody else", async () => {
    const { data, error } = await admin.client.rpc("admin_community_settings").single();
    expect(error).toBeNull();
    for (const column of [...SPRINT4_COLUMNS, ...EARLIER_COLUMNS]) expect(data, column).toHaveProperty(column);
    expect((await strategist.client.rpc("admin_community_settings")).error?.message).toMatch(/^NOT_ADMIN/);
    expect((await anonClient().rpc("admin_community_settings")).error).not.toBeNull();
  });

  it("lets the server (service role) read the whole row", async () => {
    const { data, error } = await service.from("community_settings").select("*").single();
    expect(error).toBeNull();
    for (const column of SPRINT4_COLUMNS) expect(data, column).toHaveProperty(column);
  });

  it("still lets an admin change them, and still refuses everyone else", async () => {
    expect((await admin.client.from("community_settings").update({ nudge_on_submit: false }).eq("id", true)).error).toBeNull();
    expect((await service.from("community_settings").select("nudge_on_submit").single()).data).toEqual({ nudge_on_submit: false });
    await service.from("community_settings").update({ nudge_on_submit: true }).eq("id", true);
    await strategist.client.from("community_settings").update({ ai_enabled: false }).eq("id", true);
    expect((await service.from("community_settings").select("ai_enabled").single()).data).toEqual({ ai_enabled: true });
  });
});

describe("2. a deleted account (tombstone) can never get a handle", () => {
  it("blocks setting a handle on a tombstone, even for the service role", async () => {
    const gone = await createUser({ handle: null });
    extraUsers.push(gone);
    expect((await service.rpc("anonymise_profile", { p_user_id: gone.id, p_via: "test" })).error).toBeNull();
    const { data: tombstone } = await service.from("profiles").select("handle, deleted_at").eq("id", gone.id).single();
    expect(tombstone!.deleted_at).not.toBeNull();
    expect(tombstone!.handle).toBeNull();

    const { error } = await service.from("profiles").update({ handle: "Resurrected_1" }).eq("id", gone.id);
    expect(error?.message).toMatch(/^ACCOUNT_DELETED/);
    expect((await service.from("profiles").select("handle").eq("id", gone.id).single()).data).toEqual({ handle: null });
  });

  it("blocks deleting a handled account in one step without clearing the handle", async () => {
    const live = await createUser();
    extraUsers.push(live);
    const { error } = await service.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", live.id);
    expect(error?.message).toMatch(/^ACCOUNT_DELETED/);
  });

  it("still lets a live account get its handle", async () => {
    const fresh = await createUser({ handle: null });
    extraUsers.push(fresh);
    expect((await service.from("profiles").update({ handle: `Fresh${Date.now().toString(36)}` }).eq("id", fresh.id)).error).toBeNull();
  });
});

describe("3. anonymise_profile() deletes coach and nudge records", () => {
  it("removes the account's coach and nudge decisions, keeps its Dispatch decisions, scrubs its handle records", async () => {
    const leaver = await createUser();
    extraUsers.push(leaver);
    const row = (subject_type: string, subject_id: string) => ({
      subject_type, subject_id, user_id: leaver.id, model: "test", prompt_version: "test.v1", outcome: "allow", reason: "Test.", output: { note: "kept?" },
    });
    const { error } = await service.from("ai_decisions").insert([
      row("coach", crypto.randomUUID()), row("coach", crypto.randomUUID()), row("nudge", crypto.randomUUID()),
      row("dispatch", crypto.randomUUID()), row("handle", "Leaver_Handle"),
    ]);
    expect(error).toBeNull();
    // Someone else's coach record is untouched.
    const other = await createUser();
    extraUsers.push(other);
    await service.from("ai_decisions").insert({ ...row("coach", crypto.randomUUID()), user_id: other.id });

    expect((await service.rpc("anonymise_profile", { p_user_id: leaver.id, p_via: "test" })).error).toBeNull();

    const { data: left } = await service.from("ai_decisions").select("subject_type, subject_id, output").eq("user_id", leaver.id).in("subject_type", ["coach", "nudge", "dispatch", "handle"]);
    // No coach or nudge record is left for the leaver.
    expect(left!.map((r) => r.subject_type).sort()).toEqual(["dispatch", "handle"]);
    expect(left!.find((r) => r.subject_type === "handle")).toMatchObject({ subject_id: "deleted", output: {} });
    expect(((await service.from("ai_decisions").select("id").eq("user_id", other.id).eq("subject_type", "coach")).data ?? []).length).toBe(1);
  });
});

describe("4. nudges and coaching stop at 80% of the daily cap", () => {
  it("keeps the last 20% of calls for screening", async () => {
    const { data: today } = await service.rpc("uk_today");
    await service.from("ai_usage").delete().eq("day", today as string);
    await service.from("community_settings").update({ ai_daily_cap_global: 10, ai_daily_cap_per_strategist: 40 }).eq("id", true);
    // Seven calls used already.
    await service.from("ai_usage").insert({ day: today as string, feature: "screen_dispatch", calls: 7 });

    // 7 of 10 is under 80%: a nudge is allowed (it becomes the eighth call).
    expect((await service.rpc("ai_reserve_call", { p_feature: "nudge", p_user_id: strategist.id })).data).toBe("ok");
    // 8 of 10 is 80%: no more nudges or coaching.
    expect((await service.rpc("ai_reserve_call", { p_feature: "nudge", p_user_id: strategist.id })).data).toBe("global_cap");
    expect((await service.rpc("ai_reserve_call", { p_feature: "coach", p_user_id: strategist.id })).data).toBe("global_cap");
    // Screening keeps the full cap: calls 9 and 10 are allowed, the 11th is not.
    expect((await service.rpc("ai_reserve_call", { p_feature: "screen_dispatch", p_user_id: null })).data).toBe("ok");
    expect((await service.rpc("ai_reserve_call", { p_feature: "screen_handle", p_user_id: strategist.id })).data).toBe("ok");
    expect((await service.rpc("ai_reserve_call", { p_feature: "screen_dispatch", p_user_id: null })).data).toBe("global_cap");

    await service.from("ai_usage").delete().eq("day", today as string);
    await service.from("community_settings").update({ ai_daily_cap_global: 3000 }).eq("id", true);
  });

  it("uses exact whole-number arithmetic at the boundary", async () => {
    const { data: today } = await service.rpc("uk_today");
    await service.from("ai_usage").delete().eq("day", today as string);
    await service.from("community_settings").update({ ai_daily_cap_global: 5 }).eq("id", true);
    // Cap 5: 80% is exactly 4. With 3 used a coach call is allowed (the fourth); with 4 used it is
    // refused, although 4 is still under the full cap of 5, so only the 80% rule can be refusing it.
    await service.from("ai_usage").insert({ day: today as string, feature: "screen_dispatch", calls: 3 });
    expect((await service.rpc("ai_reserve_call", { p_feature: "coach", p_user_id: strategist.id })).data).toBe("ok");
    expect((await service.rpc("ai_reserve_call", { p_feature: "coach", p_user_id: strategist.id })).data).toBe("global_cap");
    expect((await service.rpc("ai_reserve_call", { p_feature: "screen_dispatch", p_user_id: null })).data).toBe("ok");
    await service.from("ai_usage").delete().eq("day", today as string);
    await service.from("community_settings").update({ ai_daily_cap_global: 3000 }).eq("id", true);
  });

  it("is still service-role only", async () => {
    for (const client of [anonClient(), strategist.client, admin.client]) {
      expect((await client.rpc("ai_reserve_call", { p_feature: "nudge", p_user_id: strategist.id })).error).not.toBeNull();
    }
  });

  it("still lets screening apply while nudges are paused (a Dispatch is not stranded)", async () => {
    const campaign = await createCampaign({ title: "Cap reserve test" });
    campaignIds.push(campaign);
    await strategist.client.from("campaign_positions").insert({ campaign_id: campaign, user_id: strategist.id, after_position: "for" });
    await service.from("community_settings").update({ cooldown_seconds: 0 }).eq("id", true);
    const { data: id, error } = await strategist.client.rpc("post_dispatch", { p_campaign_id: campaign, p_kind: "argument", p_body: "A reserve test argument.", p_ai_use: "none" });
    expect(error).toBeNull();
    expect(await applyScreening(id as string)).toBe("visible");
  });
});

describe("5. judging_weights: public except created_by", () => {
  it("lets everyone read the weights but not who saved them", async () => {
    await admin.client.rpc("save_judging_weights", { p_panel: 40, p_peer: 25, p_ai_rubric: 25, p_mind_change: 10, p_note: "review-fixes test" });
    for (const client of [anonClient(), strategist.client, admin.client]) {
      const { data, error } = await client.from("judging_weights").select("version, panel, peer, ai_rubric, mind_change, note, created_at").order("version", { ascending: false }).limit(1).single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ panel: 40, peer: 25, ai_rubric: 25, mind_change: 10 });
      expect((await client.from("judging_weights").select("created_by")).error?.message).toMatch(/permission denied/i);
      expect((await client.from("judging_weights").select("*")).error?.message).toMatch(/permission denied/i);
    }
  });

  it("still records who saved each version, for the server", async () => {
    const { data } = await service.from("judging_weights").select("created_by").eq("note", "review-fixes test").order("version", { ascending: false }).limit(1).single();
    expect(data!.created_by).toBe(admin.id);
  });
});
