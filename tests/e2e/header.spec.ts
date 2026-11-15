import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow, openMenu } from "./helpers";

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });

const PASSWORD = "a header check password";

// The header must stay tidy for an admin, who has the most links: Home,
// Campaigns, Leaderboard, Dossier, Admin, Account and Sign out.
test.describe("Site header", () => {
  const email = `e2e-header-${randomUUID()}@example.test`;
  let userId: string;

  test.beforeAll(async () => {
    const code = `TGS-HDR-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: inviteError } = await service.from("invites").insert({ code, max_uses: 1, note: "playwright header" });
    if (inviteError) throw inviteError;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { role: "admin" },
      user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    });
    if (error) throw error;
    userId = data.user.id;
  });

  test.afterAll(async () => {
    if (userId) await service.auth.admin.deleteUser(userId);
  });

  async function signedInAt(browser: Browser, width: number, height: number): Promise<Page> {
    const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width, height } });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/");
    // Below 1024px the links are inside the Menu panel.
    if (width < 1024) await openMenu(page);
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
    return page;
  }

  for (const width of [1080, 1280, 1440, 1920]) {
    test(`at ${width}px the header is one slim sticky row: seven links on one line, search within reach`, async ({ browser }) => {
      const page = await signedInAt(browser, width, 900);
      const nav = page.getByRole("navigation", { name: "Main" });
      const items = nav.locator("a, button");
      expect(await items.count()).toBe(7);

      const tops: number[] = [];
      for (let i = 0; i < 7; i++) tops.push(Math.round((await items.nth(i).boundingBox())!.y));
      expect(Math.max(...tops) - Math.min(...tops), `link tops ${tops.join(", ")}`).toBeLessThanOrEqual(2);

      // One slim row (64 to 72px) that stays in view; the search is in the same row.
      const header = (await page.getByRole("banner").boundingBox())!;
      expect(header.height).toBeLessThanOrEqual(72);
      expect(header.height).toBeGreaterThanOrEqual(60);
      expect(await page.getByRole("banner").evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
      const search = width >= 1280 ? page.getByRole("searchbox", { name: /Search Campaigns/ }) : page.getByRole("banner").getByRole("link", { name: "Search", exact: true });
      const box = (await search.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(header.y);
      expect(box.y + box.height).toBeLessThanOrEqual(header.y + header.height);
      await expectNoHorizontalOverflow(page);
      await page.context().close();
    });
  }

  test("at 375px the links sit in a Menu panel: the header stays short, the open panel overlays and nothing overflows", async ({ browser }) => {
    const page = await signedInAt(browser, 375, 812);
    // signedInAt left the menu open: seven destinations, none wrapped into the header.
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.locator("a, button")).toHaveCount(7);
    const open = (await page.getByRole("banner").boundingBox())!;
    const panel = (await page.locator("#mobile-menu").boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(375);
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    const closed = (await page.getByRole("banner").boundingBox())!;
    expect(closed.height).toBeLessThan(150);
    // Opening the panel overlays the page; it does not make the header taller.
    expect(open.height).toBe(closed.height);
    await expectNoHorizontalOverflow(page);
    await page.context().close();
  });
});
