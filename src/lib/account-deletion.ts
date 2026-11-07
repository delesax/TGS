import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deleting an account, in ONE place. The self-service page
 * (src/app/profile/delete/actions.ts) and the by-hand script
 * (scripts/delete-account.ts) both call deleteAccount(), so they cannot drift.
 * The database does the anonymising (anonymise_profile) and writes the audit
 * entry; then the sign-in is deleted. Takes an admin (service role) client.
 */

export type DeletionSummary = {
  found: boolean;
  already_deleted?: boolean;
  via?: string;
  kept_dispatches?: number;
  removed_positions?: number;
  archived_positions?: number;
  text_copies_scrubbed?: number;
};

export type DeletionResult = { ok: true; summary: DeletionSummary; signInDeleted: boolean } | { ok: false; reason: "not_found" | "failed" };

export async function deleteAccount(admin: SupabaseClient, userId: string, via: "self_service" | "by_hand"): Promise<DeletionResult> {
  const { data: summary, error } = await admin.rpc("anonymise_profile", { p_user_id: userId, p_via: via });
  if (error) return { ok: false, reason: "failed" };
  const s = summary as DeletionSummary;
  if (!s.found) return { ok: false, reason: "not_found" };
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  // If this fails the profile is already anonymised; the caller reports it.
  return { ok: true, summary: s, signInDeleted: !authError };
}

export type DeletionPreview = {
  found: boolean;
  alreadyDeleted: boolean;
  removed: Record<string, number>;
  kept: { dispatches: number; positionsOnClosedCampaigns: number; auditEntries: number };
};

/** Counts of what deleteAccount() would remove and keep. Reads only; changes nothing. */
export async function previewAccountDeletion(admin: SupabaseClient, userId: string): Promise<DeletionPreview> {
  const count = async (table: string, column: string, value: string) => {
    const { count: n } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, value);
    return n ?? 0;
  };
  const { data: profile } = await admin.from("profiles").select("id, deleted_at, positions_consent_at").eq("id", userId).maybeSingle<{ id: string; deleted_at: string | null; positions_consent_at: string | null }>();
  if (!profile) return { found: false, alreadyDeleted: false, removed: {}, kept: { dispatches: 0, positionsOnClosedCampaigns: 0, auditEntries: 0 } };

  const { data: positions } = await admin.from("campaign_positions").select("campaign:campaigns(status, ends_at)").eq("user_id", userId);
  const now = Date.now();
  let open = 0;
  let closed = 0;
  for (const p of (positions ?? []) as unknown as { campaign: { status: string; ends_at: string } | { status: string; ends_at: string }[] | null }[]) {
    const c = Array.isArray(p.campaign) ? p.campaign[0] : p.campaign;
    if (c && (c.status === "closed" || Date.parse(c.ends_at) <= now)) closed += 1;
    else open += 1;
  }
  const { count: followers } = await admin.from("strategist_follows").select("*", { count: "exact", head: true }).or(`follower_id.eq.${userId},followed_id.eq.${userId}`);
  const { count: audit } = await admin.from("audit_log").select("*", { count: "exact", head: true }).eq("actor_id", userId);

  return {
    found: true,
    alreadyDeleted: Boolean(profile.deleted_at),
    removed: {
      "passkeys": await count("passkeys", "user_id", userId),
      "reactions": await count("dispatch_reactions", "user_id", userId),
      "campaign follows": await count("campaign_follows", "user_id", userId),
      "strategist follows (both ways)": followers ?? 0,
      "queued and sent emails": await count("email_outbox", "user_id", userId),
      "coach feedback records": await count("coach_feedback", "user_id", userId),
      "positions on open Campaigns": open,
      ...(profile.positions_consent_at ? {} : { "positions on closed Campaigns (no consent on record, so deleted)": closed }),
    },
    kept: {
      dispatches: await count("dispatches", "author_id", userId),
      positionsOnClosedCampaigns: profile.positions_consent_at ? closed : 0,
      auditEntries: audit ?? 0,
    },
  };
}
