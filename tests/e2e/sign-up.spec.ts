import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestEnv } from "../test-env";

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });

/** Waits for the confirmation email in Mailpit (local Supabase's test inbox) and returns its link. */
async function confirmationLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const message = (await (await fetch(`${env.mailpitUrl}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string; HTML: string };
      const match = `${message.Text}\n${message.HTML}`.match(/https?:\/\/[^\s"'<>]*\/auth\/v1\/verify\?[^\s"'<>]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Confirmation email did not arrive");
}

test.describe("Sign-up with an invite code", () => {
  let inviteCode: string;
  const email = `e2e-${randomUUID()}@example.test`;
  const handle = `E2E_${randomUUID().replace(/-/g, "").slice(0, 10)}`;

  test.beforeAll(async () => {
    inviteCode = `TGS-E2E-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error } = await service.from("invites").insert({ code: inviteCode, max_uses: 1, note: "playwright" });
    if (error) throw error;
  });

  test.afterAll(async () => {
    const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
    const user = data?.users.find((u) => u.email === email);
    if (user) await service.auth.admin.deleteUser(user.id);
  });

  test("a new Strategist signs up, passes handle screening and sees an empty Dossier", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "I have an invite code" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();

    // All three boxes are required, and each missing box has its own message.
    await page.getByLabel("Invite code").fill(inviteCode);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Choose a password").fill("a long pilot password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Please tick the box to confirm you are 18 or over.")).toBeVisible();
    await expect(page.getByText("Please tick the box to confirm you understand that your Dispatches are public.")).toBeVisible();
    await expect(page.getByText("Please tick the box to agree to the terms of use and confirm you have read the privacy policy.")).toBeVisible();
    await page.getByLabel("I am 18 or over.").check();
    await page.getByLabel(/I understand that my Dispatches are public/).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Please tick the box to agree to the terms of use")).toBeVisible();
    await expect(page.getByText("Please tick the box to confirm you are 18 or over.")).toHaveCount(0);
    // The wording is exact.
    await expect(page.getByLabel(/I understand that my Dispatches are public/)).toBeVisible();
    await expect(page.getByText("I understand that my Dispatches are public, and that if I delete my account they stay in the debate record without my name.")).toBeVisible();

    // A wrong invite code is refused with a clear message, and nothing typed is lost.
    await page.getByLabel("Invite code").fill("TGS-WRNG-WRNG-WRNG");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Choose a password").fill("a long pilot password");
    await page.getByLabel(/I agree to the/).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Your invite code was not accepted." })).toBeVisible();
    await expect(page.getByLabel("Email address")).toHaveValue(email);

    // The real invite code works.
    await page.getByLabel("Invite code").fill(inviteCode);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
    // Cookie audit (privacy policy, "Cookies and similar technologies"): what the site stores right after sign-up.
    const afterSignUp = await page.context().cookies();
    expect(afterSignUp.length).toBeGreaterThan(0);
    for (const c of afterSignUp) expect(c.name, "only code-verifier cookies exist at this point").toMatch(/^sb-.+code-verifier$/);

    // Click the link in the confirmation email.
    await page.goto(await confirmationLink(email));
    await expect(page.getByRole("heading", { level: 1, name: "Choose your handle" })).toBeVisible();

    // Handle screening blocks an impersonation attempt...
    await page.getByRole("textbox", { name: "Handle" }).fill("Admin");
    await page.getByRole("button", { name: "Save my handle" }).click();
    await expect(page.getByText("could be mistaken for an official or staff account")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Handle" })).toHaveValue("Admin");

    // ...and accepts a normal one.
    await page.getByRole("textbox", { name: "Handle" }).fill(handle);
    await page.getByRole("button", { name: "Save my handle" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Your Dossier" })).toBeVisible();
    await expect(page.getByText(`Welcome, @${handle}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "No Dispatches yet" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No awards yet" })).toBeVisible();

    // Persistent header: Account page, then a clear way back home.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Account" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: `Welcome back, @${handle}` })).toBeVisible();

    // The decision was recorded for admin review (CLAUDE.md rule 6).
    const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
    const userId = users.users.find((u) => u.email === email)!.id;
    const { data: decisions } = await service.from("ai_decisions").select("subject_id, outcome").eq("user_id", userId);
    expect(decisions?.map((d) => `${d.subject_id}:${d.outcome}`).sort()).toEqual(["Admin:block", `${handle}:allow`]);

    // No horizontal scrolling at 375px.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
