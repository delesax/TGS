import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestEnv } from "../test-env";
import { expectNoHorizontalOverflow } from "./helpers";

// Sprint 4 at 375px with the FAKE AI provider (AI_PROVIDER=fake; the real
// API is never called): a Dispatch is held, appealed and released by an
// admin; nudge and coach; mute; account deletion off and on; admin pages
// hidden from everyone else.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const password = "a long pilot password";
const userIds: string[] = [];
const slug = `e2e-moderation-${randomUUID().slice(0, 8)}`;
let campaignId = "";

async function makeStrategist(prefix: string, admin = false) {
  const code = `TGS-${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
  await service.from("invites").insert({ code, max_uses: 1 });
  const email = `${prefix.toLowerCase()}-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true },
    app_metadata: admin ? { role: "admin" } : {},
  });
  if (error) throw error;
  userIds.push(data.user.id);
  const handle = `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  await service.from("profiles").update({ handle }).eq("id", data.user.id);
  await service.from("campaign_positions").insert({ campaign_id: campaignId, user_id: data.user.id, after_position: "for" });
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

async function postArgument(page: Page, text: string) {
  const compose = page.getByRole("form", { name: "Write a Dispatch" });
  await compose.getByLabel(/^Argument/).check();
  await compose.getByLabel("Your Dispatch").fill(text);
  await compose.getByLabel(/^None\. I wrote this myself\./).check();
  await compose.getByRole("button", { name: "Post Dispatch" }).click();
}

test.beforeAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 0 }).eq("id", true);
  const now = Date.now();
  const { data, error } = await service
    .from("campaigns")
    .insert({
      slug,
      title: "Should town halls open on Saturdays?",
      summary: "An end-to-end moderation test Campaign.",
      category: "education",
      status: "open",
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 3 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  campaignId = data.id;
});

test.afterAll(async () => {
  await service.from("community_settings").update({ cooldown_seconds: 30, account_deletion_enabled: false }).eq("id", true);
  await service.from("dispatches").delete().eq("campaign_id", campaignId);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await service.from("profiles").delete().in("id", userIds);
  await service.from("campaigns").delete().eq("id", campaignId);
});

test("an abusive Dispatch is held, appealed, and released by an admin with an audit trail", async ({ browser }) => {
  const author = await makeStrategist("HELD");
  const admin = await makeStrategist("ADMIN", true);
  const abusive = `You're an idiot and nobody likes you. ${randomUUID().slice(0, 6)}`;

  // --- The author posts; the screen holds it ---
  const a = await signIn(browser, author.email);
  await a.goto(`/campaigns/${slug}`);
  await postArgument(a, abusive);
  await expect(a.getByText(/a person will check it before others can see it/i).first()).toBeVisible();
  const card = a.locator("article").filter({ hasText: abusive }).first();
  await expect(card.getByText("Held.", { exact: false })).toBeVisible();
  await expect(card.getByText("Only you can see it.", { exact: false })).toBeVisible();
  await expectNoHorizontalOverflow(a);

  // --- Nobody else can see it ---
  const visitor = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await visitor.goto(`/campaigns/${slug}`);
  await expect(visitor.getByRole("heading", { name: "Dispatches", exact: true })).toBeVisible();
  await expect(visitor.getByText(abusive)).toHaveCount(0);

  // --- The author appeals, once ---
  await card.getByRole("button", { name: "Appeal" }).click();
  await card.getByLabel("Why do you think the decision is wrong?").fill("I was quoting what someone said to me.");
  await card.getByRole("button", { name: "Send appeal" }).click();
  await expect(a.getByText("Your appeal has been sent.", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card.getByText("You appealed this decision", { exact: false })).toBeVisible();
  await expect(card.getByRole("button", { name: "Appeal" })).toHaveCount(0);

  // --- The admin sees it in the queue, with the AI's reason, and releases it ---
  const m = await signIn(browser, admin.email);
  await m.goto("/admin");
  await expect(m.getByRole("heading", { level: 1, name: "Admin console" })).toBeVisible();
  await expectNoHorizontalOverflow(m);
  await m.getByRole("link", { name: "Open the queue" }).click();
  await expect(m.getByRole("heading", { level: 1, name: "Moderation" })).toBeVisible();
  const item = m.locator("li").filter({ hasText: abusive }).filter({ has: m.getByRole("form", { name: "Decide on this Dispatch" }) }).first();
  await expect(item.getByText("Appeal", { exact: true })).toBeVisible();
  await expect(item.getByText(/AI:.*Harassment/)).toBeVisible();
  await expectNoHorizontalOverflow(m);
  await item.getByLabel(/^Release/).check();
  await item.getByRole("button", { name: "Save decision" }).click();
  await expect(item.getByText("Give a reason. It is kept in the audit log.")).toBeVisible();
  await item.getByLabel("Reason (required, kept in the audit log)").fill("Quoting abuse to criticise it; fair on appeal.");
  await item.getByRole("button", { name: "Save decision" }).click();
  await expect(m.getByText(/Released\. It is visible to everyone\./)).toBeVisible();

  // --- Now everyone sees it, and the decision is in the audit log ---
  await visitor.reload();
  await expect(visitor.getByText(abusive)).toBeVisible();
  await m.goto("/admin/audit?action=moderation.");
  await expect(m.getByText("moderation.released", { exact: false }).first()).toBeVisible();
  await expectNoHorizontalOverflow(m);
  const { data: decision } = await service.from("ai_decisions").select("override_outcome, override_reason").eq("user_id", author.id).eq("subject_type", "dispatch").single();
  expect(decision).toEqual({ override_outcome: "allow", override_reason: "Quoting abuse to criticise it; fair on appeal." });
});

