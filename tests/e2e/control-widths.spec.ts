import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser } from "@playwright/test";
import { collectControls, offenceReasons } from "../../scripts/lib/control-audit";
import { loadTestEnv } from "../test-env";

// From 640px up no button, input, select, textarea or option card may stretch across the page (the same limits and the same
// measuring code as scripts/control-widths.ts): buttons at most 20rem and no wider than their label plus 3rem, inputs and
// selects 36rem, textareas 56rem, option cards 36rem. Header, dialogs and tables are exempt. A sample of pages is checked.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const slug = `e2e-ctl-${randomUUID().slice(0, 8)}`;
const email = `ctl-${randomUUID()}@example.test`;
let userId = "";
let campaignId = "";
let storageState: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  const code = `TGS-CTL-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" },
  });
  if (error) throw error;
  userId = data.user.id;
  await service.from("profiles").update({ handle: `CTL_${randomUUID().replace(/-/g, "").slice(0, 8)}` }).eq("id", userId);
  const now = Date.now();
  const camp = await service
    .from("campaigns")
    .insert({
      slug,
      title: "Should libraries open on Sundays?",
      summary: "An end-to-end test Campaign.",
      rules: "Be civil.",
      category: "education",
      status: "open",
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 3 * 86_400_000).toISOString(),
      opinion_not_advice: false,
    })
    .select("id")
    .single();
  if (camp.error) throw camp.error;
  campaignId = camp.data.id;
  // Sign in once and reuse the session (separate sign-ins hit the sign-in rate limit).
  const context = await browser.newContext({ baseURL: env.siteUrl });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  storageState = await context.storageState();
  await context.close();
});

test.afterAll(async () => {
  await service.from("dispatches").delete().eq("campaign_id", campaignId);
  await service.from("campaigns").delete().eq("id", campaignId);
  if (userId) await service.auth.admin.deleteUser(userId);
});

const OUT = ["/login", "/signup", "/forgot-password", "/privacy/contact", "/search?q=nothing-here"];
const MEMBER = ["/profile", "/profile/email", "/privacy/contact"];

for (const width of [768, 1280, 1920]) {
  test(`at ${width}px no control on the sampled pages stretches (signed out)`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width, height: 1000 } });
    const page = await context.newPage();
    for (const path of OUT) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      const controls = await collectControls(page);
      expect(controls.length, `${path}: some controls found`).toBeGreaterThan(0);
      const bad = controls.filter((c) => offenceReasons(c).length).map((c) => `${path} ${c.kind} "${c.label}" ${c.width}px (${offenceReasons(c).join("; ")})`);
      expect(bad, bad.join("\n")).toEqual([]);
    }
    await context.close();
  });

  test(`at ${width}px no control on the sampled pages stretches (signed in: Account, Campaign composer)`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width, height: 1000 }, storageState });
    const page = await context.newPage();
    for (const path of [...MEMBER, `/campaigns/${slug}`]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      const controls = await collectControls(page);
      expect(controls.length, `${path}: some controls found`).toBeGreaterThan(0);
      const bad = controls.filter((c) => offenceReasons(c).length).map((c) => `${path} ${c.kind} "${c.label}" ${c.width}px (${offenceReasons(c).join("; ")})`);
      expect(bad, bad.join("\n")).toEqual([]);
    }
    await context.close();
  });
}

test("below 640px controls still fill the width (phones are unchanged)", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto("/login");
  const signIn = page.getByRole("button", { name: "Sign in", exact: true });
  const field = page.getByLabel("Email address");
  const sw = (await signIn.boundingBox())!.width;
  const fw = (await field.boundingBox())!.width;
  expect(Math.abs(sw - fw), "Sign in button is as wide as the field on a phone").toBeLessThanOrEqual(1);
  expect(sw).toBeGreaterThan(300);
  await context.close();
});
