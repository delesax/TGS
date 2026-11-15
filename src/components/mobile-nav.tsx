"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

/**
 * "Menu" button and dropdown panel for the header below the lg breakpoint (1024px), replacing the row of links
 * that used to wrap onto a second line on phones. The panel contents are server-rendered by SiteHeader and
 * passed in as children.
 *
 * Behaviour: a real button with aria-expanded and aria-controls; closes on a second press, on Escape (focus goes
 * back to the button), on choosing a link, on a route change and on a press outside; focus moves to the first
 * link on open. The button keeps a fixed 18px size (like Sign in beside it) so the logo still fits at 320px when the
 * Display picker's Larger text is on; the links inside the panel do scale. No animation, so nothing to switch off for prefers-reduced-motion. The panel is positioned
 * against the <header> (which is `relative`), so opening it overlays the page and never pushes content sideways.
 */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Remember the path the menu was opened on: a route change closes it without an effect.
  const [openAt, setOpenAt] = React.useState<string | null>(null);
  const open = openAt === pathname;
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback((returnFocus: boolean) => {
    setOpenAt(null);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => (open ? close(false) : setOpenAt(pathname))}
        className="inline-flex min-h-[44px] items-center gap-[6px] rounded-md border-2 border-primary bg-background px-[12px] text-[18px] font-semibold text-primary hover:bg-secondary aria-expanded:bg-secondary"
      >
        {open ? <X aria-hidden className="size-[20px]" /> : <Menu aria-hidden className="size-[20px]" />}
        Menu
      </button>
      <div
        id="mobile-menu"
        ref={panelRef}
        hidden={!open}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a, [data-close-menu]")) close(false);
        }}
        onSubmit={() => close(false)}
        className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-background shadow-lg"
      >
        {children}
      </div>
    </>
  );
}
