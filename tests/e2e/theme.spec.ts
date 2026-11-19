import { inflateSync } from "node:zlib";
// Not "./fixtures": this spec sets its own clock, time zone and device colour scheme on every context.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { NIGHT_END_LABEL, NIGHT_START_LABEL, THEME_COLORS, THEME_HELP, type Theme } from "../../src/lib/theme";

// Theme choice: Automatic (dark from 19:00 to 07:00 by the device's clock, or when the device is set to dark), Light, Dark.
// Every context here has a pinned clock (London, in November so it is plain UTC), a device colour scheme and a viewport.

const env = loadTestEnv();
const KEY = "tgs-display";
const day = (time: string) => new Date(`2026-11-18T${time}:00Z`);

type Options = { scheme?: "light" | "dark"; time?: string; stored?: string; width?: number; js?: boolean };

async function open(browser: Browser, { scheme = "light", time = "12:00", stored, width = 1280, js = true }: Options = {}) {
  const context = await browser.newContext({
    baseURL: env.siteUrl,
    viewport: { width, height: 900 },
    timezoneId: "Europe/London",
    colorScheme: scheme,
    javaScriptEnabled: js,
  });
  if (js) await context.clock.install({ time: day(time) });
  // Only when nothing is stored yet: an init script runs on every navigation and must not overwrite a choice made on the page.
  if (stored !== undefined) await context.addInitScript(([key, value]) => { if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value); }, [KEY, stored]);
  const page = await context.newPage();
  await page.goto("/");
  return { context, page };
}

const theme = (page: Page) => page.locator("html").getAttribute("data-theme");
const mode = (page: Page) => page.locator("html").getAttribute("data-theme-mode");
const logoSrc = (page: Page) => page.getByRole("banner").getByRole("img", { name: "The Grand Strategist" }).getAttribute("src");
const metas = (page: Page) => page.locator('meta[name="theme-color"]');
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), KEY);
const colour = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

async function expectLogoAndMeta(page: Page, resolved: Theme) {
  expect(await logoSrc(page)).toBe(`/brand/lockup-${resolved}.svg`);
  await expect(metas(page)).toHaveCount(1);
  await expect(metas(page)).toHaveAttribute("content", THEME_COLORS[resolved]);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(resolved);
}

async function openDialog(page: Page) {
  await page.getByRole("button", { name: /Display settings/ }).first().click();
  await expect(page.getByRole("dialog", { name: "Text style and size" })).toBeVisible();
}

test.describe("Automatic (the default)", () => {
  const cases: Array<[string, "light" | "dark", string, Theme]> = [
    ["light device at 12:00", "light", "12:00", "light"],
    ["dark device at 12:00", "dark", "12:00", "dark"],
    ["light device at 20:00", "light", "20:00", "dark"],
    ["light device at 06:30", "light", "06:30", "dark"],
    ["light device at 07:00", "light", "07:00", "light"],
    ["light device at 18:59", "light", "18:59", "light"],
    ["light device at 19:00", "light", "19:00", "dark"],
    ["dark device at 20:00", "dark", "20:00", "dark"],
  ];
  for (const [name, scheme, time, expected] of cases) {
    test(`${name} is ${expected}, with the matching logo, theme-color and color-scheme`, async ({ browser }) => {
      const { context, page } = await open(browser, { scheme, time });
      expect(await theme(page)).toBe(expected);
      expect(await mode(page)).toBe("auto");
      expect(await stored(page)).toBeNull(); // choosing nothing stores nothing
      await expectLogoAndMeta(page, expected);
      expect(await colour(page)).toBe(rgb(THEME_COLORS[expected]));
      await context.close();
    });
  }

  test("changes live when the device flips between light and dark, with no reload", async ({ browser }) => {
    const { context, page } = await open(browser, { scheme: "light", time: "12:00" });
    expect(await theme(page)).toBe("light");
    await page.evaluate(() => ((window as unknown as { __loads: number }).__loads = 1));
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => theme(page)).toBe("dark");
    await expectLogoAndMeta(page, "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => theme(page)).toBe("light");
    await expectLogoAndMeta(page, "light");
    expect(await page.evaluate(() => (window as unknown as { __loads?: number }).__loads)).toBe(1); // same document
    await context.close();
  });

  test("changes live when the clock crosses 19:00 and 07:00, with no reload", async ({ browser }) => {
    const { context, page } = await open(browser, { scheme: "light", time: "18:58" });
    expect(await theme(page)).toBe("light");
    await page.evaluate(() => ((window as unknown as { __loads: number }).__loads = 1));
    await page.clock.fastForward("00:03:00"); // 19:01
    await expect.poll(() => theme(page)).toBe("dark");
    await expectLogoAndMeta(page, "dark");
    await page.clock.fastForward("12:00:00"); // 07:01 next morning (the timer re-armed itself after 19:00)
    await expect.poll(() => theme(page)).toBe("light");
    await expectLogoAndMeta(page, "light");
    expect(await page.evaluate(() => (window as unknown as { __loads?: number }).__loads)).toBe(1);
    await context.close();
  });

  test("recomputes when a hidden tab becomes visible again", async ({ browser }) => {
    const { context, page } = await open(browser, { scheme: "light", time: "18:00" });
    expect(await theme(page)).toBe("light");
    // Time jumps while the tab is hidden and its timer is throttled: simulate by moving Date, then a visibilitychange.
    await page.clock.setSystemTime(day("20:00"));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => theme(page)).toBe("dark");
    await context.close();
  });
});

