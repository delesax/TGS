import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "./fixtures";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// Display settings: a "Text" button in the header (and inside the phone Menu) opens a dialog for body font and
// text size, saved in localStorage only. Default stays Atkinson Hyperlegible at 17px; headings and logo stay as designed.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const KEY = "tgs-display";
const PASSWORD = "a display picker password";
const TRIGGER = "Display settings: text style and size";

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
const SIZES = [
  { label: "Small", id: "small", px: "15px" },
  { label: "Default", id: "default", px: "17px" },
  { label: "Medium", id: "medium", px: "19px" },
  { label: "Large", id: "large", px: "22px" },
];

const html = (page: Page) => page.locator("html");
const bodyFamily = (page: Page) => page.evaluate(() => getComputedStyle(document.body).fontFamily);
const baseSize = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), KEY);
const dialog = (page: Page) => page.getByRole("dialog", { name: "Text style and size" });

async function desktop(browser: Browser, width = 1280) {
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width, height: 900 } });
  return { context, page: await context.newPage() };
}

/** Opens the dialog the way the width allows: the header Text button on desktop, the Menu row on a phone. */
async function openDisplay(page: Page) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) {
    if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: TRIGGER }).click();
  } else {
    await page.getByRole("banner").getByRole("button", { name: TRIGGER }).click();
  }
  await expect(dialog(page)).toBeVisible();
}

