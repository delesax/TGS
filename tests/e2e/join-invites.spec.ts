import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { inviteCodeHash } from "../../src/lib/invite-codes";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// "Ask to join" and the admin invites screen, end to end: request, approve, email, sign up with the right and wrong
// address, expired, revoked and reused codes. Local Supabase and the local Mailpit inbox only.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const PASSWORD = "a join invites password";
const emails: string[] = [];
const userIds: string[] = [];
let adminId: string;
const adminEmail = `e2e-invites-admin-${randomUUID()}@example.test`;
const fresh = (label: string) => {
  const e = `e2e-${label}-${randomUUID().slice(0, 8)}@example.test`;
  emails.push(e);
  return e;
};

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(adminEmail);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function fillSignUp(page: Page, email: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Choose a password").fill("a long pilot password");
  await page.getByLabel("I am 18 or over.").check();
  await page.getByLabel(/I understand that my Dispatches are public/).check();
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
}

async function processEmail() {
  await fetch(`${env.siteUrl}/api/email/process`, { method: "POST", headers: { Authorization: `Bearer ${env.emailSecret}` } });
}

/** The invitation Mailpit holds for an address: its text, once it has arrived. */
async function inviteMail(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    await processEmail();
    const search = await fetch(`${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await search.json()) as { messages?: { ID: string }[] };
    if (messages?.length) {
      const message = (await (await fetch(`${env.mailpitUrl}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
      return message.Text;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No invitation reached ${email}`);
}

async function userFor(email: string) {
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  const user = data?.users.find((u) => u.email === email);
  if (user) userIds.push(user.id);
  return user;
}

async function addRequest(email: string) {
  const { error } = await service.rpc("request_to_join", { p_email: email, p_note: "playwright" });
  if (error) throw error;
}

/** Ticks one request and presses a button on the admin screen. */
async function approve(page: Page, email: string, button: string) {
  await page.goto("/admin/invites");
  await page.getByRole("checkbox", { name: new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).check();
  await page.getByRole("button", { name: button }).click();
}

test.describe("ask to join, and invites from the admin screen", () => {
  test.beforeAll(async () => {
    await service.from("rate_limits").delete().like("bucket", "join_request%");
    await service.from("rate_limits").delete().like("bucket", "sign_%");
    const code = `TGS-INV-${randomUUID().slice(0, 8).toUpperCase()}`;
    await service.from("invites").insert({ code, max_uses: 1, note: "playwright invites admin" });
    const { data, error } = await service.auth.admin.createUser({
      email: adminEmail, password: PASSWORD, email_confirm: true, app_metadata: { role: "admin" },
      user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
    });
    if (error) throw error;
    adminId = data.user.id;
    await service.from("profiles").update({ handle: `IV${adminId.replace(/-/g, "").slice(0, 10)}` }).eq("id", adminId);
  });

  test.afterAll(async () => {
    await service.from("community_settings").update({ invite_daily_email_limit: 25, email_global_daily_cap: 60, resend_daily_limit: 100 }).eq("id", true);
    await service.from("rate_limits").delete().like("bucket", "join_request%");
    const lower = emails.map((e) => e.toLowerCase());
    if (lower.length) {
      const { data: reqs } = await service.from("join_requests").select("invite_id").in("email", lower);
      const ids = (reqs ?? []).map((r) => r.invite_id).filter(Boolean) as string[];
      await service.from("email_outbox").delete().in("to_email", lower);
      await service.from("join_requests").delete().in("email", lower);
      if (ids.length) await service.from("invites").delete().in("id", ids);
    }
    for (const id of userIds) await service.auth.admin.deleteUser(id);
    if (adminId) await service.auth.admin.deleteUser(adminId);
  });

  test("the public form gives one answer for a new address, a repeat, a current member and a bot, and keeps its layout at 375px", async ({ page }) => {
    await page.goto("/join");
    await expect(page.getByRole("heading", { level: 1, name: "Ask to join" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const thanks = /If we can offer you a place, we will email you/;
    const fresh1 = fresh("new");
    await page.getByLabel("Your email address").fill(fresh1);
    await page.getByRole("button", { name: "Ask to join" }).click();
    await expect(page.getByText(thanks)).toBeVisible();
    const first = (await page.getByRole("status").innerText()).trim();
    expect((await service.from("join_requests").select("status").eq("email", fresh1)).data).toEqual([{ status: "pending" }]);

    // The same address again (in capitals), a current member, and a bot all read the same.
    const answers: string[] = [];
    for (const email of [fresh1.toUpperCase(), adminEmail]) {
      await page.goto("/join");
      await page.getByLabel("Your email address").fill(email);
      await page.getByRole("button", { name: "Ask to join" }).click();
      await expect(page.getByText(thanks)).toBeVisible();
      answers.push((await page.getByRole("status").innerText()).trim());
    }
    await page.goto("/join");
    await page.locator("#website").fill("https://spam.example", { force: true });
    const botEmail = fresh("bot");
    await page.getByLabel("Your email address").fill(botEmail);
    await page.getByRole("button", { name: "Ask to join" }).click();
    await expect(page.getByText(thanks)).toBeVisible();
    answers.push((await page.getByRole("status").innerText()).trim());
    for (const a of answers) expect(a).toBe(first);

    // One row for the repeat, none for the member and none for the bot.
    expect((await service.from("join_requests").select("id").eq("email", fresh1)).data).toHaveLength(1);
    expect((await service.from("join_requests").select("id").eq("email", adminEmail)).data).toEqual([]);
    expect((await service.from("join_requests").select("id").eq("email", botEmail)).data).toEqual([]);

    // A bad address is explained, and nothing is saved.
    await page.goto("/join");
    await page.getByLabel("Your email address").fill("not an email");
    await page.getByRole("button", { name: "Ask to join" }).click();
    await expect(page.getByText("Enter your email address", { exact: false }).first()).toBeVisible();
  });

  test("the sign-up page does not link to it (not advertised until after the first wave), and the page is not indexed", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("link", { name: "Ask to join" })).toHaveCount(0);
    await expect(page.getByText("No invite yet?")).toHaveCount(0);
    await page.goto("/join");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("an admin approves and emails: the invitation arrives, its link signs the right address up once, and a wrong address or a reuse is refused", async ({ page, browser }) => {
    const email = fresh("approve");
    await addRequest(email);
    await signInAsAdmin(page);
    await approve(page, email, "Approve and email");
    await expect(page.getByText(/1 invite made\. 1 will be emailed now/)).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const text = await inviteMail(email);
    const link = /(https?:\/\/\S+\/signup\?code=[A-Z0-9-]+)/.exec(text)?.[1];
    expect(link, "the email carries a sign-up link").toBeDefined();
    // The code is not kept in the queue once it is sent.
    const row = (await service.from("email_outbox").select("status, payload").eq("to_email", email.toLowerCase()).single()).data!;
    expect(row.status).toBe("sent");
    expect(JSON.stringify(row.payload)).not.toContain("TGS-");

    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(link!);
    await fillSignUp(visitor, fresh("wrongaddress"));
    await expect(visitor.getByText("This code doesn't match this email. Use the address the invite was sent to.")).toBeVisible();
    await fillSignUp(visitor, email.toUpperCase());
    await expect(visitor.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible();
    expect(await userFor(email)).toBeDefined();

    // The same link again, for the same address, is refused: it was single use.
    const again = await (await browser.newContext()).newPage();
    await again.goto(link!);
    await fillSignUp(again, email);
    await expect(again.getByText("This code doesn't match this email. Use the address the invite was sent to.")).toBeVisible();
    await visitor.context().close();
    await again.context().close();
  });

  test("approving without emailing shows each link once and never again; an expired link is refused", async ({ page, browser }) => {
    const email = fresh("nolink");
    await signInAsAdmin(page);
    await page.goto("/admin/invites");
    await page.getByLabel(/Or paste email addresses/).fill(`${email}\n`);
    await page.getByRole("button", { name: "Approve without emailing" }).click();
    const link = await page.getByTestId("invite-link").innerText();
    expect(link).toMatch(/\/signup\?code=TGS-([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);
    await expect(page.getByText(/shown once/).first()).toBeVisible();
    // Copy buttons: they say so only if the copy worked, and the message carries the link.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Link copied.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await page.getByRole("button", { name: "Copy invite message" }).click();
    await expect(page.getByText("Message copied.")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(link);
    expect(copied).toContain("Use the email address this was sent to.");
    // Reload: the link is gone, and the list says it was not emailed.
    await page.reload();
    await expect(page.getByTestId("invite-link")).toHaveCount(0);
    await expect(page.getByText("Link shown to you, not emailed").first()).toBeVisible();
    expect(JSON.stringify((await service.from("invites").select("*").eq("invited_email", email.toLowerCase())).data)).not.toContain(link.split("code=")[1]);
    expect(await service.from("email_outbox").select("id").eq("to_email", email.toLowerCase())).toMatchObject({ data: [] });

    // Seven days and a second on: refused.
    const code = link.split("code=")[1];
    await service.from("invites").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("code_hash", inviteCodeHash(code));
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(link);
    await fillSignUp(visitor, email);
    await expect(visitor.getByText("This code doesn't match this email. Use the address the invite was sent to.")).toBeVisible();
    await visitor.context().close();
  });

  test("an admin can revoke an invite, and a revoked link is refused", async ({ page, browser }) => {
    const email = fresh("revoke");
    await signInAsAdmin(page);
    await page.goto("/admin/invites");
    await page.getByLabel(/Or paste email addresses/).fill(email);
    await page.getByRole("button", { name: "Approve without emailing" }).click();
    const link = await page.getByTestId("invite-link").innerText();
    await page.reload();
    const card = page.getByRole("listitem").filter({ hasText: email });
    await card.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("Invite revoked. Its link no longer works.")).toBeVisible();
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(link);
    await fillSignUp(visitor, email);
    await expect(visitor.getByText("This code doesn't match this email. Use the address the invite was sent to.")).toBeVisible();
    await visitor.context().close();
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: email }).getByText("Revoked")).toBeVisible();
  });

  test("invites over the day's budget wait for later days instead of being dropped, and the screen says so", async ({ page }) => {
    await service.from("community_settings").update({ invite_daily_email_limit: 1, email_global_daily_cap: 60, resend_daily_limit: 100000 }).eq("id", true);
    const people = [fresh("budget"), fresh("budget"), fresh("budget")];
    for (const p of people) await addRequest(p);
    await signInAsAdmin(page);
    await page.goto("/admin/invites");
    for (const p of people) await page.getByRole("checkbox", { name: new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).check();
    await expect(page.getByText(/3 chosen/)).toBeVisible();
    await page.getByRole("button", { name: "Approve and email" }).click();
    await expect(page.getByText(/3 invites made\./)).toBeVisible();
    await expect(page.getByText(/on the next days when the email budget allows/)).toBeVisible();
    const rows = (await service.from("email_outbox").select("send_after, status").in("to_email", people.map((p) => p.toLowerCase()))).data!;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "queued" || r.status === "sent")).toBe(true);
    const later = rows.filter((r) => Date.parse(r.send_after) > Date.now() + 3_600_000);
    expect(later.length).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("heading", { name: "Email budget" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await service.from("community_settings").update({ invite_daily_email_limit: 25, resend_daily_limit: 100 }).eq("id", true);
  });

  test("an admin can reject a request, and re-issue an invite", async ({ page }) => {
    const rejectMe = fresh("reject");
    const reissueMe = fresh("reissue");
    await addRequest(rejectMe);
    await signInAsAdmin(page);
    await page.goto("/admin/invites");
    await page.getByRole("checkbox", { name: new RegExp(rejectMe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).check();
    await page.getByRole("button", { name: "Reject selected" }).click();
    await expect(page.getByText("1 request rejected. They were not emailed.")).toBeVisible();

    await page.getByLabel(/Or paste email addresses/).fill(reissueMe);
    await page.getByRole("button", { name: "Approve without emailing" }).click();
    const first = await page.getByTestId("invite-link").innerText();
    await page.reload();
    await page.getByRole("listitem").filter({ hasText: reissueMe }).getByRole("button", { name: "Re-issue, show link" }).click();
    await expect(page.getByText(/New invite made\. The old one is revoked\./)).toBeVisible();
    const second = await page.getByTestId("invite-link").innerText();
    expect(second).not.toBe(first);
    expect((await service.rpc("invite_check", { p_code: first.split("code=")[1], p_email: reissueMe })).data).toBe("invalid");
    expect((await service.rpc("invite_check", { p_code: second.split("code=")[1], p_email: reissueMe })).data).toBe("ok");
  });

  test("the public form slows down a caller who sends too many (5 an hour from one place)", async ({ page }) => {
    await service.from("rate_limits").delete().like("bucket", "join_request%");
    await page.goto("/join");
    let blocked = false;
    for (let i = 0; i < 7 && !blocked; i++) {
      await page.getByLabel("Your email address").fill(fresh("flood"));
      await page.getByRole("button", { name: "Ask to join" }).click();
      blocked = await page.getByText("Too many requests from here just now.").isVisible({ timeout: 4000 }).catch(() => false);
    }
    expect(blocked).toBe(true);
    await service.from("rate_limits").delete().like("bucket", "join_request%");
  });
});
