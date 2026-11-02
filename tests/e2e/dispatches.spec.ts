import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// Sprint 3 core journey at 375px: post, reply, react, follow, search, email,
// and the offline page. Two Strategists in separate browsers.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const userIds: string[] = [];
const slug = `e2e-debate-${randomUUID().slice(0, 8)}`;
const word = `quillwort${Date.now().toString(36)}`; // unique, so search finds only this test's Dispatch
let campaignId = "";

async function makeStrategist(prefix: string) {
  const code = `TGS-${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const email = `${prefix.toLowerCase()}-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true },
  });
  if (error) throw error;
  userIds.push(data.user.id);
  const handle = `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  await service.from("profiles").update({ handle, display_name: `${prefix} Lovelace`, bio: `Bio of ${prefix}.` }).eq("id", data.user.id);
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

async function waitForEmail(to: string, subject: RegExp): Promise<{ Text: string; HTML: string; Subject: string }> {
  for (let attempt = 0; attempt < 30; attempt++) {
    // The protected processor route, as pg_cron would call it.
    await fetch(`${env.siteUrl}/api/email/process`, { method: "POST", headers: { Authorization: `Bearer ${env.emailSecret}` } });
    const search = await fetch(`${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const hit = messages?.find((m) => subject.test(m.Subject));
    if (hit) return (await (await fetch(`${env.mailpitUrl}/api/v1/message/${hit.ID}`)).json()) as { Text: string; HTML: string; Subject: string };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email matching ${subject} arrived for ${to}`);
}

test.beforeAll(async () => {
  // No cooldown and no digest wait, so the journey runs quickly. Restored afterwards.
  await service.from("community_settings").update({ cooldown_seconds: 0, reply_digest_minutes: 0 }).eq("id", true);
  const now = Date.now();
  const { data, error } = await service
    .from("campaigns")
    .insert({
      slug,
      title: "Should libraries open on Sundays?",
      summary: "An end-to-end test Campaign.",
      rules: "Be civil.",
      category: "education",
      status: "open",
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 3 * 86_400_000).toISOString(),
      opinion_not_advice: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  campaignId = data.id;
});

test.afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30, reply_digest_minutes: 10 }).eq("id", true);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await service.from("campaigns").delete().eq("id", campaignId);
});

test("two Strategists post, reply, react, follow, search and get an email", async ({ browser }) => {
  const ada = await makeStrategist("ADA");
  const bo = await makeStrategist("BO");

  // --- Ada posts an argument, then evidence with a source link ---
  const a = await signIn(browser, ada.email);
  await a.goto(`/campaigns/${slug}`);
  await expect(a.getByText("Record your position to post")).toBeVisible();
  await a.getByLabel("For").check();
  await a.getByRole("button", { name: "Record my position" }).click();
  await expect(a.getByText("Your position now has been recorded.")).toBeVisible();

  const compose = a.getByRole("form", { name: "Write a Dispatch" });
  await compose.getByRole("button", { name: "Post Dispatch" }).click();
  await expect(a.getByRole("alert").filter({ hasText: "Please check the highlighted answers." })).toBeVisible();
  await expect(compose.getByText("Say whether you used AI.")).toBeVisible();

  await compose.getByLabel(/^Argument/).check();
  await compose.getByLabel("Your Dispatch").fill(`Sunday opening helps people who work all week. ${word}.`);
  await expect(compose.getByText(/of 1,500 characters/)).toBeVisible();
  await compose.getByLabel(/^None\. I wrote this myself\./).check();
  await compose.getByRole("button", { name: "Post Dispatch" }).click();
  await expect(a.getByText("Your Dispatch has been posted. You now follow this Campaign.")).toBeVisible();
  const mine = a.locator("article").filter({ hasText: word }).first();
  await expect(mine.getByText("Written without AI")).toBeVisible();
  await expect(mine.getByText("(you)")).toBeVisible();

  await compose.getByLabel(/^Evidence/).check();
  await compose.getByLabel("Why this evidence matters").fill("Library visits by day of the week.");
  await compose.getByLabel("Link 1").fill("javascript:alert(1)");
  await compose.getByLabel(/^Assisted\./).check();
  await compose.getByRole("button", { name: "Post Dispatch" }).click();
  await expect(compose.getByText("Only web links starting with http:// or https:// are allowed.")).toBeVisible();
  await compose.getByLabel("Link 1").fill("https://www.example.org/library-visits?utm_source=newsletter&year=2025");
  await compose.getByRole("button", { name: "Post Dispatch" }).click();
  await expect(a.getByText("Your Dispatch has been posted.", { exact: false })).toBeVisible();
  const link = a.getByRole("link", { name: /\(example\.org\)/ });
  await expect(link).toHaveAttribute("href", "https://www.example.org/library-visits?year=2025");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(a.getByText("Written with AI help")).toBeVisible();
  await expectNoHorizontalOverflow(a);

  // --- Bo reacts, replies and follows Ada ---
  const b = await signIn(browser, bo.email);
  await b.goto(`/campaigns/${slug}`);
  await b.getByLabel("Against").check();
  await b.getByRole("button", { name: "Record my position" }).click();
  await expect(b.getByText("Your position now has been recorded.")).toBeVisible();

  const target = b.locator("article").filter({ hasText: word }).first();
  const persuasive = target.getByRole("button", { name: /^Persuasive/ });
  await persuasive.click();
  await expect(persuasive).toHaveAttribute("aria-pressed", "true");
  await expect(persuasive).toContainText("1");
  await b.reload();
  await expect(b.locator("article").filter({ hasText: word }).first().getByRole("button", { name: /^Persuasive/ })).toHaveAttribute("aria-pressed", "true");

  await b.locator("article").filter({ hasText: word }).first().getByRole("button", { name: "Reply" }).first().click();
  const reply = b.getByRole("form", { name: `Reply to @${ada.handle}` });
  await reply.getByLabel("Your rebuttal").fill("Sunday staff cost more, and that money would come from weekday hours.");
  await reply.getByLabel(/^None\. I wrote this myself\./).check();
  await reply.getByRole("button", { name: "Post rebuttal" }).click();
  await expect(b.getByText("Sunday staff cost more")).toBeVisible();
  await expect(b.getByRole("button", { name: /Hide 1 reply/ })).toBeVisible();

  // Ada's open page shows a "new Dispatches" pill when she comes back to the tab.
  await a.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(a.getByRole("button", { name: /1 new Dispatch\. Show/ })).toBeVisible();
  await a.getByRole("button", { name: /1 new Dispatch\. Show/ }).click();
  await expect(a.getByText("Sunday staff cost more")).toBeVisible();

  // Ada cannot react to her own Dispatch: the counts show, but not as buttons.
  const ownCard = a.locator("article").filter({ hasText: word }).first().locator(":scope > div").first();
  await expect(ownCard.getByText("Persuasive")).toBeVisible();
  await expect(ownCard.getByRole("button", { name: /^Persuasive/ })).toHaveCount(0);

  await b.getByRole("link", { name: `@${ada.handle}` }).first().click();
  await expect(b.getByRole("heading", { level: 1, name: `@${ada.handle}` })).toBeVisible();
  await expect(b.getByText("ADA Lovelace")).toBeVisible();
  await expect(b.getByText("Bio of ADA.")).toBeVisible();
  await b.getByRole("button", { name: `Follow @${ada.handle}` }).click();
  await expect(b.getByRole("button", { name: `Following @${ada.handle}. Unfollow` })).toBeVisible();
  await expectNoHorizontalOverflow(b);

  await b.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dossier" }).click();
  const following = b.getByRole("region", { name: "Following" });
  await expect(following.getByRole("link", { name: `@${ada.handle}` })).toBeVisible();
  await expect(following.getByRole("link", { name: "Should libraries open on Sundays?" })).toBeVisible();
  await expect(b.getByRole("region", { name: "Your Dispatches in Should libraries open on Sundays?" })).toBeVisible();
  await expectNoHorizontalOverflow(b);

  // --- Search from the header ---
  await b.getByRole("searchbox", { name: "Search Campaigns, Dispatches and Strategists" }).fill(word);
  await b.getByRole("searchbox", { name: "Search Campaigns, Dispatches and Strategists" }).press("Enter");
  await expect(b.getByRole("heading", { level: 1, name: "Search" })).toBeVisible();
  await expect(b.getByText("1 result for")).toBeVisible();
  await expect(b.locator("mark", { hasText: word })).toBeVisible();
  await b.getByRole("link", { name: "Strategists" }).click();
  await expect(b.getByRole("heading", { name: "No results" })).toBeVisible();
  await expectNoHorizontalOverflow(b);

  // --- Ada gets an email about Bo's reply ---
  const email = await waitForEmail(ada.email, /replied to your Dispatch/);
  expect(email.Subject).toBe(`@${bo.handle} replied to your Dispatch`);
  expect(email.Text).toContain(`/campaigns/${slug}#dispatch-`);
  expect(email.Text).toMatch(/Stop these emails: http.*\/email\/unsubscribe\?token=/);
  expect(email.HTML).toContain('lang="en-GB"');

  // The unsubscribe link works without signing in.
  const unsubscribe = /Stop these emails: (\S+)/.exec(email.Text)![1];
  const anon = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await anon.goto(unsubscribe.replace(/^https?:\/\/[^/]+/, ""));
  await anon.getByRole("button", { name: "Stop these emails" }).click();
  await expect(anon.getByText("Done. We will not send you these emails any more.")).toBeVisible();
  const { data: prefs } = await service.from("notification_preferences").select("replies, campaign_updates").eq("user_id", ada.id).single();
  expect(prefs).toEqual({ replies: false, campaign_updates: true });

  // --- Signed out: a Strategist page shows only the handle, join date and public Dispatches ---
  await anon.goto(`/strategists/${ada.handle}`);
  await expect(anon.getByRole("heading", { level: 1, name: `@${ada.handle}` })).toBeVisible();
  await expect(anon.getByText(/^Strategist since /)).toBeVisible();
  await expect(anon.getByText(word)).toBeVisible();
  await expect(anon.getByText("ADA Lovelace")).toHaveCount(0);
  await expect(anon.getByText("Bio of ADA.")).toHaveCount(0);
  await expect(anon.getByRole("link", { name: "Sign in to follow" })).toBeVisible();
  await expectNoHorizontalOverflow(anon);

  // ...and searching for people asks them to sign in.
  await anon.goto(`/search?q=${ada.handle}&type=strategists`);
  await expect(anon.getByRole("heading", { name: "Sign in to search for Strategists" })).toBeVisible();
  await anon.goto(`/search?q=${ada.handle}`);
  await expect(anon.getByText("Nothing matched", { exact: false }).or(anon.getByRole("status"))).toBeVisible();
  // Result cards are labelled "Campaign", "Dispatch" or "Strategist"; none may be a person.
  await expect(anon.locator("ol > li").filter({ has: anon.getByText("Strategist", { exact: true }) })).toHaveCount(0);
  await expectNoHorizontalOverflow(anon);
});

