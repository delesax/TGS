import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PublishedRubric } from "@/lib/judging/rubric";
import type { CampaignRound, Category, Format, PositionChoice, Status } from "@/lib/campaigns";

export type CampaignSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: Category;
  format: Format;
  status: Status;
  starts_at: string;
  ends_at: string;
  is_sensitive: boolean;
  opinion_not_advice: boolean;
};

export type Campaign = CampaignSummary & {
  rules: string | null;
  rubric_published_at: string | null;
  judging_weights_version: number | null;
  content_note: string | null;
  rounds: CampaignRound[];
};

/** Admin-only columns, read through campaign_admin_fields() (checks the JWT role claim). */
export type CampaignAdminFields = { id: string; notes: string | null; needs_owner_decision: string | null };

const SUMMARY_COLUMNS = "id, slug, title, summary, category, format, status, starts_at, ends_at, is_sensitive, opinion_not_advice";

/** The database clock in milliseconds. Server time is the only clock (CLAUDE.md rule 5). */
export async function getServerNow(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("server_now");
  if (error || !data) throw new Error("Could not read the server clock");
  return Date.parse(data as string);
}

/** Published Campaigns (and drafts for admins, through row-level security). */
export async function listCampaigns(): Promise<CampaignSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("campaigns").select(SUMMARY_COLUMNS).order("starts_at");
  if (error) throw new Error("Could not load Campaigns");
  return data as CampaignSummary[];
}

export async function getCampaign(by: { slug: string } | { id: string }): Promise<Campaign | null> {
  const supabase = await createClient();
  const query = supabase
    .from("campaigns")
    .select(`${SUMMARY_COLUMNS}, rules, rubric_published_at, judging_weights_version, content_note, rounds:campaign_rounds(position, title, starts_at, ends_at, allowed_kinds)`);
  const { data, error } = await ("slug" in by ? query.eq("slug", by.slug) : query.eq("id", by.id)).maybeSingle();
  if (error) throw new Error("Could not load the Campaign");
  if (!data) return null;
  const campaign = data as unknown as Campaign;
  campaign.rounds = [...campaign.rounds].sort((a, b) => a.position - b.position);
  return campaign;
}

export type MyPosition = { before_position: PositionChoice | null; after_position: PositionChoice | null };

export async function getMyPosition(campaignId: string, userId: string): Promise<MyPosition | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_positions")
    .select("before_position, after_position")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle<MyPosition>();
  return data ?? null;
}

export async function getCampaignAdminFields(ids: string[]): Promise<Map<string, CampaignAdminFields>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("campaign_admin_fields", { p_ids: ids });
  if (error) throw new Error("Could not load Campaign notes");
  return new Map((data as CampaignAdminFields[]).map((row) => [row.id, row]));
}

/** The published rubric for a Campaign, or null while it is unpublished. Weights are the version pinned at publication. */
export async function getPublishedRubric(c: Pick<Campaign, "rubric_published_at" | "judging_weights_version">): Promise<PublishedRubric | null> {
  if (!c.rubric_published_at) return null;
  const supabase = await createClient();
  const [{ data: w }, { data: s }] = await Promise.all([
    c.judging_weights_version
      ? supabase.from("judging_weights").select("panel, peer, ai_rubric, mind_change").eq("version", c.judging_weights_version).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("judging_settings").select("steelman_bonus_max").maybeSingle<{ steelman_bonus_max: number | string }>(),
  ]);
  return {
    publishedAt: c.rubric_published_at,
    weights: (w as PublishedRubric["weights"]) ?? null,
    steelmanBonusMax: s ? Number(s.steelman_bonus_max) : null,
  };
}
