import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const PASSWORD = "a batch two a password";

test.describe("Sprint 7 batch 2a: signals, judging and email settings, bound invites", () => {
  const email = `e2e-b2a-${randomUUID()}@example.test`;
  const created: string[] = [];
  let userId: string;

  test.beforeAll(async () => {
    await service.from("rate_limits").delete().like("bucket", "sign_%");
    const code = `TGS-B2A-${randomUUID().slice(0, 8).toUpperCase()}`;
    await service.from("invites").insert({ code, max_uses: 1, note: "playwright b2a" });
    const { data, error } = await service.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true, app_metadata: { role: "admin" },
      user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    });
    if (error) throw error;
    userId = data.user.id;
    await service.from("profiles").update({ handle: `BT${userId.replace(/-/g, "").slice(0, 10)}` }).eq("id", userId);
  });

  test.afterAll(async () => {
    await service.from("judging_settings").update({ min_voter_account_age_hours: 48, max_steelman_confirmations: 3, min_position_span_hours: 24 }).eq("id", true);
    await service.from("community_settings").update({ email_essentials_only: true, email_global_daily_cap: 60 }).eq("id", true);
    for (const id of created) await service.auth.admin.deleteUser(id);
    if (userId) await service.auth.admin.deleteUser(userId);
  });

  async function signIn(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);
  }

  test("the Signals page loads for an admin and explains that nothing is automatic", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/signals");
    await expect(page.getByRole("heading", { level: 1, name: "Signals" })).toBeVisible();
    await expect(page.getByText(/nothing here changes a score, a weight or an account/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("the judging settings save, including the three new fields", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/judging");
    await page.getByLabel(/Account age before votes/).fill("12");
    await page.getByLabel(/Steelman confirmations each person/).fill("2");
    await page.getByLabel(/Hours a position change must span/).fill("6");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Saved. The change is in the audit log.")).toBeVisible();
    const { data } = await service.from("judging_settings").select("min_voter_account_age_hours, max_steelman_confirmations, min_position_span_hours").single();
    expect(data).toEqual({ min_voter_account_age_hours: 12, max_steelman_confirmations: 2, min_position_span_hours: 6 });
  });

  test("the email controls show in Settings and save with a reason", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin/settings");
    const form = page.getByRole("form", { name: "Email controls" });
    await expect(form.getByLabel(/Essential emails only/)).toBeChecked();
    await expect(form.getByLabel(/Most app emails sent in one UK day/)).toHaveValue("60");
    await form.getByLabel(/Most app emails sent in one UK day/).fill("40");
    await form.getByRole("button", { name: "Save email controls" }).click();
    await expect(form.getByText("Give a reason. It is kept in the audit log.")).toBeVisible();
    await form.getByLabel("Reason").fill("playwright check");
    await form.getByRole("button", { name: "Save email controls" }).click();
    await expect(form.getByText("Saved. The change is in the audit log.")).toBeVisible();
    const { data } = await service.from("community_settings").select("email_global_daily_cap").eq("id", true).single();
    expect(data?.email_global_daily_cap).toBe(40);
  });

  test("a bound invite is refused for another address with a clear message and works for its own", async ({ page }) => {
    await service.from("rate_limits").delete().like("bucket", "sign_%");
    const bound = `e2e-bound-${randomUUID()}@example.test`;
    const code = `TGS-BND-${randomUUID().slice(0, 8).toUpperCase()}`;
    await service.from("invites").insert({ code, max_uses: 1, invited_email: bound, note: "playwright bound" });
    await page.goto(`/signup?code=${code}`);
    await page.getByLabel("Email address").fill(`e2e-other-${randomUUID()}@example.test`);
    await page.getByLabel("Choose a password").fill("a long pilot password");
    await page.getByLabel("I am 18 or over.").check();
    await page.getByLabel(/I understand that my Dispatches are public/).check();
    await page.getByLabel(/I agree to the/).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/made for a different email address/)).toBeVisible();
    await page.getByLabel("Email address").fill(bound);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
    const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
    const made = data?.users.find((u) => u.email === bound);
    if (made) created.push(made.id);
    expect(made).toBeDefined();
  });
});
