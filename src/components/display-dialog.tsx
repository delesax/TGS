"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_FONT,
  DEFAULT_SIZE,
  DISPLAY_KEY,
  FONT_OPTIONS,
  SIZE_OPTIONS,
  applyDisplay,
  parseDisplay,
  serializeDisplay,
  type Display,
  type FontId,
  type SizeId,
} from "@/lib/display";
import { DEFAULT_THEME_MODE, THEME_HELP, THEME_OPTIONS, applyThemeMode, type ThemeMode } from "@/lib/theme";

/** Triggers (the header "Text" button and the one in the phone Menu) dispatch this; the one dialog below opens. */
export const OPEN_DISPLAY_EVENT = "tgs:open-display";

const radioCard = "option-card";
/** Short one-line choices (size, theme): as many columns as fit, each at least 10.5rem (or the full width when that is narrower), so a card's text never runs under its check mark. Where even that is too narrow (Large text on a 320px screen), a long word may break inside itself (overflow-wrap: anywhere) rather than run under the tick or out of the dialog. */
/** The default option of a group (Atkinson Hyperlegible, Automatic) has the longest label, so it takes a whole row and its name stays on one line. */
const fullRow = " [grid-column:1/-1]";
/** Text style cards: two columns only while each is wide enough for the longest name ("Merriweather") beside its radio and check mark, else one. */
const fontColumns = "grid grid-cols-[repeat(auto-fit,minmax(min(13.5rem,100%),1fr))] gap-2";
const fitColumns = "grid grid-cols-[repeat(auto-fit,minmax(min(10.5rem,100%),1fr))] gap-2";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-font", "data-size", "data-theme-mode"] });
  return () => observer.disconnect();
}

/** The attributes on <html> are the single source of truth; the pre-paint script and this dialog both write them. */
function readAttributes() {
  const root = document.documentElement;
  return `${root.getAttribute("data-font") ?? ""}|${root.getAttribute("data-size") ?? ""}|${root.getAttribute("data-theme-mode") ?? ""}`;
}

/**
 * The Display settings dialog: body font and text size, with a live preview and a reset. A native modal <dialog>
 * gives the focus trap, Escape to close and an inert page behind it. The choice is applied to <html> at once and
 * saved in this browser only (localStorage, one key, in try/catch). Headings and the logo do not change with the font or size.
 */
