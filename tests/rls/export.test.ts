import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportDispatchBatch, exportHead } from "../../src/lib/export-data";
import { anonClient, applyScreening, createCampaign, createInvite, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Part 7: "Download my data" is complete, and leaves out other people's data.

let me: TestUser;
let other: TestUser;
let moderator: TestUser;
let campaignId: string;
let myDispatch: string;
let otherDispatch: string;
let inviteCode: string;
type Head = {
  account: Record<string, unknown>;
  consents: Record<string, unknown>;
  passkeys: Record<string, unknown>[];
  following: { campaigns: unknown[]; strategists: unknown[] };
  [key: string]: unknown;
};
let head: Head;

beforeAll(async () => {
  const invite = await createInvite();
  inviteCode = invite.code;
  const email = `export-${randomUUID()}@example.test`;
  const created = await service.auth.admin.createUser({
    email,
    password: "export-test-password",
    email_confirm: true,
    user_metadata: { invite_code: invite.code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "tv-1", privacy_version: "pv-1" },
  });
  if (created.error) throw created.error;
  me = { id: created.data.user.id, email, client: null as never };
  await service.from("profiles").update({ handle: `Me_${Date.now().toString(36)}`, display_name: "Me Myself", positions_consent_at: new Date().toISOString(), positions_consent_version: "pv-1" }).eq("id", me.id);
  [other, moderator] = await Promise.all([createUser({ handle: `Other_${Date.now().toString(36)}` }), createUser({ admin: true })]);
  campaignId = await createCampaign();
  await service.from("community_settings").update({ cooldown_seconds: 0, max_dispatches_per_round: 50 }).eq("id", true);

  // Dispatches: mine and someone else's.
  const mineClient = anonClient();
  await mineClient.auth.signInWithPassword({ email, password: "export-test-password" });
  const mine = await mineClient.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: "My own words.", p_ai_use: "assisted" });
  if (mine.error) throw mine.error;
  myDispatch = mine.data as string;
  await applyScreening(myDispatch);
  const theirs = await other.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: "Someone else's words.", p_ai_use: "none" });
  otherDispatch = theirs.data as string;
  await applyScreening(otherDispatch);

  // Things about me.
  await service.from("campaign_positions").insert({ campaign_id: campaignId, user_id: me.id, after_position: "for" });
  await service.from("dispatch_reactions").insert({ dispatch_id: otherDispatch, user_id: me.id, reaction: "persuasive" });
  await service.from("campaign_follows").upsert({ campaign_id: campaignId, user_id: me.id });
  await service.from("strategist_follows").insert({ follower_id: me.id, followed_id: other.id });
  await service.from("strategist_follows").insert({ follower_id: other.id, followed_id: me.id }); // someone following me: not mine to export
  await service.from("passkeys").insert({ user_id: me.id, credential_id: `cred-${randomUUID()}`, public_key: "SECRET-PUBLIC-KEY", nickname: "My phone" });
  await service.from("dispatch_reports").insert({ dispatch_id: otherDispatch, reporter_id: me.id, reason: "other", details: "I reported this." });
  await service.from("dispatch_reports").insert({ dispatch_id: myDispatch, reporter_id: other.id, reason: "harassment", details: "OTHER-PERSON-REPORT-ABOUT-ME" });
  await service.from("dispatch_appeals").insert({
    dispatch_id: myDispatch, author_id: me.id, reason: "Please look again.", original_status: "held", status: "rejected",
    decided_by: moderator.id, decided_at: new Date().toISOString(), decision_reason: "The hold stands.", original_actor: moderator.id, same_admin: true,
  });
  await service.from("ai_decisions").insert({
    subject_type: "dispatch", subject_id: myDispatch, user_id: me.id, model: "model-x", prompt_version: "screen.v1", outcome: "allow", reason: "Fine.",
    output: { undeclared_ai: true, undeclared_ai_reason: "SOFT-FLAG-SIGNAL" }, overridden_by: moderator.id, overridden_at: new Date().toISOString(), override_outcome: "hold", override_reason: "A person looked.",
  });
  await service.from("ai_decisions").insert({ subject_type: "handle", subject_id: "MyHandle", user_id: me.id, model: "model-x", prompt_version: "handle.v1", outcome: "allow", reason: "Handle fine." });
  const coach = await service.from("ai_decisions").insert({ subject_type: "coach", subject_id: "draft", user_id: me.id, model: "sonnet", prompt_version: "coach.v1", outcome: "allow", reason: "Coach note.", output: { questions: ["What is your evidence?"] } }).select("id").single();
  await service.from("coach_feedback").insert({ ai_decision_id: coach.data!.id, user_id: me.id, draft_key: randomUUID(), helpful: true, comment: "Useful." });
  await service.from("moderation_flags").insert({ kind: "undeclared_ai", dispatch_id: myDispatch, details: { why: "FLAG-DETAILS-SECRET" } });
  await service.from("privacy_requests").insert({ type: "access", email, user_id: me.id, message: "Please send everything." });
  await service.from("privacy_requests").insert({ type: "complaint", email, message: "Sent before I had an account." });
  await service.from("privacy_requests").insert({ type: "question", email: `someone-else-${randomUUID()}@example.test`, message: "NOT-MINE" });

  head = (await exportHead(service, me.id, email)) as Head;
});

afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30, max_dispatches_per_round: 10 }).eq("id", true);
  await service.from("privacy_requests").delete().like("email", "%example.test").or(`user_id.eq.${me.id},message.eq.NOT-MINE`);
  await service.from("moderation_flags").delete().eq("dispatch_id", myDispatch);
  await service.from("dispatches").delete().in("author_id", [me.id, other.id]);
  await service.from("profiles").delete().eq("id", me.id);
  await service.auth.admin.deleteUser(me.id);
  await deleteUsers([other, moderator]);
  await service.from("campaigns").delete().eq("id", campaignId);
});

describe("Download my data includes", () => {
  it("account and profile, the invite code used, and the consent records and versions", () => {
    expect(head.account).toMatchObject({ email: me.email, id: me.id, display_name: "Me Myself", invite_code_used: inviteCode });
    expect(head.account.handle).toMatch(/^Me_/);
    expect(head.consents).toMatchObject({ terms_version: "tv-1", privacy_version: "pv-1", positions_consent_version: "pv-1" });
    for (const k of ["age_confirmed_at", "terms_accepted_at", "public_acknowledged_at", "positions_consent_at"]) expect((head.consents as Record<string, unknown>)[k], k).not.toBeNull();
  });

  it("Dispatches with their AI-use declarations", async () => {
    const batch = await exportDispatchBatch(service, me.id, 0);
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0]).toMatchObject({ id: myDispatch, body: "My own words.", ai_use: "assisted" });
  });

  it("reactions, follows (by handle), positions and email settings", () => {
    expect(head.reactions_given).toEqual([expect.objectContaining({ dispatch_id: otherDispatch, reaction: "persuasive" })]);
    expect(head.following.campaigns).toHaveLength(1);
    expect(head.following.strategists).toEqual([expect.objectContaining({ handle: expect.stringMatching(/^Other_/) })]);
    expect(head.positions).toEqual([expect.objectContaining({ campaign_id: campaignId, after_position: "for" })]);
    expect(head).toHaveProperty("email_preferences");
  });

  it("passkey names and creation dates, but never the keys", () => {
    expect(head.passkeys).toEqual([expect.objectContaining({ nickname: "My phone", created_at: expect.any(String) })]);
    expect(JSON.stringify(head)).not.toContain("SECRET-PUBLIC-KEY");
    expect(head.passkeys[0]).not.toHaveProperty("public_key");
    expect(head.passkeys[0]).not.toHaveProperty("credential_id");
  });

  it("reports and appeals they made", () => {
    expect(head.reports_made).toEqual([expect.objectContaining({ dispatch_id: otherDispatch, details: "I reported this." })]);
    expect(head.appeals_made).toEqual([expect.objectContaining({ dispatch_id: myDispatch, reason: "Please look again.", decision_reason: "The hold stands.", status: "rejected" })]);
  });

  it("decisions about their Dispatches and handles: decision, reason, date, model", () => {
    const d = head.decisions_about_my_handle_and_dispatches as Record<string, unknown>[];
    expect(d.length).toBeGreaterThanOrEqual(2); // plus the screening decision made when the Dispatch was posted
    expect(d).toContainEqual(expect.objectContaining({ subject_type: "dispatch", model: "model-x", outcome: "allow", reason: "Fine.", created_at: expect.any(String), override_outcome: "hold", override_reason: "A person looked." }));
    expect(d).toContainEqual(expect.objectContaining({ subject_type: "handle", model: "model-x", reason: "Handle fine." }));
  });

  it("coach feedback and ratings", () => {
    expect(head.coach_and_tone_check_records).toEqual([expect.objectContaining({ subject_type: "coach", reason: "Coach note.", output: { questions: ["What is your evidence?"] } })]);
    expect(head.coach_feedback_ratings).toEqual([expect.objectContaining({ helpful: true, comment: "Useful." })]);
  });

  it("their privacy requests, found by account or by the email address", () => {
    const messages = (head.privacy_requests as { message: string }[]).map((r) => r.message).sort();
    expect(messages).toEqual(["Please send everything.", "Sent before I had an account."]);
  });
});

describe("Download my data leaves out", () => {
  const text = () => JSON.stringify(head);

  it("another person's report about them", () => {
    expect(text()).not.toContain("OTHER-PERSON-REPORT-ABOUT-ME");
    expect(head.reports_made).toHaveLength(1);
  });

  it("any reviewer, moderator or administrator identity", () => {
    expect(text()).not.toContain(moderator.id);
    for (const key of ["decided_by", "overridden_by", "original_actor", "same_admin", "resolved_by"]) expect(text()).not.toContain(`"${key}"`);
  });

  it("who follows them, and other people's ids", () => {
    expect(text()).not.toContain(other.id);
    expect(head.following.strategists).toHaveLength(1);
  });

  it("moderation flags and the soft undeclared-AI signal", () => {
    expect(text()).not.toContain("FLAG-DETAILS-SECRET");
    expect(text()).not.toContain("SOFT-FLAG-SIGNAL");
    expect(text()).not.toContain("undeclared");
  });

  it("someone else's privacy requests", () => {
    expect(text()).not.toContain("NOT-MINE");
  });

  it("the unsubscribe token", () => {
    expect(text()).not.toContain("unsubscribe_token");
  });
});
