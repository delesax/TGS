"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_FONT,
  DEFAULT_SIZE,
  DISPLAY_KEY,
  FONT_OPTIONS,
  SIZE_OPTIONS,
  applyDisplay,
  parseDisplay,
  type Display,
  type FontId,
  type SizeId,
} from "@/lib/display";

const radioCard =
  "flex min-h-12 cursor-pointer items-start gap-3 rounded-md border-2 border-border bg-background px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring";

/**
 * "Display" control in the footer: body font and text size. The choice is applied to <html> at once and saved
 * in this browser only (localStorage, one key). If storage is blocked the choice still applies until the page
 * is closed, and a short note says so. Headings and the logo do not change.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-font", "data-size"] });
  return () => observer.disconnect();
}

/** The attributes on <html> are the single source of truth; the pre-paint script and this control both write them. */
function readAttributes() {
  const root = document.documentElement;
  return `${root.getAttribute("data-font") ?? ""}|${root.getAttribute("data-size") ?? ""}`;
}

export function DisplaySettings() {
  const snapshot = React.useSyncExternalStore(subscribe, readAttributes, () => "|");
  const display = React.useMemo<Display>(() => {
    const [font, size] = snapshot.split("|");
    return parseDisplay(JSON.stringify({ font: font || DEFAULT_FONT, size: size || DEFAULT_SIZE }));
  }, [snapshot]);
  const [saveFailed, setSaveFailed] = React.useState(false);

  function commit(next: Display) {
    applyDisplay(next);
    try {
      if (next.font === DEFAULT_FONT && next.size === DEFAULT_SIZE) window.localStorage.removeItem(DISPLAY_KEY);
      else window.localStorage.setItem(DISPLAY_KEY, JSON.stringify(next));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }

  const isDefault = display.font === DEFAULT_FONT && display.size === DEFAULT_SIZE;

  return (
    <details className="group rounded-md border-2 border-border bg-background" data-testid="display-settings">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-3 text-base font-semibold text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span>Display: text style and size</span>
        <span aria-hidden className="text-muted-foreground group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-5 border-t-2 border-border p-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold text-foreground">Text style</legend>
          <p className="text-base text-muted-foreground">Changes the body text only. Headings and the logo stay as they are.</p>
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
              <span className="flex flex-col" style={{ fontFamily: `var(${font.cssVar}), ${font.generic === "serif" ? "ui-serif, Georgia, serif" : "ui-sans-serif, system-ui, sans-serif"}` }}>
                <span className="text-lg font-semibold text-foreground">{font.label}</span>
                <span className="text-base text-muted-foreground">{font.note}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-semibold text-foreground">Text size</legend>
          <div className="flex flex-wrap gap-2">
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
                <span className="text-base font-semibold text-foreground">{size.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="rounded-md border-2 border-border bg-card p-3" data-testid="display-preview">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          <p className="mt-1 text-lg text-card-foreground">The best argument wins, before the deadline. Read the rules, make your case, and answer the strongest objection.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => commit({ font: DEFAULT_FONT, size: DEFAULT_SIZE })} disabled={isDefault}>
            Reset to default
          </Button>
          <p role="status" className="text-base text-muted-foreground">
            {saveFailed ? "This browser would not save your choice, so it applies until you close the page." : "Saved on this device only."}
          </p>
        </div>
      </div>
    </details>
  );
}
