import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApexMark } from "@/components/apex-motif";
import { AwardList, Breakdown, Rationale, StrategistName, VERDICT_STATUS_LABELS, WeightsLine } from "@/components/judging/verdict-parts";
import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { getCampaign, getServerNow } from "@/lib/campaign-data";
import { formatUkDateTime } from "@/lib/campaigns";
import { metaDescription } from "@/lib/meta-description";
import { getHandles, getJudgingWindow, getLiveVerdict, getWinningCase } from "@/lib/judging/data";
import { AI_ASSISTED_RATIONALE_NOTICE, AI_JUDGING_NOTICE, APPEAL_NOTICE } from "@/lib/judging/notices";
import { referencedUsers } from "@/lib/judging/rationale";
import { createClient } from "@/lib/supabase/server";
import { WinningCaseSection } from "@/components/judging/winning-case";
import { AppealForm } from "./appeal-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/campaigns/[slug]/verdict">): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getCampaign({ slug });
  const description = campaign && campaign.status !== "draft" ? metaDescription(campaign.summary, "Verdict: ") : null;
  return { title: campaign ? `Verdict: ${campaign.title}` : "Verdict not found", ...(description ? { description } : {}) };
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
      <div className="page-container flex flex-col gap-6 py-8 sm:py-12">
        <h1>Verdict: {campaign.title}</h1>
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
  const winningCase = await getWinningCase(verdict.id);
  const publicAwards = verdict.proposed_awards.filter((a) => a.category !== "grand_strategist"); // the Grand Strategist card above already says it
  const winner = verdict.component_scores.find((s) => s.user_id === verdict.winner_id);
  const runnersUp = verdict.component_scores
    .filter((c) => c.user_id !== verdict.winner_id && c.final !== null && c.final !== undefined)
    .sort((x, y) => (y.final ?? 0) - (x.final ?? 0))
    .slice(0, 3);
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
    <div className="page-container flex flex-col gap-8 py-8 sm:py-12">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Verdict</p>
        <h1 className="max-w-[28ch]">{campaign.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          <span className="inline-flex w-fit items-center rounded-full border border-hairline bg-muted px-2.5 py-0.5 font-semibold text-foreground">
            {VERDICT_STATUS_LABELS[verdict.status]}
            {verdict.version > 1 ? ` · version ${verdict.version}` : ""}
          </span>
          <span>
            Published {verdict.published_at ? formatUkDateTime(verdict.published_at) : ""}
            {verdict.status === "final" && verdict.finalised_at ? `. Final since ${formatUkDateTime(verdict.finalised_at)}.` : "."}
          </span>
        </div>
      </div>

      <section aria-labelledby="winner-h" className="hero-glow">
        <div className="featured-edge relative overflow-hidden rounded-[12px] p-6 shadow-[var(--shadow-raised)] sm:p-9">
          <ApexMark className="pointer-events-none absolute bottom-4 right-6 hidden w-44 text-foreground sm:block" />
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-10 place-items-center rounded-full bg-secondary">
              <span className="size-3.5 rounded-full bg-gold shadow-[0_0_14px_3px_rgb(200_162_74/0.55)]" />
            </span>
            <h2 id="winner-h" className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-text">
              Grand Strategist
            </h2>
          </div>
          <p className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-5xl">
            {verdict.winner_id ? <StrategistName id={verdict.winner_id} handles={handles} /> : "Not named"}
          </p>
          {winner?.final !== undefined && winner?.final !== null ? (
            <p className="mt-3 text-base text-muted-foreground">
              Final score: <span className="font-semibold text-foreground">{winner.final.toFixed(1)}</span> out of 100.
            </p>
          ) : null}
          {runnersUp.length ? (
            /* sm:pr-[13rem] keeps the scores clear of the Apex mark (w-44 plus right-6 is 12.5rem, so 13rem leaves a 0.5rem gap) */
            <div className="mt-6 border-t border-hairline pt-4 sm:pr-[13rem]">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Runners-up</h3>
              <ol className="mt-2 flex flex-col gap-1.5 text-base">
                {runnersUp.map((r) => (
                  <li key={r.user_id} className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span aria-hidden className="mr-2 text-muted-foreground tabular-nums">
                        {r.rank ?? ""}
                      </span>
                      <StrategistName id={r.user_id} handles={handles} />
                    </span>
                    <span className="tabular-nums text-muted-foreground">{r.final !== null && r.final !== undefined ? r.final.toFixed(1) : "–"}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </section>

      <WinningCaseSection winningCase={winningCase} campaignSlug={campaign.slug} />

      <section aria-labelledby="rationale-h" className="flex flex-col gap-3">
        <h2 id="rationale-h">
          Why
        </h2>
        <Rationale text={verdict.rationale} handles={handles} />
        {verdict.rationale_ai_assisted ? (
          <p role="note" className="rounded-[10px] bg-muted/70 p-3 text-sm text-muted-foreground">
            {AI_ASSISTED_RATIONALE_NOTICE}
          </p>
        ) : null}
      </section>

      {publicAwards.length ? (
        <section aria-labelledby="awards-h" className="flex flex-col gap-3">
          <h2 id="awards-h">Awards</h2>
          <AwardList awards={publicAwards} handles={handles} campaignSlug={campaign.slug} />
        </section>
      ) : null}

      <section aria-labelledby="breakdown-h" className="flex flex-col gap-3">
        <h2 id="breakdown-h">
          How the scores add up
        </h2>
        <p className="text-lg">
          Each part is scored out of 100. The final score blends them with the weights below, plus a steelman bonus of up to 5 points for fairly restating the other side
          before answering it.
        </p>
        <WeightsLine weights={verdict.weights_snapshot} />
        <Breakdown scores={verdict.component_scores} handles={handles} caption="Scores by Strategist" />
        <p role="note" className="rounded-[10px] bg-muted/70 p-3 text-sm text-muted-foreground">
          {AI_JUDGING_NOTICE}
        </p>
      </section>

      <section aria-labelledby="appeal-h" className="flex flex-col gap-3">
        <h2 id="appeal-h">
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
