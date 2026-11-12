import Link from "next/link";
import { Award, Medal } from "lucide-react";
import { EmptyState } from "@/components/page";
import { formatUkShort } from "@/lib/campaigns";
import type { AwardRow } from "@/lib/judging/data";
import { AWARD_LABELS } from "@/lib/judging/rationale";

/** Titles (Grand Strategist) and awards on a Dossier. Published Verdicts only. */
export function TitlesAndAwards({ awards, own }: { awards: AwardRow[]; own: boolean }) {
  const titles = awards.filter((a) => a.category === "grand_strategist");
  const others = awards.filter((a) => a.category !== "grand_strategist");
  const item = (a: AwardRow) => (
    <li key={`${a.category}-${a.campaign?.slug}`} className="flex flex-col gap-1 rounded-xl border border-border p-4">
      <p className="text-xl font-semibold">{AWARD_LABELS[a.category]}</p>
      {a.campaign ? (
        <Link href={`/campaigns/${a.campaign.slug}/verdict`} className="inline-flex min-h-12 items-center text-lg text-primary underline [overflow-wrap:anywhere]">
          {a.campaign.title}
        </Link>
      ) : null}
      <p className="text-base text-muted-foreground">Awarded {formatUkShort(a.awarded_at)}</p>
    </li>
  );
  return (
    <>
      <section aria-labelledby="dossier-titles" className="flex flex-col gap-3">
        <h2 id="dossier-titles" className="flex items-center gap-2 text-2xl font-semibold">
          <Medal aria-hidden className="size-6 text-primary" /> Titles
        </h2>
        {titles.length ? (
          <ul className="flex flex-col gap-3">{titles.map(item)}</ul>
        ) : (
          <EmptyState title="No titles yet">
            {own ? "Win a Campaign to be named Grand Strategist. Your title will be shown here for good." : "No Grand Strategist titles yet."}
          </EmptyState>
        )}
      </section>
      <section aria-labelledby="dossier-awards" className="flex flex-col gap-3">
        <h2 id="dossier-awards" className="flex items-center gap-2 text-2xl font-semibold">
          <Award aria-hidden className="size-6 text-primary" /> Awards
        </h2>
        {others.length ? (
          <ul className="flex flex-col gap-3">{others.map(item)}</ul>
        ) : (
          <EmptyState title="No awards yet">
            {own ? "Awards such as Best rebuttal and Best evidence are given when each Campaign's Verdict is published." : "No awards yet."}
          </EmptyState>
        )}
      </section>
    </>
  );
}
