import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "./fixtures";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// The admin-only Campaign draft helper, at 375px, with the fake AI provider (the real API is never called). It saves nothing.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const userIds: string[] = [];
const campaignIds: string[] = [];

const NOTES = [
  "The Example Council announced a plan on 12 March 2026 to close three libraries by 1 April 2027.",
  'A spokesperson said "the plan will save £2.4 million a year" in a written statement.',
  "Supporters argue the money is better spent on social care. Critics argue the libraries serve people with nowhere else to go.",
  "A public consultation closes on 30 June 2026 and a council vote is expected in September 2026. See https://example.org/report for the full text.",
].join("\n");

async function person(prefix: string, admin: boolean) {
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

async function campaign() {
  const { data, error } = await service
    .from("campaigns")
    .insert({ slug: `e2e-helper-${randomUUID().slice(0, 8)}`, title: "Should the Example Council close three libraries?", summary: "Existing summary.", rules: "Existing rules.", category: "education", status: "draft", starts_at: new Date(Date.now() + 86_400_000).toISOString(), ends_at: new Date(Date.now() + 8 * 86_400_000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  campaignIds.push(data.id);
  return data.id as string;
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

const calls = async () => {
  const { data } = await service.from("ai_usage").select("calls").eq("feature", "judge_rationale");
  return (data ?? []).reduce((n, r) => n + (r.calls as number), 0);
};

test.afterAll(async () => {
  await service.from("community_settings").update({ ai_enabled: true }).eq("id", true);
  await service.from("campaigns").delete().in("id", campaignIds);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await service.from("profiles").delete().in("id", userIds);
});

test("an admin pastes notes and gets a labelled draft, a fact-check table, re-check dates and rules; nothing is saved to the Campaign", async ({ browser }) => {
  test.setTimeout(90_000);
  const id = await campaign();
  const admin = await person("HELP", true);
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await signIn(page, admin.email);

  // The Edit Campaign page links to it.
  await page.goto(`/admin/campaigns/${id}`);
  await page.getByRole("link", { name: "Draft text with AI" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Campaign draft helper" })).toBeVisible();
  await expect(page.getByText("AI draft - verify every fact.", { exact: false }).first()).toBeVisible();

  // The rules are there at once, from the live limits, with their character count and no AI call.
  const rules = page.getByRole("textbox", { name: "Rules text" });
  await expect(rules).toHaveValue(/An Argument can be up to 1,500 characters\. A Rebuttal can be up to 1,000 characters\. Evidence can be up to 600 characters\./);
  await expect(rules).toHaveValue(/You can post up to 10 Dispatches in this Campaign\./);
  await expect(rules).toHaveValue(/30 seconds after your last Dispatch, and you can edit a Dispatch for 5 minutes/);
  await expect(page.getByText(/[\d,]+ of 10,000 characters/)).toBeVisible();

  const before = await calls();
  await page.getByRole("textbox", { name: "Source notes" }).fill(NOTES);
  await expect(page.getByText(`${NOTES.length.toLocaleString("en-GB")} of 12,000 characters`)).toBeVisible();
  await page.getByRole("button", { name: "Draft summary, fact-check table and dates" }).click();
  await expect(page.getByText("Draft ready below. Verify every fact before using any of it.")).toBeVisible();

  // Every output is labelled; the summary has its count; the table says "unverified"; the dates are plain lines.
  await expect(page.locator("section").filter({ hasText: "AI draft - verify every fact" })).toHaveCount(4); // summary, table, dates, rules
  const summary = page.getByRole("textbox", { name: "Draft public summary" });
  await expect(summary).toHaveValue(/Example Council/);
  expect(await summary.inputValue()).not.toContain("example.org"); // a link in the notes is never followed or repeated
  await expect(page.getByText(/[\d,]+ of 2,000 characters/)).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["Claim", "Source line", "Exact quote", "Status"]);
  const rows = table.getByRole("row").filter({ has: page.getByRole("cell") });
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) await expect(row.getByRole("cell").last()).toContainText("unverified");
  await expect(page.getByRole("textbox", { name: "Re-check by dates" })).toHaveValue(/Re-check by 12 March 2026/);
  await expectNoHorizontalOverflow(page);

  // One AI call, counted under judge_rationale, and nothing written to the Campaign.
  expect(await calls()).toBe(before + 1);
  const { data: c } = await service.from("campaigns").select("summary, rules, status").eq("id", id).single();
  expect(c).toEqual({ summary: "Existing summary.", rules: "Existing rules.", status: "draft" });
  await context.close();
});

test("a Strategist who is not an admin cannot open it", async ({ browser }) => {
  const id = await campaign();
  const member = await person("MEMB", false);
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await signIn(page, member.email);
  await page.goto(`/admin/campaigns/${id}/draft-helper`);
  await expect(page.getByRole("heading", { level: 1, name: "Campaign draft helper" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Source notes" })).toHaveCount(0);
  await context.close();
});

test("a draft that fails the checks shows nothing and says why; AI off is explained", async ({ browser }) => {
  test.setTimeout(90_000);
  const id = await campaign();
  const admin = await person("HELP", true);
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await signIn(page, admin.email);
  await page.goto(`/admin/campaigns/${id}/draft-helper`);

  await page.getByRole("textbox", { name: "Source notes" }).fill(`${NOTES}\n[[ai-invalid]]`);
  await page.getByRole("button", { name: "Draft summary, fact-check table and dates" }).click();
  await expect(page.getByText(/did not pass the checks/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Draft public summary" })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Source notes" }).fill("Too short.");
  await page.getByRole("button", { name: "Draft summary, fact-check table and dates" }).click();
  await expect(page.getByText("Paste at least 100 characters of notes.")).toBeVisible();

  await service.from("community_settings").update({ ai_enabled: false }).eq("id", true);
  await page.getByRole("textbox", { name: "Source notes" }).fill(NOTES);
  await page.getByRole("button", { name: "Draft summary, fact-check table and dates" }).click();
  await expect(page.getByText("AI is switched off in Settings.")).toBeVisible();
  await service.from("community_settings").update({ ai_enabled: true }).eq("id", true);
  await context.close();
});

test("the 11th draft in a day is refused, and nothing is sent", async ({ browser }) => {
  test.setTimeout(180_000);
  const id = await campaign();
  const admin = await person("HELP", true);
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await signIn(page, admin.email);
  await page.goto(`/admin/campaigns/${id}/draft-helper`);
  await page.getByRole("textbox", { name: "Source notes" }).fill(NOTES);
  const button = page.getByRole("button", { name: "Draft summary, fact-check table and dates" });
  for (let i = 1; i <= 10; i++) {
    await button.click();
    await expect(page.getByText("Draft ready below. Verify every fact before using any of it.")).toBeVisible();
    await expect(button).toBeEnabled();
    // Dismiss the message so the next success is a new one.
    const dismiss = page.getByRole("button", { name: /dismiss|close/i });
    if (await dismiss.count()) await dismiss.first().click();
  }
  const before = await calls();
  await button.click();
  await expect(page.getByText("You have used your 10 drafts for today.")).toBeVisible();
  expect(await calls()).toBe(before);
  await context.close();
});

test("no ai_usage, system_events, audit_log or ai_decisions row contains the notes, whether the draft passes or fails", async ({ browser }) => {
  test.setTimeout(90_000);
  const sentinel = `ZQXSENTINEL${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const id = await campaign();
  const admin = await person("HELP", true);
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await signIn(page, admin.email);
  await page.goto(`/admin/campaigns/${id}/draft-helper`);
  const button = page.getByRole("button", { name: "Draft summary, fact-check table and dates" });
  const notes = `${NOTES}\nReference code ${sentinel} is used in the file.`;

  await page.getByRole("textbox", { name: "Source notes" }).fill(notes);
  await button.click();
  await expect(page.getByText("Draft ready below. Verify every fact before using any of it.")).toBeVisible();
  await page.getByRole("textbox", { name: "Source notes" }).fill(`${notes}\n[[ai-invalid]]`);
  await button.click();
  await expect(page.getByText(/did not pass the checks/)).toBeVisible();

  for (const table of ["ai_usage", "system_events", "audit_log", "ai_decisions"]) {
    const { data, error } = await service.from(table).select("*").limit(5000);
    expect(error, table).toBeNull();
    expect(JSON.stringify(data ?? []), table).not.toContain(sentinel);
  }
  await context.close();
});
