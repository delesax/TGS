/**
 * WCAG contrast audit across the whole app, for LOCAL development only.
 *
 *   npm run test:env && set -a && . ./.env.test.local && set +a
 *   npm run build && JOIN_FORM_ENABLED=true npx next start --port 3600 &
 *   npx tsx scripts/contrast.ts --theme light,dark --widths 375,1280 --sizes default,large --fail
 *
 * Visits every page and state in scripts/lib/audit-pages.ts (signed out, Strategist, participant, new user, admin; the
 * Display dialog, install pill, forms, empty and 404 states) and checks, in each requested theme:
 *   - text: every visible text node against its effective background (AA: 4.5, or 3 for large text);
 *   - placeholders (4.5), the focus ring of every focusable control (3, against the page behind it) and the border of
 *     inputs, selects and textareas (3);
 *   - gradients: this script does not trust a single colour where the background is a gradient. Any text that sits on
 *     one (a background-image, or a ::before layer such as the hero glow) is listed separately with its worst case
 *     (every colour stop composited over the page colour); look at those by hand (see the PR notes).
 *
 * Forcing a theme (no Automatic logic involved): --theme light | dark. Automatic: --theme auto with --hour (device clock,
 * default 12) and --device light|dark (default light). Several: --theme light,dark,auto.
 * Other options: --base URL  --widths 375,1280  --sizes default,large  --only <text in page name>  --out file.json  --fail
 */
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { env, openDisplay, prepareAudit } from "./lib/audit-pages";

const arg = (name: string, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : fallback;
};
const BASE = arg("base", env.siteUrl);
const WIDTHS = (arg("widths") || "375,1280").split(",").map(Number);
const SIZES = (arg("sizes") || "default,large").split(",");
const THEMES = (arg("theme") || "light,dark").split(",");
const HOUR = Number(arg("hour", "12"));
const DEVICE = arg("device", "light") as "light" | "dark";

type Finding = { page: string; theme: string; width: number; size: string; kind: string; what: string; ratio: number; need: number; note?: string };

