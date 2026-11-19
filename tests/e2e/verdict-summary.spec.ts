import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "./fixtures";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// The winner's summary, admin flow at 375px, with the fake AI provider (the real API is never called):
// draft on demand, edit and approve, publish, remove with a reason, AI off, and nothing public until approved.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const userIds: string[] = [];
const campaignIds: string[] = [];

const SENTENCE =
  "For some Verdicts, an AI model drafts a short summary of the winner's own Dispatches. An admin reads and approves it before it is published, and it is labelled as AI-assisted. It does not affect scores or rankings.";

async function strategist(prefix: string, admin = false) {
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
  await service.from("profiles").update({ handle: `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 8)}` }).eq("id", data.user.id);
  return { id: data.user.id, email };
}

/** A closed Campaign with two Dispatches and a draft Verdict naming the first author. */
async function draftVerdict() {
  const slug = `e2e-summary-${randomUUID().slice(0, 8)}`;
  const now = Date.now();
  const { data: c, error } = await service
    .from("campaigns")
    .insert({ slug, title: "Should libraries open on Sundays?", category: "education", status: "open", starts_at: new Date(now - 600_000).toISOString(), ends_at: new Date(now + 600_000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  campaignIds.push(c.id);
  const ann = await strategist("ANN");
  const ben = await strategist("BEN");
  const admin = await strategist("ADMIN", true);
  for (const [author, body] of [
    [ann, "Libraries should open on Sundays because that is when working families are free. A 2023 council survey of 400 residents found demand was highest then, and a volunteer rota could cover the staff overtime."],
    [ben, "Sunday opening costs staff overtime, which the budget cannot absorb."],
  ] as const) {
    const { error: e } = await service.from("dispatches").insert({ campaign_id: c.id, author_id: author.id, kind: "argument", body, ai_use: "none", moderation_status: "visible" });
    if (e) throw e;
  }
  await service.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", c.id);
  const { data: v, error: ve } = await service.rpc("store_verdict_draft", {
    p_campaign_id: c.id,
    p_actor: admin.id,
    p_draft: {
      needs_attention: false,
      attention_reasons: [],
      weights_snapshot: { version: 1, panel: 40, peer: 25, ai_rubric: 25, mind_change: 10, source: "campaign" },
      component_scores: [],
      proposed_awards: [{ category: "grand_strategist", profile_id: ann.id, dispatch_id: null, rationale: `@{user:${ann.id}} had the highest final score.` }],
      winner_id: ann.id,
      rationale: `@{user:${ann.id}} is the Grand Strategist.`,
    },
  });
  if (ve) throw ve;
  return { campaignId: c.id, verdictId: v as string, ann, admin };
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.afterAll(async () => {
  if (process.env.KEEP_TEST_DATA) return; // leave the published Verdict in the local database for visual checks
  await service.from("community_settings").update({ ai_enabled: true }).eq("id", true);
  await service.from("awards").delete().in("campaign_id", campaignIds);
  await service.from("dispatches").delete().in("campaign_id", campaignIds);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await service.from("profiles").delete().in("id", userIds);
  await service.from("campaigns").delete().in("id", campaignIds);
});

test("the approved sentence is on the AI-use and privacy pages, word for word", async ({ page }) => {
  for (const path of ["/ai-use", "/privacy"]) {
    await page.goto(path);
    await expect(page.getByTestId("verdict-summary-sentence")).toHaveText(SENTENCE);
  }
});

test("an admin drafts on demand, edits and approves, publishes, and can remove it later; nothing is public until approved", async ({ browser }) => {
  test.setTimeout(120_000);
  const { campaignId, verdictId, admin } = await draftVerdict();
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await signIn(page, admin.email);
  await page.goto(`/admin/judging/${campaignId}`);

  // Nothing is drafted automatically, and nothing is approved.
  await expect(page.getByTestId("summary-none")).toBeVisible();
  await expect(page.getByTestId("publish-summary-status")).toContainText("none approved");
  expect((await service.from("verdict_summary_drafts").select("id").eq("verdict_id", verdictId)).data).toEqual([]);

  // Draft with AI (fake provider): a pending draft appears in the editable text area.
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect(page.getByText(/Draft summary ready below/)).toBeVisible();
  const text = page.getByLabel("AI draft (edit it if needed)");
  await expect(text).toBeVisible();
  const draft = await text.inputValue();
  expect(draft.split(/\s+/).length).toBeGreaterThanOrEqual(80);
  expect(draft).toContain("working families");
  // Still not approved, still nothing public.
  await expect(page.getByTestId("summary-none")).toBeVisible();
  expect((await service.from("verdicts").select("winner_summary").eq("id", verdictId).single()).data!.winner_summary).toBeNull();

  // Edit, choose the best Dispatch, confirm and approve.
  await text.fill(draft + " They also say a rota of volunteers could help.");
  await page.getByLabel(/Best Dispatch/).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Approve this summary" }).click();
  await expect(page.getByText("Tick the box to confirm.")).toBeVisible();
  await page.getByLabel(/I have read this summary against/).check();
  await page.getByRole("button", { name: "Approve this summary" }).click();
  await expect(page.getByText(/Summary approved\./)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("summary-approved")).toContainText("Summary drafted by AI from the winner's Dispatches and reviewed by an admin");
  await expect(page.getByTestId("summary-approved")).toContainText("Edited by an admin");
  await expect(page.getByTestId("publish-summary-status")).toContainText("approved");
  await expectNoHorizontalOverflow(page);

  // Publish: the approved text becomes public with the Verdict, and not before.
  const anon = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false } });
  expect((await anon.from("verdicts").select("winner_summary").eq("id", verdictId)).data).toEqual([]);
  await page.getByLabel(/I have reviewed the scores, awards and rationale/).check();
  await page.getByRole("button", { name: "Publish the Verdict" }).click();
  await expect(page.getByText(/Published\. Awards are issued/)).toBeVisible();
  const published = (await anon.from("verdicts").select("status, winner_summary, winner_summary_ai_assisted").eq("id", verdictId).single()).data!;
  expect(published.status).toBe("published");
  expect(published.winner_summary).toContain("working families");
  expect(published.winner_summary_ai_assisted).toBe(true);

  // The public Verdict page: "The winning case" sits directly under the Grand Strategist card and before "Why".
  const slug = (await service.from("campaigns").select("slug").eq("id", campaignId).single()).data!.slug as string;
  const pub = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
  const pubPage = await pub.newPage();
  await pubPage.goto(`/campaigns/${slug}/verdict`);
  const section = pubPage.getByTestId("winning-case");
  await expect(section).toBeVisible();
  await expect(section).toContainText("working families");
  await expect(pubPage.getByTestId("winning-case-label")).toHaveText("Summary drafted by AI from the winner's Dispatches and reviewed by an admin.");
  await expect(section.getByRole("link", { name: "Read the Dispatch" })).toHaveAttribute("href", new RegExp(`/campaigns/${slug}#dispatch-`));
  const order = await pubPage.evaluate(() => {
    const ids = ["winner-h", "winning-case-h", "rationale-h"].map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? -1);
    return ids[0] >= 0 && ids[0] < ids[1] && ids[1] < ids[2];
  });
  expect(order).toBe(true);
  // The Grand Strategist card is not repeated in the public Awards list.
  const awards = pubPage.locator("section[aria-labelledby='awards-h']");
  if (await awards.count()) await expect(awards.getByText("Grand Strategist", { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(pubPage);
  await pub.close();

  // After publication there is no approve or draft form, but removal is still possible, with a reason.
  await page.goto(`/admin/judging/${campaignId}`);
  await expect(page.getByRole("button", { name: "Approve this summary" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Draft with AI" })).toHaveCount(0);
  await page.locator("summary", { hasText: "Remove the summary" }).click();
  await page.getByLabel(/Reason \(kept in the audit log/).fill("too short");
  await page.getByRole("button", { name: "Remove the summary" }).click();
  await expect(page.getByText(/Give a reason of at least 10 characters/)).toBeVisible();
  await page.getByLabel(/Reason \(kept in the audit log/).fill("A figure in it is not in the Dispatch.");
  await page.getByRole("button", { name: "Remove the summary" }).click();
  await expect(page.getByTestId("summary-none")).toBeVisible(); // the page refreshes without the summary
  const after = (await anon.from("verdicts").select("status, winner_summary").eq("id", verdictId).single()).data!;
  expect(after).toEqual({ status: "published", winner_summary: null });
  expect((await service.from("verdict_summary_drafts").select("status").eq("verdict_id", verdictId)).data!.map((r) => r.status)).toEqual(["removed"]);
  const actions = (await service.from("audit_log").select("action").eq("target_id", verdictId).in("action", ["verdict.summary_drafted", "verdict.summary_approved", "verdict.summary_removed"])).data!.map((a) => a.action);
  expect(new Set(actions)).toEqual(new Set(["verdict.summary_drafted", "verdict.summary_approved", "verdict.summary_removed"]));
  await context.close();
});

test("a Verdict published without an approved summary shows none, and AI off or an unusable draft gives a clear message", async ({ browser }) => {
  test.setTimeout(120_000);
  const { campaignId, verdictId, admin } = await draftVerdict();
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await signIn(page, admin.email);
  await page.goto(`/admin/judging/${campaignId}`);

  // AI off: the button explains, no draft is stored.
  await service.from("community_settings").update({ ai_enabled: false }).eq("id", true);
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect(page.getByText("AI is switched off in Settings.")).toBeVisible();
  await service.from("community_settings").update({ ai_enabled: true }).eq("id", true);

  // A draft that fails the checks (the fake invents a quotation when a Dispatch asks it to) is discarded.
  await service.from("dispatches").update({ body: "Libraries should open on Sundays because families are free then, and the rota is cheap. [[summary-quote]]" }).eq("campaign_id", campaignId).like("body", "Libraries should%");
  await page.reload();
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect(page.getByText(/did not pass the checks/)).toBeVisible();
  expect((await service.from("verdict_summary_drafts").select("id").eq("verdict_id", verdictId)).data).toEqual([]);

  // Publishing without approving: nothing is shown.
  await page.getByLabel(/I have reviewed the scores, awards and rationale/).check();
  await page.getByRole("button", { name: "Publish the Verdict" }).click();
  await expect(page.getByText(/Published\. Awards are issued/)).toBeVisible();
  const row = (await service.from("verdicts").select("status, winner_summary").eq("id", verdictId).single()).data!;
  expect(row).toEqual({ status: "published", winner_summary: null });
  const slug2 = (await service.from("campaigns").select("slug").eq("id", campaignId).single()).data!.slug as string;
  await page.goto(`/campaigns/${slug2}/verdict`);
  await expect(page.getByRole("heading", { name: "Grand Strategist" }).first()).toBeVisible();
  await expect(page.getByTestId("winning-case")).toHaveCount(0); // no summary, nothing rendered
  await context.close();
});
