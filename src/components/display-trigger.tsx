"use client";

import { CaseSensitive } from "lucide-react";
import { OPEN_DISPLAY_EVENT } from "@/components/display-dialog";

/**
 * The "Text" button that opens the Display settings dialog. `header` sits in the desktop header row; `menu` is the
 * row inside the phone Menu (the panel closes as the dialog opens). The visible word is "Text"; the accessible name
 * is longer and starts from it.
 */
export function DisplayTrigger({ variant }: { variant: "header" | "menu" }) {
  const common = "font-semibold text-foreground transition-colors duration-200 hover:bg-muted motion-reduce:transition-none";
  return (
    <button
      type="button"
      aria-label="Display settings: text style and size"
      aria-haspopup="dialog"
      data-close-menu={variant === "menu" ? "" : undefined}
      onClick={() => window.dispatchEvent(new Event(OPEN_DISPLAY_EVENT))}
      className={
        variant === "header"
          ? `inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-[8px] text-[15px] xl:px-[10px] xl:text-[16px] ${common}`
          : `flex min-h-12 w-full items-center gap-2 rounded-md px-3 text-lg ${common}`
      }
    >
      <CaseSensitive aria-hidden className="size-[20px] shrink-0" />
      Text
    </button>
  );
}
