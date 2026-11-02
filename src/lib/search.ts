import "server-only";
import { createClient } from "@/lib/supabase/server";

export const SEARCH_TYPES = ["all", "campaigns", "dispatches", "strategists"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
export const SEARCH_PAGE_SIZE = 20;
/** Searches that take longer than this are stopped and the person is told. */
export const SEARCH_TIMEOUT_MS = 4000;

export type SearchResult = {
  result_type: "campaign" | "dispatch" | "strategist";
  id: string;
  title: string;
  snippet: string;
  campaign_slug: string | null;
  handle: string | null;
  created_at: string;
  rank: number;
};

export type SearchOutcome = { results: SearchResult[]; hasMore: boolean } | { error: "timeout" | "failed" };

/** Full-text search through search_tgs(), which runs with the person's own rights (row-level security). */
export async function runSearch(query: string, type: SearchType, page: number): Promise<SearchOutcome> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("search_tgs", { p_query: query, p_type: type, p_limit: SEARCH_PAGE_SIZE + 1, p_offset: (page - 1) * SEARCH_PAGE_SIZE })
    .abortSignal(AbortSignal.timeout(SEARCH_TIMEOUT_MS));
  if (error) {
    const timedOut = /abort|timeout|57014/i.test(`${error.message} ${error.code ?? ""}`);
    if (!timedOut) console.error("search failed", error.code);
    return { error: timedOut ? "timeout" : "failed" };
  }
  const rows = (data as SearchResult[]) ?? [];
  return { results: rows.slice(0, SEARCH_PAGE_SIZE), hasMore: rows.length > SEARCH_PAGE_SIZE };
}
