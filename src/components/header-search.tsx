"use client";

import * as React from "react";
import { Search } from "lucide-react";

/**
 * Desktop (xl and up) search: a compact field that widens on focus, with a "/" shortcut hint.
 * Pressing "/" anywhere outside a text field focuses it. Below xl the header shows a Search
 * icon link instead, and below lg the phone header has its own full-width search row.
 */
export function HeaderSearch() {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const input = inputRef.current;
      if (!input || input.offsetParent === null) return; // not visible at this width
      event.preventDefault();
      input.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form role="search" action="/search" className="relative hidden xl:block">
      <label htmlFor="site-search-desktop" className="sr-only">
        Search Campaigns, Dispatches and Strategists
      </label>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        id="site-search-desktop"
        name="q"
        type="search"
        enterKeyHint="search"
        maxLength={200}
        placeholder="Search"
        className="h-[40px] w-[160px] rounded-[10px] border border-input bg-background/60 pl-9 pr-9 text-[16px] placeholder:text-muted-foreground transition-[width,box-shadow] duration-200 focus:w-[240px] motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border px-[6px] text-[12px] text-muted-foreground"
      >
        /
      </kbd>
    </form>
  );
}
