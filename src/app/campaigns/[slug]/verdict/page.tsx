import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crown } from "lucide-react";
import { AwardList, Breakdown, Rationale, StrategistName, VERDICT_STATUS_LABELS, WeightsLine } from "@/components/judging/verdict-parts";
import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { getCampaign, getServerNow } from "@/lib/campaign-data";
import { formatUkDateTime } from "@/lib/campaigns";
import { getHandles, getJudgingWindow, getLiveVerdict } from "@/lib/judging/data";
import { AI_ASSISTED_RATIONALE_NOTICE, AI_JUDGING_NOTICE, APPEAL_NOTICE } from "@/lib/judging/notices";
import { referencedUsers } from "@/lib/judging/rationale";
import { createClient } from "@/lib/supabase/server";
import { AppealForm } from "./appeal-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/campaigns/[slug]/verdict">): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getCampaign({ slug });
  return { title: campaign ? `Verdict: ${campaign.title}` : "Verdict not found" };
}

export default async function VerdictPage({ params }: PageProps<"/campaigns/[slug]/verdict">) {
  const { slug } = await params;
  const [campaign, viewer, now] = await Promise.all([getCampaign({ slug }), getViewer(), getServerNow()]);
  if (!campaign || campaign.status === "draft") notFound();
  const [verdict, window] = await Promise.all([getLiveVerdict(campaign.id), getJudgingWindow(campaign.id)]);

  const back = (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button asChild variant="outline">
        <Link href={`/campaigns/${campaign.slug}`}>Back to the Campaign</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href="/leaderboard">Leaderboard</Link>
      </Button>
    </div>
  );

  if (!verdict) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:py-12">
        <h1 className="text-3xl font-bold sm:text-4xl">Verdict: {campaign.title}</h1>
        <EmptyState
          title="The Verdict has not been published yet"
          action={
            window.peerOpen ? (
              <Button asChild>
                <Link href={`/campaigns/${campaign.slug}/vote`}>Peer voting is open: vote now</Link>
              </Button>
            ) : undefined
          }
        >
          {window.closed
            ? "The Campaign has closed. The panel, peer votes, the AI rubric and the mind-change measure are being brought together, and an admin will review the result before it is published here."
            : `The Verdict is published after the Campaign closes on ${formatUkDateTime(campaign.ends_at)} and the judging is complete.`}
        </EmptyState>
        {viewer?.isAdmin ? (
          <p className="text-lg">
            <Link href={`/admin/judging/${campaign.id}`} className="font-semibold text-primary underline">
              Review the judging in the admin console
            </Link>
          </p>
        ) : null}
        {back}
      </div>
    );
  }

  const handles = await getHandles([
    ...verdict.component_scores.map((s) => s.user_id),
    ...verdict.proposed_awards.map((a) => a.profile_id),
    ...referencedUsers(verdict.rationale, ...verdict.proposed_awards.map((a) => a.rationale)),
  ]);
  const winner = verdict.component_scores.find((s) => s.user_id === verdict.winner_id);
  const appealOpen = verdict.status !== "final" && verdict.appeal_closes_at !== null && Date.parse(verdict.appeal_closes_at) > now;

  let canAppeal = false;
  let alreadyAppealed = false;
  if (viewer?.profile?.handle && appealOpen) {
    const supabase = await createClient();
    const [{ data: participant }, { data: mine }] = await Promise.all([
      supabase.rpc("is_campaign_participant", { p_campaign_id: campaign.id, p_user_id: viewer.userId }),
      supabase.from("verdict_appeals").select("id, status").eq("verdict_id", verdict.id).eq("appellant_id", viewer.userId).maybeSingle(),
    ]);
    canAppeal = Boolean(participant) && !mine;
    alreadyAppealed = Boolean(mine);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-3">
        <p className="text-lg font-semibold text-muted-foreground">Verdict</p>
        <h1 className="text-3xl font-bold sm:text-4xl">{campaign.title}</h1>
        <p className="inline-flex w-fit rounded-full border-2 border-foreground px-3 py-1 text-base font-semibold">
          {VERDICT_STATUS_LABELS[verdict.status]}
          {verdict.version > 1 ? ` · version ${verdict.version}` : ""}
        </p>
        <p className="text-lg text-muted-foreground">
          Published {verdict.published_at ? formatUkDateTime(verdict.published_at) : ""}
          {verdict.status === "final" && verdict.finalised_at ? `. Final since ${formatUkDateTime(verdict.finalised_at)}.` : "."}
        </p>
      </div>

      <section aria-labelledby="winner-h" className="flex flex-col gap-2 rounded-xl border-2 border-primary bg-muted p-5">
        <h2 id="winner-h" className="flex items-center gap-2 text-2xl font-bold">
          <Crown aria-hidden className="size-7 text-primary" /> Grand Strategist
        </h2>
        <p className="text-2xl">{verdict.winner_id ? <StrategistName id={verdict.winner_id} handles={handles} /> : "Not named"}</p>
        {winner?.final !== undefined && winner?.final !== null ? <p className="text-lg">Final score: {winner.final.toFixed(1)} out of 100.</p> : null}
      </section>

      <section aria-labelledby="rationale-h" className="flex flex-col gap-3">
        <h2 id="rationale-h" className="text-2xl font-bold">
          Why
        </h2>
        <Rationale text={verdict.rationale} handles={handles} />
        {verdict.rationale_ai_assisted ? (
          <p role="note" className="rounded-lg border border-border p-3 text-base text-muted-foreground">
            {AI_ASSISTED_RATIONALE_NOTICE}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="awards-h" className="flex flex-col gap-3">
        <h2 id="awards-h" className="text-2xl font-bold">
          Awards
        </h2>
        <AwardList awards={verdict.proposed_awards} handles={handles} campaignSlug={campaign.slug} />
      </section>

      <section aria-labelledby="breakdown-h" className="flex flex-col gap-3">
        <h2 id="breakdown-h" className="text-2xl font-bold">
          How the scores add up
        </h2>
        <p className="text-lg">
          Each part is scored out of 100. The final score blends them with the weights below, plus a steelman bonus of up to 5 points for fairly restating the other side
          before answering it.
        </p>
        <WeightsLine weights={verdict.weights_snapshot} />
        <Breakdown scores={verdict.component_scores} handles={handles} caption="Scores by Strategist" />
        <p role="note" className="rounded-lg border border-border p-3 text-base text-muted-foreground">
          {AI_JUDGING_NOTICE}
        </p>
      </section>

      <section aria-labelledby="appeal-h" className="flex flex-col gap-3">
        <h2 id="appeal-h" className="text-2xl font-bold">
          Appeal
        </h2>
        <p className="text-lg">{APPEAL_NOTICE}</p>
        {verdict.status === "appealed" ? <p className="text-lg font-semibold">This Verdict is under appeal. An admin will decide, and any change will be published here.</p> : null}
        {!appealOpen ? (
          <p className="text-lg">The appeal window has closed{verdict.appeal_closes_at ? ` (it closed ${formatUkDateTime(verdict.appeal_closes_at)})` : ""}.</p>
        ) : !viewer ? (
          <Button asChild className="self-start">
            <Link href={`/login?next=${encodeURIComponent(`/campaigns/${campaign.slug}/verdict`)}`}>Sign in to appeal</Link>
          </Button>
        ) : alreadyAppealed ? (
          <p className="text-lg">You have appealed this Verdict. We will email you the outcome.</p>
        ) : canAppeal ? (
          <>
            <p className="text-lg">Appeals close {formatUkDateTime(verdict.appeal_closes_at!)}.</p>
            <AppealForm verdictId={verdict.id} slug={campaign.slug} />
          </>
        ) : (
          <p className="text-lg">Only Strategists who posted in this Campaign can appeal. Appeals close {formatUkDateTime(verdict.appeal_closes_at!)}.</p>
        )}
      </section>

      {back}
    </div>
  );
}
