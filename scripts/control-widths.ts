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
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { collectControls, offenceReasons, type Control } from "./lib/control-audit";
import { env, openDisplay, prepareAudit, type Role } from "./lib/audit-pages";

const arg = (name: string, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : fallback;
};
const BASE = arg("base", env.siteUrl);
const BASE_OFF = arg("base-off", "");
const WIDTHS = (arg("widths") || "375,768,1024,1280,1440,1920,2560").split(",").map(Number);

async function main() {
  const browser = await chromium.launch();
  const { targets, contexts, anon: anonCtx } = await prepareAudit(browser, BASE, BASE_OFF);
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
