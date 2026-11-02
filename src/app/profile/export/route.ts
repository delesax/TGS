import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Download my data" (UK GDPR right of access). A JSON file of the signed-in
 * Strategist's own profile, Dispatches (with edit history, and the original
 * text of any they withdrew or that were hidden), positions, reactions,
 * follows, reports and email preferences. Never cached.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Please sign in first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const me = viewer.userId;
  const supabase = await createClient();

  const [profile, dispatches, positions, reactions, campaignFollows, strategistFollows, reports, emailPrefs] = await Promise.all([
    supabase.from("profiles").select("id, handle, display_name, expertise_tag, bio, created_at").eq("id", me).single(),
    supabase
      .from("dispatches")
      .select("id, campaign_id, parent_id, kind, position, body, sources, ai_use, round_position, moderation_status, created_at, edited_at, withdrawn_at, hidden_at, reaction_counts")
      .eq("author_id", me)
      .order("created_at"),
    supabase.from("campaign_positions").select("campaign_id, before_position, after_position, before_at, after_at").eq("user_id", me),
    supabase.from("dispatch_reactions").select("dispatch_id, reaction, created_at").eq("user_id", me),
    supabase.from("campaign_follows").select("campaign_id, created_at").eq("user_id", me),
    supabase.from("strategist_follows").select("followed_id, created_at").eq("follower_id", me),
    supabase.from("dispatch_reports").select("dispatch_id, reason, details, status, created_at").eq("reporter_id", me),
    supabase.from("notification_preferences").select("replies, campaign_updates, closing_soon, unsubscribed_all_at").eq("user_id", me).maybeSingle(),
  ]);

  const failed = [profile, dispatches, positions, reactions, campaignFollows, strategistFollows, reports].find((r) => r.error);
  if (failed) {
    console.error("export failed", failed.error?.code);
    return NextResponse.json({ error: "We could not prepare your data. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  // Your own words from Dispatches you withdrew or a moderator hid. The sealed
  // table is admin-only, so read it with the service role, limited to your Dispatches.
  const ids = (dispatches.data ?? []).map((d) => d.id);
  const { data: revisions } = ids.length
    ? await supabase.from("dispatch_revisions").select("dispatch_id, body, sources, ai_use, revised_at").in("dispatch_id", ids).order("revised_at")
    : { data: [] };
  const admin = createAdminClient();
  const { data: sealed } = ids.length
    ? await admin.from("dispatch_sealed_content").select("dispatch_id, sealed_for, body, sources, sealed_at").in("dispatch_id", ids)
    : { data: [] };
  await admin.from("audit_log").insert({ actor_id: me, action: "account.exported", target_table: "profiles", target_id: me, details: {} });

  const body = {
    exported_at: new Date().toISOString(),
    about:
      "Your data from The Grand Strategist. Dispatches are public while visible; reactions, follows, positions, reports and email settings are private to you and the TGS team.",
    account: { email: viewer.email, ...profile.data },
    dispatches: dispatches.data,
    dispatch_edit_history: revisions ?? [],
    withdrawn_or_hidden_original_text: sealed ?? [],
    positions: positions.data,
    reactions_given: reactions.data,
    following: { campaigns: campaignFollows.data, strategists: strategistFollows.data },
    reports_made: reports.data,
    email_preferences: emailPrefs.data ?? null,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tgs-my-data-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