test.describe("Light and Dark override both the device and the clock", () => {
  for (const chosen of ["light", "dark"] as const) {
    for (const scheme of ["light", "dark"] as const) {
      for (const time of ["12:00", "21:00", "03:00"]) {
        test(`${chosen} chosen, ${scheme} device at ${time}`, async ({ browser }) => {
          const { context, page } = await open(browser, { scheme, time, stored: JSON.stringify({ v: 2, theme: chosen }) });
          expect(await theme(page)).toBe(chosen);
          expect(await mode(page)).toBe(chosen);
          await expectLogoAndMeta(page, chosen);
          // and it stays put when the device flips
          await page.emulateMedia({ colorScheme: scheme === "light" ? "dark" : "light" });
          await page.waitForTimeout(150);
          expect(await theme(page)).toBe(chosen);
          await context.close();
        });
      }
    }
  }

  test("the logo matches the theme, not the device (dark device + Light = light logo; light device at 20:00 + Automatic = dark logo)", async ({ browser }) => {
    const a = await open(browser, { scheme: "dark", time: "12:00", stored: JSON.stringify({ v: 2, theme: "light" }) });
    expect(await logoSrc(a.page)).toBe("/brand/lockup-light.svg");
    const visible = await a.page.getByRole("banner").getByRole("img", { name: "The Grand Strategist" }).count();
    expect(visible).toBe(1); // the other lockup is display:none, so there is one accessible logo
    await a.context.close();
    const b = await open(browser, { scheme: "light", time: "20:00" });
    expect(await logoSrc(b.page)).toBe("/brand/lockup-dark.svg");
    await b.context.close();
  });
});

