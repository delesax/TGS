import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { formatUkShort } from "@/lib/campaigns";
import { splitHighlights } from "@/lib/highlight";
import { SEARCH_TYPES, runSearch, type SearchResult, type SearchType } from "@/lib/search";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<SearchType, string> = { all: "Everything", campaigns: "Campaigns", dispatches: "Dispatches", strategists: "Strategists" };
const RESULT_LABELS: Record<SearchResult["result_type"], string> = { campaign: "Campaign", dispatch: "Dispatch", strategist: "Strategist" };

function Highlighted({ text }: { text: string }) {
  return (
    <>
      {splitHighlights(text).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded bg-accent px-0.5 font-semibold text-accent-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function resultHref(r: SearchResult): string {
  if (r.result_type === "campaign") return `/campaigns/${r.campaign_slug}`;
  if (r.result_type === "dispatch") return `/campaigns/${r.campaign_slug}#dispatch-${r.id}`;
  return `/strategists/${r.handle}`;
}

function searchHref(q: string, type: SearchType, page = 1) {
  const params = new URLSearchParams({ q });
  if (type !== "all") params.set("type", type);
  if (page > 1) params.set("page", String(page));
  return `/search?${params}`;
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 200);
  const type = (SEARCH_TYPES as readonly string[]).includes(String(params.type)) ? (params.type as SearchType) : "all";
  const page = Math.min(Math.max(Number.parseInt(String(params.page ?? "1"), 10) || 1, 1), 50);

  const outcome = q ? await runSearch(q, type, page) : null;

  return (
    <Page title="Search" intro="Find Campaigns, Dispatches and Strategists. Withdrawn and hidden Dispatches are not included.">
      <form role="search" action="/search" className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="search-page-q" className="sr-only">
          Search for
        </label>
        <input
          id="search-page-q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={200}
          className="min-h-12 w-full rounded-md border-2 border-input bg-background px-4 text-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
        <Button type="submit">Search</Button>
      </form>

      {q ? (
        <nav aria-label="Filter results">
          <ul className="flex flex-wrap gap-2">
            {SEARCH_TYPES.map((t) => (
              <li key={t}>
                <Link
                  href={searchHref(q, t)}
                  aria-current={t === type ? "page" : undefined}
                  className="inline-flex min-h-12 items-center rounded-full border-2 border-border px-4 text-base font-semibold aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
                >
                  {TYPE_LABELS[t]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {!q ? (
        <EmptyState title="What are you looking for?">Type a word or two, for example a topic, a phrase from a Dispatch, or a Strategist&apos;s handle.</EmptyState>
      ) : outcome && "error" in outcome ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border-2 border-destructive p-5">
          <p className="text-xl font-semibold">{outcome.error === "timeout" ? "That search took too long." : "Search is not working right now."}</p>
          <p className="text-lg">{outcome.error === "timeout" ? "Try fewer or more specific words." : "Please try again in a moment."}</p>
          <Button asChild variant="outline" className="self-start">
            <Link href={searchHref(q, type, page)}>Try again</Link>
          </Button>
        </div>
      ) : outcome && outcome.results.length === 0 ? (
        <EmptyState title="No results">
          Nothing matched “{q}”{type !== "all" ? ` in ${TYPE_LABELS[type]}` : ""}. Check the spelling, try other words{type !== "all" ? ", or search everything" : ""}.
        </EmptyState>
      ) : outcome ? (
        <>
          <p role="status" className="text-lg">
            {outcome.hasMore || page > 1 ? `Showing results ${(page - 1) * 20 + 1} to ${(page - 1) * 20 + outcome.results.length}` : `${outcome.results.length} result${outcome.results.length === 1 ? "" : "s"}`} for “{q}”.
          </p>
          <ol className="flex flex-col gap-3">
            {outcome.results.map((r) => (
              <li key={`${r.result_type}-${r.id}`} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                <p className="text-base font-semibold text-muted-foreground">{RESULT_LABELS[r.result_type]}</p>
                <Link href={resultHref(r)} className="text-xl font-semibold text-primary underline underline-offset-2 [overflow-wrap:anywhere]">
                  {r.result_type === "strategist" ? `@${r.title}` : r.title}
                </Link>
                {r.snippet ? (
                  <p className="text-lg [overflow-wrap:anywhere]">
                    <Highlighted text={r.snippet} />
                  </p>
                ) : null}
                {r.result_type === "dispatch" ? (
                  <p className="text-base text-muted-foreground">
                    By @{r.handle}, {formatUkShort(r.created_at)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3 sm:flex-row">
            {page > 1 ? (
              <Button asChild variant="outline">
                <Link href={searchHref(q, type, page - 1)}>Previous results</Link>
              </Button>
            ) : null}
            {outcome.hasMore ? (
              <Button asChild variant="outline">
                <Link href={searchHref(q, type, page + 1)}>More results</Link>
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </Page>
  );
}
