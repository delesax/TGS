import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Everything "Download my data" returns, apart from the Dispatches themselves
 * (those are streamed in batches by the route). Right of access, UK GDPR.
 *
 * Reads with the service role, but every query is limited to the one person by
 * id (or, for privacy requests, by the email on their account) and names its
 * columns, so nothing is returned by accident.
 *
 * Deliberately NOT included (it is someone else's data, or an internal
 * signal): reports other people made about this person's Dispatches; the
 * identity of any moderator, reviewer or administrator (resolved_by,
 * decided_by, overridden_by, original_actor, same_admin); who follows this
 * person; moderation flags (including the soft "possible undeclared AI"
 * flag, which the owner decided is never shown to the author); the AI's
 * structured output for decisions about Dispatches (it can contain that
 * signal); the unsubscribe token, passkey keys and counters; other people's
 * ids (people they follow appear by handle).
 */

export type ExportHead = Record<string, unknown>;

async function must<T>(label: string, q: PromiseLike<{ data: T | null; error: { code?: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`export: could not read ${label} (${error.code ?? "error"})`);
  return (data ?? ([] as unknown)) as T;
}

type Row = Record<string, unknown>;

export async function exportHead(admin: SupabaseClient, userId: string, email: string): Promise<ExportHead> {
  const profile = (
    await must<Row[]>(
      "profile",
      admin
        .from("profiles")
        .select(
          "id, handle, display_name, expertise_tag, bio, created_at, invite_id, invite_consumed_at, age_confirmed_at, terms_accepted_at, terms_version, privacy_version, public_acknowledged_at, positions_consent_at, positions_consent_version",
        )
        .eq("id", userId),
    )
  )[0] as Row | undefined;

  const inviteId = profile?.invite_id as string | null | undefined;
  const invite = inviteId ? ((await must<Row[]>("invite", admin.from("invites").select("code").eq("id", inviteId)))[0] as Row | undefined) : undefined;

  const [passkeys, positions, reactions, campaignFollows, strategistFollows, reports, appeals, decisions, coachRecords, coachRatings, emailPrefs, requestsById, requestsByEmail] =
    await Promise.all([
      must<Row[]>("passkeys", admin.from("passkeys").select("nickname, device_type, backed_up, created_at, last_used_at").eq("user_id", userId).order("created_at")),
      must<Row[]>("positions", admin.from("campaign_positions").select("campaign_id, before_position, after_position, before_at, after_at").eq("user_id", userId)),
      must<Row[]>("reactions", admin.from("dispatch_reactions").select("dispatch_id, reaction, created_at").eq("user_id", userId)),
      must<Row[]>("campaign follows", admin.from("campaign_follows").select("campaign_id, created_at").eq("user_id", userId)),
      must<Row[]>("strategist follows", admin.from("strategist_follows").select("followed_id, created_at").eq("follower_id", userId)),
      must<Row[]>("reports", admin.from("dispatch_reports").select("dispatch_id, reason, details, status, created_at").eq("reporter_id", userId)),
      must<Row[]>("appeals", admin.from("dispatch_appeals").select("dispatch_id, reason, original_status, status, decision_reason, created_at, decided_at").eq("author_id", userId)),
      must<Row[]>(
        "decisions",
        admin
          .from("ai_decisions")
          .select("created_at, subject_type, subject_id, model, prompt_version, outcome, reason, override_outcome, override_reason, overridden_at")
          .eq("user_id", userId)
          .in("subject_type", ["dispatch", "handle", "display_name", "bio"])
          .order("created_at"),
      ),
      must<Row[]>("coach records", admin.from("ai_decisions").select("created_at, subject_type, model, outcome, reason, output").eq("user_id", userId).in("subject_type", ["coach", "nudge"]).order("created_at")),
      must<Row[]>("coach ratings", admin.from("coach_feedback").select("campaign_id, helpful, comment, rated_at, created_at").eq("user_id", userId)),
      must<Row[]>("email settings", admin.from("notification_preferences").select("replies, campaign_updates, closing_soon, moderation, unsubscribed_all_at, updated_at").eq("user_id", userId)),
      must<Row[]>("privacy requests", admin.from("privacy_requests").select("id, created_at, type, message, status, acknowledged_at, due_at, closed_at, outcome_note").eq("user_id", userId)),
      must<Row[]>(
        "privacy requests by email",
        admin.from("privacy_requests").select("id, created_at, type, message, status, acknowledged_at, due_at, closed_at, outcome_note").eq("email", email.toLowerCase()),
      ),
    ]);

  // People they follow appear by (public) handle, never by internal id.
  const followedIds = strategistFollows.map((f) => f.followed_id as string);
  const handles = followedIds.length ? await must<Row[]>("followed handles", admin.from("profiles").select("id, handle").in("id", followedIds)) : [];
  const handleOf = new Map(handles.map((h) => [h.id as string, (h.handle as string | null) ?? "a deleted Strategist"]));

  const requests = new Map<string, Row>();
  for (const r of [...requestsById, ...requestsByEmail]) requests.set(r.id as string, r);

  return {
    account: {
      email,
      id: userId,
      handle: profile?.handle ?? null,
      display_name: profile?.display_name ?? null,
      expertise_tag: profile?.expertise_tag ?? null,
      bio: profile?.bio ?? null,
      created_at: profile?.created_at ?? null,
      invite_code_used: invite?.code ?? null,
      invite_consumed_at: profile?.invite_consumed_at ?? null,
    },
    consents: {
      age_confirmed_at: profile?.age_confirmed_at ?? null,
      terms_accepted_at: profile?.terms_accepted_at ?? null,
      terms_version: profile?.terms_version ?? null,
      privacy_version: profile?.privacy_version ?? null,
      public_acknowledged_at: profile?.public_acknowledged_at ?? null,
      positions_consent_at: profile?.positions_consent_at ?? null,
      positions_consent_version: profile?.positions_consent_version ?? null,
    },
    passkeys,
    positions,
    reactions_given: reactions,
    following: {
      campaigns: campaignFollows,
      strategists: strategistFollows.map((f) => ({ handle: handleOf.get(f.followed_id as string) ?? "a deleted Strategist", created_at: f.created_at })),
    },
    reports_made: reports,
    appeals_made: appeals,
    decisions_about_my_handle_and_dispatches: decisions,
    coach_and_tone_check_records: coachRecords,
    coach_feedback_ratings: coachRatings,
    email_preferences: emailPrefs[0] ?? null,
    privacy_requests: [...requests.values()],
  };
}

export const EXPORT_BATCH = 500;

/** One batch of the person's Dispatches, with edit history and sealed original text. */
export async function exportDispatchBatch(admin: SupabaseClient, userId: string, offset: number) {
  const rows = await must<Row[]>(
    "Dispatches",
    admin
      .from("dispatches")
      .select("id, campaign_id, parent_id, kind, position, body, sources, ai_use, round_position, moderation_status, created_at, edited_at, withdrawn_at, hidden_at, reaction_counts")
      .eq("author_id", userId)
      .order("created_at")
      .order("id")
      .range(offset, offset + EXPORT_BATCH - 1),
  );
  if (!rows.length) return { rows, revisions: [] as Row[], sealed: [] as Row[] };
  const ids = rows.map((d) => d.id as string);
  const [revisions, sealed] = await Promise.all([
    must<Row[]>("edit history", admin.from("dispatch_revisions").select("dispatch_id, body, sources, ai_use, revised_at").in("dispatch_id", ids).order("revised_at")),
    must<Row[]>("sealed text", admin.from("dispatch_sealed_content").select("dispatch_id, sealed_for, body, sources, sealed_at").in("dispatch_id", ids)),
  ]);
  return { rows, revisions, sealed };
}
