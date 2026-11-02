import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { toUkInputValue } from "../../src/lib/campaigns";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const userIds: string[] = [];
const slug = `e2e-${randomUUID().slice(0, 8)}`;

async function makeUser(prefix: string, admin = false) {
  const code = `TGS-${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const email = `${prefix.toLowerCase()}-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true },
    app_metadata: admin ? { role: "admin" } : {},
  });
  if (error) throw error;
  userIds.push(data.user.id);
  await service.from("profiles").update({ handle: `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 10)}` }).eq("id", data.user.id);
  return email;
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your Dossier" })).toBeVisible();
}

test.afterAll(async () => {
  await service.from("campaigns").delete().eq("slug", slug);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
});

test("an admin creates a Campaign; a Strategist sees it, records a before position and sees the countdown", async ({ browser }) => {
  const adminEmail = await makeUser("ADM", true);
  const strategistEmail = await makeUser("STR");

  // Opens in 3 hours, closes in 3 days, with two rounds. Whole minutes, UK time.
  const minute = 60_000;
  const start = Math.ceil((Date.now() + 3 * 60 * minute) / minute) * minute;
  const mid = start + 36 * 60 * minute;
  const end = start + 72 * 60 * minute;
  const uk = (ms: number) => toUkInputValue(new Date(ms).toISOString());

  // --- Admin ---
  const adminPage = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await signIn(adminPage, adminEmail);
  await adminPage.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Campaigns" }).click();
  await adminPage.getByRole("link", { name: "Create a Campaign" }).click();
  await expect(adminPage.getByRole("heading", { level: 1, name: "Create a Campaign" })).toBeVisible();

  // A mistake is explained in plain English and nothing typed is lost.
  await adminPage.getByLabel("Title (the question)").fill("Should e2e tests run on every change?");
  await adminPage.getByLabel("Web address").fill(slug);
  await adminPage.getByRole("button", { name: "Save Campaign" }).click();
  await expect(adminPage.getByRole("alert").filter({ hasText: "Please check the highlighted answers." })).toBeVisible();
  await expect(adminPage.getByText("Write a short summary")).toBeVisible();
  await expect(adminPage.getByLabel("Title (the question)")).toHaveValue("Should e2e tests run on every change?");

  await adminPage.getByLabel("Summary").fill("A Campaign created by the Playwright test.");
  await adminPage.getByLabel("Rules (optional)").fill("Be civil.");
  await adminPage.getByLabel("Category").selectOption("technology");
  await adminPage.getByLabel("Format").selectOption("oxford");
  await adminPage.getByLabel("Opens").fill(uk(start));
  await adminPage.getByLabel("Closes").fill(uk(end));
  await adminPage.getByLabel("Round 1 name").fill("Opening arguments");
  await adminPage.getByLabel("Round 1 starts").fill(uk(start));
  await adminPage.getByLabel("Round 1 deadline").fill(uk(mid));
  await adminPage.getByLabel("Round 2 name").fill("Rebuttals");
  await adminPage.getByLabel("Round 2 starts").fill(uk(mid));
  await adminPage.getByLabel("Round 2 deadline").fill(uk(end));
  await adminPage.getByLabel(/opinion, not advice/).check();
  await adminPage.getByLabel("Publish").selectOption("scheduled");
  await adminPage.getByRole("button", { name: "Save Campaign" }).click();
  await expect(adminPage.getByRole("heading", { level: 1, name: "Edit Campaign" })).toBeVisible();
  await expect(adminPage.getByText("Saved. The change has been recorded in the audit log.")).toBeVisible();

  const { data: saved } = await service.from("campaigns").select("id, starts_at, ends_at").eq("slug", slug).single();
  expect(Date.parse(saved!.starts_at)).toBe(start);
  const { data: log } = await service.from("audit_log").select("action").eq("target_id", saved!.id);
  expect(log!.map((l) => l.action)).toContain("campaign.created");

  // --- Strategist ---
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await signIn(page, strategistEmail);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Campaigns" }).click();
  const soon = page.getByRole("region", { name: "Opening soon" });
  await soon.getByRole("link", { name: "Should e2e tests run on every change?" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Should e2e tests run on every change?" })).toBeVisible();
  await expect(page.getByText("Opinion, not advice.")).toBeVisible();
  await expect(page.getByText("Round 1: Opening arguments")).toBeVisible();
  await expect(page.getByText("Dispatches open when the Campaign opens")).toBeVisible();

  // Sprint 2 carry-over: the Campaign page's buttons fit at 375px.
  await expectNoHorizontalOverflow(page);

  // The countdown is computed from the server's clock and ticks.
  const clock = page.getByTestId("campaign-countdown").locator("[data-seconds-left]");
  const first = Number(await clock.getAttribute("data-seconds-left"));
  expect(Math.abs(first - (start - Date.now()) / 1000)).toBeLessThan(10);
  await expect.poll(async () => Number(await clock.getAttribute("data-seconds-left")), { timeout: 5000 }).toBeLessThan(first);
  await expect(page.getByRole("status").filter({ hasText: /^Opens in: 3 hours( 10 minutes)? or less\.$/ })).toBeAttached();

  // Record a before position.
  await page.getByRole("button", { name: "Record my position" }).click();
  await expect(page.getByText("Choose For, Against or Undecided.").first()).toBeVisible();
  await page.getByLabel("Against").check();
  await page.getByRole("button", { name: "Record my position" }).click();
  await expect(page.getByText("Your starting position has been recorded.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Against")).toBeChecked();
  await expect(page.getByRole("button", { name: "Change my position" })).toBeVisible();

  // Non-admins cannot reach the admin pages.
  await page.goto("/admin/campaigns/new");
  await expect(page.getByRole("heading", { level: 1, name: "Create a Campaign" })).toHaveCount(0);

  // Carry-over from Sprint 1: /profile opened directly by URL loads fully.
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);

  await expectNoHorizontalOverflow(page);
});
