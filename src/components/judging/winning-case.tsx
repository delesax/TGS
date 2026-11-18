import Link from "next/link";
import type { WinningCase } from "@/lib/judging/data";
import { winningCaseLabel } from "@/lib/judging/winning-case";

/** "The winning case": the approved summary of the winner's Dispatches, with a plain label of who wrote it. Renders nothing without one. */
export function WinningCaseSection({ winningCase, campaignSlug }: { winningCase: WinningCase | null; campaignSlug: string }) {
  if (!winningCase) return null;
  return (
    <section aria-labelledby="winning-case-h" className="flex flex-col gap-3" data-testid="winning-case">
      <h2 id="winning-case-h">The winning case</h2>
      <div className="surface-card flex flex-col gap-3 p-5 sm:p-6">
        <p className="text-lg leading-relaxed [overflow-wrap:anywhere]">{winningCase.text}</p>
        <p className="border-t border-hairline pt-3 text-sm text-muted-foreground" data-testid="winning-case-label">
          {winningCaseLabel(winningCase.aiAssisted)}.
        </p>
        {winningCase.dispatchId ? (
          <Link href={`/campaigns/${campaignSlug}#dispatch-${winningCase.dispatchId}`} className="inline-flex min-h-11 w-fit items-center text-base font-semibold text-primary underline underline-offset-4">
            Read the Dispatch
          </Link>
        ) : null}
      </div>
    </section>
  );
}