test("a Strategist gets a private nudge and coach feedback, and rates it", async ({ browser }) => {
  const writer = await makeStrategist("COACH");
  const p = await signIn(browser, writer.email);
  await p.goto(`/campaigns/${slug}`);
  const compose = p.getByRole("form", { name: "Write a Dispatch" });
  await compose.getByLabel(/^Argument/).check();
  await compose.getByLabel("Your Dispatch").fill("@Somebody is clearly clueless about council budgets.");
  await compose.getByRole("button", { name: "Check my tone" }).click();
  await expect(compose.getByText(/This reads as a personal attack on @Somebody/)).toBeVisible();

  await compose.getByLabel("Your Dispatch").fill("Town halls should open on Saturdays because most people work during the week.");
  await compose.getByRole("button", { name: /Get feedback \(3 left\)/ }).click();
  const feedback = compose.getByRole("region", { name: "Feedback on your draft" });
  await expect(feedback.getByText("Questions to consider")).toBeVisible();
  await expect(feedback.getByText(/The strongest opposing point: Missing/)).toBeVisible();
  await expect(compose.getByRole("button", { name: /Get feedback \(2 left\)/ })).toBeVisible();
  await feedback.getByRole("button", { name: "Yes" }).click();
  await expect(feedback.getByText("Thank you. Your rating helps us improve the coach.")).toBeVisible();
  await expectNoHorizontalOverflow(p);

  // Posting a fair argument is never blocked; a nudge after posting is private.
  await compose.getByLabel(/^None\. I wrote this myself\./).check();
  await compose.getByRole("button", { name: "Post Dispatch" }).click();
  await expect(p.getByText("Your Dispatch has been posted. You now follow this Campaign.")).toBeVisible();

  const { data: rated } = await service.from("coach_feedback").select("helpful").eq("user_id", writer.id);
  expect(rated).toEqual([{ helpful: true }]);
});

test("an admin mutes a Strategist, who sees why and cannot post", async ({ browser }) => {
  const noisy = await makeStrategist("MUTE");
  const admin = await makeStrategist("MOD", true);
  const m = await signIn(browser, admin.email);
  await m.goto(`/admin/users?q=${noisy.handle}`);
  await expectNoHorizontalOverflow(m);
  const row = m.locator("li").filter({ hasText: `@${noisy.handle}` }).first();
  await row.locator("summary").click();
  await row.getByLabel("Reason (required, kept in the audit log)").fill("Repeated personal attacks after a warning.");
  await row.locator('button[type="submit"]').click();
  await expect(m.getByText(/Posting muted\. They see the reason/)).toBeVisible();

  const n = await signIn(browser, noisy.email);
  await n.goto(`/campaigns/${slug}`);
  await expect(n.getByText("Posting is paused for your account")).toBeVisible();
  await expect(n.getByText(/Repeated personal attacks after a warning\./)).toBeVisible();
  await expect(n.getByRole("form", { name: "Write a Dispatch" })).toHaveCount(0);
});

