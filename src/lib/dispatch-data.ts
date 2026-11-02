import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LIMITS, type DispatchLimits, type DispatchRow } from "@/lib/dispatches";

// Reads for Dispatches, always through the signed-in person's own client, so
// row-level security decides what they see.

export const THREADS_PER_PAGE = 20;
/** Upper bound on replies loaded with one page of threads. */
const MAX_REPLIES_PER_PAGE = 400;

export const DISPATCH_COLUMNS =
  "id, campaign_id, author_id, parent_id, display_parent_id, root_id, depth, kind, position, body, sources, ai_use, round_position, reaction_counts, created_at, edited_at, withdrawn_at, hidden_at, author:profiles!dispatches_author_id_fkey(handle)";

export async function getDispatchLimits(): Promise<DispatchLimits> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_settings")
    .select("argument_max_chars, rebuttal_max_chars, evidence_max_chars, max_dispatches_per_round, cooldown_seconds, edit_window_seconds")
    .maybeSingle<DispatchLimits>();
  return data ?? DEFAULT_LIMITS;
}

export type ReactionType = { key: string; label: string; description: string };

export async function getReactionTypes(): Promise<ReactionType[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("reaction_types").select("key, label, description").eq("active", true).order("sort");
  return (data as ReactionType[] | null) ?? [];
}

export type ThreadPage = {
  rows: DispatchRow[];
  /** created_at of the oldest thread on this page, for "Show more"; null when there are no more. */
  nextBefore: string | null;
};

/**
 * One page of threads: 20 top-level Dispatches, newest first, with their
 * replies. Never loads the whole Campaign at once.
 */
export async function getThreadPage(campaignId: string, before: string | null = null): Promise<ThreadPage> {
  const supabase = await createClient();
  let rootsQuery = supabase
    .from("dispatches")
    .select(DISPATCH_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("depth", 0)
    .order("created_at", { ascending: false })
    .limit(THREADS_PER_PAGE + 1);
  if (before) rootsQuery = rootsQuery.lt("created_at", before);
  const { data: roots, error } = await rootsQuery;
  if (error) throw new Error("Could not load Dispatches");

  const page = (roots as unknown as DispatchRow[]).slice(0, THREADS_PER_PAGE);
  const hasMore = (roots?.length ?? 0) > THREADS_PER_PAGE;
  if (!page.length) return { rows: [], nextBefore: null };

  const { data: replies, error: repliesError } = await supabase
    .from("dispatches")
    .select(DISPATCH_COLUMNS)
    .in(
      "root_id",
      page.map((r) => r.id),
    )
    .gt("depth", 0)
    .order("created_at", { ascending: true })
    .limit(MAX_REPLIES_PER_PAGE);
  if (repliesError) throw new Error("Could not load replies");

  return {
    rows: [...page, ...((replies as unknown as DispatchRow[]) ?? [])],
    nextBefore: hasMore ? page[page.length - 1].created_at : null,
  };
}

/** Visible Dispatches posted after `since` by other people (for the "N new Dispatches" pill). */
export async function countNewDispatches(campaignId: string, since: string, excludeAuthor: string | null): Promise<number> {
  const supabase = await createClient();
  let query = supabase
    .from("dispatches")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("moderation_status", "visible")
    .gt("created_at", since);
  if (excludeAuthor) query = query.neq("author_id", excludeAuthor);
  const { count, error } = await query;
  if (error) throw new Error("Could not count new Dispatches");
  return count ?? 0;
}

export async function getMyReactions(dispatchIds: string[], userId: string): Promise<Record<string, string[]>> {
  if (!dispatchIds.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("dispatch_reactions").select("dispatch_id, reaction").eq("user_id", userId).in("dispatch_id", dispatchIds);
  const mine: Record<string, string[]> = {};
  for (const r of (data as { dispatch_id: string; reaction: string }[] | null) ?? []) {
    (mine[r.dispatch_id] ??= []).push(r.reaction);
  }
  return mine;
}

export type ComposeContext = {
  postedThisRound: number;
  lastPostedAt: string | null;
  followsCampaign: boolean;
};

export async function getComposeContext(campaignId: string, userId: string, roundPosition: number | null): Promise<ComposeContext> {
  const supabase = await createClient();
  let roundQuery = supabase.from("dispatches").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("author_id", userId);
  roundQuery = roundPosition === null ? roundQuery.is("round_position", null) : roundQuery.eq("round_position", roundPosition);
  const [{ count }, { data: last }, { data: follow }] = await Promise.all([
    roundQuery,
    supabase.from("dispatches").select("created_at").eq("author_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("campaign_follows").select("campaign_id").eq("campaign_id", campaignId).eq("user_id", userId).maybeSingle(),
  ]);
  return { postedThisRound: count ?? 0, lastPostedAt: (last as { created_at: string } | null)?.created_at ?? null, followsCampaign: Boolean(follow) };
}