test.describe("The dialog", () => {
  test("has a Theme group with the helper line, and is keyboard operable", async ({ browser }) => {
    const { context, page } = await open(browser, { scheme: "light", time: "12:00" });
    await openDialog(page);
    const group = page.getByRole("group", { name: "Theme" });
    await expect(group).toBeVisible();
    await expect(group.getByText(THEME_HELP)).toBeVisible();
    expect(THEME_HELP).toContain(NIGHT_START_LABEL);
    expect(THEME_HELP).toContain(NIGHT_END_LABEL);
    const auto = group.getByRole("radio", { name: "Automatic (default)" });
    await expect(auto).toBeChecked();
    await auto.focus();
    await page.keyboard.press("ArrowRight"); // Light
    await expect(group.getByRole("radio", { name: "Light" })).toBeChecked();
    await page.keyboard.press("ArrowRight"); // Dark
    await expect(group.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(await theme(page)).toBe("dark");
    expect(await mode(page)).toBe("dark");
    expect(JSON.parse((await stored(page))!).theme).toBe("dark");
    // the focus ring is visible on the focused radio card in the chosen theme
    const ring = await page.evaluate(() => {
      const card = document.activeElement?.closest("label");
      return card ? getComputedStyle(card).outlineStyle + "|" + getComputedStyle(card).boxShadow : "";
    });
    expect(ring).not.toBe("");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft"); // back to Automatic
    await expect(auto).toBeChecked();
    expect(await theme(page)).toBe("light");
    expect(await stored(page)).toBeNull(); // everything default again: nothing stored
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Text style and size" })).toBeHidden();
    await context.close();
  });

  test("the choice persists after a reload and across pages, and keeps the font and size", async ({ browser }) => {
    const { context, page } = await open(browser, { scheme: "light", time: "12:00", stored: JSON.stringify({ v: 2, font: "lora", size: "large" }) });
    expect(await theme(page)).toBe("light");
    await openDialog(page);
    await page.getByRole("radio", { name: "Dark" }).check();
    expect(await theme(page)).toBe("dark");
    expect(JSON.parse((await stored(page))!)).toEqual({ v: 2, font: "lora", size: "large", theme: "dark" });
    await page.reload();
    expect(await theme(page)).toBe("dark");
    await page.goto("/login");
    expect(await theme(page)).toBe("dark");
    expect(await mode(page)).toBe("dark");
    await expect(page.locator("html")).toHaveAttribute("data-font", "lora");
    await expect(page.locator("html")).toHaveAttribute("data-size", "large");
    await context.close();
  });

  test("Reset to default puts the theme back to Automatic as well", async ({ browser }) => {
    const { context, page } = await open(browser, { scheme: "light", time: "12:00", stored: JSON.stringify({ v: 2, theme: "dark" }) });
    await openDialog(page);
    await page.getByRole("button", { name: "Reset to default" }).click();
    await expect(page.getByRole("radio", { name: "Automatic (default)" })).toBeChecked();
    expect(await theme(page)).toBe("light");
    expect(await stored(page)).toBeNull();
    await context.close();
  });

  test("works in the phone Menu (375px)", async ({ browser }) => {
    const { context, page } = await open(browser, { scheme: "light", time: "12:00", width: 375 });
    await page.getByRole("button", { name: /Menu/ }).first().click();
    await page.getByRole("button", { name: /Display settings/ }).first().click();
    await page.getByRole("radio", { name: "Dark" }).check();
    expect(await theme(page)).toBe("dark");
    await context.close();
  });
});

test.describe("Storage", () => {
  const withFontAndSize = '"v":2,"font":"lora","size":"large"';
  const cases: Array<[string, string, boolean]> = [
    ["a value with no theme field", `{${withFontAndSize}}`, true],
    ["an unknown theme", `{${withFontAndSize},"theme":"purple"}`, true],
    ["a non-string theme", `{${withFontAndSize},"theme":7}`, true],
    ["a corrupt value", "not json{", false],
    ["an empty value", "", false],
    ["JSON null", "null", false],
  ];
  for (const [name, value, keepsFont] of cases) {
    test(`${name} is Automatic${keepsFont ? " and keeps the stored font and size" : ""}`, async ({ browser }) => {
      const { context, page } = await open(browser, { scheme: "light", time: "20:00", stored: value });
      expect(await mode(page)).toBe("auto");
      expect(await theme(page)).toBe("dark"); // Automatic at 20:00
      if (keepsFont) {
        await expect(page.locator("html")).toHaveAttribute("data-font", "lora");
        await expect(page.locator("html")).toHaveAttribute("data-size", "large");
      }
      await context.close();
    });
  }

  test("blocked storage falls back to Automatic and the page still works", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: env.siteUrl, timezoneId: "Europe/London", colorScheme: "light", viewport: { width: 1280, height: 900 } });
    await context.clock.install({ time: day("21:00") });
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get: () => { throw new Error("blocked"); } });
    });
    const page = await context.newPage();
    await page.goto("/");
    expect(await theme(page)).toBe("dark");
    expect(await mode(page)).toBe("auto");
    await context.close();
  });
});

