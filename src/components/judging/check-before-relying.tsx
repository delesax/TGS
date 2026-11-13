import { countCheckSignals, describeCounts, leansOnUnlinkedClaims, type DispatchSource } from "@/lib/judging/check-before-relying";

/**
 * "Check before relying": what a person should look at before trusting the evidence in a Dispatch.
 * The AI cannot verify sources, so this lists the claims the model flagged (prompt v2) and plain counts
 * of links, figures and named studies. It never changes a score.
 */
export function CheckBeforeRelying({ body, sources, claims }: { body: string; sources?: DispatchSource[] | null; claims?: string[] | null }) {
  const counts = countCheckSignals(body, sources ?? []);
  const list = (claims ?? []).filter(Boolean);
  if (!list.length && counts.figures + counts.namedStudies === 0 && counts.links === 0) return null;
  return (
    <div role="note" className="flex flex-col gap-1 rounded-lg border-2 border-border bg-muted p-3 text-base">
      <p className="font-semibold">Check before relying</p>
      <p>
        {describeCounts(counts)}.{leansOnUnlinkedClaims(counts) ? " It names figures or studies but gives no link." : ""} The AI cannot check any source, so look at these yourself.
      </p>
      {list.length ? (
        <>
          <p className="font-semibold">Claims the AI flagged for checking:</p>
          <ul className="list-disc pl-6">
            {list.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
