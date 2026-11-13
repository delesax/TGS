import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Page } from "@/components/page";
import { requireStrategist } from "@/lib/auth";
import { KIND_LABELS } from "@/lib/dispatches";
import { getEligibleDispatches, getJudgingWindow, handleOf } from "@/lib/judging/data";
import { createClient } from "@/lib/supabase/server";
import { PanelForm, type PanelScore } from "./panel-form";

export const metadata: Metadata = { title: "Score the Dispatches" };
export const dynamic = "force-dynamic";

export default async function PanelPage({ params }: PageProps<"/judging/[campaignId]">) {
  const { campaignId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(campaignId)) notFound();
  const viewer = await requireStrategist(`/judging/${campaignId}`);
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("judge_assignments")
    .select("submitted_at, campaign:campaigns(id, slug, title)")
    .eq("campaign_id", campaignId)
    .eq("judge_id", viewer.userId)
    .maybeSingle();
  // Judges see only Campaigns they are assigned to.
  if (!assignment) notFound();
  const a = assignment as unknown as { submitted_at: string | null; campaign: { id: string; slug: string; title: string } };
  const window = await getJudgingWindow(campaignId);
  if (!window.closed) {
    return (
      <Page title={a.campaign.title}>
        <EmptyState title="Not closed yet">You can score this Campaign once it has closed. We will not email you again: come back to Your judging after the deadline.</EmptyState>
      </Page>
    );
  }

  const [all, { data: myScores }] = await Promise.all([
    getEligibleDispatches(campaignId),
    supabase.from("panel_scores").select("dispatch_id, logic, evidence, originality, responsiveness, comment").eq("campaign_id", campaignId).eq("judge_id", viewer.userId),
  ]);
  // The model's "claims to check" (prompt v2): judges may read these (and only these) from the AI record, never its scores.
  // If the database does not have the function yet, nothing is shown.
  const { data: claimRows } = await supabase.rpc("dispatch_unverified_claims", { p_campaign_id: campaignId });
  const claimsById = new Map(((claimRows as { dispatch_id: string; unverified_claims: string[] | null }[]) ?? []).map((r) => [r.dispatch_id, r.unverified_claims ?? []]));
  const byId = new Map(all.map((d) => [d.id, d]));
  const dispatches = all
    .filter((d) => d.author_id !== viewer.userId)
    .map((d) => {
      const parent = d.parent_id ? byId.get(d.parent_id) : null;
      return {
        id: d.id,
        author: handleOf(d),
        kind: KIND_LABELS[d.kind].label.toLowerCase(),
        body: d.body,
        sources: d.sources ?? [],
        claims: claimsById.get(d.id) ?? [],
        createdAt: d.created_at,
        parentExcerpt: parent ? `${handleOf(parent)}: ${parent.body.slice(0, 200)}${parent.body.length > 200 ? "…" : ""}` : null,
      };
    });
  const scores: Record<string, PanelScore> = Object.fromEntries(((myScores as (PanelScore & { dispatch_id: string })[]) ?? []).map((s) => [s.dispatch_id, s]));
  const ownCount = all.length - dispatches.length;

  return (
    <Page
      title={`Score: ${a.campaign.title}`}
      intro={`${dispatches.length} Dispatch${dispatches.length === 1 ? "" : "es"} to score. Your scores are private: no one else, not even an admin, sees them until you submit.${ownCount ? ` ${ownCount} of your own Dispatches are left out.` : ""}`}
    >
      {window.live ? <p className="text-lg font-semibold">The Verdict has been published. Scores can no longer change.</p> : null}
      {dispatches.length ? (
        <PanelForm campaignId={campaignId} dispatches={dispatches} scores={scores} locked={Boolean(a.submitted_at) || Boolean(window.live)} />
      ) : (
        <EmptyState title="No Dispatches to score">This Campaign has no visible Dispatches by other Strategists.</EmptyState>
      )}
      <Link href="/judging" className="inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
        Back to your judging
      </Link>
    </Page>
  );
}
