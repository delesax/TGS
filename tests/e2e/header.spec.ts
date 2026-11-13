import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

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
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
    return page;
  }

  for (const width of [1080, 1280, 1440, 1920]) {
    test(`at ${width}px the links stay on one row and the search box sits directly below`, async ({ browser }) => {
      const page = await signedInAt(browser, width, 900);
      const nav = page.getByRole("navigation", { name: "Main" });
      const items = nav.locator("a, button");
      expect(await items.count()).toBe(7);

      const tops: number[] = [];
      for (let i = 0; i < 7; i++) tops.push(Math.round((await items.nth(i).boundingBox())!.y));
      expect(Math.max(...tops) - Math.min(...tops), `link tops ${tops.join(", ")}`).toBeLessThanOrEqual(2);

      const signOut = (await nav.getByRole("button", { name: "Sign out" }).boundingBox())!;
      const search = (await page.getByRole("searchbox", { name: /Search Campaigns/ }).boundingBox())!;
      expect(search.y).toBeGreaterThanOrEqual(signOut.y + signOut.height);
      // One 48px row of links plus the search box: well under two link rows' worth of extra height.
      const header = (await page.getByRole("banner").boundingBox())!;
      expect(header.height).toBeLessThan(150);
      await expectNoHorizontalOverflow(page);
      await page.context().close();
    });
  }

  test("at 375px the layout is unchanged: logo above the links, links wrap, nothing overflows", async ({ browser }) => {
    const page = await signedInAt(browser, 375, 812);
    const logo = (await page.getByRole("link", { name: "The Grand Strategist" }).first().boundingBox())!;
    const home = (await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).boundingBox())!;
    expect(home.y).toBeGreaterThanOrEqual(logo.y + logo.height);
    const header = (await page.getByRole("banner").boundingBox())!;
    console.log(`HEADER375 height=${Math.round(header.height)} logoY=${Math.round(logo.y)} homeY=${Math.round(home.y)}`);
    await expectNoHorizontalOverflow(page);
    await page.context().close();
  });
});
