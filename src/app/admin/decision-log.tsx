"use client";

import * as React from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// The moderation queue's "Just decided" log. It lives above the list, so when a
// decision refreshes the list (and the decided item leaves it) the confirmation
// stays on screen instead of disappearing with the item. Cleared by a full
// reload or by dismissing it.

type Decision = { id: number; summary: string; message: string };

const Ctx = React.createContext<{ add: (summary: string, message: string) => void } | null>(null);

/** Null outside the queue, where decisions keep showing their confirmation in place. */
export function useDecisionLog() {
  return React.useContext(Ctx);
}

export function DecisionLogProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [decisions, setDecisions] = React.useState<Decision[]>([]);
  const next = React.useRef(1);

  const add = React.useCallback(
    (summary: string, message: string) => {
      setDecisions((d) => [{ id: next.current++, summary, message }, ...d]);
      // Re-read the queue from the server. State up here is kept; the list below updates.
      router.refresh();
    },
    [router],
  );

  return (
    <Ctx.Provider value={{ add }}>
      {decisions.length ? (
        // Sticky, so it stays in view on a phone even if the decided item was far down the list.
        <section
          aria-label="Decisions you just made"
          role="status"
          className="sticky top-2 z-10 flex max-h-56 flex-col gap-2 overflow-y-auto rounded-xl border-2 border-success bg-background p-3 shadow-lg"
        >
          <h2 className="text-xl font-bold">Just decided ({decisions.length})</h2>
          <ul className="flex flex-col gap-2">
            {decisions.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2 rounded-lg bg-success/10 p-2 text-base">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <strong>{d.summary}</strong>
                  <br />
                  {d.message}
                </span>
                <Button type="button" variant="ghost" className="min-h-12 min-w-12 shrink-0 px-0" onClick={() => setDecisions((all) => all.filter((x) => x.id !== d.id))}>
                  <X aria-hidden />
                  <span className="sr-only">Dismiss this confirmation</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {children}
    </Ctx.Provider>
  );
}
