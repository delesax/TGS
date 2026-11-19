"use client";

import * as React from "react";
import { watchTheme } from "@/lib/theme";

/**
 * Keeps Automatic live: when the device switches between light and dark, when the clock crosses 19:00 or 07:00, and when
 * a hidden tab comes back, the theme is re-resolved with no reload. Renders nothing; the first resolution is done by
 * the script in <head> (src/lib/theme-init.ts) before the page paints.
 */
export function ThemeSync() {
  React.useEffect(() => watchTheme(), []);
  return null;
}