/** Runs in the page. Returns text, placeholder, focus-ring and border findings plus the gradient-backed text. */
async function audit(page: Page) {
  await page.evaluate("window.__name = window.__name || ((f) => f)");
  // Transitions off, so a ring or colour is read at its final value and not part-way (links with transition-colors animate it).
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
  await page.waitForTimeout(50);
  return page.evaluate(() => {
    // With a modal dialog open the page behind it is inert and dimmed: only the dialog is checked.
    const modal = document.querySelector("dialog[open]");
    const inScope = (el: Element) => !modal || modal.contains(el);
    type RGBA = [number, number, number, number];
    const parse = (s: string): RGBA => {
      let m = s.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const a = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1];
      }
      m = s.match(/color\(srgb ([^)]+)\)/);
      if (m) {
        const a = m[1].split(/[ /]+/).filter(Boolean).map(Number);
        return [a[0] * 255, a[1] * 255, a[2] * 255, a.length > 3 ? a[3] : 1];
      }
      return [0, 0, 0, 0];
    };
    const over = (top: RGBA, bottom: RGBA): RGBA => {
      const a = top[3];
      return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
    };
    const lum = (c: RGBA) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: RGBA, b: RGBA) => {
      const x = lum(a);
      const y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const gradientStops = (image: string): RGBA[] => [...image.matchAll(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g)].map((m) => parse(m[0]));
    // A padding-box layer of one solid colour (linear-gradient(c, c)), as the featured card uses, counts as a plain fill.
    const solidLayer = (image: string): RGBA | null => {
      const first = image.match(/^linear-gradient\(([^)]*\)[^)]*)\)/);
      const stops = first ? gradientStops(first[0]) : [];
      return stops.length === 2 && stops[0].join() === stops[1].join() ? stops[0] : null;
    };
    const root = parse(getComputedStyle(document.documentElement).backgroundColor);
    const body = parse(getComputedStyle(document.body).backgroundColor);
    const page: RGBA = body[3] > 0 ? body : root[3] > 0 ? root : [255, 255, 255, 1];
    /** Effective solid background under an element, plus the gradient stops that sit on it (if any). */
    const backdrop = (el: Element) => {
      const layers: RGBA[] = [];
      const gradients: RGBA[][] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        const image = cs.backgroundImage;
        if (image && image !== "none") {
          const solid = solidLayer(image);
          if (solid) layers.push(solid);
          else gradients.push(gradientStops(image));
        }
        const before = getComputedStyle(e, "::before");
        if (before.content !== "none" && before.backgroundImage !== "none" && /gradient/.test(before.backgroundImage)) gradients.push(gradientStops(before.backgroundImage));
        const c = parse(cs.backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
      }
      let bg = page;
      for (const l of layers.reverse()) bg = over(l, bg);
      return { bg, gradients };
    };
    const where = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String((el as HTMLElement).className || "").split(" ")[0].slice(0, 28)}`;
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0 && r.width >= 2 && r.height >= 2;
    };
    const out: { kind: string; what: string; ratio: number; need: number; note?: string }[] = [];
    const gradientText: { what: string; worst: number; need: number; fg: string; box: { x: number; y: number; width: number; height: number } }[] = [];
    let checked = 0;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode;
      const text = (t.textContent ?? "").trim();
      const el = t.parentElement;
      if (!text || !el || el.closest("script,style,noscript,svg,.sr-only,[hidden]") || !visible(el) || !inScope(el)) continue;
      // Hidden by an ancestor (closed dialog, collapsed menu, display:none): skip.
      if (el.getClientRects().length === 0) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      const need = fs >= 24 || (fs >= 18.66 && +cs.fontWeight >= 700) ? 3 : 4.5;
      const { bg, gradients } = backdrop(el);
      const fg = over(parse(cs.color), bg);
      checked++;
      const r = ratio(fg, bg);
      const disabled = el.closest(":disabled,[aria-disabled='true']") ? "disabled (exempt from AA, shown for review)" : undefined;
      if (r < need) out.push({ kind: "text", what: `${where(el)} "${text.slice(0, 32)}"`, ratio: r, need, note: disabled });
      if (gradients.length) {
        const worst = Math.min(...gradients.flat().map((s) => ratio(fg, over(s, bg))), r);
        const range = document.createRange();
        range.selectNodeContents(t);
        const box = range.getBoundingClientRect();
        gradientText.push({
          what: `${where(el)} "${text.slice(0, 32)}"`,
          worst,
          need,
          fg: `rgb(${Math.round(fg[0])}, ${Math.round(fg[1])}, ${Math.round(fg[2])})`,
          box: { x: box.x + window.scrollX, y: box.y + window.scrollY, width: box.width, height: box.height },
        });
      }
    }

    for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[placeholder], textarea[placeholder]")) {
      if (!visible(el) || el.getClientRects().length === 0 || !inScope(el)) continue;
      const { bg } = backdrop(el);
      const fg = over(parse(getComputedStyle(el, "::placeholder").color), bg);
      checked++;
      const r = ratio(fg, bg);
      if (r < 4.5) out.push({ kind: "placeholder", what: `${where(el)} "${el.placeholder.slice(0, 24)}"`, ratio: r, need: 4.5 });
    }

    for (const el of document.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, textarea")) {
      if (!visible(el) || el.getClientRects().length === 0 || (el as HTMLInputElement).disabled || !inScope(el)) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.borderTopWidth) < 1) continue;
      const { bg } = backdrop(el.parentElement ?? el);
      const border = over(parse(cs.borderTopColor), bg);
      checked++;
      const r = ratio(border, bg);
      if (r < 3) out.push({ kind: "control border", what: where(el), ratio: r, need: 3 });
    }

    // Focus ring: focus each control (first 40) and compare the outline colour with what is behind it.
    const focusables = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])")].filter((e) => visible(e) && e.getClientRects().length && !(e as HTMLButtonElement).disabled && inScope(e));
    for (const el of focusables.slice(0, 40)) {
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) continue;
      // The ring may be on the control itself or on the card around it (.option-card:has(:focus-visible)).
      const holder = el.matches(":focus-visible") ? [el, el.closest<HTMLElement>("label, .option-card")].filter((x): x is HTMLElement => !!x) : [];
      let ring: { color: RGBA; host: HTMLElement } | null = null;
      for (const host of holder) {
        const cs = getComputedStyle(host);
        const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
        // A Tailwind ring is a stack of shadows, some fully transparent: take the first visible one.
        const shadow = cs.boxShadow !== "none" ? [...cs.boxShadow.matchAll(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g)].map((m) => m[0]).find((c) => parse(c)[3] > 0) : undefined;
        const borderChanged = host !== el && cs.borderTopColor !== getComputedStyle(host.parentElement ?? host).borderTopColor;
        if (outline) ring = { color: parse(cs.outlineColor), host };
        else if (shadow) ring = { color: parse(shadow), host };
        else if (borderChanged) ring = { color: parse(cs.borderTopColor), host };
        if (ring) break;
      }
      checked++;
      if (!el.matches(":focus-visible")) {
        out.push({ kind: "focus ring", what: `${where(el)} does not match :focus-visible after keyboard focus`, ratio: 1, need: 3 });
      } else if (!ring) {
        out.push({ kind: "focus ring", what: `${where(el)} has no visible focus indicator`, ratio: 1, need: 3 });
      } else {
        const { bg } = backdrop(ring.host.parentElement ?? ring.host);
        const r = ratio(over(ring.color, bg), bg);
        if (r < 3) out.push({ kind: "focus ring", what: where(el), ratio: r, need: 3 });
      }
      el.blur();
    }
    return { out, gradientText, checked };
  });
}

/** Worst contrast of `fg` against the real rendered pixels behind a piece of text: all text on the page is made transparent, the
 *  text's own rectangle is screenshotted, and every pixel is compared with the text colour. This is how gradient and glow backgrounds are checked. */
async function pixelWorst(page: Page, box: { x: number; y: number; width: number; height: number }, fg: string): Promise<number | null> {
  try {
    // Hide ALL text on the page, not just this element's: tall headings overlap the neighbouring line's glyphs.
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "cg-hide-text";
      style.textContent = "*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}";
      document.head.appendChild(style);
    });
    let png: Buffer;
    try {
      png = await page.screenshot({ animations: "disabled", timeout: 5000, fullPage: true, clip: { x: box.x, y: box.y, width: Math.max(1, box.width), height: Math.max(1, box.height) } });
    } finally {
      await page.evaluate(() => document.getElementById("cg-hide-text")?.remove());
    }
    return await page.evaluate(
      async ([b64, color]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        const f = (v: number) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        const L = (r: number, g: number, b: number) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        const [fr, fg2, fb] = color.match(/\d+/g)!.map(Number);
        const lf = L(fr, fg2, fb);
        let worst = 99;
        for (let i = 0; i < data.length; i += 4) {
          const lb = L(data[i], data[i + 1], data[i + 2]);
          worst = Math.min(worst, (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05));
        }
        return worst;
      },
      [png.toString("base64"), fg],
    );
  } catch {
    return null;
  }
}

async function main() {
  const browser = await chromium.launch();
  const { targets, contexts, anon } = await prepareAudit(browser, BASE, "");
  const only = arg("only");
  const findings: Finding[] = [];
  const gradients = new Map<string, { worst: number; need: number; seen: number }>();
  const failures: string[] = [];
  let checked = 0;
  let states = 0;

  for (const theme of THEMES) {
    for (const size of SIZES) {
      for (const t of targets) {
        const name = t.name ?? t.path;
        if (only && !name.includes(only)) continue;
        const ctx = t.role === "out" ? anon : contexts[t.role];
        for (const width of WIDTHS) {
          const page = await ctx.newPage();
          try {
            await page.addInitScript("window.__name = (f) => f");
            const stored = { v: 2, size, ...(theme === "auto" ? {} : { theme }) };
            await page.addInitScript((value) => localStorage.setItem("tgs-display", value), JSON.stringify(stored));
            if (theme === "auto") {
              await page.emulateMedia({ colorScheme: DEVICE });
              const when = new Date();
              when.setHours(HOUR, 0, 0, 0);
              await page.clock.install({ time: when });
            } else await page.emulateMedia({ colorScheme: "light" });
            if (t.before) await t.before();
            await page.setViewportSize({ width, height: 1000 });
            await page.goto((t.base ?? BASE) + t.path, { waitUntil: "load" });
            await page.waitForLoadState("networkidle").catch(() => {});
            await page.waitForTimeout(300);
            const resolved = await page.evaluate(() => document.documentElement.dataset.theme);
            const expected = theme === "auto" ? undefined : theme;
            if (expected && resolved !== expected) throw new Error(`data-theme is ${resolved}, expected ${expected}`);
            if (t.after) {
              if (width < 1024 && t.after === openDisplay) await page.getByRole("button", { name: /Menu/ }).first().click().catch(() => {});
              await t.after(page).catch(() => failures.push(`${name} @${width}: interaction not reached`));
            }
            await page.keyboard.press("Tab"); // keyboard modality, so scripted focus() matches :focus-visible like a real Tab
            const r = await audit(page);
            for (const g of r.gradientText.slice(0, 40)) {
              const px = await pixelWorst(page, g.box, g.fg);
              if (px !== null) g.worst = px;
            }
            states++;
            checked += r.checked;
            const label = theme === "auto" ? `auto ${HOUR}:00 ${DEVICE} device -> ${resolved}` : theme;
            for (const f of r.out) findings.push({ page: name, theme: label, width, size, kind: f.kind, what: f.what, ratio: +f.ratio.toFixed(2), need: f.need, note: f.note });
            for (const g of r.gradientText) {
              const key = `${label} | ${name} | ${g.what}`;
              const prev = gradients.get(key);
              gradients.set(key, { worst: Math.min(prev?.worst ?? 99, g.worst), need: g.need, seen: (prev?.seen ?? 0) + 1 });
            }
          } catch (e) {
            failures.push(`${name} @${width} ${theme}: ${(e as Error).message.split("\n")[0]}`);
          } finally {
            await page.close();
          }
        }
      }
    }
  }
  await browser.close();

  const grouped = new Map<string, { f: Finding; where: Set<string> }>();
  for (const f of findings) {
    const key = `${f.theme} | ${f.kind} | ${f.what} | ${f.ratio}<${f.need}${f.note ? " | " + f.note : ""}`;
    const g = grouped.get(key) ?? { f, where: new Set<string>() };
    g.where.add(`${f.page}@${f.width}/${f.size}`);
    grouped.set(key, g);
  }
  console.log(`Themes: ${THEMES.join(", ")}. Page states: ${states}. Checks: ${checked}. Failures (distinct): ${grouped.size}.`);
  for (const [key, g] of grouped) console.log(`${key}\n    on ${[...g.where].slice(0, 4).join("; ")}${g.where.size > 4 ? `; +${g.where.size - 4} more` : ""}`);
  console.log(`\nText on a gradient or glow, worst contrast over the real rendered pixels (the first 40 per page state): ${gradients.size}`);
  for (const [key, g] of [...gradients].sort((a, b) => a[1].worst - b[1].worst).slice(0, 15)) console.log(`${g.worst.toFixed(2)} (need ${g.need}) ${g.worst < g.need ? "FAIL" : "ok"} | ${key} | ${g.seen}x`);
  if (failures.length) console.log(`\nNot reached (${failures.length}):\n` + [...new Set(failures)].slice(0, 25).join("\n"));
  const outFile = arg("out");
  if (outFile) writeFileSync(outFile, JSON.stringify({ themes: THEMES, findings, gradients: [...gradients], failures }, null, 1));
  if (process.argv.includes("--fail") && (grouped.size || failures.length)) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