test.describe("First paint and no JavaScript", () => {
  test("data-theme is set before the body exists (before DOMContentLoaded)", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: env.siteUrl, timezoneId: "Europe/London", colorScheme: "light", viewport: { width: 1280, height: 900 } });
    await context.clock.install({ time: day("21:00") });
    await context.addInitScript(() => {
      const w = window as unknown as { __theme?: { value: string | null; bodyExisted: boolean; ready: string } };
      new MutationObserver((records, observer) => {
        for (const r of records)
          if (r.attributeName === "data-theme") {
            w.__theme = { value: document.documentElement.getAttribute("data-theme"), bodyExisted: !!document.body, ready: document.readyState };
            observer.disconnect();
          }
      }).observe(document, { attributes: true, subtree: true });
    });
    const page = await context.newPage();
    await page.goto("/");
    const seen = await page.evaluate(() => (window as unknown as { __theme?: { value: string | null; bodyExisted: boolean; ready: string } }).__theme);
    expect(seen).toEqual({ value: "dark", bodyExisted: false, ready: "loading" });
    await context.close();
  });

  /** Reads one painted pixel from a screenshot, so the check sees what is on screen and not just CSS. */
  async function pixel(page: Page, x: number, y: number): Promise<string> {
    const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
    const idat: Buffer[] = [];
    for (let at = 8; at < png.length; ) {
      const length = png.readUInt32BE(at);
      if (png.toString("ascii", at + 4, at + 8) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + length));
      at += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(idat));
    return `rgb(${raw[1]}, ${raw[2]}, ${raw[3]})`;
  }

  test("no flash: with every script file blocked (so React never runs), the first paint is already the chosen theme", async ({ browser }) => {
    for (const [chosen, scheme, expected] of [
      ["dark", "light", "dark"],
      ["light", "dark", "light"],
    ] as const) {
      const context = await browser.newContext({ baseURL: env.siteUrl, timezoneId: "Europe/London", colorScheme: scheme, viewport: { width: 1280, height: 900 } });
      await context.clock.install({ time: day("12:00") });
      await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [KEY, JSON.stringify({ v: 2, theme: chosen })]);
      await context.route("**/_next/static/**/*.js", (route) => route.abort());
      const page = await context.newPage();
      await page.goto("/", { waitUntil: "domcontentloaded" });
      expect(await theme(page)).toBe(expected);
      expect(await pixel(page, 2, 400)).toBe(rgb(THEME_COLORS[expected]));
      await context.close();
    }
  });

  test("without JavaScript the page follows the device, same palette", async ({ browser }) => {
    for (const scheme of ["light", "dark"] as const) {
      const context: BrowserContext = await browser.newContext({ baseURL: env.siteUrl, colorScheme: scheme, javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto("/");
      expect(await theme(page)).toBeNull();
      expect(await colour(page)).toBe(rgb(THEME_COLORS[scheme]));
      const logo = await page.locator("header img").evaluateAll((imgs) => imgs.filter((i) => getComputedStyle(i).display !== "none").map((i) => i.getAttribute("src")));
      expect(logo).toEqual([`/brand/lockup-${scheme}.svg`]);
      await context.close();
    }
  });
});

test.describe("The header is the same in both themes", () => {
  for (const [width, height] of [
    [1024, 65],
    [1280, 70],
    [1440, 73],
  ] as const) {
    for (const chosen of ["light", "dark"] as const) {
      test(`${width}px: header ${height}px and the same logo box (${chosen})`, async ({ browser }) => {
        const { context, page } = await open(browser, { width, stored: JSON.stringify({ v: 2, theme: chosen }) });
        const box = await page.evaluate(() => {
          const header = document.querySelector("header")!;
          const logo = [...header.querySelectorAll("img")].find((i) => getComputedStyle(i).display !== "none")!;
          const r = logo.getBoundingClientRect();
          return { header: Math.round(header.getBoundingClientRect().height), logo: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10) };
        });
        expect(box.header).toBe(height);
        const other = await open(browser, { width, stored: JSON.stringify({ v: 2, theme: chosen === "light" ? "dark" : "light" }) });
        const otherBox = await other.page.evaluate(() => {
          const header = document.querySelector("header")!;
          const logo = [...header.querySelectorAll("img")].find((i) => getComputedStyle(i).display !== "none")!;
          const r = logo.getBoundingClientRect();
          return { header: Math.round(header.getBoundingClientRect().height), logo: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10) };
        });
        expect(otherBox).toEqual(box);
        await other.context.close();
        await context.close();
      });
    }
  }
});
