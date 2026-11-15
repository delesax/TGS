/**
 * Display choices (body font and text size). Stored only in this browser's
 * localStorage under one key; nothing is sent to the server and nothing is
 * stored in the database. The same lists drive the picker, the tiny script
 * that applies the choice before first paint, and the CSS in globals.css
 * (html[data-font] and html[data-size]).
 */

export const DISPLAY_KEY = "tgs-display";

/** `id` is the value of html[data-font]; `cssVar` is the next/font variable set on <html> in layout.tsx. */
export const FONT_OPTIONS = [
  { id: "atkinson", label: "Atkinson Hyperlegible", note: "Default. Made for low-vision readers.", cssVar: "--font-atkinson", generic: "sans-serif" },
  { id: "inter", label: "Inter", note: "Clean and neutral.", cssVar: "--font-inter", generic: "sans-serif" },
  { id: "source-sans", label: "Source Sans 3", note: "Open and friendly.", cssVar: "--font-source-sans", generic: "sans-serif" },
  { id: "lexend", label: "Lexend", note: "Wide spacing, easier tracking.", cssVar: "--font-lexend", generic: "sans-serif" },
  { id: "open-sans", label: "Open Sans", note: "Familiar and plain.", cssVar: "--font-open-sans", generic: "sans-serif" },
  { id: "source-serif", label: "Source Serif 4", note: "Serif, matches the headings.", cssVar: "--font-source-serif", generic: "serif" },
  { id: "merriweather", label: "Merriweather", note: "Serif, sturdy on screens.", cssVar: "--font-merriweather", generic: "serif" },
  { id: "lora", label: "Lora", note: "Serif, calm and bookish.", cssVar: "--font-lora", generic: "serif" },
] as const;

export type FontId = (typeof FONT_OPTIONS)[number]["id"];
export const DEFAULT_FONT: FontId = "atkinson";

export const SIZE_OPTIONS = [
  { id: "default", label: "Default" },
  { id: "large", label: "Large" },
  { id: "larger", label: "Larger" },
] as const;

export type SizeId = (typeof SIZE_OPTIONS)[number]["id"];
export const DEFAULT_SIZE: SizeId = "default";

export type Display = { font: FontId; size: SizeId };

const FONT_IDS: readonly string[] = FONT_OPTIONS.map((f) => f.id);
const SIZE_IDS: readonly string[] = SIZE_OPTIONS.map((s) => s.id);

/** Reads a stored value safely: anything unknown or malformed falls back to the defaults. */
export function parseDisplay(raw: string | null): Display {
  const fallback: Display = { font: DEFAULT_FONT, size: DEFAULT_SIZE };
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as { font?: unknown; size?: unknown };
    return {
      font: typeof value.font === "string" && FONT_IDS.includes(value.font) ? (value.font as FontId) : DEFAULT_FONT,
      size: typeof value.size === "string" && SIZE_IDS.includes(value.size) ? (value.size as SizeId) : DEFAULT_SIZE,
    };
  } catch {
    return fallback;
  }
}

/** Sets or clears the two attributes on <html>. Defaults are the absence of the attribute. */
export function applyDisplay(display: Display, root: HTMLElement = document.documentElement) {
  if (display.font === DEFAULT_FONT) root.removeAttribute("data-font");
  else root.setAttribute("data-font", display.font);
  if (display.size === DEFAULT_SIZE) root.removeAttribute("data-size");
  else root.setAttribute("data-size", display.size);
}

/**
 * Runs in <head> before the page paints, so a saved choice never flashes the
 * default first. Plain ES5, wrapped in try/catch (storage can be blocked), and
 * it only ever sets two attributes. The lists are inlined from the constants above.
 */
export const DISPLAY_INIT_SCRIPT = `(function(){try{var r=localStorage.getItem(${JSON.stringify(DISPLAY_KEY)});if(!r)return;var d=JSON.parse(r),h=document.documentElement,F=${JSON.stringify(FONT_IDS)},S=${JSON.stringify(SIZE_IDS)};if(F.indexOf(d.font)>0)h.setAttribute("data-font",d.font);if(S.indexOf(d.size)>0)h.setAttribute("data-size",d.size)}catch(e){}})();`;