test("a sensitive Campaign shows its content note before the compose box and the Dispatches", async ({ page }) => {
  const sensitiveSlug = `e2e-sensitive-${randomUUID().slice(0, 8)}`;
  const { data, error } = await service
    .from("campaigns")
    .insert({
      slug: sensitiveSlug,
      title: "A sensitive test Campaign",
      category: "health_social_care",
      status: "open",
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      is_sensitive: true,
      content_note: "This Campaign discusses end-of-life care.",
      opinion_not_advice: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  try {
    await page.goto(`/campaigns/${sensitiveSlug}`);
    const gate = page.getByRole("region", { name: "Content note before the Dispatches" });
    await expect(gate.getByText("This Campaign discusses end-of-life care.")).toBeVisible();
    await expect(page.getByText("Sign in to post", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("dispatch-threads")).toHaveCount(0);
    await gate.getByRole("button", { name: "I have read the note. Show the Dispatches" }).click();
    await expect(page.getByText("Sign in to post", { exact: true })).toBeVisible();
    await expect(page.getByTestId("dispatch-threads")).toBeVisible();
    await expect(page.getByText("Opinion, not advice.").first()).toBeVisible();
  } finally {
    await service.from("campaigns").delete().eq("id", data.id);
  }
});

test("pages fit a 375px screen", async ({ page }) => {
  for (const path of ["/campaigns", `/campaigns/${slug}`, "/login", `/search?q=${word}`]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("the offline page is shown when there is no connection", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto("/");
  // Wait for the service worker to install and take control.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
  const cached = await page.evaluate(async () => (await caches.keys()).length);
  expect(cached).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.goto("/campaigns");
  await expect(page.getByRole("heading", { level: 1, name: "You are offline" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Pages themselves were never stored: only the shell.
  const stored = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) urls.push(new URL(req.url).pathname);
    return urls;
  });
  expect(stored.filter((u) => !u.startsWith("/_next/static/") && !u.startsWith("/icons/") && u !== "/offline.html" && u !== "/manifest.webmanifest")).toEqual([]);
  await context.setOffline(false);
  await context.close();
});
