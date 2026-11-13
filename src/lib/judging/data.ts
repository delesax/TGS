import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Attention, Component, ProposedAward, StrategistScore, Weights } from "./blend";

// Reads for the judging pages, through the signed-in (or anonymous) client,
// so row-level security decides what each person sees.

export type VerdictRow = {
  id: string;
  campaign_id: string;
  version: number;
  status: "draft" | "published" | "appealed" | "final" | "superseded" | "discarded";
  needs_attention: boolean;
  attention_reasons: Attention[];
  weights_snapshot: Weights;
  component_scores: StrategistScore[];
  proposed_awards: ProposedAward[];
  winner_id: string | null;
  rationale: string;
  rationale_ai_assisted: boolean;
  rationale_model: string | null;
  rationale_edited_at: string | null;
  computed_at: string;
  computed_by: string | null;
  published_at: string | null;
  appeal_closes_at: string | null;
  finalised_at: string | null;
};

export const VERDICT_COLUMNS =
  "id, campaign_id, version, status, needs_attention, attention_reasons, weights_snapshot, component_scores, proposed_awards, winner_id, rationale, rationale_ai_assisted, rationale_model, rationale_edited_at, computed_at, computed_by, published_at, appeal_closes_at, finalised_at";

export const COMPONENT_ORDER: Component[] = ["panel", "peer", "ai_rubric", "mind_change"];

export async function getLiveVerdict(campaignId: string): Promise<VerdictRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("verdicts").select(VERDICT_COLUMNS).eq("campaign_id", campaignId).in("status", ["published", "appealed", "final"]).maybeSingle();
  if (error) throw new Error("Could not load the Verdict");
  return data as VerdictRow | null;
}

/** Current handles for user ids; null for a deleted account. */
export async function getHandles(ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, handle, deleted_at").in("id", unique);
  const map = new Map<string, string | null>(unique.map((id) => [id, null]));
  for (const p of (data as { id: string; handle: string | null; deleted_at: string | null }[]) ?? []) map.set(p.id, p.deleted_at ? null : p.handle);
  return map;
}

export type AwardRow = {
  category: ProposedAward["category"];
  rationale: string;
  awarded_at: string;
  dispatch_id: string | null;
  campaign: { slug: string; title: string; category: string } | null;
};

/** A Strategist's titles and awards, newest first. Awards are public. */
export async function getAwardsFor(profileId: string): Promise<AwardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("awards")
    .select("category, rationale, awarded_at, dispatch_id, campaign:campaigns(slug, title, category)")
    .eq("profile_id", profileId)
    .order("awarded_at", { ascending: false });
  if (error) return [];
  return (data as unknown as AwardRow[]) ?? [];
}

export type JudgingWindow = { peerOpen: boolean; closed: boolean; live: string | null };

export async function getJudgingWindow(campaignId: string): Promise<JudgingWindow> {
  const supabase = await createClient();
  const [{ data: peerOpen }, { data: closed }, { data: live }] = await Promise.all([
    supabase.rpc("peer_window_open", { p_campaign_id: campaignId }),
    supabase.rpc("campaign_has_closed", { p_campaign_id: campaignId }),
    supabase.rpc("live_verdict_status", { p_campaign_id: campaignId }),
  ]);
  return { peerOpen: Boolean(peerOpen), closed: Boolean(closed), live: (live as string | null) ?? null };
}

export type JudgingSettingsRow = {
  peer_window_hours: number;
  judging_window_hours: number;
  peer_vote_credits: number;
  appeal_window_days: number;
  ai_rationale_wording: boolean;
  steelman_bonus_max: number;
  steelman_min_confirmations: number;
  reputation_cap_multiple: number;
  min_voter_account_age_hours: number;
  max_steelman_confirmations: number;
  min_position_span_hours: number;
};

export async function getJudgingSettings(): Promise<JudgingSettingsRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("judging_settings")
    .select("peer_window_hours, judging_window_hours, peer_vote_credits, appeal_window_days, ai_rationale_wording, steelman_bonus_max, steelman_min_confirmations, reputation_cap_multiple, min_voter_account_age_hours, max_steelman_confirmations, min_position_span_hours")
    .single();
  if (error || !data) throw new Error("Could not load the judging settings");
  return data as JudgingSettingsRow;
}

/** Eligible Dispatches of a Campaign, oldest first, with their author's handle. */
export type JudgingDispatch = {
  id: string;
  author_id: string;
  kind: "argument" | "rebuttal" | "evidence";
  body: string;
  created_at: string;
  parent_id: string | null;
  author: { handle: string | null; deleted_at: string | null } | null;
};

export async function getEligibleDispatches(campaignId: string): Promise<JudgingDispatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispatches")
    .select("id, author_id, kind, body, created_at, parent_id, author:profiles!dispatches_author_id_fkey(handle, deleted_at)")
    .eq("campaign_id", campaignId)
    .eq("moderation_status", "visible")
    .is("withdrawn_at", null)
    .is("hidden_at", null)
    .order("created_at")
    .limit(500);
  if (error) throw new Error("Could not load the Dispatches");
  return (data as unknown as JudgingDispatch[]) ?? [];
}

export function handleOf(d: { author: { handle: string | null; deleted_at: string | null } | null }): string {
  return d.author?.handle && !d.author.deleted_at ? `@${d.author.handle}` : "A former Strategist";
}