test.describe("Display settings", () => {
  test("the Text button is in the header, and a choice persists across reloads and pages until reset", async ({ browser }) => {
    const { context, page } = await desktop(browser);
    await page.goto("/");
    await expect(html(page)).not.toHaveAttribute("data-font", /.+/);
    expect(await bodyFamily(page)).toMatch(/Atkinson/);
    expect(await baseSize(page)).toBe("17px");

    // Header placement: one slim row, the labelled button inside it.
    const header = (await page.getByRole("banner").boundingBox())!;
    const button = page.getByRole("banner").getByRole("button", { name: TRIGGER });
    await expect(button).toHaveText("Text");
    const box = (await button.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(header.y);
    expect(box.y + box.height).toBeLessThanOrEqual(header.y + header.height);

    await openDisplay(page);
    await dialog(page).getByRole("radio", { name: /^Inter/ }).check();
    await expect(html(page)).toHaveAttribute("data-font", "inter");
    expect(await bodyFamily(page)).toMatch(/Inter/);
    expect(JSON.parse((await stored(page))!)).toEqual({ v: 2, font: "inter", size: "default" });
    // Headings stay Source Serif 4.
    expect(await page.getByRole("heading", { level: 1 }).first().evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Source Serif 4/);

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-font", "inter");
    await page.goto("/login");
    await expect(html(page)).toHaveAttribute("data-font", "inter");

    await openDisplay(page);
    await expect(dialog(page).getByRole("radio", { name: /^Inter/ })).toBeChecked();
    await dialog(page).getByRole("button", { name: "Reset to default" }).click();
    await expect(html(page)).not.toHaveAttribute("data-font", /.+/);
    expect(await stored(page)).toBeNull();
    expect(await bodyFamily(page)).toMatch(/Atkinson/);
    await context.close();
  });

  test("the four sizes are 15, 17, 19 and 22px, persist, and reset", async ({ browser }) => {
    const { context, page } = await desktop(browser);
    await page.goto("/");
    await openDisplay(page);
    for (const size of SIZES) {
      await dialog(page).getByRole("radio", { name: size.label, exact: true }).check();
      expect(await baseSize(page), size.label).toBe(size.px);
    }
    await page.reload();
    expect(await baseSize(page)).toBe("22px");
    await expectNoHorizontalOverflow(page);
    await openDisplay(page);
    await dialog(page).getByRole("button", { name: "Reset to default" }).click();
    expect(await baseSize(page)).toBe("17px");
    expect(await stored(page)).toBeNull();
    await context.close();
  });

  test("keyboard: opens with Enter, focus stays inside, Escape closes and focus returns to the Text button", async ({ browser }) => {
    const { context, page } = await desktop(browser);
    await page.goto("/");
    const button = page.getByRole("banner").getByRole("button", { name: TRIGGER });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    // Tab around: focus never leaves the dialog (it is modal).
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(button).toBeFocused();
    // A visible focus outline on a radio option.
    await button.press("Enter");
    const radio = dialog(page).getByRole("radio", { name: /^Inter/ });
    await radio.focus();
    await page.keyboard.press("Space");
    await expect(html(page)).toHaveAttribute("data-font", "inter");
    expect(await radio.evaluate((el) => getComputedStyle(el.closest("label")!).outlineStyle)).toBe("solid");
    await context.close();
  });

  test("on a phone the Text row is inside the Menu; the menu closes as the dialog opens and focus returns to Menu", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto("/");
    await openDisplay(page);
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toHaveAttribute("aria-expanded", "false");
    await dialog(page).getByRole("radio", { name: "Large", exact: true }).check();
    expect(await baseSize(page)).toBe("22px");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
    await context.close();
  });

  test("a blocked or corrupt store falls back cleanly, and saved values from the first picker keep their meaning", async ({ browser }) => {
    const blocked = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 1280, height: 900 } });
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
    await dialog(page).getByRole("radio", { name: /^Lora/ }).check();
    await expect(html(page)).toHaveAttribute("data-font", "lora");
    await expect(dialog(page).getByRole("status")).toContainText("would not save");
    expect(errors).toEqual([]);
    await blocked.close();

    const cases: { stored: string; font: string | null; size: string | null; px: string }[] = [
      { stored: '{"font":"comic-sans","size":"huge"}', font: null, size: null, px: "17px" },
      { stored: "not json", font: null, size: null, px: "17px" },
      // First picker (no version): large was 20px and larger was 22px.
      { stored: '{"font":"lexend","size":"large"}', font: "lexend", size: "medium", px: "19px" },
      { stored: '{"font":"inter","size":"larger"}', font: "inter", size: "large", px: "22px" },
      // Current version: large is 22px.
      { stored: '{"v":2,"font":"lora","size":"large"}', font: "lora", size: "large", px: "22px" },
      { stored: '{"v":2,"font":"lora","size":"small"}', font: "lora", size: "small", px: "15px" },
    ];
    for (const c of cases) {
      const ctx = await browser.newContext({ baseURL: env.siteUrl });
      await ctx.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [KEY, c.stored]);
      const p = await ctx.newPage();
      await p.goto("/");
      if (c.font) await expect(html(p)).toHaveAttribute("data-font", c.font);
      else await expect(html(p)).not.toHaveAttribute("data-font", /.+/);
      if (c.size) await expect(html(p)).toHaveAttribute("data-size", c.size);
      else await expect(html(p)).not.toHaveAttribute("data-size", /.+/);
      expect(await baseSize(p), c.stored).toBe(c.px);
      await ctx.close();
    }
  });

  test("all eight fonts stay readable at 320px with the largest size, and nothing shifts on load", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 320, height: 800 } });
    const page = await context.newPage();
    await page.goto("/");
    await openDisplay(page);
    await dialog(page).getByRole("radio", { name: "Large", exact: true }).check();
    for (const font of FONTS) {
      await dialog(page).getByRole("radio", { name: new RegExp(`^${font.label}`) }).check();
      if (font.id === "atkinson") await expect(html(page)).not.toHaveAttribute("data-font", /.+/);
      else await expect(html(page)).toHaveAttribute("data-font", font.id);
      expect(await bodyFamily(page)).toMatch(font.family);
    }
    await dialog(page).getByRole("radio", { name: /^Merriweather/ }).check();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(page);
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
    await context.close();
  });

  test("a checked option's text never runs under its check mark, and nothing runs past the dialog edge, at any width and at the largest size", async ({ browser }) => {
    for (const size of ["default", "large"]) {
      for (const width of [320, 375, 640, 768, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 } });
        await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [KEY, JSON.stringify({ v: 2, size })]);
        const page = await context.newPage();
        await page.goto("/");
        await page.evaluate(() => window.dispatchEvent(new Event("tgs:open-display")));
        await page.locator("dialog[open]").waitFor();
        // Nothing in the dialog runs past its right edge or makes it scroll sideways (at 320px with Large text the font cards used to).
        const clipped = await page.evaluate(() => {
          const d = document.querySelector("dialog[open]") as HTMLElement;
          const right = d.getBoundingClientRect().right;
          return { sideways: d.scrollWidth > d.clientWidth, past: [...d.querySelectorAll(".option-card, [data-testid=display-preview], button")].filter((c) => c.getBoundingClientRect().right > right - 1).length };
        });
        expect(clipped, `dialog content past its right edge at ${width}px, ${size} text`).toEqual({ sideways: false, past: 0 });
        const radios = page.locator("dialog input[type=radio]");
        for (let i = 0; i < (await radios.count()); i++) {
          await radios.nth(i).check({ force: true });
          const over = await page.evaluate((index) => {
            const card = document.querySelectorAll("dialog input[type=radio]")[index].closest("label")!;
            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const tickLeft = card.getBoundingClientRect().right - 0.75 * rem - 1.1 * rem; // the tick: right 0.75rem, 1.1rem wide
            return Math.max(...[...card.querySelectorAll("span")].map((s) => { const r = document.createRange(); r.selectNodeContents(s); return r.getBoundingClientRect().right; })) - tickLeft;
          }, i);
          expect(over, `option ${i} (${await radios.nth(i).getAttribute("value")}) at ${width}px, ${size} text`).toBeLessThanOrEqual(0);
        }
        await context.close();
      }
    }
  });

  test("option names stay on one line: Default text from 360px, Large text from 414px", async ({ browser }) => {
    for (const [size, widths] of [["default", [360, 375, 414, 640, 768, 1280]], ["large", [414, 640, 768, 1280]]] as const) {
      for (const width of widths) {
        const context = await browser.newContext({ viewport: { width, height: 1400 } });
        await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [KEY, JSON.stringify({ v: 2, size })]);
        const page = await context.newPage();
        await page.goto("/");
        await page.evaluate(() => window.dispatchEvent(new Event("tgs:open-display")));
        await page.locator("dialog[open]").waitFor();
        const wrapped = await page.evaluate(() =>
          [...document.querySelectorAll("dialog .option-card")]
            .map((card) => {
              const name = card.querySelector("span.font-semibold")!;
              const range = document.createRange();
              range.selectNodeContents(name);
              return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1 ? name.textContent : null;
            })
            .filter(Boolean),
        );
        expect(wrapped, `option names on two lines at ${width}px, ${size} text`).toEqual([]);
        await context.close();
      }
    }
  });

  test("works signed in too", async ({ browser }) => {
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
    const { context, page } = await desktop(browser);
    try {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).not.toHaveURL(/\/login/);
      await openDisplay(page);
      await dialog(page).getByRole("radio", { name: /^Source Serif 4/ }).check();
      await page.goto("/dossier");
      await expect(html(page)).toHaveAttribute("data-font", "source-serif");
      // This member has no handle yet, so the page can navigate on (to /onboarding) after the first document has loaded. Reading
      // the style in the middle of that navigation threw "Execution context was destroyed", so retry until the page is stable.
      await expect.poll(() => bodyFamily(page).catch(() => ""), { message: "the body font after the page settles" }).toMatch(/Source Serif 4/);
    } finally {
      await context.close();
      await service.auth.admin.deleteUser(data.user.id);
    }
  });
});

test.describe("Display settings with the header and mobile menu", () => {
  for (const size of ["small", "large"]) {
    for (const width of [320, 375, 768, 1024, 1280, 1440]) {
      test(`${size} text at ${width}px: header usable and short, Sign in and Menu or Text reachable, no sideways scroll`, async ({ browser }) => {
        const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width, height: 800 } });
        await context.addInitScript((value) => window.localStorage.setItem("tgs-display", value), JSON.stringify({ v: 2, font: "lexend", size }));
        const page = await context.newPage();
        await page.goto("/");
        await expect(html(page)).toHaveAttribute("data-size", size);
        const header = (await page.getByRole("banner").boundingBox())!;
        expect(header.height).toBeLessThan(width >= 1024 ? 73 : 150);
        await expectNoHorizontalOverflow(page);
        if (width < 1024) {
          await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
          await page.getByRole("button", { name: "Menu", exact: true }).click();
          await expect(page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: TRIGGER })).toBeVisible();
          await expectNoHorizontalOverflow(page);
          await page.keyboard.press("Escape");
        } else {
          await expect(page.getByRole("banner").getByRole("button", { name: TRIGGER })).toBeVisible();
        }
        await context.close();
      });
    }
  }
});
