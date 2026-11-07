import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyScreening, createCampaign, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Part 4D(b): deleting an account removes every copy of the handle, not only the profile row.

let gone: TestUser; // will be anonymised
let reader: TestUser;
let campaignId: string;
let handle: string;
let dispatchId: string;

beforeAll(async () => {
  [gone, reader] = await Promise.all([createUser({ handle: `Zed_${Date.now().toString(36)}` }), createUser()]);
  handle = (await service.from("profiles").select("handle").eq("id", gone.id).single()).data!.handle as string;
  campaignId = await createCampaign();
  await service.from("community_settings").update({ cooldown_seconds: 0 }).eq("id", true);
  const { data } = await gone.client.rpc("post_dispatch", { p_campaign_id: campaignId, p_kind: "argument", p_body: "Kept in the debate record.", p_ai_use: "none" });
  dispatchId = data as string;
  await applyScreening(dispatchId);
});

afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30 }).eq("id", true);
  await deleteUsers([reader]);
  await service.from("awards").delete().eq("campaign_id", campaignId);
  await service.from("dispatches").delete().eq("author_id", gone.id);
  await service.from("profiles").delete().eq("id", gone.id);
  await service.from("campaigns").delete().eq("id", campaignId);
});

describe("anonymise_profile() scrubs the handle from text copies", () => {
  it("replaces it in award rationales, decisions, flags, appeals, reports and other people's queued emails, and leaves look-alikes alone", async () => {
    await service.from("awards").insert({ campaign_id: campaignId, profile_id: gone.id, category: "grand_strategist", rationale: `@${handle} made the clearest case. ${handle.toLowerCase()} also rebutted well. ${handle}x is someone else.` });
    const { data: decision } = await service
      .from("ai_decisions")
      .insert({ subject_type: "dispatch", subject_id: dispatchId, user_id: gone.id, model: "test", prompt_version: "t", outcome: "allow", reason: `Fine. Written by ${handle}.` })
      .select("id")
      .single();
    const { data: flag } = await service
      .from("moderation_flags")
      .insert({ kind: "held_handle", user_id: gone.id, details: { handle }, status: "resolved", resolution: "released", resolution_reason: `Checked ${handle}, fine.`, resolved_at: new Date().toISOString() })
      .select("id")
      .single();
    await service.from("dispatch_reports").insert({ dispatch_id: dispatchId, reporter_id: reader.id, reason: "other", details: `This is by @${handle} and is rude.` });
    await service.from("dispatch_appeals").insert({
      dispatch_id: dispatchId,
      author_id: gone.id,
      reason: "Please look again.",
      original_status: "held",
      status: "rejected",
      decided_at: new Date().toISOString(),
      decision_reason: `Upheld the hold on ${handle}'s Dispatch.`,
    });
    await service.from("email_outbox").insert({
      user_id: reader.id,
      kind: "reply",
      payload: { dispatch_id: dispatchId, campaign_slug: "x", campaign_title: "T", replier_handle: handle, excerpt: "hello" },
      dedupe_key: `scrub-test-${handle}`,
    });

    const { data: summary, error } = await service.rpc("anonymise_profile", { p_user_id: gone.id, p_via: "test" });
    expect(error).toBeNull();
    expect((summary as { text_copies_scrubbed: number }).text_copies_scrubbed).toBeGreaterThanOrEqual(6);

    const { data: award } = await service.from("awards").select("rationale").eq("campaign_id", campaignId).single();
    expect(award!.rationale).toBe(`a deleted Strategist made the clearest case. a deleted Strategist also rebutted well. ${handle}x is someone else.`);
    expect((await service.from("ai_decisions").select("reason").eq("id", decision!.id).single()).data!.reason).toBe("Fine. Written by a deleted Strategist.");
    const { data: f } = await service.from("moderation_flags").select("details, resolution_reason").eq("id", flag!.id).single();
    expect(f).toEqual({ details: {}, resolution_reason: "Checked a deleted Strategist, fine." });
    expect((await service.from("dispatch_reports").select("details").eq("dispatch_id", dispatchId).single()).data!.details).toBe("This is by a deleted Strategist and is rude.");
    expect((await service.from("dispatch_appeals").select("decision_reason").eq("dispatch_id", dispatchId).single()).data!.decision_reason).toBe("Upheld the hold on a deleted Strategist's Dispatch.");
    const { data: mail } = await service.from("email_outbox").select("payload").eq("dedupe_key", `scrub-test-${handle}`).single();
    expect((mail!.payload as { replier_handle: string }).replier_handle).toBe("a deleted Strategist");
    // The Dispatch itself stays.
    expect((await service.from("dispatches").select("body").eq("id", dispatchId).single()).data!.body).toBe("Kept in the debate record.");
  });

  it("archives positions only for people who consented, and clears the consent", async () => {
    const consenter = await createUser();
    const never = await createUser({ positionsConsent: false });
    const closing = await createCampaign();
    try {
      await consenter.client.from("campaign_positions").insert({ campaign_id: closing, user_id: consenter.id, after_position: "for" });
      await service.from("campaign_positions").insert({ campaign_id: closing, user_id: never.id, after_position: "against" });
      await service.from("campaigns").update({ status: "closed", starts_at: new Date(Date.now() - 7_200_000).toISOString(), ends_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", closing);
      await service.rpc("anonymise_profile", { p_user_id: consenter.id, p_via: "test" });
      await service.rpc("anonymise_profile", { p_user_id: never.id, p_via: "test" });
      const { data } = await service.from("anonymous_positions").select("after_position").eq("campaign_id", closing);
      expect(data).toEqual([{ after_position: "for" }]);
      const { data: p } = await service.from("profiles").select("positions_consent_at").eq("id", consenter.id).single();
      expect(p!.positions_consent_at).toBeNull();
    } finally {
      await service.from("profiles").delete().in("id", [consenter.id, never.id]);
      await deleteUsers([consenter, never]).catch(() => undefined);
      await service.from("campaigns").delete().eq("id", closing);
    }
  });
});
