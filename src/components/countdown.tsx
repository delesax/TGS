"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { announcementBucket, clockParts, describeDuration, secondsLeft } from "@/lib/campaigns";
import { cn } from "@/lib/utils";
import { useServerNow } from "./use-server-now";

const pad = (n: number) => String(n).padStart(2, "0");

export function Countdown({
  target,
  serverNow,
  label,
  doneLabel,
  size = "large",
  id,
}: {
  /** ISO timestamp from the database. */
  target: string;
  serverNow: number;
  /** For example "Time left" or "Opens in". */
  label: string;
  /** Shown when the clock reaches zero. */
  doneLabel: string;
  size?: "large" | "small";
  id?: string;
}) {
  const router = useRouter();
  const now = useServerNow(serverNow);
  const left = secondsLeft(Date.parse(target), now);
  const { days, hours, minutes, seconds } = clockParts(left);

  // Refresh the page once per deadline so status and round update. Keyed by
  // target: React reuses this component when "Opens in" becomes "Time left".
  const refreshedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (left === 0 && refreshedFor.current !== target) {
      const t = window.setTimeout(() => {
        refreshedFor.current = target;
        router.refresh();
      }, 1500);
      return () => window.clearTimeout(t);
    }
  }, [left, target, router]);

  // Screen readers hear it at sensible intervals, not every second.
  const bucket = announcementBucket(left);
  const announcement = React.useMemo(
    () => (bucket === 0 ? doneLabel : `${label}: ${describeDuration(bucket)} or less.`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bucket],
  );

  const units = [
    { value: days, name: "days" },
    { value: hours, name: "hours" },
    { value: minutes, name: "minutes" },
    { value: seconds, name: "seconds" },
  ];

  return (
    <div id={id} className="flex flex-col gap-2" data-testid={id}>
      <p className={cn("font-semibold", size === "large" ? "text-xl" : "text-lg")}>{label}</p>
      {left === 0 ? (
        <p className={cn("font-bold", size === "large" ? "text-3xl" : "text-xl")}>{doneLabel}</p>
      ) : (
        <>
          <p className="sr-only">{describeDuration(left)}</p>
          <div aria-hidden className="flex gap-2 sm:gap-3" data-seconds-left={left}>
            {units.map((u) => (
              <div
                key={u.name}
                className={cn(
                  "flex flex-col items-center rounded-lg bg-primary text-primary-foreground",
                  size === "large" ? "min-w-16 px-2 py-2 sm:min-w-20" : "min-w-12 px-1.5 py-1",
                )}
              >
                <span className={cn("font-bold tabular-nums leading-none", size === "large" ? "text-3xl sm:text-4xl" : "text-xl")}>
                  {pad(u.value)}
                </span>
                <span className={cn(size === "large" ? "text-sm" : "text-xs")}>{u.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
