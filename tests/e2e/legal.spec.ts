import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// Legal hardening at 375px: legal pages, footer, privacy contact form (with the
// local Mailpit inbox standing in for email), admin privacy requests, cookie audit.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const userIds: string[] = [];
const requestEmails: string[] = [];

async function makeUser(prefix: string, admin = false) {
  const code = `TGS-${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const email = `${prefix.toLowerCase()}-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" },
    app_metadata: admin ? { role: "admin" } : {},
  });
  if (error) throw error;
  userIds.push(data.user.id);
  const handle = `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  await service.from("profiles").update({ handle }).eq("id", data.user.id);
  return { id: data.user.id, email, handle };
}

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your Dossier" })).toBeVisible();
  return page;
}

async function mailTo(to: string, subject: RegExp) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const hit = messages?.find((m) => subject.test(m.Subject));
    if (hit) return (await (await fetch(`${env.mailpitUrl}/api/v1/message/${hit.ID}`)).json()) as { Text: string; HTML: string; Subject: string };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to} matching ${subject}`);
}

test.afterAll(async () => {
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await service.from("privacy_requests").delete().in("email", requestEmails);
});

test.describe("legal pages and the footer", () => {
  const pages = [
    { path: "/privacy", h1: "Privacy policy", h2: "Who we are" },
    { path: "/terms", h1: "Terms of use", h2: "About these terms" },
    { path: "/ai-use", h1: "How we use AI", h2: "What the AI-use label means on a Dispatch" },
    { path: "/accessibility", h1: "Accessibility", h2: "Our aim" },
    { path: "/privacy/contact", h1: "Contact us about your data", h2: null },
  ];

  for (const p of pages) {
    test(`${p.path} renders at 375px with no sideways scrolling, and the footer shows the company block`, async ({ page }) => {
      await page.goto(p.path);
      await expect(page.getByRole("heading", { level: 1, name: p.h1 })).toBeVisible();
      if (p.h2) await expect(page.getByRole("heading", { level: 2, name: p.h2 })).toBeVisible();
      if (p.path !== "/privacy/contact") {
        await expect(page.getByText("DRAFT: this page is complete but has not yet had its final legal review. Some details are still to be added.")).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);

      const footer = page.getByTestId("company-block");
      await expect(footer).toContainText("The Grand Strategist Limited");
      await expect(footer).toContainText("Registered in England and Wales, company number");
      await expect(footer).toContainText("Registered office:");
      await expect(footer).toContainText("Contact:");
      for (const name of ["Terms of use", "Privacy policy", "How we use AI", "Accessibility", "Contact us about your data"]) {
        await expect(page.getByRole("navigation", { name: "Policies" }).getByRole("link", { name })).toBeVisible();
      }
    });
  }

  test("the privacy page shows its tables stacked on a phone, and the version line", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText("Version 2026-11-a, in force from")).toBeVisible();
    await expect(page.getByRole("table", { name: "Why we use your data and our legal basis" })).toBeVisible();
    await expect(page.getByRole("table", { name: "How long we keep each kind of data" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Cookies and similar storage used by the site" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Body type is at least 18px.
    const size = await page.locator("main p, p").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(18);
  });

  test("the terms say what the brief says about the cap, the law and reporting", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByText("limited to £100", { exact: false })).toBeVisible();
    await expect(page.getByText("governed by the law of England and Wales", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Reporting a Dispatch" })).toBeVisible();
    await expect(page.getByText("Samaritans are free on 116 123", { exact: false })).toBeVisible();
  });
});

test.describe("Contact us about your data", () => {
  test("a visitor sends a request: errors first, then saved, acknowledged by email, and the honeypot is invisible", async ({ page }) => {
    const email = `visitor-${randomUUID()}@example.test`;
    requestEmails.push(email);
    await page.goto("/privacy/contact");
    // The trap field is parked far off screen and hidden from assistive technology.
    const box = await page.locator("#website").boundingBox();
    expect(box!.x).toBeLessThan(-1000);
    await expect(page.locator("#website").locator("xpath=ancestor::div[@aria-hidden='true']")).toHaveCount(1);

    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Please check the highlighted answers." })).toBeVisible();
    await expect(page.getByText("Choose what your message is about.")).toBeVisible();

    await page.getByLabel("What is your message about?").selectOption("complaint");
    await page.getByLabel("Your email address").fill(email);
    await page.getByLabel("Your message", { exact: true }).fill("PRIVATE-MESSAGE-BODY I would like to complain.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Thank you. We have your message and sent you an email to confirm.")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const { data } = await service.from("privacy_requests").select("type, message, status, acknowledged_at, due_at, created_at, user_id").eq("email", email);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ type: "complaint", message: "PRIVATE-MESSAGE-BODY I would like to complain.", user_id: null });
    expect(data![0].acknowledged_at).not.toBeNull(); // the acknowledgement went out
    expect(data![0].status).toBe("acknowledged");

    const mail = await mailTo(email, /We have your message/);
    for (const body of [mail.Text, mail.HTML]) {
      expect(body).toContain("We have your message. We will reply within one month.");
      expect(body).toContain("Because it is a complaint, we will tell you the outcome without unnecessary delay.");
      expect(body).toContain("The Grand Strategist Limited");
      expect(body).toContain("Registered in England and Wales, company number");
      expect(body).not.toContain("PRIVATE-MESSAGE-BODY");
    }
    expect(mail.Text.toLowerCase()).not.toContain("stop these emails");
  });

  test("a bot that fills the hidden field gets a friendly answer and nothing is saved", async ({ page }) => {
    const email = `bot-${randomUUID()}@example.test`;
    requestEmails.push(email);
    await page.goto("/privacy/contact");
    await page.getByLabel("What is your message about?").selectOption("question");
    await page.getByLabel("Your email address").fill(email);
    await page.getByLabel("Your message", { exact: true }).fill("buy now");
    await page.evaluate(() => ((document.getElementById("website") as HTMLInputElement).value = "http://spam.example"));
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Thank you. We have your message.")).toBeVisible();
    const { data } = await service.from("privacy_requests").select("id").eq("email", email);
    expect(data).toEqual([]);
  });

  test("a signed-in Strategist has their account email filled in and locked; an admin can then work the request", async ({ browser }) => {
    const user = await makeUser("PRIV");
    const admin = await makeUser("ADMN", true);
    requestEmails.push(user.email);
    const p = await signIn(browser, user.email);
    await p.goto("/profile");
    await p.locator("#main").getByRole("link", { name: "Contact us about your data" }).click();
    await expect(p.getByLabel("Your email address")).toHaveValue(user.email);
    await expect(p.getByLabel("Your email address")).toHaveAttribute("readonly", "");
    await p.getByLabel("What is your message about?").selectOption("access");
    await p.getByLabel("Your message", { exact: true }).fill("Please send me everything you hold.");
    await p.getByRole("button", { name: "Send message" }).click();
    await expect(p.getByText("Thank you. We have your message and sent you an email to confirm.")).toBeVisible();

    const { data } = await service.from("privacy_requests").select("id, user_id").eq("email", user.email).single();
    expect(data!.user_id).toBe(user.id);

    // The person cannot see the admin page.
    await p.goto("/admin/privacy-requests");
    await expect(p.getByRole("heading", { level: 1, name: "We could not find that page" })).toBeVisible();

    const a = await signIn(browser, admin.email);
    await a.goto("/admin/privacy-requests");
    await expect(a.getByRole("heading", { level: 1, name: "Privacy requests" })).toBeVisible();
    await expect(a.getByText("I want to see the data you hold about me").first()).toBeVisible();
    await expectNoHorizontalOverflow(a);
    await a.getByRole("link", { name: "I want to see the data you hold about me" }).first().click();
    await expect(a.getByText("Please send me everything you hold.")).toBeVisible();
    await a.getByLabel("Status").selectOption("closed");
    await a.getByLabel("Outcome note").fill("Sent the export on request.");
    await a.getByRole("button", { name: "Save" }).click();
    await expect(a.getByText("Saved.")).toBeVisible();

    const { data: row } = await service.from("privacy_requests").select("status, outcome_note, closed_at").eq("id", data!.id).single();
    expect(row).toMatchObject({ status: "closed", outcome_note: "Sent the export on request." });
    expect(row!.closed_at).not.toBeNull();
    const { data: log } = await service.from("audit_log").select("action, details").eq("target_id", data!.id);
    expect(JSON.stringify(log)).not.toContain("Please send me everything");
    // Every view of the request is logged, so "opened" may appear more than once.
    expect([...new Set(log!.map((l) => l.action))].sort()).toEqual(["privacy_request.opened", "privacy_request.updated"]);
  });
});

