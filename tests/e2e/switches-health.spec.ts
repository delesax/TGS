import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const PASSWORD = "a switches check password";

test.describe("Sprint 7: kill switches, health and rate limits", () => {
  const email = `e2e-switch-${randomUUID()}@example.test`;
  let userId: string;

  test.beforeAll(async () => {
    // Earlier runs on this machine share one IP address; start each run with clean counters.
    await service.from("rate_limits").delete().like("bucket", "sign_%");
    const code = `TGS-SWT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: inviteError } = await service.from("invites").insert({ code, max_uses: 1, note: "playwright switches" });
    if (inviteError) throw inviteError;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { role: "admin" },
      user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    });
    if (error) throw error;
    userId = data.user.id;
    // Admin pages need a handle (an admin without one is sent to onboarding).
    const { error: handleError } = await service.from("profiles").update({ handle: `SW${userId.replace(/-/g, "").slice(0, 10)}` }).eq("id", userId);
    if (handleError) throw handleError;
  });

  test.afterAll(async () => {
    await service.from("community_settings").update({ posting_paused: false, signups_paused: false, emails_paused: false }).eq("id", true);
    if (userId) await service.auth.admin.deleteUser(userId);
  });

  test("the public health check says ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("an admin pauses sign-ups from Settings: the banner shows, the sign-up form refuses, then it is switched off again", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/admin/settings");
    await expect(page.getByRole("group", { name: "Site switches" })).toBeVisible();
    await page.getByLabel(/Pause sign-ups/).check();
    // A reason is required.
    await page.getByRole("button", { name: "Save switches" }).click();
    await expect(page.getByText("Give a reason. It is kept in the audit log.")).toBeVisible();
    await page.getByLabel("Reason").fill("playwright check");
    await page.getByRole("button", { name: "Save switches" }).click();
    await expect(page.getByText("Saved. The change is in the audit log")).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("status").filter({ hasText: "New accounts are paused" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Signed out, the sign-up form refuses with the same wording, even with a valid invite code.
    const invite = `TGS-PSE-${randomUUID().slice(0, 8).toUpperCase()}`;
    await service.from("invites").insert({ code: invite, max_uses: 1, note: "playwright paused" });
    await page.context().clearCookies();
    await page.goto("/signup");
    await page.getByLabel("Invite code").fill(invite);
    await page.getByLabel("Email address").fill(`e2e-paused-${randomUUID()}@example.test`);
    await page.getByLabel("Choose a password").fill("a long pilot password");
    await page.getByLabel("I am 18 or over.").check();
    await page.getByLabel(/I understand that my Dispatches are public/).check();
    await page.getByLabel(/I agree to the/).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "New accounts are paused for a short while." })).toBeVisible();

    // Switch it off again.
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/admin/settings");
    await page.getByLabel(/Pause sign-ups/).uncheck();
    await page.getByLabel("Reason").fill("playwright check over");
    await page.getByRole("button", { name: "Save switches" }).click();
    await expect(page.getByText("Saved. The change is in the audit log")).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("status").filter({ hasText: "New accounts are paused" })).toHaveCount(0);
  });

  test("the admin Health page shows queues, jobs and events", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/admin/health");
    await expect(page.getByRole("heading", { level: 1, name: "Health" })).toBeVisible();
    await expect(page.getByText("Emails waiting")).toBeVisible();
    await expect(page.getByText("housekeeping-limits-events")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("too many wrong sign-ins for one address are refused with a clear message", async ({ page }) => {
    const target = `e2e-ratelimit-${randomUUID()}@example.test`;
    await page.goto("/login");
    let refused = false;
    for (let i = 0; i < 10 && !refused; i++) {
      await page.getByLabel("Email address").fill(target);
      await page.getByLabel("Password").fill("not the right password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      refused = await page.getByText("Too many sign-in attempts.").isVisible().catch(() => false);
      if (!refused) await expect(page.getByText("That email and password do not match our records.")).toBeVisible();
    }
    expect(refused).toBe(true);
    await expect(page.getByText("Please wait a few minutes and try again.")).toBeVisible();
    // The event log has the trip, with the bucket name only.
    const { data } = await service.from("system_events").select("kind, code").eq("kind", "rate_limited").eq("code", "sign_in_email").limit(1);
    expect(data?.length).toBe(1);
  });
});
