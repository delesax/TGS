import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "./fixtures";
import { loadTestEnv } from "../test-env";

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });

const PASSWORD = "a landing test password";

test.describe("Where sign-in lands", () => {
  const email = `e2e-landing-${randomUUID()}@example.test`;

  test.beforeAll(async () => {
    const code = `TGS-LND-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: inviteError } = await service.from("invites").insert({ code, max_uses: 1, note: "playwright landing" });
    if (inviteError) throw inviteError;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    });
    if (error) throw error;
    const { error: profileError } = await service.from("profiles").update({ handle: `landing${randomUUID().slice(0, 6)}` }).eq("id", data.user.id);
    if (profileError) throw profileError;
  });

  async function signInAt(page: Page, url: string) {
    await page.context().clearCookies();
    await page.goto(url);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }

  test("no next parameter lands on the home page", async ({ page }) => {
    await signInAt(page, "/login");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  });

  test("a valid next parameter is still honoured", async ({ page }) => {
    await signInAt(page, "/login?next=/campaigns");
    await expect(page).toHaveURL(/\/campaigns$/);
  });

  test("a signed-out visit to a protected page returns there after sign-in", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dossier");
    await expect(page).toHaveURL(/\/login\?next=%2Fdossier/);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dossier/);
  });

  for (const bad of ["https://evil.example/", "//evil.example/", "/\\evil.example", "javascript:alert(1)"]) {
    test(`an external or protocol-relative next is ignored: ${bad}`, async ({ page }) => {
      await signInAt(page, `/login?next=${encodeURIComponent(bad)}`);
      await expect(page).toHaveURL(/\/$/);
      expect(new URL(page.url()).origin).toBe(new URL(env.siteUrl).origin);
    });
  }
});