test("account deletion is off by default, and when on it anonymises and keeps Dispatches", async ({ browser }) => {
  const leaver = await makeStrategist("LEAVE");
  const text = `A Dispatch that outlives its author ${randomUUID().slice(0, 6)}.`;
  const p = await signIn(browser, leaver.email);
  await p.goto(`/campaigns/${slug}`);
  await postArgument(p, text);
  await expect(p.getByText("Your Dispatch has been posted.", { exact: false })).toBeVisible();

  await p.goto("/profile/delete");
  await expect(p.getByText("Deleting your account is not switched on yet")).toBeVisible();
  await expect(p.getByRole("button", { name: "Delete my account" })).toHaveCount(0);
  await expectNoHorizontalOverflow(p);

  await service.from("community_settings").update({ account_deletion_enabled: true }).eq("id", true);
  await p.reload();
  await expect(p.getByText("DRAFT", { exact: false }).first()).toBeVisible();
  await expect(p.getByRole("link", { name: "Download my data" })).toBeVisible();
  await expect(p.getByText("your 1 Dispatch, shown as by", { exact: false })).toBeVisible();
  await expectNoHorizontalOverflow(p);
  await p.getByLabel(/Type your handle/).fill("wrong");
  await p.getByLabel("Your password").fill(password);
  await p.getByLabel(/I understand this cannot be undone/).check();
  await p.getByRole("button", { name: "Delete my account" }).click();
  await expect(p.getByText(/Type your handle, .* exactly to confirm/)).toBeVisible();
  await p.getByLabel(/Type your handle/).fill(leaver.handle);
  await p.getByRole("button", { name: "Delete my account" }).click();
  await expect(p.getByRole("heading", { level: 1, name: "Your account has been deleted" })).toBeVisible();
  await expectNoHorizontalOverflow(p);

  const visitor = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await visitor.goto(`/campaigns/${slug}`);
  const card = visitor.locator("article").filter({ hasText: text }).first();
  await expect(card.getByText("A deleted Strategist")).toBeVisible();
  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 });
  expect(users.users.some((u) => u.id === leaver.id)).toBe(false);
  await service.from("community_settings").update({ account_deletion_enabled: false }).eq("id", true);
});

test("admin pages say not found to everyone but admins", async ({ browser }) => {
  const plain = await makeStrategist("PLAIN");
  const p = await signIn(browser, plain.email);
  for (const path of ["/admin", "/admin/moderation", "/admin/users", "/admin/settings", "/admin/judging", "/admin/audit", "/admin/campaigns"]) {
    await p.goto(path);
    await expect(p.getByRole("heading", { level: 1, name: "We could not find that page" }), path).toBeVisible();
  }
  const csv = await p.request.get("/admin/audit/export");
  expect(csv.status()).toBe(404);

  const admin = await makeStrategist("CHIEF", true);
  const m = await signIn(browser, admin.email);
  for (const path of ["/admin/settings", "/admin/judging"]) {
    await m.goto(path);
    await expect(m.getByRole("heading", { level: 1 })).not.toHaveText("We could not find that page");
    await expectNoHorizontalOverflow(m);
  }
});

