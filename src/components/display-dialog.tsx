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

/** Triggers (the header "Text" button and the one in the phone Menu) dispatch this; the one dialog below opens. */
export const OPEN_DISPLAY_EVENT = "tgs:open-display";

const radioCard =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border border-input bg-background px-3 py-2 transition-colors duration-200 motion-reduce:transition-none has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-font", "data-size"] });
  return () => observer.disconnect();
}

/** The attributes on <html> are the single source of truth; the pre-paint script and this dialog both write them. */
function readAttributes() {
  const root = document.documentElement;
  return `${root.getAttribute("data-font") ?? ""}|${root.getAttribute("data-size") ?? ""}`;
}

/**
 * The Display settings dialog: body font and text size, with a live preview and a reset. A native modal <dialog>
 * gives the focus trap, Escape to close and an inert page behind it. The choice is applied to <html> at once and
 * saved in this browser only (localStorage, one key, in try/catch). Headings and the logo do not change.
 */
export function DisplayDialog() {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const snapshot = React.useSyncExternalStore(subscribe, readAttributes, () => "|");
  const display = React.useMemo<Display>(() => {
    const [font, size] = snapshot.split("|");
    return parseDisplay(JSON.stringify({ v: 2, font: font || DEFAULT_FONT, size: size || DEFAULT_SIZE }));
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
    try {
      if (next.font === DEFAULT_FONT && next.size === DEFAULT_SIZE) window.localStorage.removeItem(DISPLAY_KEY);
      else window.localStorage.setItem(DISPLAY_KEY, serializeDisplay(next));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }

  const isDefault = display.font === DEFAULT_FONT && display.size === DEFAULT_SIZE;

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
      className="surface-raised m-auto w-[min(32rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-0 text-foreground backdrop:bg-black/45 lg:fixed lg:right-6 lg:top-[76px] lg:left-auto lg:m-0"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
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

      <div className="flex flex-col gap-5 p-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold">Text size</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SIZE_OPTIONS.map((size) => (
              <label key={size.id} className={`${radioCard} items-center`}>
                <input
                  type="radio"
                  name="display-size"
                  value={size.id}
                  checked={display.size === size.id}
                  onChange={() => commit({ ...display, size: size.id as SizeId })}
                  className="size-5 shrink-0 accent-primary"
                />
                <span className="text-base font-semibold">{size.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold">Text style</legend>
          <p className="text-sm text-muted-foreground">Changes the body text only. Headings and the logo stay as they are.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FONT_OPTIONS.map((font) => (
              <label key={font.id} className={radioCard}>
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
                  <span className="text-base font-semibold">{font.label}</span>
                  <span className="text-sm text-muted-foreground">{font.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="rounded-[10px] bg-muted/70 p-3" data-testid="display-preview">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
          <p className="mt-1 text-base">The best argument wins, before the deadline. Read the rules, make your case, and answer the strongest objection.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => commit({ font: DEFAULT_FONT, size: DEFAULT_SIZE })} disabled={isDefault}>
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