export function DisplayDialog() {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const snapshot = React.useSyncExternalStore(subscribe, readAttributes, () => "||");
  const display = React.useMemo<Display>(() => {
    const [font, size, theme] = snapshot.split("|");
    return parseDisplay(JSON.stringify({ v: 2, font: font || DEFAULT_FONT, size: size || DEFAULT_SIZE, theme: theme || DEFAULT_THEME_MODE }));
  }, [snapshot]);
  const [saveFailed, setSaveFailed] = React.useState(false);

  React.useEffect(() => {
    const open = () => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
    };
    window.addEventListener(OPEN_DISPLAY_EVENT, open);
    return () => window.removeEventListener(OPEN_DISPLAY_EVENT, open);
  }, []);

  function onClose() {
    // Back to where the visitor was; if that was inside the (now closed) phone Menu, to the Menu button.
    const target = opener.current && opener.current.offsetParent !== null ? opener.current : document.querySelector<HTMLElement>('[aria-controls="mobile-menu"]');
    target?.focus();
  }

  function commit(next: Display) {
    applyDisplay(next);
    applyThemeMode(next.theme);
    try {
      if (next.font === DEFAULT_FONT && next.size === DEFAULT_SIZE && next.theme === DEFAULT_THEME_MODE) window.localStorage.removeItem(DISPLAY_KEY);
      else window.localStorage.setItem(DISPLAY_KEY, serializeDisplay(next));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }

  const isDefault = display.font === DEFAULT_FONT && display.size === DEFAULT_SIZE && display.theme === DEFAULT_THEME_MODE;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="display-title"
      data-testid="display-dialog"
      onClose={onClose}
      onKeyDown={(event) => {
        // Keep Tab and Shift+Tab inside the dialog (a native modal still lets focus escape to the browser's own controls).
        if (event.key !== "Tab") return;
        // Tab stops: enabled buttons, plus one radio per group (the checked one, else the first).
        const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]'));
        const items = all.filter((el) => {
          if (!(el instanceof HTMLInputElement) || el.type !== "radio") return true;
          const group = all.filter((o): o is HTMLInputElement => o instanceof HTMLInputElement && o.type === "radio" && o.name === el.name);
          return group.some((o) => o.checked) ? el.checked : group[0] === el;
        });
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close(); // a press on the backdrop
      }}
      className="surface-raised m-auto w-[min(32rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-0 text-foreground backdrop:bg-black/45 lg:fixed lg:right-6 lg:top-[76px] lg:left-auto lg:m-0"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-3 sm:px-4">
        <h2 id="display-title" className="text-lg font-semibold tracking-tight">
          Text style and size
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close display settings"
          className="grid size-11 place-items-center rounded-[10px] text-foreground transition-colors duration-200 hover:bg-muted motion-reduce:transition-none"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <div className="flex flex-col gap-5 p-3 sm:p-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold">Text size</legend>
          <div className={fitColumns}>
            {[...SIZE_OPTIONS].sort((a, b) => a.px - b.px).map((size) => (
              <label key={size.id} className={`${radioCard} items-center`}>
                <input
                  type="radio"
                  name="display-size"
                  value={size.id}
                  checked={display.size === size.id}
                  onChange={() => commit({ ...display, size: size.id as SizeId })}
                  className="size-5 shrink-0 accent-primary"
                />
                <span className="text-base font-semibold [overflow-wrap:anywhere]">{size.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold">Text style</legend>
          <p className="text-sm text-muted-foreground">Changes the body text only. Headings and the logo stay as they are.</p>
          <div className={fontColumns}>
            {FONT_OPTIONS.map((font) => (
              <label key={font.id} className={`${radioCard}${font.id === DEFAULT_FONT ? fullRow : ""}`}>
                <input
                  type="radio"
                  name="display-font"
                  value={font.id}
                  checked={display.font === font.id}
                  onChange={() => commit({ ...display, font: font.id as FontId })}
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
                <span
                  className="flex min-w-0 flex-col"
                  style={{ fontFamily: `var(${font.cssVar}), ${font.generic === "serif" ? "ui-serif, Georgia, serif" : "ui-sans-serif, system-ui, sans-serif"}` }}
                >
                  <span className="text-base font-semibold [overflow-wrap:anywhere]">{font.label}</span>
                  <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{font.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2" data-testid="display-theme">
          <legend className="mb-1 text-base font-semibold">Theme</legend>
          <p id="theme-help" className="text-sm text-muted-foreground">
            {THEME_HELP}
          </p>
          <div className={fitColumns} aria-describedby="theme-help">
            {THEME_OPTIONS.map((option) => (
              <label key={option.id} className={`${radioCard} items-center${option.id === DEFAULT_THEME_MODE ? fullRow : ""}`}>
                <input
                  type="radio"
                  name="display-theme"
                  value={option.id}
                  checked={display.theme === option.id}
                  onChange={() => commit({ ...display, theme: option.id as ThemeMode })}
                  className="size-5 shrink-0 accent-primary"
                />
                <span className="text-base font-semibold [overflow-wrap:anywhere]">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="rounded-[10px] bg-muted/70 p-3" data-testid="display-preview">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
          <p className="mt-1 text-base">The best argument wins, before the deadline. Read the rules, make your case, and answer the strongest objection.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => commit({ font: DEFAULT_FONT, size: DEFAULT_SIZE, theme: DEFAULT_THEME_MODE })} disabled={isDefault}>
            Reset to default
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {saveFailed ? "This browser would not save your choice, so it applies until you close the page." : "Saved on this device only."}
          </p>
        </div>
      </div>
    </dialog>
  );
}
