import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// The Display picker (footer): body font and text size, saved in localStorage only.
// Default stays Atkinson Hyperlegible; headings stay Source Serif 4.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const KEY = "tgs-display";
const PASSWORD = "a display picker password";

const FONTS = [
  { id: "atkinson", label: "Atkinson Hyperlegible", family: /Atkinson/ },
  { id: "inter", label: "Inter", family: /Inter/ },
  { id: "source-sans", label: "Source Sans 3", family: /Source Sans 3/ },
  { id: "lexend", label: "Lexend", family: /Lexend/ },
  { id: "open-sans", label: "Open Sans", family: /Open Sans/ },
  { id: "source-serif", label: "Source Serif 4", family: /Source Serif 4/ },
  { id: "merriweather", label: "Merriweather", family: /Merriweather/ },
  { id: "lora", label: "Lora", family: /Lora/ },
];

const html = (page: Page) => page.locator("html");
const bodyFamily = (page: Page) => page.evaluate(() => getComputedStyle(document.body).fontFamily);
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), KEY);

async function openDisplay(page: Page) {
  const summary = page.getByText("Display: text style and size");
  await summary.scrollIntoViewIfNeeded();
  if (!(await page.getByTestId("display-settings").evaluate((el) => (el as HTMLDetailsElement).open))) await summary.click();
}

test.describe("Display picker", () => {
  test("a choice persists across reloads and pages, and reset restores the default", async ({ page }) => {
    await page.goto("/");
    await expect(html(page)).not.toHaveAttribute("data-font", /.+/);
    expect(await bodyFamily(page)).toMatch(/Atkinson/);

    await openDisplay(page);
    await page.getByRole("radio", { name: /^Inter/ }).check();
    await expect(html(page)).toHaveAttribute("data-font", "inter");
    expect(await bodyFamily(page)).toMatch(/Inter/);
    expect(JSON.parse((await stored(page))!)).toEqual({ font: "inter", size: "default" });

    // Headings and the logo do not change.
    expect(await page.getByRole("heading", { level: 1 }).first().evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Source Serif 4/);

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-font", "inter");
    expect(await bodyFamily(page)).toMatch(/Inter/);

    await page.goto("/login");
    await expect(html(page)).toHaveAttribute("data-font", "inter");

    await openDisplay(page);
    await expect(page.getByRole("radio", { name: /^Inter/ })).toBeChecked();
    await page.getByRole("button", { name: "Reset to default" }).click();
    await expect(html(page)).not.toHaveAttribute("data-font", /.+/);
    expect(await stored(page)).toBeNull();
    expect(await bodyFamily(page)).toMatch(/Atkinson/);

    await page.reload();
    await expect(html(page)).not.toHaveAttribute("data-font", /.+/);
  });

  test("text size changes the base size and resets with the font", async ({ page }) => {
    await page.goto("/");
    const size = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(await size()).toBe("18px");
    await openDisplay(page);
    await page.getByRole("radio", { name: "Large", exact: true }).check();
    expect(await size()).toBe("20px");
    await page.getByRole("radio", { name: "Larger", exact: true }).check();
    expect(await size()).toBe("22px");
    await page.reload();
    expect(await size()).toBe("22px");
    await expectNoHorizontalOverflow(page);
    await openDisplay(page);
    await page.getByRole("button", { name: "Reset to default" }).click();
    expect(await size()).toBe("18px");
    expect(await stored(page)).toBeNull();
  });

  test("the picker works from the keyboard and shows a focus state", async ({ page }) => {
    await page.goto("/");
    const summary = page.locator("summary", { hasText: "Display: text style and size" });
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("display-settings")).toHaveJSProperty("open", true);
    // Tab to the first radio, then arrow keys move and select within the group.
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    await expect(html(page)).toHaveAttribute("data-font", "inter");
    const outline = await page.getByRole("radio", { name: /^Inter/ }).evaluate((el) => {
      const label = el.closest("label")!;
      return getComputedStyle(label).outlineStyle + " " + getComputedStyle(label).outlineWidth;
    });
    expect(outline).toBe("solid 3px");
  });

  test("a blocked or corrupt store falls back cleanly", async ({ browser }) => {
    // Storage that throws on every access (some privacy modes do this).
    const blocked = await browser.newContext({ baseURL: env.siteUrl });
    await blocked.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("blocked");
        },
      });
    });
    const page = await blocked.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    expect(await bodyFamily(page)).toMatch(/Atkinson/);
    await openDisplay(page);
    await page.getByRole("radio", { name: /^Lora/ }).check();
    await expect(html(page)).toHaveAttribute("data-font", "lora");
    await expect(page.getByRole("status").filter({ hasText: "would not save" })).toBeVisible();
    expect(errors).toEqual([]);
    await blocked.close();

    // A stored value that is not one of the options is ignored.
    const corrupt = await browser.newContext({ baseURL: env.siteUrl });
    await corrupt.addInitScript((key) => window.localStorage.setItem(key, '{"font":"comic-sans","size":"huge"}'), KEY);
    const page2 = await corrupt.newPage();
    await page2.goto("/");
    await expect(html(page2)).not.toHaveAttribute("data-font", /.+/);
    await expect(html(page2)).not.toHaveAttribute("data-size", /.+/);
    expect(await bodyFamily(page2)).toMatch(/Atkinson/);
    await corrupt.close();
  });

  test("all eight fonts stay readable at 375px with the largest text size, and nothing shifts on load", async ({ page }) => {
    await page.goto("/");
    await openDisplay(page);
    await page.getByRole("radio", { name: "Larger", exact: true }).check();
    for (const font of FONTS) {
      await page.getByRole("radio", { name: new RegExp(`^${font.label}`) }).check();
      if (font.id === "atkinson") await expect(html(page)).not.toHaveAttribute("data-font", /.+/);
      else await expect(html(page)).toHaveAttribute("data-font", font.id);
      expect(await bodyFamily(page)).toMatch(font.family);
      await expectNoHorizontalOverflow(page);
    }
    // Layout shift when a saved non-default font loads (swap with size-adjusted fallbacks).
    await page.getByRole("radio", { name: /^Merriweather/ }).check();
    await page.reload();
    await page.waitForLoadState("networkidle");
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!entry.hadRecentInput) total += entry.value;
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 500);
        }),
    );
    expect(cls, "cumulative layout shift").toBeLessThan(0.1);
  });

  test("works signed in too", async ({ page }) => {
    const code = `TGS-DISP-${randomUUID().slice(0, 8).toUpperCase()}`;
    await service.from("invites").insert({ code, max_uses: 1, note: "playwright display" });
    const email = `e2e-display-${randomUUID()}@example.test`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    });
    if (error) throw error;
    try {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).not.toHaveURL(/\/login/);
      await openDisplay(page);
      await page.getByRole("radio", { name: /^Source Serif 4/ }).check();
      await page.goto("/dossier");
      await expect(html(page)).toHaveAttribute("data-font", "source-serif");
      expect(await bodyFamily(page)).toMatch(/Source Serif 4/);
    } finally {
      await service.auth.admin.deleteUser(data.user.id);
    }
  });
});
