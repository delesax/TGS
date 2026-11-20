import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// Verdict page extras at 375px: per-criterion averages (aggregates only) and the anonymous before and after chart,
// which is suppressed under 10 members who recorded a position. Display only: no score or Verdict is changed.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const userIds: string[] = [];
const campaignIds: string[] = [];

async function strategist(prefix: string, opts: { admin?: boolean; consent?: boolean } = {}) {
  const code = `TGS-${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const { data, error } = await service.auth.admin.createUser({
    email: `${prefix.toLowerCase()}-${randomUUID()}@example.test`,
    password,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    app_metadata: opts.admin ? { role: "admin" } : {},
  });
  if (error) throw error;
  userIds.push(data.user.id);
  await service
    .from("profiles")
    .update({ handle: `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 8)}`, ...(opts.consent ? { positions_consent_at: new Date().toISOString(), positions_consent_version: "test" } : {}) })
    .eq("id", data.user.id);
  return data.user.id;
}

const c = (n: number) => ({ logic: n, evidence: n, originality: n, responsiveness: n });

/** A published Verdict whose panel has `judges` judges, plus `positions` members with a recorded before and after position. */
async function publishedVerdict(judges: number, positions: number) {
  const slug = `e2e-extras-${randomUUID().slice(0, 8)}`;
  const now = Date.now();
  const { data: camp, error } = await service
    .from("campaigns")
    .insert({ slug, title: "Should libraries open on Sundays?", category: "education", status: "scheduled", starts_at: new Date(now + 3_600_000).toISOString(), ends_at: new Date(now + 7_200_000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  campaignIds.push(camp.id);
  const ann = await strategist("ANN");
  const admin = await strategist("ADMIN", { admin: true });
  const { data: d, error: de } = await service
    .from("dispatches")
    .insert({ campaign_id: camp.id, author_id: ann, kind: "argument", body: "Libraries should open on Sundays because that is when working families are free to use them.", ai_use: "none", moderation_status: "visible" })
    .select("id")
    .single();
  if (de) throw de;
  const judgeIds: string[] = [];
  for (let i = 0; i < judges; i++) judgeIds.push(await strategist(`J${i}`));
  for (const j of judgeIds) await service.from("judge_assignments").insert({ campaign_id: camp.id, judge_id: j });
  // Different scores per judge, so an individual judge's score could be told apart if it leaked.
  const scores = [5, 3, 4, 2];
  for (const [i, j] of judgeIds.entries()) {
    const n = scores[i % scores.length];
    const { error: pe } = await service.from("panel_scores").insert({ campaign_id: camp.id, dispatch_id: d.id, judge_id: j, ...c(n) });
    if (pe) throw pe;
    await service.from("judge_assignments").update({ submitted_at: new Date().toISOString() }).eq("campaign_id", camp.id).eq("judge_id", j);
  }
  const { error: ae } = await service.from("ai_rubric_scores").insert({ campaign_id: camp.id, dispatch_id: d.id, provider: "fake", model: "fake", prompt_version: "test", ...c(4), rationale: "Clear." });
  if (ae) throw ae;
  const positionUsers: string[] = [];
  for (let i = 0; i < positions; i++) {
    const u = await strategist(`P${i}`, { consent: true });
    // The before position can only be recorded before the Campaign starts.
    const { error: pe } = await service.from("campaign_positions").insert({ campaign_id: camp.id, user_id: u, before_position: i % 2 ? "for" : "against" });
    if (pe) throw pe;
    positionUsers.push(u);
  }
  await service.from("campaigns").update({ status: "open", starts_at: new Date(now - 600_000).toISOString(), ends_at: new Date(now + 600_000).toISOString() }).eq("id", camp.id);
  for (const u of positionUsers) {
    const { error: pe } = await service.from("campaign_positions").update({ after_position: "for" }).eq("campaign_id", camp.id).eq("user_id", u);
    if (pe) throw pe;
  }
  await service.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", camp.id);
  const { data: v, error: ve } = await service.rpc("store_verdict_draft", {
    p_campaign_id: camp.id,
    p_actor: admin,
    p_draft: {
      needs_attention: false,
      attention_reasons: [],
      weights_snapshot: { version: 1, panel: 40, peer: 25, ai_rubric: 25, mind_change: 10, source: "campaign" },
      component_scores: [{ user_id: ann, rank: 1, dispatches: 1, components: { panel: 50, peer: 0, ai_rubric: 75, mind_change: 0 }, raw: { peer_weight: 0, voters: 0, mind_credits: 0 }, steelman_bonus: 0, steelman_dispatches: [], blended: 50, final: 50, first_dispatch_at: new Date().toISOString(), newcomer: false }],
      proposed_awards: [{ category: "grand_strategist", profile_id: ann, dispatch_id: null, rationale: `@{user:${ann}} had the highest final score.` }],
      winner_id: ann,
      rationale: `@{user:${ann}} is the Grand Strategist.`,
    },
  });
  if (ve) throw ve;
  const { error: ue } = await service.from("verdicts").update({ status: "published", published_at: new Date().toISOString(), appeal_closes_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", v as string);
  if (ue) throw ue;
  return slug;
}

test.afterAll(async () => {
  for (const id of campaignIds) {
    await service.from("dispatches").delete().eq("campaign_id", id);
    await service.from("verdicts").delete().eq("campaign_id", id);
  }
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await service.from("profiles").delete().in("id", userIds);
  for (const id of campaignIds) await service.from("campaigns").delete().eq("id", id);
});

test("criteria averages show with 3 judges and positions stay private under 10 members", async ({ page }) => {
  test.setTimeout(120_000);
  const slug = await publishedVerdict(3, 3);
  await page.goto(`/campaigns/${slug}/verdict`);
  const section = page.getByRole("region", { name: "Scores by criterion" });
  await expect(section).toBeVisible();
  // Panel (5, 3, 4) averages 4.0; the AI rubric scored 4.0. No individual judge's 5, 3 or 2 appears as a criterion score.
  await expect(section.getByText("4.0")).toHaveCount(8);
  await expect(section.getByText("5.0")).toHaveCount(0);
  await expect(section.getByText("3.0")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Did minds move?" })).toBeVisible();
  await expect(page.getByText(/Totals are shown only once at least 10 members/)).toBeVisible();
  await expect(page.getByText("Strategists recorded this.")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("panel averages are hidden with fewer than 3 judges; the chart shows at 10 members", async ({ page }) => {
  test.setTimeout(180_000);
  const slug = await publishedVerdict(2, 10);
  await page.goto(`/campaigns/${slug}/verdict`);
  const section = page.getByRole("region", { name: "Scores by criterion" });
  await expect(section.getByText(/shown only when at least 3 judges/)).toBeVisible();
  // AI rubric figures remain (4.0 x 4); the panel column shows dashes, never 5.0 or 3.0.
  await expect(section.getByText("4.0")).toHaveCount(4);
  await expect(section.getByText("5.0")).toHaveCount(0);
  await expect(page.getByText("10 Strategists recorded this.")).toHaveCount(2);
  await expect(page.getByText("For", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Totals are shown only once/)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
