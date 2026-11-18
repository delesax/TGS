import { test as base, expect } from "@playwright/test";

export { expect };
export type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Every spec except theme.spec.ts imports `test` from here instead of "@playwright/test".
 *
 * The theme is Automatic by default and Automatic is dark at night (19:00 to 07:00 by the browser's clock), so a
 * suite that ran after dark would render in dark and a few assertions could differ. To make the suite independent of
 * the machine's real clock, every browser context (the built-in `context` and any made with browser.newContext) gets
 * a pinned clock: the real date, with the time of day moved to 12:xx in Europe/London. Time still flows normally
 * from there. Set TGS_PIN_HOUR (0 to 23) to pin another hour, for example 21 to run the whole suite "at night".
 */
const ZONE = "Europe/London";

export function pinnedTime(now = new Date(), hour = Number(process.env.TGS_PIN_HOUR ?? 12)): Date {
  const londonHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "numeric", hourCycle: "h23" }).format(now));
  return new Date(now.getTime() + (hour - londonHour) * 3_600_000);
}

export const test = base.extend<object, object>({
  browser: [
    async ({ browser }, use) => {
      const original = browser.newContext.bind(browser);
      browser.newContext = (async (options?: Parameters<typeof original>[0]) => {
        const context = await original({ timezoneId: ZONE, colorScheme: "light", ...options });
        await context.clock.install({ time: pinnedTime() });
        return context;
      }) as typeof browser.newContext;
      await use(browser);
      browser.newContext = original as typeof browser.newContext;
    },
    { scope: "worker" },
  ],
});
