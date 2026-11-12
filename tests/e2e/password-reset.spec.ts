import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });

const OLD_PASSWORD = "an old pilot password";
const NEW_PASSWORD = "a brand new password";

/** Newest first. */
async function messagesFor(email: string): Promise<{ ID: string; Created: string }[]> {
  const search = await fetch(`${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  const { messages } = (await search.json()) as { messages: { ID: string; Created: string }[] | null };
  return (messages ?? []).sort((a, b) => b.Created.localeCompare(a.Created));
}

/** Waits for a reset email in Mailpit and returns the link in it (the default local template link). */
async function resetLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const [first] = await messagesFor(email);
    if (first) {
      const message = (await (await fetch(`${env.mailpitUrl}/api/v1/message/${first.ID}`)).json()) as { Text: string; HTML: string };
      const match = `${message.Text}\n${message.HTML}`.match(/https?:\/\/[^\s"'<>]*\/auth\/v1\/verify\?[^\s"'<>]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Reset email did not arrive");
}

async function ask(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Forgot your password?" })).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  // Supabase allows one reset email per address per second; stay clear of that limit.
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Send me a reset link" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
}

test.describe("Password recovery", () => {
  const email = `e2e-reset-${randomUUID()}@example.test`;
  let userId: string;

  test.beforeAll(async () => {
    const code = `TGS-RST-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error: inviteError } = await service.from("invites").insert({ code, max_uses: 1, note: "playwright reset" });
    if (inviteError) throw inviteError;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: OLD_PASSWORD,
      email_confirm: true,
      user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    });
    if (error) throw error;
    userId = data.user.id;
  });

  test.afterAll(async () => {
    if (userId) await service.auth.admin.deleteUser(userId);
  });

  test("the same message appears whether or not the address has an account", async ({ page }) => {
    await ask(page, email);
    const known = await page.getByRole("main").innerText();

    const stranger = `e2e-nobody-${randomUUID()}@example.test`;
    await ask(page, stranger);
    const unknown = await page.getByRole("main").innerText();

    expect(unknown).toBe(known);
    await expectNoHorizontalOverflow(page);
    // Only the real account gets an email.
    await resetLink(email);
    expect(await messagesFor(stranger)).toHaveLength(0);
  });

  test("a malformed address is explained on the form", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByRole("button", { name: "Send me a reset link" }).click();
    await expect(page.getByText("Enter your email address in the form name@example.com.")).toBeVisible();
  });

  test("the emailed link lets the person choose a new password, once", async ({ page }) => {
    await ask(page, email);
    const link = await resetLink(email);

    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // The sign-up password rules apply, and the two entries must match.
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByLabel("Type the new password again").fill("short");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Your password needs at least 10 characters.")).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Type the new password again").fill("something else entirely");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("The two passwords do not match.")).toBeVisible();

    await page.getByLabel("Type the new password again").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=success/);
    await expect(page.getByText("Your password has been changed. Sign in with your new password.")).toBeVisible();

    // Signed out everywhere: the old password no longer works, the new one does.
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(OLD_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("That email and password do not match our records.")).toBeVisible();
    await page.getByLabel("Password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // Using the same link again says so and offers a new one.
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByRole("alert").filter({ hasText: "expired or has already been used" })).toBeVisible();
    await page.getByRole("link", { name: "Back to sign in" }).waitFor();
    await expect(page.getByRole("heading", { level: 1, name: "Forgot your password?" })).toBeVisible();
  });

  test("the cross-device (token) link works once and then says it has been used", async ({ page }) => {
    const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
    if (error) throw error;
    const url = `/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/reset-password`;

    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("yet another good password");
    await page.getByLabel("Type the new password again").fill("yet another good password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=success/);

    await page.goto(url);
    await expect(page.getByRole("alert").filter({ hasText: "expired or has already been used" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
  });

  test("a garbled link and a direct visit both say the link has expired", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=not-a-real-token&type=recovery&next=/reset-password");
    await expect(page.getByRole("alert").filter({ hasText: "expired or has already been used" })).toBeVisible();

    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { level: 1, name: "This link has expired" })).toBeVisible();
    await page.getByRole("link", { name: "Ask for a new reset link" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("an ordinary signed-in session cannot use the reset page", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("yet another good password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { level: 1, name: "This link has expired" })).toBeVisible();
  });
});
