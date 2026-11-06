import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BATCH = 500;

/**
 * "Download my data" (UK GDPR right of access). A JSON file of the signed-in
 * Strategist's own profile, Dispatches (with edit history, and the original
 * text of any they withdrew or that were hidden or removed), positions,
 * reactions, follows, reports, appeals, coach ratings and email preferences.
 * Dispatches are read and written in batches of 500 and streamed, so a long
 * history never has to sit in memory at once. Never cached.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Please sign in first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const me = viewer.userId;
  const supabase = await createClient();

  const [profile, positions, reactions, campaignFollows, strategistFollows, reports, appeals, coach, emailPrefs] = await Promise.all([
    supabase.from("profiles").select("id, handle, display_name, expertise_tag, bio, created_at").eq("id", me).single(),
    supabase.from("campaign_positions").select("campaign_id, before_position, after_position, before_at, after_at").eq("user_id", me),
    supabase.from("dispatch_reactions").select("dispatch_id, reaction, created_at").eq("user_id", me),
    supabase.from("campaign_follows").select("campaign_id, created_at").eq("user_id", me),
    supabase.from("strategist_follows").select("followed_id, created_at").eq("follower_id", me),
    supabase.from("dispatch_reports").select("dispatch_id, reason, details, status, created_at").eq("reporter_id", me),
    supabase.from("dispatch_appeals").select("dispatch_id, reason, status, created_at, decided_at").eq("author_id", me),
    supabase.from("coach_feedback").select("campaign_id, helpful, comment, rated_at, created_at").eq("user_id", me),
    supabase.from("notification_preferences").select("replies, campaign_updates, closing_soon, moderation, unsubscribed_all_at").eq("user_id", me).maybeSingle(),
  ]);
  const failed = [profile, positions, reactions, campaignFollows, strategistFollows, reports, appeals, coach].find((r) => r.error);
  if (failed) {
    console.error("export failed", failed.error?.code);
    return NextResponse.json({ error: "We could not prepare your data. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const admin = createAdminClient();
  await admin.from("audit_log").insert({ actor_id: me, action: "account.exported", target_table: "profiles", target_id: me, details: {} });

  const encoder = new TextEncoder();
  const head = {
    exported_at: new Date().toISOString(),
    about:
      "Your data from The Grand Strategist. Dispatches are public while visible; reactions, follows, positions, reports, appeals, coach ratings and email settings are private to you and the TGS team.",
    account: { email: viewer.email, ...profile.data },
    positions: positions.data,
    reactions_given: reactions.data,
    following: { campaigns: campaignFollows.data, strategists: strategistFollows.data },
    reports_made: reports.data,
    appeals_made: appeals.data,
    coach_feedback_ratings: coach.data,
    email_preferences: emailPrefs.data ?? null,
  };

  // Writes `"key": [ ...rows ]`, one batch of Dispatch ids at a time.
  async function* batches() {
    for (let offset = 0; ; offset += BATCH) {
      const { data, error } = await supabase
        .from("dispatches")
        .select("id, campaign_id, parent_id, kind, position, body, sources, ai_use, round_position, moderation_status, created_at, edited_at, withdrawn_at, hidden_at, reaction_counts")
        .eq("author_id", me)
        .order("created_at")
        .order("id")
        .range(offset, offset + BATCH - 1);
      if (error) throw new Error("Could not read Dispatches");
      const rows = data ?? [];
      if (!rows.length) return;
      const ids = rows.map((d) => d.id);
      const [{ data: revisions }, { data: sealed }] = await Promise.all([
        supabase.from("dispatch_revisions").select("dispatch_id, body, sources, ai_use, revised_at").in("dispatch_id", ids).order("revised_at"),
        // Your own words from Dispatches you withdrew or a moderator hid or removed.
        // The sealed table is admin-only, so it is read with the service role, limited to your Dispatches.
        admin.from("dispatch_sealed_content").select("dispatch_id, sealed_for, body, sources, sealed_at").in("dispatch_id", ids),
      ]);
      yield { rows, revisions: revisions ?? [], sealed: sealed ?? [] };
      if (rows.length < BATCH) return;
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(s));
      const json = JSON.stringify(head, null, 2);
      write(json.slice(0, -2)); // drop the closing "\n}" and keep going
      const revisions: unknown[] = [];
      const sealed: unknown[] = [];
      write(',\n  "dispatches": [');
      let first = true;
      try {
        for await (const batch of batches()) {
          for (const d of batch.rows) {
            write(`${first ? "" : ","}\n    ${JSON.stringify(d)}`);
            first = false;
          }
          revisions.push(...batch.revisions);
          sealed.push(...batch.sealed);
        }
        write(`\n  ],\n  "dispatch_edit_history": ${JSON.stringify(revisions)},\n  "withdrawn_hidden_or_removed_original_text": ${JSON.stringify(sealed)}\n}\n`);
      } catch (e) {
        console.error("export stream failed", e instanceof Error ? e.message : e);
        write(`\n  ],\n  "error": "The export stopped early. Please try again."\n}\n`);
      }
      controller.close();
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tgs-my-data-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
