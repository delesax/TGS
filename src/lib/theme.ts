/**
 * Theme choice: Automatic (the default), Light or Dark. Stored only in this browser, in the same localStorage value
 * as the font and size (src/lib/display.ts, key "tgs-display", field "theme"). Nothing is sent to the server, no
 * cookie is read, no location is used, so pages stay cacheable.
 *
 * Automatic is DARK when the device's own clock is between NIGHT_START and NIGHT_END, or whenever the device itself
 * reports prefers-color-scheme: dark. Otherwise it is light. Light and Dark override both.
 *
 * Three places resolve a mode to a theme and they must agree: resolveTheme (this file, used by the live-update code
 * and the tests), THEME_INIT_SCRIPT (the tiny ES5 copy that runs in <head> before first paint) and the CSS
 * no-JavaScript fallback in globals.css (device preference only). tests/unit/theme.test.ts runs the script against
 * resolveTheme across the clock boundaries.
 */

/** The only place the two hours live. Whole hours, 24-hour clock, device-local time. */
export const NIGHT_START = 19;
export const NIGHT_END = 7;

const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
/** "19:00" and "07:00", for the dialog text. */
export const NIGHT_START_LABEL = pad(NIGHT_START);
export const NIGHT_END_LABEL = pad(NIGHT_END);

export const THEME_MODES = ["auto", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const DEFAULT_THEME_MODE: ThemeMode = "auto";
export type Theme = "light" | "dark";

/** Browser-chrome colours (the one theme-color meta), the same two values the media-based pair used. */
export const THEME_COLORS: Record<Theme, string> = { light: "#f7f5f0", dark: "#060f1d" };

export const THEME_OPTIONS: ReadonlyArray<{ id: ThemeMode; label: string }> = [
  { id: "auto", label: "Automatic (default)" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** The helper line in the dialog, built from the constants. */
export const THEME_HELP = `Automatic switches to dark from ${NIGHT_START_LABEL} to ${NIGHT_END_LABEL} by your device's clock, or whenever your device is set to dark.`;

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

/** True from NIGHT_START up to (not including) NIGHT_END, by the hour of the given device-local time. */
export function isNight(now: Date): boolean {
  const hour = now.getHours();
  return hour >= NIGHT_START || hour < NIGHT_END;
}

export function resolveTheme(mode: ThemeMode, now: Date, prefersDark: boolean): Theme {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return isNight(now) || prefersDark ? "dark" : "light";
}

/** Milliseconds from `now` to the next NIGHT_START or NIGHT_END (device-local), always greater than zero. */
export function msToNextBoundary(now: Date): number {
  const next = new Date(now.getTime());
  let best = Infinity;
  for (const hour of [NIGHT_START, NIGHT_END]) {
    next.setTime(now.getTime());
    next.setHours(hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    best = Math.min(best, next.getTime() - now.getTime());
  }
  return best;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function deviceIsDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/** Sets the (single) theme-color meta to match the resolved theme, creating it if it is missing. */
export function setThemeColorMeta(theme: Theme, doc: Document = document) {
  let meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement("meta");
    meta.name = "theme-color";
    doc.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];
}

/** Writes data-theme-mode, and data-theme resolved from it, on <html>. Returns the resolved theme. */
export function applyThemeMode(mode: ThemeMode, root: HTMLElement = document.documentElement): Theme {
  const theme = resolveTheme(mode, new Date(), deviceIsDark());
  // Only write when different: watchTheme observes data-theme-mode, and a same-value write would loop.
  if (root.getAttribute("data-theme-mode") !== mode) root.setAttribute("data-theme-mode", mode);
  if (root.getAttribute("data-theme") !== theme) root.setAttribute("data-theme", theme);
  setThemeColorMeta(theme, root.ownerDocument);
  return theme;
}

/**
 * Live updates for Automatic, with no reload: the device scheme changing, the next 19:00/07:00 boundary
 * (one timer, re-armed each time) and the tab becoming visible again (background timers are throttled).
 * Re-reads data-theme-mode each time, so choosing a mode in the dialog is picked up too. Returns the cleanup.
 */
export function watchTheme(root: HTMLElement = document.documentElement): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const query = window.matchMedia(DARK_QUERY);

  const update = () => {
    const mode = root.getAttribute("data-theme-mode");
    applyThemeMode(isThemeMode(mode) ? mode : DEFAULT_THEME_MODE, root);
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(update, msToNextBoundary(new Date()) + 50);
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") update();
  };

  query.addEventListener("change", update);
  document.addEventListener("visibilitychange", onVisible);
  const observer = new MutationObserver(update);
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme-mode"] });
  update();

  return () => {
    query.removeEventListener("change", update);
    document.removeEventListener("visibilitychange", onVisible);
    observer.disconnect();
    if (timer !== undefined) clearTimeout(timer);
  };
}
