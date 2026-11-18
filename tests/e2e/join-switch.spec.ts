import { createClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// The ask-to-join switch (JOIN_FORM_ENABLED). The main test server has it on; a second server on the next port runs the same
// build with it off (see playwright.config.ts). The action itself is called directly in src/app/join/actions.test.ts.
const env = loadTestEnv();
const offUrl = `http://localhost:${Number(new URL(env.siteUrl).port || "3100") + 1}`;
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });

test.describe("JOIN_FORM_ENABLED off (unset)", () => {
  test.use({ baseURL: offUrl });

  test("/join is a plain Not open yet page: noindex, no form, no overflow at 375px", async ({ page }) => {
    const before = (await service.from("join_requests").select("id", { count: "exact", head: true })).count;
    const res = await page.goto("/join");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Not open yet" })).toBeVisible();
    await expect(page.getByText("Requests to join are not open yet.")).toBeVisible();
    await expect(page.locator("form[aria-label='Ask to join']")).toHaveCount(0);
    await expect(page.getByLabel("Your email address")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ask to join" })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expectNoHorizontalOverflow(page);
    expect((await service.from("join_requests").select("id", { count: "exact", head: true })).count).toBe(before);
  });
});

test.describe("JOIN_FORM_ENABLED=true", () => {
  test("/join shows the form as before, still noindex", async ({ page }) => {
    await page.goto("/join");
    await expect(page.getByRole("heading", { level: 1, name: "Ask to join" })).toBeVisible();
    await expect(page.getByLabel("Your email address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask to join" })).toBeVisible();
    await expect(page.getByText("Not open yet")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expectNoHorizontalOverflow(page);
  });
});