test("the sweeper re-screens a Dispatch left pending, and only with the secret", async ({ request }) => {
  const stuck = await makeStrategist("STUCK");
  // As if the server crashed after posting: pending, requested 5 minutes ago.
  const { data, error } = await service
    .from("dispatches")
    .insert({ campaign_id: campaignId, author_id: stuck.id, kind: "argument", position: "for", body: "Stuck while being checked.", ai_use: "none", moderation_status: "pending", screening: "awaiting", screen_requested_at: new Date(Date.now() - 5 * 60_000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  expect((await request.post("/api/moderation/sweep", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  const ok = await request.post("/api/moderation/sweep", { headers: { Authorization: `Bearer ${env.moderationSecret}` } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ claimed: expect.any(Number) });
  const { data: after } = await service.from("dispatches").select("moderation_status, screening").eq("id", data.id).single();
  expect(after).toEqual({ moderation_status: "visible", screening: "screened" });
});

test("a decided item leaves the queue and its confirmation stays, without a reload", async ({ browser }) => {
  const admin = await makeStrategist("QADMIN", true);
  const first = await makeStrategist("QONE");
  const second = await makeStrategist("QTWO");
  const tag1 = `queue-one-${randomUUID().slice(0, 6)}`;
  const tag2 = `queue-two-${randomUUID().slice(0, 6)}`;
  // Two held Dispatches, as the AI would have left them.
  for (const [author, tag] of [[first, tag1], [second, tag2]] as const) {
    const { data, error } = await service
      .from("dispatches")
      .insert({ campaign_id: campaignId, author_id: author.id, kind: "argument", position: "for", body: `Held for the queue test ${tag}`, ai_use: "none", moderation_status: "pending", screening: "awaiting", screen_requested_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw error;
    const { error: applyError } = await service.rpc("apply_dispatch_screening", {
      p_dispatch_id: data.id,
      p_result: { outcome: "hold", model: "test", prompt_version: "test.v1", provider: "fake", reason: "Test hold.", category: "harassment", confidence: 0.9, output: {} },
    });
    if (applyError) throw applyError;
  }

  const m = await signIn(browser, admin.email);
  await m.goto("/admin/moderation");
  // A full reload would clear this marker.
  await m.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
  const count = async () => Number(/\((\d+)\)/.exec((await m.getByRole("heading", { name: /^Dispatches \(\d+\)$/ }).textContent()) ?? "")?.[1]);
  const before = await count();
  const item = (tag: string) => m.locator("li").filter({ hasText: tag }).filter({ has: m.getByRole("form", { name: "Decide on this Dispatch" }) });

  await item(tag1).getByLabel(/^Release/).check();
  await item(tag1).getByLabel("Reason (required, kept in the audit log)").fill("Fine on a second look.");
  await item(tag1).getByRole("button", { name: "Save decision" }).click();

  // The confirmation appears, the item leaves the list, and the count drops, all without a reload.
  const log = m.getByRole("status", { name: "Decisions you just made" });
  await expect(log.getByText(tag1, { exact: false })).toBeVisible();
  await expect(log.getByText("Released. It is visible to everyone.", { exact: false })).toBeVisible();
  await expect(item(tag1)).toHaveCount(0);
  await expect.poll(count).toBe(before - 1);
  await expectNoHorizontalOverflow(m);

  // A second decision adds to the log; the first confirmation is still there.
  await item(tag2).getByLabel(/^Keep held/).check();
  await item(tag2).getByLabel("Reason (required, kept in the audit log)").fill("Still over the line.");
  await item(tag2).getByRole("button", { name: "Save decision" }).click();
  await expect(log.getByText("Just decided (2)")).toBeVisible();
  await expect(log.getByText(tag1, { exact: false })).toBeVisible();
  // Kept held stays in the queue, and its form starts afresh so it can be decided again.
  await expect(item(tag2).getByRole("button", { name: "Save decision" })).toBeVisible();
  await expect(item(tag2).getByLabel("Reason (required, kept in the audit log)")).toHaveValue("");
  await expectNoHorizontalOverflow(m);

  // The page was never reloaded, and a confirmation can be dismissed.
  expect(await m.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
  await log.getByRole("button", { name: "Dismiss this confirmation" }).first().click();
  await expect(log.getByText("Just decided (1)")).toBeVisible();

  const { data: rows } = await service.from("dispatches").select("moderation_status").like("body", "Held for the queue test queue-%").in("author_id", [first.id, second.id]);
  expect(rows!.map((r) => r.moderation_status).sort()).toEqual(["held", "visible"]);
});
