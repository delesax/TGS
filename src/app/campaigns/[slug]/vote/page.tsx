import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KindTag } from "@/components/dispatch/labels";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireStrategist } from "@/lib/auth";
import { getCampaign, getServerNow } from "@/lib/campaign-data";
import { formatUkDateTime } from "@/lib/campaigns";
import { getEligibleDispatches, getJudgingSettings, getJudgingWindow, handleOf } from "@/lib/judging/data";
import { createClient } from "@/lib/supabase/server";
import { VoteControls } from "./vote-controls";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/campaigns/[slug]/vote">): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getCampaign({ slug });
  return { title: campaign ? `Vote: ${campaign.title}` : "Campaign not found" };
}

export default async function VotePage({ params }: PageProps<"/campaigns/[slug]/vote">) {
  const { slug } = await params;
  const viewer = await requireStrategist(`/campaigns/${slug}/vote`);
  const [campaign, now] = await Promise.all([getCampaign({ slug }), getServerNow()]);
  if (!campaign || campaign.status === "draft") notFound();

  const supabase = await createClient();
  const [window, settings, dispatches, { data: participant }, { data: hasPosition }, { data: votes }, { data: confirmations }, { data: pick }] = await Promise.all([
    getJudgingWindow(campaign.id),
    getJudgingSettings(),
    getEligibleDispatches(campaign.id),
    supabase.rpc("is_campaign_participant", { p_campaign_id: campaign.id, p_user_id: viewer.userId }),
    supabase.from("campaign_positions").select("user_id").eq("campaign_id", campaign.id).eq("user_id", viewer.userId).maybeSingle(),
    supabase.from("peer_votes").select("dispatch_id").eq("campaign_id", campaign.id).eq("voter_id", viewer.userId),
    supabase.from("steelman_flags").select("dispatch_id").eq("campaign_id", campaign.id).eq("user_id", viewer.userId),
    supabase.from("mind_change_picks").select("dispatch_id").eq("campaign_id", campaign.id).eq("user_id", viewer.userId).maybeSingle(),
  ]);

  const started = now >= Date.parse(campaign.starts_at);
  const isParticipant = Boolean(participant);
  const canVote = window.peerOpen && isParticipant;
  const canPick = started && (!window.closed || window.peerOpen) && (isParticipant || Boolean(hasPosition));
  const voted = new Set(((votes as { dispatch_id: string }[]) ?? []).map((v) => v.dispatch_id));
  const confirmed = new Set(((confirmations as { dispatch_id: string }[]) ?? []).map((v) => v.dispatch_id));
  const picked = (pick as { dispatch_id: string } | null)?.dispatch_id ?? null;
  const votingClosesAt = new Date(Date.parse(campaign.ends_at) + settings.peer_window_hours * 3_600_000).toISOString();

  return (
    <Page title={`Vote: ${campaign.title}`} intro="Peer votes are one of the four parts of the Verdict. Vote for the Dispatches you found strongest, not the ones you agree with.">
      <section aria-labelledby="how-h" className="flex flex-col gap-2 rounded-xl border border-border p-5 text-lg">
        <h2 id="how-h" className="text-2xl font-bold">
          How it works
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>You have {settings.peer_vote_credits} votes. Each Dispatch can get one of them. You cannot vote for your own.</li>
          <li>Votes are weighted a little by each voter&apos;s track record, with a cap, so no one voter counts more than three times the typical voter.</li>
          <li>&ldquo;It fairly restates the other side&rdquo; confirms a steelman: the Dispatch set out the opposing case fairly before answering it. Confirmed steelmen earn a small bonus.</li>
          <li>&ldquo;This changed my mind&rdquo;: pick one Dispatch, if one moved your position. It counts only if your before and after positions differ.</li>
          <li>Your votes and picks are private. Only the totals are published.</li>
        </ul>
        <p>
          {window.peerOpen
            ? `Voting is open until ${formatUkDateTime(votingClosesAt)}.`
            : !window.closed
              ? `Voting opens when the Campaign closes on ${formatUkDateTime(campaign.ends_at)}. ${started ? "You can already pick the Dispatch that changed your mind." : ""}`
              : "Voting has closed."}
        </p>
        {!isParticipant && window.peerOpen ? <p className="font-semibold">Only Strategists who posted in this Campaign can vote.</p> : null}
        {window.live ? (
          <Link href={`/campaigns/${campaign.slug}/verdict`} className="inline-flex min-h-12 items-center font-semibold text-primary underline">
            Read the Verdict
          </Link>
        ) : null}
      </section>

      {!dispatches.length ? (
        <EmptyState title="No Dispatches to vote on">This Campaign has no visible Dispatches.</EmptyState>
      ) : (
        <section aria-labelledby="dispatches-h" className="flex flex-col gap-4">
          <h2 id="dispatches-h" className="text-2xl font-bold">
            Dispatches ({dispatches.length})
          </h2>
          <ul className="flex flex-col gap-4">
            {dispatches.map((d) => {
              const mine = d.author_id === viewer.userId;
              return (
                <li key={d.id} id={`dispatch-${d.id}`} className="flex flex-col gap-3 rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2 text-lg">
                    <span className="font-semibold">{handleOf(d)}</span>
                    <KindTag kind={d.kind} />
                    <span className="text-base text-muted-foreground">{formatUkDateTime(d.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-line text-lg [overflow-wrap:anywhere]">{d.body}</p>
                  {mine ? (
                    <p className="text-base font-semibold text-muted-foreground">Your Dispatch: you cannot vote for or pick it.</p>
                  ) : canVote || canPick ? (
                    <VoteControls
                      dispatchId={d.id}
                      campaignId={campaign.id}
                      slug={campaign.slug}
                      voted={voted.has(d.id)}
                      steelman={confirmed.has(d.id)}
                      picked={picked === d.id}
                      canVote={canVote}
                      canPick={canPick}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Button asChild variant="outline" className="self-start">
        <Link href={`/campaigns/${campaign.slug}`}>Back to the Campaign</Link>
      </Button>
    </Page>
  );
}
