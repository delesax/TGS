import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "./fixtures";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// The position form (radio cards, consent notice and the Record button) stops at 36rem on wide screens, so it does not
// stretch across a 1600px page. On phones it is still the full width of the page.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const slug = `e2e-pos-${randomUUID().slice(0, 8)}`;
let userId = "";
let campaignId = "";
let storageState: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;
const email = `pos-${randomUUID()}@example.test`;

test.beforeAll(async () => {
  const code = `TGS-POS-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" },
  });
  if (error) throw error;
  userId = data.user.id;
  await service.from("profiles").update({ handle: `POS_${randomUUID().replace(/-/g, "").slice(0, 8)}` }).eq("id", userId);
  const now = Date.now();
  const camp = await service
    .from("campaigns")
    .insert({
      slug,
      title: "Should libraries open on Sundays?",
      summary: "An end-to-end test Campaign.",
      rules: "Be civil.",
      category: "education",
      status: "scheduled",
      starts_at: new Date(now + 86_400_000).toISOString(),
      ends_at: new Date(now + 4 * 86_400_000).toISOString(),
      opinion_not_advice: false,
    })
    .select("id")
    .single();
  if (camp.error) throw camp.error;
  campaignId = camp.data.id;
});

// Sign in once and reuse the session, so the tests stay clear of the sign-in rate limit.
test.beforeAll(async ({ browser }: { browser: Browser }) => {
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
  await service.from("campaign_positions").delete().eq("campaign_id", campaignId);
  await service.from("campaigns").delete().eq("id", campaignId);
  if (userId) await service.auth.admin.deleteUser(userId);
});

/** Widths of the form parts, in px, plus 36rem in px for the page's current text size. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector('form[aria-label^="Where do you stand"]') as HTMLElement;
    const w = (el: Element | null) => (el ? el.getBoundingClientRect().width : 0);
    const submit = form.querySelector('button[type="submit"]');
    const notice = form.querySelector("div.bg-accent");
    const cards = Array.from(form.querySelectorAll(".option-card"));
    return {
      remPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
      form: w(form),
      parent: w(form.parentElement) - parseFloat(getComputedStyle(form.parentElement!).paddingLeft) - parseFloat(getComputedStyle(form.parentElement!).paddingRight),
      submit: w(submit),
      notice: w(notice),
      cards: cards.map(w),
      right: Math.max(form.getBoundingClientRect().right, ...cards.map((c) => c.getBoundingClientRect().right)),
    };
  });
}

for (const size of ["default", "large"] as const) {
  for (const width of [375, 768, 1280, 1920]) {
    test(`position form at ${width}px, ${size} text: capped at 36rem on wide screens, full width on phones, nothing overflows`, async ({ browser }) => {
      const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width, height: 1000 }, storageState });
      await context.addInitScript((value) => window.localStorage.setItem("tgs-display", value), JSON.stringify({ v: 2, font: "atkinson", size }));
      const page = await context.newPage();
      await page.goto(`/campaigns/${slug}`);
      await expect(page.getByRole("form", { name: "Where do you stand before the debate?" })).toBeVisible();

      const m = await measure(page);
      const cap = 36 * m.remPx;
      expect(m.cards.length).toBe(3);
      if (width < 640) {
        // Phones: unchanged, the whole width of the page.
        expect(Math.abs(m.form - m.parent), "form fills the page on phones").toBeLessThanOrEqual(1);
        expect(Math.abs(m.submit - m.parent), "button fills the page on phones").toBeLessThanOrEqual(1);
      } else {
        expect(m.form, "form width").toBeLessThanOrEqual(cap + 0.5);
        expect(m.submit, "Record button width").toBeLessThanOrEqual(cap + 0.5);
        expect(m.notice, "consent notice width").toBeLessThanOrEqual(cap + 0.5);
        for (const c of m.cards) expect(c, "radio card width").toBeLessThanOrEqual(cap + 0.5);
        if (width >= 1280) expect(m.form, "form is capped, not merely narrow").toBeLessThan(m.parent);
      }
      expect(m.right).toBeLessThanOrEqual(width);
      await expectNoHorizontalOverflow(page);

      // Error state: nothing chosen.
      await page.getByRole("button", { name: "Record my position" }).click();
      await expect(page.getByText("Choose For, Against or Undecided.").first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      const afterError = await measure(page);
      if (width >= 640) expect(afterError.form).toBeLessThanOrEqual(cap + 0.5);

      await context.close();
    });
  }
}

test("saved state and the Clear my position button stay inside the cap at 1280px", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 1280, height: 1000 }, storageState });
  const page = await context.newPage();
  await page.goto(`/campaigns/${slug}`);
  await expect(page.getByRole("form", { name: "Where do you stand before the debate?" })).toBeVisible();
  await page.getByRole("radio", { name: "For", exact: true }).check();
  await page.getByLabel("I agree to you recording my position on Campaigns.").check();
  await page.getByRole("button", { name: "Record my position" }).click();
  await expect(page.getByText("Your starting position has been recorded.")).toBeVisible();
  const change = page.getByRole("button", { name: "Change my position" });
  const clear = page.getByRole("button", { name: "Clear my position" });
  await expect(change).toBeVisible();
  const cap = 36 * (await measure(page)).remPx;
  expect((await change.boundingBox())!.width).toBeLessThanOrEqual(cap + 0.5);
  const clearWidth = (await clear.boundingBox())!.width;
  expect(clearWidth, "Clear my position is as wide as its text, not the form").toBeLessThan(cap / 2);
  await expectNoHorizontalOverflow(page);
  await clear.click();
  // The form re-renders without a position: no Clear button, the Record button is back.
  await expect(page.getByRole("button", { name: "Record my position" })).toBeVisible();
  await expect(clear).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await context.close();
});
