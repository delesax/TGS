import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestEnv } from "../test-env";

// The public Verdict page and the leaderboard, first visit on a throttled
// phone (Slow 4G + 4x CPU, as tests/e2e/performance.spec.ts), must be usable
// in under 2 seconds: largest contentful paint and DOMContentLoaded.

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });
const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: (1.44 * 1024 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 };
const BUDGET_MS = 2000;
const slug = `e2e-verdict-perf-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];
let campaignId = "";

test.beforeAll(async () => {
  const now = Date.now();
  const { data: c, error } = await service
    .from("campaigns")
    .insert({ slug, title: "Should parks stay open after dark?", category: "health_social_care", status: "closed", starts_at: new Date(now - 9 * 86_400_000).toISOString(), ends_at: new Date(now - 5 * 86_400_000).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  campaignId = c.id;
  const scores = [];
  for (let i = 0; i < 12; i++) {
    const code = `TGS-VP-${randomUUID().slice(0, 8).toUpperCase()}`;
    await service.from("invites").insert({ code, max_uses: 1 });
    const { data } = await service.auth.admin.createUser({ email: `vp-${randomUUID()}@example.test`, password: "a long pilot password", email_confirm: true, user_metadata: { invite_code: code, age_confirmed: true, terms_accepted: true, public_acknowledged: true } });
    const id = data.user!.id;
    userIds.push(id);
    await service.from("profiles").update({ handle: `VP_${randomUUID().replace(/-/g, "").slice(0, 10)}` }).eq("id", id);
    await service.from("dispatches").insert({ campaign_id: campaignId, author_id: id, kind: "argument", body: `Argument ${i}.`, ai_use: "none", moderation_status: "visible" });
    const final = 80 - i * 5;
    scores.push({ user_id: id, rank: i + 1, dispatches: 1, components: { panel: final, peer: final, ai_rubric: final, mind_change: final }, raw: { peer_weight: 1, voters: 1, mind_credits: 0 }, steelman_bonus: 0, steelman_dispatches: [], blended: final, final, first_dispatch_at: new Date(now).toISOString(), newcomer: true });
  }
  const { error: verdictError } = await service.from("verdicts").insert({
    campaign_id: campaignId,
    version: 1,
    status: "published",
    weights_snapshot: { version: 1, panel: 40, peer: 25, ai_rubric: 25, mind_change: 10, source: "campaign" },
    component_scores: scores,
    proposed_awards: [{ category: "grand_strategist", profile_id: userIds[0], dispatch_id: null, rationale: `@{user:${userIds[0]}} had the highest final score: 80.` }],
    winner_id: userIds[0],
    rationale: `@{user:${userIds[0]}} is the Grand Strategist with a final score of 80 out of 100.\n\nNext: @{user:${userIds[1]}} (75).`,
    published_at: new Date(now).toISOString(),
    appeal_closes_at: new Date(now + 7 * 86_400_000).toISOString(),
  });
  if (verdictError) throw verdictError;
});

test.afterAll(async () => {
  await service.from("dispatches").delete().eq("campaign_id", campaignId);
  for (const id of userIds) await service.auth.admin.deleteUser(id);
  await service.from("profiles").delete().in("id", userIds);
  await service.from("campaigns").delete().eq("id", campaignId);
});

const results: Record<string, { lcp: number; domContentLoaded: number; load: number }> = {};

test.afterAll(() => {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/verdict-performance.json", JSON.stringify({ profile: "Slow 4G + 4x CPU", budgetMs: BUDGET_MS, results }, null, 2));
  console.log(`Verdict and leaderboard, Slow 4G + 4x CPU:\n${JSON.stringify(results, null, 2)}`);
});

for (const [name, path, heading] of [
  ["verdict", () => `/campaigns/${slug}/verdict`, "Grand Strategist"],
  ["leaderboard", () => "/leaderboard", "Leaderboard"],
] as const) {
  test(`the ${name} page is usable in under 2 seconds on a throttled phone (first visit)`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: number };
      w.__lcp = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await page.goto(path(), { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return { lcp: (window as unknown as { __lcp: number }).__lcp, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd };
    });
    results[name] = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)])) as (typeof results)[string];
    expect(m.lcp).toBeLessThan(BUDGET_MS);
    expect(m.domContentLoaded).toBeLessThan(BUDGET_MS);
    await context.close();
  });
}
