import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestEnv } from "../test-env";

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });

test("a Strategist adds a passkey and signs in with it", async ({ page, context }) => {
  // A confirmed user with a handle, created directly (sign-up itself is covered by sign-up.spec.ts).
  const code = `TGS-PK-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const email = `pk-${randomUUID()}@example.test`;
  const password = "a long pilot password";
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" },
  });
  if (error) throw error;
  const handle = `PK_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  await service.from("profiles").update({ handle }).eq("id", data.user.id);

  try {
    // Chrome's built-in virtual authenticator stands in for Touch ID / Face ID.
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
    });

    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your Dossier" })).toBeVisible();

    await page.goto("/profile");
    await page.getByLabel("Name this device (optional)").fill("Test laptop");
    await page.getByRole("button", { name: "Add a passkey on this device" }).click();
    await expect(page.getByText("Passkey added.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Your passkeys" })).toContainText("Test laptop");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();

    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your Dossier" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: `@${handle}` })).toBeVisible();
  } finally {
    await service.auth.admin.deleteUser(data.user.id);
  }
});