test.describe("cookie and storage audit", () => {
  test("signed out: no cookies at all. Signed in: only the sign-in cookie. Nothing from a third party.", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    const thirdParty: string[] = [];
    page.on("request", (r) => {
      const host = new URL(r.url()).host;
      if (host !== new URL(env.siteUrl).host) thirdParty.push(host);
    });
    for (const path of ["/", "/privacy", "/campaigns", "/login"]) await page.goto(path);
    expect(await ctx.cookies()).toEqual([]);
    const signedOutStorage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
    expect(signedOutStorage.session).toEqual([]);
    expect(thirdParty, "requests to other hosts while signed out").toEqual([]);

    const user = await makeUser("CKIE");
    const signed = await signIn(browser, user.email);
    await signed.goto("/campaigns");
    const cookies = await signed.context().cookies();
    const names = cookies.map((c) => c.name).sort();
    console.log("COOKIE AUDIT signed-in:", JSON.stringify(cookies.map((c) => ({ name: c.name.replace(/\.\d+$/, ".N"), httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, days: c.expires > 0 ? Math.round((c.expires - Date.now() / 1000) / 86400) : "session" }))));
    console.log("COOKIE AUDIT storage:", JSON.stringify(await signed.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))));
    console.log("COOKIE AUDIT caches:", JSON.stringify(await signed.evaluate(async () => ("caches" in window ? await caches.keys() : []))));
    expect(names.every((n) => /^sb-[^-]+-auth-token(\.\d+)?$/.test(n)), names.join(", ")).toBe(true);
  });
});
