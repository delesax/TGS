/**
 * Control-width audit, for LOCAL development only.
 *
 *   npm run test:env && set -a && . ./.env.test.local && set +a
 *   npm run build && npx next start --port 3600 &            # JOIN_FORM_ENABLED=true for the "/join on" page
 *   npx tsx scripts/control-widths.ts --out /tmp/widths.json
 *
 * Seeds (idempotent, local only) an open Campaign with Dispatches, a closed Campaign with a published Verdict, peer voting
 * and an appeal window open, then visits the pages in PAGES at 375 (baseline) and 768, 1024, 1280, 1440, 1920 and 2560px,
 * signed out, as a Strategist and as an admin, and records every button, button-styled link, input, select, textarea and
 * option card with its width and its content width. From 640px up it lists the "stretched" ones (see scripts/lib/control-audit.ts
 * for the limits). Exempt: anything in the header (search), a dialog or a table.
 *
 * Options: --base http://localhost:3600  --base-off http://localhost:3601 (second server with the join switch off)
 *          --only <text in the page name>  --widths 768,1280  --out file.json  --fail (exit 1 when any offender is left)
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadTestEnv } from "../tests/test-env";
import { collectControls, offenceReasons, type Control } from "./lib/control-audit";
import { DEBATE_PASSWORD, DEBATE_SLUG, debateEmail, seedDebate } from "./lib/debate-seed";

const arg = (name: string, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : fallback;
};
const env = loadTestEnv();
const BASE = arg("base", env.siteUrl);
const BASE_OFF = arg("base-off", "");
const WIDTHS = (arg("widths") || "375,768,1024,1280,1440,1920,2560").split(",").map(Number);
const JUDGING_SLUG = "test-judging-high-street-tax";
const JUDGING_PASSWORD = "judging-test-password";
const ADMIN_EMAIL = "controls-admin@audit.example.test";
const NEWBIE_EMAIL = "controls-newbie@audit.example.test";
const AUDIT_PASSWORD = "an audit password 1";
const INVITE = "TGS-AUDIT-CONTROLS";

type Role = "out" | "member" | "judge" | "admin" | "newbie";
type Step = (page: Page) => Promise<void>;
type Target = { path: string; role: Role; name?: string; base?: string; after?: Step; before?: () => Promise<void> };

const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });

async function seed() {
  await seedDebate({ url: env.supabaseUrl, serviceKey: env.serviceKey, anonKey: env.anonKey }, () => {});
  execFileSync("npx", ["tsx", "scripts/seed-judging.ts"], { env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: env.supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: env.serviceKey, NEXT_PUBLIC_SUPABASE_ANON_KEY: env.anonKey }, stdio: "ignore" });
  const existingInvite = await service.from("invites").select("id").eq("code", INVITE).maybeSingle();
  if (!existingInvite.data) {
    const made = await service.from("invites").insert({ code: INVITE, note: "control-width audit", max_uses: 50 });
    if (made.error) throw made.error;
  }
  const ensure = async (email: string, admin: boolean, handle: string | null) => {
    const list = await service.auth.admin.listUsers({ perPage: 1000 });
    let user = list.data.users.find((u) => u.email === email);
    if (!user) {
      const created = await service.auth.admin.createUser({
        email,
        password: AUDIT_PASSWORD,
        email_confirm: true,
        app_metadata: admin ? { role: "admin" } : {},
        user_metadata: { invite_code: INVITE, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" },
      });
      if (created.error) throw created.error;
      user = created.data.user;
    }
    if (handle) await service.from("profiles").update({ handle }).eq("id", user.id);
    return user.id;
  };
  await ensure(ADMIN_EMAIL, true, "Audit_Admin");
  await ensure(NEWBIE_EMAIL, false, null);
  // Publish the judging Verdict (if it is still a draft) as the admin, then put the close 1 hour back so peer voting and the appeal window are both open.
  const { data: camp } = await service.from("campaigns").select("id").eq("slug", JUDGING_SLUG).single();
  const anon = createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false } });
  const signed = await anon.auth.signInWithPassword({ email: ADMIN_EMAIL, password: AUDIT_PASSWORD });
  if (signed.error) throw signed.error;
  const { data: verdict } = await service.from("verdicts").select("id, status").eq("campaign_id", camp!.id).order("version", { ascending: false }).limit(1).single();
  if (verdict && verdict.status === "draft") {
    const r = await anon.rpc("publish_verdict", { p_verdict_id: verdict.id });
    if (r.error) console.error("publish_verdict:", r.error.message);
  }
  await service.from("campaigns").update({ ends_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", camp!.id);
  return camp!.id as string;
}

async function login(browser: import("@playwright/test").Browser, email: string, password: string): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 15000 });
  const state = await ctx.storageState();
  await ctx.close();
  return browser.newContext({ baseURL: BASE, storageState: state });
}

const openDisplay: Step = async (page) => {
  await page.getByRole("button", { name: /Display settings/ }).first().click();
  await page.locator("dialog[open]").waitFor();
};
const showInstallPill: Step = async (page) => {
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => {}, userChoice: new Promise(() => {}) })));
  await page.waitForTimeout(200);
};
const openEdit: Step = async (page) => {
  const edit = page.getByRole("button", { name: /^Edit/ }).first();
  if (await edit.count()) await edit.click();
  else throw new Error("no Edit button");
};
const openReply: Step = async (page) => {
  const b = page.getByRole("button", { name: /Reply/ }).first();
  if (await b.count()) await b.click();
  else throw new Error("no Reply button");
};
const openReport: Step = async (page) => {
  const b = page.getByRole("button", { name: /Report/ }).first();
  if (await b.count()) await b.click();
  else throw new Error("no Report button");
};
const openAdminTabs = (ids: { campaign: string; judging: string }): Target[] => [
  { path: "/admin", role: "admin" },
  { path: "/admin/campaigns", role: "admin" },
  { path: "/admin/campaigns/new", role: "admin" },
  { path: `/admin/campaigns/${ids.campaign}`, role: "admin", name: "/admin/campaigns/[id]" },
  { path: "/admin/moderation", role: "admin" },
  { path: "/admin/reports", role: "admin" },
  { path: "/admin/users", role: "admin" },
  { path: "/admin/invites", role: "admin" },
  { path: "/admin/privacy-requests", role: "admin" },
  { path: "/admin/settings", role: "admin" },
  { path: "/admin/judging", role: "admin" },
  { path: `/admin/judging/${ids.judging}`, role: "admin", name: "/admin/judging/[campaignId]" },
  { path: "/admin/audit", role: "admin" },
  { path: "/admin/signals", role: "admin" },
  { path: "/admin/health", role: "admin" },
];

async function main() {
  const judgingId = await seed();
  const { data: debate } = await service.from("campaigns").select("id").eq("slug", DEBATE_SLUG).single();
  // Dispatches can be edited for a few minutes after posting: make the first member's newest one fresh before each visit.
  const memberId = (await service.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === debateEmail(0))!.id;
  const freshen = async () => {
    const { data } = await service.from("dispatches").select("id").eq("campaign_id", debate!.id).eq("author_id", memberId).order("created_at", { ascending: false }).limit(1);
    if (data?.[0]) await service.from("dispatches").update({ created_at: new Date().toISOString() }).eq("id", data[0].id);
  };
  const targets: Target[] = [
    { path: "/", role: "out" },
    { path: "/", role: "out", name: "/ (Display dialog open)", after: openDisplay },
    { path: "/", role: "out", name: "/ (install pill)", after: showInstallPill },
    { path: "/campaigns", role: "out" },
    { path: `/campaigns/${DEBATE_SLUG}`, role: "out", name: "/campaigns/[open] signed out" },
    { path: `/campaigns/${JUDGING_SLUG}`, role: "out", name: "/campaigns/[closed] signed out" },
    { path: `/campaigns/${JUDGING_SLUG}/verdict`, role: "out", name: "/campaigns/[closed]/verdict signed out" },
    { path: "/leaderboard", role: "out" },
    { path: "/login", role: "out" },
    { path: "/signup", role: "out" },
    { path: `/signup?code=${INVITE}`, role: "out", name: "/signup?code=" },
    { path: "/forgot-password", role: "out" },
    { path: "/forgot-password/sent", role: "out" },
    { path: "/reset-password", role: "out" },
    { path: "/join", role: "out", name: "/join (switch on)" },
    ...(BASE_OFF ? [{ path: "/join", role: "out" as Role, name: "/join (switch off)", base: BASE_OFF }] : []),
    { path: "/privacy", role: "out" },
    { path: "/privacy/contact", role: "out", name: "/privacy/contact signed out" },
    { path: "/terms", role: "out" },
    { path: "/ai-use", role: "out" },
    { path: "/accessibility", role: "out" },
    { path: "/search?q=zzzznothing", role: "out", name: "/search (empty state)" },
    { path: "/no-such-page-here", role: "out", name: "404 page" },
    { path: "/campaigns/no-such-campaign", role: "out", name: "404 campaign" },
    { path: "/", role: "member", name: "/ member" },
    { path: `/campaigns/${DEBATE_SLUG}`, role: "member", name: "/campaigns/[open] member (composer, forms)" },
    { path: `/campaigns/${DEBATE_SLUG}`, role: "member", name: "/campaigns/[open] member (dispatch edit)", after: openEdit, before: freshen },
    { path: `/campaigns/${DEBATE_SLUG}`, role: "member", name: "/campaigns/[open] member (Rebuttal reply form)", after: openReply },
    { path: `/campaigns/${DEBATE_SLUG}`, role: "member", name: "/campaigns/[open] member (report form)", after: openReport },
    { path: "/dossier", role: "member" },
    { path: "/profile", role: "member" },
    { path: "/profile/email", role: "member" },
    { path: "/profile/delete", role: "member" },
    { path: "/privacy/contact", role: "member", name: "/privacy/contact member" },
    { path: "/leaderboard", role: "member", name: "/leaderboard member" },
    { path: `/campaigns/${JUDGING_SLUG}`, role: "judge", name: "/campaigns/[closed] participant" },
    { path: `/campaigns/${JUDGING_SLUG}/verdict`, role: "judge", name: "/campaigns/[closed]/verdict participant (appeal)" },
    { path: `/campaigns/${JUDGING_SLUG}/vote`, role: "judge", name: "/campaigns/[closed]/vote (peer vote, steelman, mind-change)" },
    { path: "/onboarding", role: "newbie" },
    { path: "/dossier", role: "newbie", name: "/dossier (empty state)" },
    ...openAdminTabs({ campaign: debate!.id, judging: judgingId }),
  ];

  const browser = await chromium.launch();
  const contexts: Record<Exclude<Role, "out">, BrowserContext> = {
    member: await login(browser, debateEmail(0), DEBATE_PASSWORD),
    judge: await login(browser, "jt_ada@judging.example.test", JUDGING_PASSWORD),
    admin: await login(browser, ADMIN_EMAIL, AUDIT_PASSWORD),
    newbie: await login(browser, NEWBIE_EMAIL, AUDIT_PASSWORD),
  };
  const anonCtx = await browser.newContext({ baseURL: BASE });
  const rows: { page: string; role: Role; width: number; control: Control; reasons: string[] }[] = [];
  const failures: string[] = [];
  const only = arg("only");
  for (const t of targets) {
    if (only && !(t.name ?? t.path).includes(only)) continue;
    const ctx = t.role === "out" ? anonCtx : contexts[t.role];
    const page = await ctx.newPage();
    await page.addInitScript("window.__name = (f) => f");
    const name = t.name ?? t.path;
    for (const width of WIDTHS) {
      try {
        if (t.before) await t.before();
        await page.setViewportSize({ width, height: 1000 });
        await page.goto((t.base ?? BASE) + t.path, { waitUntil: "load" });
        // Pages stream (Suspense): wait for the network to settle so the composer, forms and lists are in.
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(300);
        if (t.after) {
          if (width < 1024 && t.after === openDisplay) {
            // Below 1024px the Text button lives in the Menu (see site-header.tsx).
            await page.getByRole("button", { name: /Menu/ }).first().click().catch(() => {});
          }
          await t.after(page).catch(() => failures.push(`${name} @${width}: interaction not reached`));
        }
        for (const control of await collectControls(page)) rows.push({ page: name, role: t.role, width, control, reasons: width >= 640 ? offenceReasons(control) : [] });
      } catch (e) {
        failures.push(`${name} @${width}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    await page.close();
  }
  await browser.close();
  const out = arg("out");
  if (out) writeFileSync(out, JSON.stringify({ widths: WIDTHS, rows, failures }, null, 1));

  const off = rows.filter((r) => r.reasons.length);
  const groups = new Map<string, { page: string; control: Control; widths: Record<number, number>; reasons: Set<string> }>();
  for (const r of off) {
    const key = `${r.page}||${r.control.kind}||${r.control.selector}||${r.control.label}`;
    const g = groups.get(key) ?? { page: r.page, control: r.control, widths: {}, reasons: new Set<string>() };
    g.widths[r.width] = r.control.width;
    r.reasons.forEach((x) => g.reasons.add(x));
    groups.set(key, g);
  }
  console.log(`Pages: ${targets.length}. Widths: ${WIDTHS.join(", ")}. Controls recorded: ${rows.length}. Offenders (page x element): ${groups.size}.`);
  for (const g of groups.values()) {
    console.log(`${g.page} | ${g.control.kind} | ${g.control.selector} | "${g.control.label}" | content ${g.control.contentWidth}px | ${Object.entries(g.widths).map(([w, v]) => `${v}px@${w}`).join(" ")} | ${[...g.reasons].join("; ")}`);
  }
  if (failures.length) console.log(`Not reached (${failures.length}):\n` + [...new Set(failures)].slice(0, 30).join("\n"));
  if (process.argv.includes("--fail") && groups.size) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
