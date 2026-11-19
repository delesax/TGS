import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "./fixtures";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// One shared fluid container (1600px max, padding clamp(16px, 2.5vw, 40px)) for header, pages and footer;
// a header search whose placeholder is never clipped; and a compact footer.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const SIZES = ["small", "default", "medium", "large"] as const;
const FONTS = ["atkinson", "inter", "source-sans", "lexend", "open-sans", "source-serif", "merriweather", "lora"];

async function withDisplay(browser: import("@playwright/test").Browser, width: number, size: string, font = "atkinson") {
  const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width, height: 1000 } });
  await context.addInitScript((value) => window.localStorage.setItem("tgs-display", value), JSON.stringify({ v: 2, font, size }));
  return { context, page: await context.newPage() };
}

/** True when the whole placeholder word fits inside the field's content box (so no letter can be cut off). */
async function placeholderFits(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const input = el as HTMLInputElement;
    const cs = getComputedStyle(input);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const need = ctx.measureText(input.placeholder).width;
    const have = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return { need: Math.round(need), have: Math.round(have), ok: need <= have };
  });
}

test.describe("shared container", () => {
  // Fluid: padding-inline clamp(16px, 2.5vw, 40px), 1600px maximum, centred. Left = the margin outside the container box.
  for (const [width, left, pad] of [
    [1280, 0, 32],
    [1440, 0, 36],
    [1728, 64, 40],
    [1920, 160, 40],
    [2560, 480, 40],
  ] as const) {
    test(`at ${width}px the page container is centred, at most 1600px wide, with ${pad}px side padding`, async ({ browser }) => {
      const { context, page } = await withDisplay(browser, width, "default");
      await page.goto("/");
      for (const selector of ["header > div", "main > div", "footer > div"]) {
        const box = (await page.locator(selector).first().boundingBox())!;
        expect(Math.round(box.x), `${selector} left edge`).toBe(left);
        expect(Math.round(box.width), `${selector} width`).toBe(Math.min(1600, width));
      }
      expect(await page.locator("main > div").first().evaluate((el) => getComputedStyle(el).paddingLeft)).toBe(`${pad}px`);
      await context.close();
    });
  }

  test("phones use 16px side padding and the home headline wraps in at most three lines", async ({ browser }) => {
    const { context, page } = await withDisplay(browser, 375, "default");
    await page.goto("/");
    expect(await page.locator("main > div").first().evaluate((el) => getComputedStyle(el).paddingLeft)).toBe("16px");
    await context.close();
    for (const width of [375, 768, 1280, 1728, 1920, 2560]) {
      const { context: c, page: p } = await withDisplay(browser, width, "default");
      await p.goto("/");
      const lines = await p.getByRole("heading", { level: 1 }).evaluate((h) => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
      expect(lines, `home headline lines at ${width}px`).toBeLessThanOrEqual(3);
      await c.close();
    }
  });

  test("long reading text keeps a comfortable line length in the wide container", async ({ browser }) => {
    const { context, page } = await withDisplay(browser, 1728, "default");
    await page.goto("/privacy");
    const widest = await page.locator("main p").evaluateAll((ps) => Math.max(...ps.map((p) => p.getBoundingClientRect().width / (parseFloat(getComputedStyle(p).fontSize) * 0.5))));
    expect(widest, "characters per line, roughly").toBeLessThanOrEqual(150); // 68ch is about 136 half-em units
    const widths = await page.locator("main p").evaluateAll((ps) => ps.map((p) => p.getBoundingClientRect().width));
    expect(Math.max(...widths)).toBeLessThan(900);
    await context.close();
  });
});

test.describe("header search", () => {
  for (const width of [1280, 1440]) {
    for (const size of SIZES) {
      test(`at ${width}px and ${size} text the whole placeholder "Search" is visible`, async ({ browser }) => {
        const { context, page } = await withDisplay(browser, width, size);
        await page.goto("/");
        const input = page.getByRole("banner").getByRole("searchbox", { name: /Search Campaigns/ });
        await expect(input).toBeVisible();
        const fit = await placeholderFits(page, "#site-search-desktop");
        expect(fit.ok, `placeholder needs ${fit.need}px, has ${fit.have}px`).toBe(true);
        // The "/" hint does not sit over the text until the field is focused.
        expect(await page.locator("#site-search-desktop ~ kbd").evaluate((el) => getComputedStyle(el).display)).toBe("none");
        await input.focus();
        expect(await page.locator("#site-search-desktop ~ kbd").evaluate((el) => getComputedStyle(el).display)).not.toBe("none");
        await context.close();
      });
    }
  }

  for (const font of FONTS) {
    test(`with the ${font} font the placeholder still fits at 1280px, large text`, async ({ browser }) => {
      const { context, page } = await withDisplay(browser, 1280, "large", font);
      await page.goto("/");
      const fit = await placeholderFits(page, "#site-search-desktop");
      expect(fit.ok, `placeholder needs ${fit.need}px, has ${fit.have}px`).toBe(true);
      await context.close();
    });
  }

  for (const size of SIZES) {
    test(`at 1024px and ${size} text search is an icon button with a visible accessible name`, async ({ browser }) => {
      const { context, page } = await withDisplay(browser, 1024, size);
      await page.goto("/");
      const icon = page.getByRole("banner").getByRole("link", { name: "Search", exact: true });
      await expect(icon).toBeVisible();
      await expect(icon).toHaveAttribute("title", "Search");
      const box = (await icon.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(40);
      await context.close();
    });
  }

  test.describe("signed in as an admin (seven links)", () => {
    const email = `e2e-layout-${randomUUID()}@example.test`;
    let userId = "";
    test.beforeAll(async () => {
      const code = `TGS-LAY-${randomUUID().slice(0, 8).toUpperCase()}`;
      await service.from("invites").insert({ code, max_uses: 1, note: "playwright layout" });
      const { data, error } = await service.auth.admin.createUser({
        email,
        password: "a layout password",
        email_confirm: true,
        app_metadata: { role: "admin" },
        user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
      });
      if (error) throw error;
      userId = data.user.id;
      await service.from("profiles").update({ handle: `LAY_${randomUUID().replace(/-/g, "").slice(0, 8)}` }).eq("id", userId);
    });
    test.afterAll(async () => {
      if (userId) await service.auth.admin.deleteUser(userId);
    });

    for (const font of ["atkinson", "lexend", "open-sans", "merriweather"]) {
      test(`${font} at large text: seven links on one row, search fits or collapses to the icon, nothing clips (1024 to 1440px)`, async ({ browser }) => {
        const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        await page.goto("/login");
        await page.getByLabel("Email address").fill(email);
        await page.getByLabel("Password").fill("a layout password");
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
        await expect(page).not.toHaveURL(/\/login/);
        await page.evaluate((value) => window.localStorage.setItem("tgs-display", value), JSON.stringify({ v: 2, font, size: "large" }));
        for (const width of [1024, 1280, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto("/");
          const items = page.getByRole("navigation", { name: "Main" }).locator("a, button");
          expect(await items.count()).toBe(7);
          const tops = [];
          for (let i = 0; i < 7; i++) tops.push(Math.round((await items.nth(i).boundingBox())!.y));
          expect(Math.max(...tops) - Math.min(...tops), `${font} ${width}px link tops ${tops}`).toBeLessThanOrEqual(2);
          expect((await page.getByRole("banner").boundingBox())!.height).toBeLessThanOrEqual(77);
          if (width >= 1280) expect((await placeholderFits(page, "#site-search-desktop")).ok).toBe(true);
          else await expect(page.getByRole("banner").getByRole("link", { name: "Search", exact: true })).toBeVisible();
          await expectNoHorizontalOverflow(page);
        }
        await context.close();
      });
    }

    // The header's right-hand group (Text button, search) must stay inside the page container, not eat into its side padding.
    // Linux text rendering is about 3% wider than macOS, so this is checked in every font at Large text, with a 1px tolerance.
    test("every font at large text keeps the whole header row inside the container (1024 to 1440px)", async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({ baseURL: env.siteUrl, viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password").fill("a layout password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).not.toHaveURL(/\/login/);
      for (const font of FONTS) {
        await page.evaluate((value) => window.localStorage.setItem("tgs-display", value), JSON.stringify({ v: 2, font, size: "large" }));
        for (const width of [1024, 1100, 1200, 1279, 1280, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto("/");
          const over = await page.evaluate(() => {
            const row = document.querySelector("header .page-container")!;
            const contentRight = row.getBoundingClientRect().right - parseFloat(getComputedStyle(row).paddingRight);
            const visible = Array.from(row.children).filter((e) => getComputedStyle(e).display !== "none");
            return Math.max(...visible.map((e) => e.getBoundingClientRect().right)) - contentRight;
          });
          expect(over, `${font} ${width}px: header row runs ${over.toFixed(1)}px past the container edge`).toBeLessThanOrEqual(1);
        }
      }
      await context.close();
    });
  });
});

test.describe("compact footer", () => {
  // One row (about 56 to 64px) from 1280px; two compact rows (at most about 110px) from 1024px with a mouse.
  // At exactly 1280px the small print sits beside the links with the least room, so Linux text (about 3% wider than macOS) wraps it
  // to a third line: 64.75px on macOS, 77.1px on Linux (the link column is 46.75px on both). 80px allows that one extra line of
  // small print on either platform, but fails when the footer grows a real extra row (stacked rows measure about 104px or more).
  for (const [width, max] of [
    [1024, 115],
    [1280, 80],
    [1440, 66],
    [1728, 66],
    [1920, 66],
    [2560, 66],
  ] as const) {
    test(`at ${width}px the footer is at most ${max}px tall at default text`, async ({ browser }) => {
      const { context, page } = await withDisplay(browser, width, "default");
      await page.goto("/");
      const h = (await page.locator("footer").boundingBox())!.height;
      expect(h).toBeGreaterThanOrEqual(48);
      expect(h).toBeLessThanOrEqual(max);
      await context.close();
    });
  }

  for (const width of [320, 375, 768]) {
    test(`at ${width}px the footer is compact, the five links and the company line are all there`, async ({ browser }) => {
      const { context, page } = await withDisplay(browser, width, "default");
      await page.goto("/");
      const h = (await page.locator("footer").boundingBox())!.height;
      // Touch screens (this suite emulates one) keep 44px link rows, so phones and tablets are taller than a mouse-driven desktop
      // (before the change: 494px at 320, 418px at 375 and 316px at 768).
      expect(h).toBeLessThanOrEqual(width === 320 ? 300 : width === 375 ? 270 : 130);
      const nav = page.getByRole("navigation", { name: "Policies" });
      for (const name of ["Terms of use", "Privacy policy", "How we use AI", "Accessibility", "Contact us about your data"]) await expect(nav.getByRole("link", { name })).toBeVisible();
      const line = page.getByTestId("company-block");
      await expect(line).toContainText("The Grand Strategist Limited · Invite-only pilot · Registered in England and Wales, company number");
      await expect(line).toContainText("[to be added]"); // kept exactly as it is; only the highlight box is gone
      await expectNoHorizontalOverflow(page);
      await context.close();
    });
  }

  test("the install prompt is not part of the footer and takes no space", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer").getByText("Install the app")).toHaveCount(0);
  });
});
