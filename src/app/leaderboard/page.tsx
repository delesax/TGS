import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page } from "@/components/page";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/campaigns";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

type Row = { user_id: string; handle: string; titles: number; awards: number; campaigns: number; points: number };

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const { category: raw } = await searchParams;
  const category = typeof raw === "string" && (CATEGORIES as readonly string[]).includes(raw) ? (raw as Category) : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leaderboard", { p_category: category, p_limit: 100 });
  if (error) throw new Error("Could not load the leaderboard");
  const rows = (data as Row[]) ?? [];
  const tabs: { href: string; label: string; active: boolean }[] = [
    { href: "/leaderboard", label: "All time", active: !category },
    ...CATEGORIES.map((c) => ({ href: `/leaderboard?category=${c}`, label: CATEGORY_LABELS[c], active: category === c })),
  ];

  return (
    <Page title="Leaderboard" intro="From published Verdicts only. 10 points for each Grand Strategist title, 4 for each other award, 1 for each judged Campaign taken part in.">
      <nav aria-label="Leaderboard categories">
        <ul className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={t.active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center rounded-md border-2 px-3 text-lg font-semibold",
                  t.active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length ? (
        <ol className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={r.user_id} className="flex flex-col gap-1 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xl">
                <span className="mr-2 font-bold">{i + 1}.</span>
                <Link href={`/strategists/${r.handle}`} className="font-semibold text-primary underline">
                  @{r.handle}
                </Link>
              </p>
              <p className="text-lg">
                <strong>
                  {r.points} point{r.points === 1 ? "" : "s"}
                </strong> · {r.titles} title{r.titles === 1 ? "" : "s"} · {r.awards} award{r.awards === 1 ? "" : "s"} · {r.campaigns} Campaign
                {r.campaigns === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="No Verdicts yet">
          {category ? `No ${CATEGORY_LABELS[category]} Campaign has a published Verdict yet.` : "The leaderboard fills in as Verdicts are published."}{" "}
          <Link href="/campaigns" className="font-semibold text-primary underline">
            See Campaigns
          </Link>
        </EmptyState>
      )}
    </Page>
  );
}
