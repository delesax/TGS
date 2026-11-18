import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestEnv } from "../test-env";

// Campaign and Verdict pages carry a search-result description derived from the Campaign's public summary.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const id = randomUUID().slice(0, 8);
const longSlug = `e2e-meta-long-${id}`;
const draftSlug = `e2e-meta-draft-${id}`;
const SITE_DESCRIPTION = "A time-boxed arena for structured reasoning. The best argument before the deadline wins.";
const longSummary = "Ministers are weighing a minimum age for social media accounts. ".repeat(6);

async function makeCampaign(slug: string, summary: string) {
  const now = Date.now();
  const { error } = await service.from("campaigns").insert({
    slug,
    title: `Meta description ${slug}`,
    summary,
    rules: "Be civil.",
    category: "education",
    status: "open",
    starts_at: new Date(now - 60_000).toISOString(),
    ends_at: new Date(now + 3 * 86_400_000).toISOString(),
    opinion_not_advice: false,
  });
  if (error) throw error;
}

test.beforeAll(async () => {
  await makeCampaign(longSlug, longSummary);
  await makeCampaign(draftSlug, "DRAFT: background to be refreshed by the owner before this Campaign opens.");
});

test.afterAll(async () => {
  await service.from("campaigns").delete().in("slug", [longSlug, draftSlug]);
});

async function description(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  return page.locator('meta[name="description"]').getAttribute("content");
}

test("the Campaign page description is the summary, cut at a word with an ellipsis", async ({ page }) => {
  const d = (await description(page, `/campaigns/${longSlug}`))!;
  expect(d.length).toBeLessThanOrEqual(155);
  expect(d.startsWith("Ministers are weighing a minimum age for social media accounts.")).toBe(true);
  expect(d.endsWith("…")).toBe(true);
});

test("the Verdict page description is the summary with a Verdict prefix", async ({ page }) => {
  const d = (await description(page, `/campaigns/${longSlug}/verdict`))!;
  expect(d.length).toBeLessThanOrEqual(155);
  expect(d.startsWith("Verdict: Ministers are weighing")).toBe(true);
});

test("a DRAFT summary is never used: both pages fall back to the site description", async ({ page }) => {
  expect(await description(page, `/campaigns/${draftSlug}`)).toBe(SITE_DESCRIPTION);
  expect(await description(page, `/campaigns/${draftSlug}/verdict`)).toBe(SITE_DESCRIPTION);
});
