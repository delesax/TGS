import { writeFileSync, mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { DEBATE_PASSWORD, DEBATE_SLUG, debateEmail, seedDebate } from "../../scripts/lib/debate-seed";
import { loadTestEnv } from "../test-env";

// The Campaign page with the 20-Strategist debate, loaded on a throttled
// mobile profile, must be usable in under 2 seconds.
//
// Profile: Chrome DevTools "Slow 4G" (562.5 ms round trip, 1.44 Mbps down,
// 675 kbps up) and 4x CPU slowdown (DevTools' mid-tier mobile setting).
// "Usable" means the first Dispatch thread is on screen (largest contentful
// paint) and the page has finished loading its HTML. We also record when the
// threads become interactive (React hydrated), and report every number.

const env = loadTestEnv();
const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: (1.44 * 1024 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 };
const CPU_SLOWDOWN = 4;
const BUDGET_MS = 2000;

type Metrics = { htmlReceived: number; fcp: number; lcp: number; domContentLoaded: number; load: number; interactive: number; transferKb: number };

async function measure(page: Page, path: string): Promise<Metrics> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __interactive: number };
    w.__lcp = 0;
    w.__interactive = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new MutationObserver((_, observer) => {
      if (document.querySelector('[data-testid="dispatch-threads"][data-hydrated="true"]')) {
        w.__interactive = performance.now();
        observer.disconnect();
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-hydrated"] });
  });

  await page.goto(path, { waitUntil: "load" });
  await expect(page.getByTestId("dispatch-threads").locator("article").first()).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { __interactive: number }).__interactive > 0, null, { timeout: 15_000 });
  // Let the last paint entries arrive, then stop throttling before reading them.
  await page.waitForTimeout(300);
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const w = window as unknown as { __lcp: number; __interactive: number };
    const transfer = performance.getEntriesByType("resource").reduce((n, r) => n + ((r as PerformanceResourceTiming).transferSize || 0), nav.transferSize || 0);
    return {
      // Chrome applies the emulated latency while the body arrives, so responseEnd
      // (not responseStart) is when the throttled HTML has been received.
      htmlReceived: nav.responseEnd,
      fcp,
      lcp: w.__lcp,
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      interactive: w.__interactive,
      transferKb: transfer / 1024,
    };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  return Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, Math.round(v)])) as Metrics;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await seedDebate({ url: env.supabaseUrl, serviceKey: env.serviceKey, anonKey: env.anonKey });
});

const results: Record<string, Metrics> = {};

test.afterAll(() => {
  // Written for the CHANGELOG and DEMO; also printed.
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/performance.json", JSON.stringify({ profile: "Slow 4G + 4x CPU", budgetMs: BUDGET_MS, results }, null, 2));
  console.log(`Campaign page, Slow 4G + 4x CPU:\n${JSON.stringify(results, null, 2)}`);
});

test("the Campaign page with a 20-Strategist debate is usable in under 2 seconds on a throttled phone (first visit)", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const m = await measure(page, `/campaigns/${DEBATE_SLUG}`);
  results.firstVisit = m;
  expect(await page.locator("article").count()).toBeGreaterThan(20);
  expect(m.lcp).toBeLessThan(BUDGET_MS);
  expect(m.domContentLoaded).toBeLessThan(BUDGET_MS);
  await context.close();
});

test("…and for a signed-in Strategist coming back (cached app files)", async ({ browser }) => {
  // The service worker fetches pages outside the page's network throttling, so it
  // is blocked here to keep the measurement honest. It never caches pages anyway.
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(debateEmail(0));
  await page.getByLabel("Password").fill(DEBATE_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your Dossier" })).toBeVisible();
  await page.goto(`/campaigns/${DEBATE_SLUG}`); // warms the browser cache with the app's files
  const m = await measure(page, `/campaigns/${DEBATE_SLUG}`);
  results.signedInRepeat = m;
  expect(m.lcp).toBeLessThan(BUDGET_MS);
  expect(m.interactive).toBeLessThan(BUDGET_MS);
  await context.close();
});
