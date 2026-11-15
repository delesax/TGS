import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// Below 1024px the header links live in a "Menu" panel instead of wrapping onto a second row.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const PASSWORD = "a mobile menu password";

const menuButton = (page: Page) => page.getByRole("button", { name: "Menu", exact: true });
const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

test.describe("Mobile menu", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Sign in is visible without opening the menu; the links are not", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(menuButton(page)).toBeVisible();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton(page)).toHaveAttribute("aria-controls", "mobile-menu");
    await expect(mainNav(page).getByRole("link", { name: "Campaigns" })).toBeHidden();
    const header = (await page.getByRole("banner").boundingBox())!;
    expect(header.height).toBeLessThan(150);
  });

  test("it opens and closes with the button, and focus moves into the panel", async ({ page }) => {
    await page.goto("/");
    await menuButton(page).click();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Home", "Campaigns", "Leaderboard", "Dossier"]) await expect(mainNav(page).getByRole("link", { name })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Home" })).toBeFocused();
    // Tap targets are at least 44px tall.
    for (const link of await mainNav(page).getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await menuButton(page).click();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(mainNav(page).getByRole("link", { name: "Campaigns" })).toBeHidden();
  });

  test("Escape closes it and focus returns to the Menu button", async ({ page }) => {
    await page.goto("/");
    await menuButton(page).click();
    await expect(mainNav(page).getByRole("link", { name: "Home" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton(page)).toBeFocused();
  });

  test("pressing outside the panel closes it", async ({ page }) => {
    await page.goto("/");
    await menuButton(page).click();
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
    // Well below the panel, which overlays the top of the page.
    await page.mouse.click(187, 790);
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("choosing a link goes there, closes the menu, and marks the current page", async ({ page }) => {
    await page.goto("/");
    await menuButton(page).click();
    await mainNav(page).getByRole("link", { name: "Campaigns" }).click();
    await expect(page).toHaveURL(/\/campaigns$/);
    await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
    await menuButton(page).click();
    await expect(mainNav(page).getByRole("link", { name: "Campaigns" })).toHaveAttribute("aria-current", "page");
    await expect(mainNav(page).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
  });

  test("at the desktop width there is no Menu button and the links show as before", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto("/");
    await expect(menuButton(page)).toBeHidden();
    await expect(mainNav(page).getByRole("link", { name: "Campaigns" })).toBeVisible();
    await context.close();
  });

  for (const width of [320, 360, 375, 414, 768]) {
    test(`no horizontal scroll at ${width}px, closed or open, logged out`, async ({ browser }) => {
      const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width, height: 800 } });
      const page = await context.newPage();
      await page.goto("/");
      await expectNoHorizontalOverflow(page);
      const header = (await page.getByRole("banner").boundingBox())!;
      expect(header.height).toBeLessThan(150);
      await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
      await menuButton(page).click();
      await expectNoHorizontalOverflow(page);
      await context.close();
    });
  }

  test.describe("signed in as an admin", () => {
    const email = `e2e-mobilenav-${randomUUID()}@example.test`;
    let userId = "";

    test.beforeAll(async () => {
      const code = `TGS-MNAV-${randomUUID().slice(0, 8).toUpperCase()}`;
      await service.from("invites").insert({ code, max_uses: 1, note: "playwright mobile nav" });
      const { data, error } = await service.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        app_metadata: { role: "admin" },
        user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
      });
      if (error) throw error;
      userId = data.user.id;
      await service.from("profiles").update({ handle: `MNAV_${randomUUID().replace(/-/g, "").slice(0, 8)}`, display_name: "Nav Lovelace" }).eq("id", userId);
    });

    test.afterAll(async () => {
      if (userId) await service.auth.admin.deleteUser(userId);
    });

    for (const width of [320, 375, 768]) {
      test(`all seven links are in the menu at ${width}px, the header stays short and nothing overflows`, async ({ browser }) => {
        const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width, height: 800 } });
        const page = await context.newPage();
        await page.goto("/login");
        await page.getByLabel("Email address").fill(email);
        await page.getByLabel("Password").fill(PASSWORD);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page).not.toHaveURL(/\/login/);
        await page.goto("/");
        const closed = (await page.getByRole("banner").boundingBox())!;
        expect(closed.height).toBeLessThan(150);
        await expectNoHorizontalOverflow(page);
        await menuButton(page).click();
        await expect(mainNav(page).locator("a, button")).toHaveCount(7);
        for (const name of ["Home", "Campaigns", "Leaderboard", "Dossier", "Admin", "Account"]) await expect(mainNav(page).getByRole("link", { name })).toBeVisible();
        await expect(mainNav(page).getByRole("button", { name: "Sign out" })).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await mainNav(page).getByRole("link", { name: "Admin" }).click();
        await expect(page).toHaveURL(/\/admin$/);
        await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
        await context.close();
      });
    }
  });
});
