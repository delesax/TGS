import { expect, type Page } from "@playwright/test";

/**
 * Fails if the page scrolls sideways, or if any visible element pokes out past
 * the right edge of the viewport (which the page-level check can miss when a
 * parent clips it). Names the offending elements so the failure is useful.
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const width = doc.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.closest(".sr-only")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > width + 1) {
        const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(el.textContent ?? "").trim().slice(0, 40)}" right=${Math.round(rect.right)}`;
        offenders.push(label);
      }
    }
    return { scroll: doc.scrollWidth - width, offenders: offenders.slice(0, 5) };
  });
  expect(result.offenders, `elements wider than the ${await page.evaluate(() => document.documentElement.clientWidth)}px viewport`).toEqual([]);
  expect(result.scroll).toBeLessThanOrEqual(0);
}
