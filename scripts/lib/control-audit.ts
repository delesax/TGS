import type { Page } from "@playwright/test";

/**
 * Shared by scripts/control-widths.ts (the audit) and tests/e2e/control-widths.spec.ts (the guard).
 * Collects every button, button-styled link, input, select, textarea and option card on the page it is given,
 * with its width and the width of its content, and says which are "stretched" from 640px up.
 */
export type Control = {
  kind: "button" | "link-button" | "input" | "select" | "textarea" | "option-card";
  tag: string;
  selector: string;
  label: string;
  width: number;
  /** Width of what is inside (text and icons); 0 for fields. */
  contentWidth: number;
  /** Root font size in px, so rem limits follow the Text size setting. */
  rem: number;
  /** Why the audit does not count it ("header", "dialog", "table"), or "". */
  exempt: string;
};

/** The limits, in rem (the Text size setting changes the root font size, so the limits grow with it). */
export const LIMITS = { buttonMax: 20, buttonPadding: 3, inputMax: 36, textareaMax: 56, cardMax: 36 };
/** The 1px border on each side of a button counts as part of its padding, with a little rounding. */
const BORDER_PX = 4;

export async function collectControls(page: Page): Promise<Control[]> {
  // tsx/esbuild wraps named functions in __name(); the page has no such helper.
  await page.evaluate("window.__name = window.__name || ((f) => f)");
  return page.evaluate(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const out: Control[] = [];
    const seen = new Set<Element>();
    const short = (el: Element) => {
      const parts: string[] = [];
      let cur: Element | null = el;
      for (let i = 0; cur && cur !== document.body && i < 3; i++, cur = cur.parentElement) {
        let s = cur.tagName.toLowerCase();
        if (cur.id) s += `#${cur.id}`;
        else if (cur.getAttribute("name")) s += `[name=${cur.getAttribute("name")}]`;
        else if (typeof cur.className === "string" && cur.className.trim()) s += "." + cur.className.trim().split(/\s+/).slice(0, 2).join(".");
        parts.unshift(s);
        if (cur.id) break;
      }
      return parts.join(" > ");
    };
    const content = (el: Element) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = r.getBoundingClientRect();
      return b.width;
    };
    const label = (el: Element) =>
      ((el as HTMLElement).innerText || el.getAttribute("aria-label") || (el as HTMLInputElement).placeholder || el.getAttribute("name") || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const exempt = (el: Element) => (el.closest("header") ? "header" : el.closest("dialog") ? "dialog" : el.closest("table") ? "table" : el.closest("[data-install-pill]") ? "" : "");
    const visible = (el: Element) => {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const add = (el: Element, kind: Control["kind"]) => {
      if (seen.has(el) || !visible(el)) return;
      seen.add(el);
      out.push({ kind, tag: el.tagName.toLowerCase(), selector: short(el), label: label(el), width: Math.round(el.getBoundingClientRect().width * 10) / 10, contentWidth: kind === "button" || kind === "link-button" || kind === "option-card" ? Math.round(content(el) * 10) / 10 : 0, rem, exempt: exempt(el) });
    };
    document.querySelectorAll("[data-slot=button]").forEach((el) => add(el, el.tagName === "A" ? "link-button" : "button"));
    document.querySelectorAll("button").forEach((el) => add(el, "button"));
    document.querySelectorAll("textarea").forEach((el) => add(el, "textarea"));
    document.querySelectorAll("select").forEach((el) => add(el, "select"));
    document.querySelectorAll("input").forEach((el) => {
      const t = (el as HTMLInputElement).type;
      if (["hidden", "checkbox", "radio", "submit", "button", "file"].includes(t)) return;
      add(el, "input");
    });
    document.querySelectorAll(".option-card").forEach((el) => add(el, "option-card"));
    return out;
  });
}

/** Reasons a control counts as stretched at 640px and up (empty when it is fine or exempt). */
export function offenceReasons(c: Control): string[] {
  if (c.exempt) return [];
  const reasons: string[] = [];
  const limit = (r: number) => r * c.rem;
  if (c.kind === "button" || c.kind === "link-button") {
    if (c.width > limit(LIMITS.buttonMax) + 0.5) reasons.push(`wider than ${LIMITS.buttonMax}rem`);
    // A label longer than the cap wraps, so the button is exactly 20rem wide with its text narrower: that is the cap working, not a stretch.
    const wrappedAtCap = Math.abs(c.width - limit(LIMITS.buttonMax)) <= 1;
    if (!wrappedAtCap && c.width > c.contentWidth + limit(LIMITS.buttonPadding) + BORDER_PX + 0.5) reasons.push(`wider than content + ${LIMITS.buttonPadding}rem`);
  } else if (c.kind === "input" || c.kind === "select") {
    if (c.width > limit(LIMITS.inputMax) + 0.5) reasons.push(`wider than ${LIMITS.inputMax}rem`);
  } else if (c.kind === "textarea") {
    if (c.width > limit(LIMITS.textareaMax) + 0.5) reasons.push(`wider than ${LIMITS.textareaMax}rem`);
  } else if (c.kind === "option-card") {
    if (c.width > limit(LIMITS.cardMax) + 0.5) reasons.push(`wider than ${LIMITS.cardMax}rem`);
  }
  return reasons;
}
