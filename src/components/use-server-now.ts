"use client";

import * as React from "react";

/**
 * The server's clock, as seen from the browser. The page passes the server's
 * now(); we work out the offset from the browser clock once, tick from it, and
 * re-sync from /api/time whenever the tab comes back into focus. The browser's
 * own clock is never trusted for the deadline itself (CLAUDE.md rule 5).
 */
export function useServerNow(serverNow: number): number {
  const offset = React.useRef<number | null>(null);
  const [now, setNow] = React.useState(serverNow);

  React.useEffect(() => {
    offset.current = serverNow - Date.now();
    const tick = () => setNow(Date.now() + (offset.current ?? 0));
    tick();
    const timer = window.setInterval(tick, 1000);

    const resync = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const sent = Date.now();
        const res = await fetch("/api/time", { cache: "no-store" });
        const { now: server } = (await res.json()) as { now: number };
        const received = Date.now();
        // Assume the reply took half the round trip to arrive.
        offset.current = server + (received - sent) / 2 - received;
        tick();
      } catch {
        // Keep ticking from the last known offset.
      }
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, [serverNow]);

  return now;
}

