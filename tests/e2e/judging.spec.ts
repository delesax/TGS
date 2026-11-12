import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// Sprint 5 at 375px: a judge scores and submits, a participant votes, an admin
// computes a draft (which needs attention: nobody recorded positions), overrides
// the weights with a reason, publishes; a visitor reads the Verdict; a
// participant appeals. AI rubric scores are stored directly (no AI call).

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const userIds: string[] = [];
const slug = `e2e-judging-${randomUUID().slice(0, 8)}`;
let campaignId = "";

async function makeStrategist(prefix: string, admin = false) {
  const code = `TGS-${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const email = `${prefix.toLowerCase()}-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    app_metadata: admin ? { role: "admin" } : {},
  });
  if (error) throw error;
  userIds.push(data.user.id);
  const handle = `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  await service.from("profiles").update({ handle }).eq("id", data.user.id);
  return { id: data.user.id, email, handle };
}

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your Dossier" })).toBeVisible();
  return page;
}

test.afterAll(async () => {
  await service.from("awards").delete().eq("campaign_id", campaignId);
  await service.from("dispatches").delete().eq("campaign_id", campaignId);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await service.from("profiles").delete().in("id", userIds);
  await service.from("campaigns").delete().eq("id", campaignId);
});

test("a closed Campaign is judged, published with an audit trail, read by a visitor and appealed", async ({ browser }) => {
  test.setTimeout(120_000);
  const now = Date.now();
  const { data: campaign, error } = await service
    .from("campaigns")
    .insert({ slug, title: "Should libraries open on Sundays?", category: "education", status: "open", starts_at: new Date(now - 600_000).toISOString(), ends_at: new Date(now + 600_000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  campaignId = campaign.id;

  const [ann, ben, judge, admin] = [await makeStrategist("ANN"), await makeStrategist("BEN"), await makeStrategist("JUDGE"), await makeStrategist("ADMIN", true)];
  const dispatchIds: string[] = [];
  for (const [author, body] of [
    [ann, "Libraries should open on Sundays because that is when working families are free, and footfall data from pilot towns rose."],
    [ben, "Sunday opening costs staff overtime. However, I accept the access point; a rota of volunteers could cover it."],
  ] as const) {
    const { data, error: e } = await service.from("dispatches").insert({ campaign_id: campaignId, author_id: author.id, kind: "argument", body, ai_use: "none", moderation_status: "visible" }).select("id").single();
    if (e) throw e;
    dispatchIds.push(data.id);
  }
  await service.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", campaignId);
  await service.from("judge_assignments").insert({ campaign_id: campaignId, judge_id: judge.id });

  // The judge scores both Dispatches, saves a draft, then submits.
  const judgePage = await signIn(browser, judge.email);
  await judgePage.goto("/judging");
  await judgePage.getByRole("link", { name: "Score the Dispatches" }).click();
  await expect(judgePage.getByRole("heading", { level: 1, name: /^Score:/ })).toBeVisible();
  const items = judgePage.getByRole("form", { name: "Panel scores" }).getByRole("listitem");
  for (let i = 0; i < 2; i++) {
    for (const [criterion, n] of [["Logic", 4], ["Evidence", 3], ["Originality", 3], ["Responsiveness", i === 0 ? 2 : 5]] as const) {
      await items.nth(i).getByRole("group", { name: criterion }).getByText(String(n), { exact: true }).click();
    }
  }
  await expectNoHorizontalOverflow(judgePage);
  await judgePage.getByRole("button", { name: "Save draft" }).click();
  await expect(judgePage.getByText(/Draft saved \(2 Dispatches scored\)/)).toBeVisible();
  await judgePage.getByLabel(/I have scored every Dispatch/).check();
  await judgePage.getByRole("button", { name: "Submit and lock my scores" }).click();
  await expect(judgePage.getByText(/Submitted\. Your scores are locked/)).toBeVisible();

  // A participant votes for the other Dispatch; their own has no controls.
  const annPage = await signIn(browser, ann.email);
  await annPage.goto(`/campaigns/${slug}/vote`);
  await expect(annPage.getByText("Your Dispatch: you cannot vote for or pick it.")).toBeVisible();
  await annPage.getByRole("button", { name: "Vote for this Dispatch" }).click();
  await expect(annPage.getByText(/Vote saved\. 4 votes left\./)).toBeVisible();
  await expectNoHorizontalOverflow(annPage);

  // AI rubric scores, stored as the processor would (no AI call in tests).
  for (const [i, id] of dispatchIds.entries()) {
    await service.rpc("store_rubric_score", {
      p_dispatch_id: id,
      p_result: { provider: "fake", model: "test-model", prompt_version: "judge-rubric.v1", logic: 3 + i, evidence: 3, originality: 3, responsiveness: 3 + i, rationale: "Test score." },
    });
  }
  // Voting closes: move the close back past the peer window.
  await service.from("campaigns").update({ starts_at: new Date(Date.now() - 100 * 3_600_000).toISOString(), ends_at: new Date(Date.now() - 80 * 3_600_000).toISOString() }).eq("id", campaignId);

  // The admin computes a draft: it needs attention, because nobody recorded positions.
  const adminPage = await signIn(browser, admin.email);
  await adminPage.goto(`/admin/judging/${campaignId}`);
  await adminPage.getByRole("button", { name: "Compute the draft" }).click();
  await expect(adminPage.getByText(/It needs attention/)).toBeVisible();
  await adminPage.reload();
  await expect(adminPage.getByText("Needs attention before it can be published")).toBeVisible();
  await expect(adminPage.getByRole("note").getByText(/Nobody recorded both a before and an after position/)).toBeVisible();
  await expect(adminPage.getByRole("button", { name: "Publish the Verdict" })).toHaveCount(0);

  // Override: mind-change 0, with a reason. Never reweighted silently.
  const recompute = adminPage.getByRole("form", { name: "Recompute the draft" });
  await recompute.getByLabel("Override the weights for this Verdict only").check();
  await recompute.getByLabel("Panel (%)").fill("50");
  await recompute.getByLabel("Mind-change (%)").fill("0");
  await recompute.getByLabel(/Reason for overriding/).fill("No positions were recorded in this test Campaign.");
  await recompute.getByRole("button", { name: "Recompute the draft" }).click();
  await expect(adminPage.getByText(/New draft computed\. Review it below, then publish\./)).toBeVisible();
  await adminPage.reload();
  await expect(adminPage.getByText(/Set by an admin for this Verdict: No positions were recorded/)).toBeVisible();
  await expectNoHorizontalOverflow(adminPage);
  await adminPage.getByLabel(/I have reviewed the scores, awards and rationale/).check();
  await adminPage.getByRole("button", { name: "Publish the Verdict" }).click();
  await expect(adminPage.getByText(/Published\. Awards are issued/)).toBeVisible();

  const { data: audit } = await service.from("audit_log").select("action").eq("details->>campaign_id", campaignId).in("action", ["panel.submitted", "verdict.computed", "verdict.published"]);
  expect(new Set(audit!.map((a) => a.action))).toEqual(new Set(["panel.submitted", "verdict.computed", "verdict.published"]));

  // A visitor reads the Verdict, its rationale, awards, breakdown and appeal route.
  const visitor = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await visitor.goto(`/campaigns/${slug}/verdict`);
  await expect(visitor.getByRole("heading", { name: "Grand Strategist" })).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Why" })).toBeVisible();
  await expect(visitor.getByRole("list", { name: "Scores by Strategist" })).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Sign in to appeal" })).toBeVisible();
  await expectNoHorizontalOverflow(visitor);
  await visitor.goto("/leaderboard");
  await expect(visitor.getByRole("heading", { level: 1, name: "Leaderboard" })).toBeVisible();

  // A participant appeals.
  await benAppeals(browser, ben.email);
});

async function benAppeals(browser: Browser, email: string) {
  const page = await signIn(browser, email);
  await page.goto(`/campaigns/${slug}/verdict`);
  await page.getByLabel("Why do you think the Verdict is wrong?").fill("The panel under-scored my point about volunteers.");
  await page.getByRole("button", { name: "Send my appeal" }).click();
  await expect(page.getByText(/Your appeal has been sent/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/This Verdict is under appeal/)).toBeVisible();
}
