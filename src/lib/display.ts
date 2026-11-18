/**
 * Display choices (body font and text size). Stored only in this browser's
 * localStorage under one key; nothing is sent to the server and nothing is
 * stored in the database. The same lists drive the picker, the tiny script
 * that applies the choice before first paint, and the CSS in globals.css
 * (html[data-font] and html[data-size]). The theme choice (Automatic, Light or Dark) lives in the same value; its
 * rules and the script that applies it are in src/lib/theme.ts and src/lib/theme-init.ts.
 */

import { DEFAULT_THEME_MODE, isThemeMode, type ThemeMode } from "@/lib/theme";

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

/** Base text sizes: Default is the design baseline (17px). The px value is set in globals.css (html[data-size]). */
export const SIZE_OPTIONS = [
  { id: "default", label: "Default", px: 17 },
  { id: "small", label: "Small", px: 15 },
  { id: "medium", label: "Medium", px: 19 },
  { id: "large", label: "Large", px: 22 },
] as const;

export type SizeId = (typeof SIZE_OPTIONS)[number]["id"];
export const DEFAULT_SIZE: SizeId = "default";

export type Display = { font: FontId; size: SizeId; theme: ThemeMode };

const FONT_IDS: readonly string[] = FONT_OPTIONS.map((f) => f.id);
const SIZE_IDS: readonly string[] = SIZE_OPTIONS.map((s) => s.id);

/**
 * Stored values are versioned. Version 2 (this picker) uses default/small/medium/large. A value without a version
 * comes from the first picker, whose sizes were default/large (20px)/larger (22px): large becomes Medium and
 * larger becomes Large, so nobody's saved choice breaks or jumps.
 */
const LEGACY_SIZES: Record<string, SizeId> = { large: "medium", larger: "large" };

/**
 * Reads a stored value safely: anything unknown or malformed falls back to the defaults. The theme field was added
 * without a version bump: a v2 value with no theme (everyone who saved a font or size before) is valid and means
 * Automatic, so their font and size are kept. An unknown or invalid theme also means Automatic.
 */
export function parseDisplay(raw: string | null): Display {
  const fallback: Display = { font: DEFAULT_FONT, size: DEFAULT_SIZE, theme: DEFAULT_THEME_MODE };
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as { v?: unknown; font?: unknown; size?: unknown; theme?: unknown };
    const size = typeof value.size === "string" ? (value.v === 2 ? value.size : (LEGACY_SIZES[value.size] ?? value.size)) : DEFAULT_SIZE;
    return {
      font: typeof value.font === "string" && FONT_IDS.includes(value.font) ? (value.font as FontId) : DEFAULT_FONT,
      size: SIZE_IDS.includes(size) ? (size as SizeId) : DEFAULT_SIZE,
      theme: isThemeMode(value.theme) ? value.theme : DEFAULT_THEME_MODE,
    };
  } catch {
    return fallback;
  }
}

/** What gets saved: the current version plus the choices that are not the default theme. */
export function serializeDisplay(display: Display): string {
  // Automatic is the absence of a theme field, so a font-and-size-only choice is stored exactly as it always was.
  const { theme, ...rest } = display;
  return JSON.stringify({ v: 2, ...rest, ...(theme === DEFAULT_THEME_MODE ? {} : { theme }) });
}

/** Sets or clears the font and size attributes on <html>. Defaults are the absence of the attribute. (The theme attributes are set by applyThemeMode in theme.ts.) */
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
export const DISPLAY_INIT_SCRIPT = `(function(){try{var r=localStorage.getItem(${JSON.stringify(DISPLAY_KEY)});if(!r)return;var d=JSON.parse(r),h=document.documentElement,F=${JSON.stringify(FONT_IDS)},S=${JSON.stringify(SIZE_IDS)},z=d.size;if(d.v!==2)z=${JSON.stringify(LEGACY_SIZES)}[z]||z;if(F.indexOf(d.font)>0)h.setAttribute("data-font",d.font);if(S.indexOf(z)>0)h.setAttribute("data-size",z)}catch(e){}})();`;
