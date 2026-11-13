import Link from "next/link";
import { ContentGate, FollowCampaignButton } from "@/components/dispatch/campaign-controls";
import { ComposeForm } from "@/components/dispatch/compose-form";
import { DispatchThreads } from "@/components/dispatch/dispatch-threads";
import { Button } from "@/components/ui/button";
import type { Viewer } from "@/lib/auth";
import type { Campaign } from "@/lib/campaign-data";
import { getAiHelp, getComposeContext, getDispatchLimits, getMyReactions, getReactionTypes, getThreadPage } from "@/lib/dispatch-data";
import { DISPATCH_KINDS, formatUkDateTime, type CampaignRound, type DispatchKind, type Status } from "@/lib/campaigns";
import { KIND_LABELS, cooldownSecondsLeft } from "@/lib/dispatches";

function ComposeNotice({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="note" className="flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-muted p-5">
      <p className="text-xl font-semibold">{title}</p>
      <div className="text-lg">{children}</div>
      {action}
    </div>
  );
}

/** The Dispatches part of a Campaign page: who may post, the compose box, and the threads. */
export async function DispatchSection({
  campaign,
  viewer,
  status,
  round,
  now,
}: {
  campaign: Campaign;
  viewer: Viewer | null;
  status: Status;
  round: CampaignRound | null;
  now: number;
}) {
  const signedIn = Boolean(viewer?.profile?.handle);
  const roundPosition = round?.position ?? null;
  const [page, limits, reactionTypes, compose, aiHelp] = await Promise.all([
    getThreadPage(campaign.id),
    getDispatchLimits(),
    getReactionTypes(),
    signedIn ? getComposeContext(campaign.id, viewer!.userId, roundPosition) : Promise.resolve(null),
    getAiHelp(),
  ]);
  const mine = signedIn ? await getMyReactions(page.rows.map((r) => r.id), viewer!.userId) : {};

  const open = status === "open";
  const hasRounds = campaign.rounds.length > 0;
  const allowed: DispatchKind[] = round?.allowed_kinds?.length ? round.allowed_kinds : [...DISPATCH_KINDS];
  const topLevelKinds = allowed.filter((k) => k !== "rebuttal");
  const repliesAllowed = open && (!hasRounds || (round !== null && allowed.includes("rebuttal")));
  const next = encodeURIComponent(`/campaigns/${campaign.slug}`);
  const nextRound = campaign.rounds.find((r) => Date.parse(r.starts_at) > now);

  let composer: React.ReactNode;
  if (status === "closed") {
    composer = (
      <ComposeNotice title="This Campaign has closed" action={<Button asChild variant="outline"><Link href="/campaigns">See open Campaigns</Link></Button>}>
        Dispatches, edits and reactions stopped at the deadline. Read the debate below; the Verdict, once published, is linked at the top of this page.
      </ComposeNotice>
    );
  } else if (status !== "open") {
    composer = (
      <ComposeNotice title="Dispatches open when the Campaign opens">
        Opens {formatUkDateTime(campaign.starts_at)}. You can record an optional before position above in the meantime.
      </ComposeNotice>
    );
  } else if (!viewer) {
    composer = (
      <ComposeNotice title="Sign in to post" action={<Button asChild><Link href={`/login?next=${next}`}>Sign in</Link></Button>}>
        Anyone can read the debate. Strategists sign in to post, reply and react.
      </ComposeNotice>
    );
  } else if (!signedIn) {
    composer = (
      <ComposeNotice title="Choose your handle first" action={<Button asChild><Link href="/onboarding">Choose your handle</Link></Button>}>
        Every Dispatch is posted under your handle.
      </ComposeNotice>
    );
  } else if (hasRounds && !round) {
    composer = (
      <ComposeNotice title="No round is running at the moment">
        {nextRound ? `Round ${nextRound.position}, ${nextRound.title}, opens ${formatUkDateTime(nextRound.starts_at)}.` : "Check the round deadlines above."}
      </ComposeNotice>
    );
  } else if (compose?.muted) {
    composer = (
      <ComposeNotice title="Posting is paused for your account">
        A moderator has paused your posting{compose.muted.reason ? `: ${compose.muted.reason}` : "."} You can still read the debate and react. If you think
        this is a mistake, reply to any email from TGS.
      </ComposeNotice>
    );
  } else if (compose && compose.postedThisRound >= limits.max_dispatches_per_round) {
    composer = (
      <ComposeNotice title={`You have posted ${limits.max_dispatches_per_round} Dispatches ${hasRounds ? "in this round" : "here"}`}>
        That is the limit, so everyone gets heard. You can still react to Dispatches below.{hasRounds && nextRound ? ` The limit resets when round ${nextRound.position} opens.` : ""}
      </ComposeNotice>
    );
  } else if (!topLevelKinds.length) {
    composer = (
      <ComposeNotice title={`Round ${round?.position}: rebuttals only`}>
        This round accepts replies to other Dispatches. Use the Reply button on the Dispatch you want to answer.
      </ComposeNotice>
    );
  } else {
    composer = (
      <div className="flex flex-col gap-3 rounded-xl border-2 border-primary p-4 sm:p-5">
        <h3 className="text-2xl font-bold">Write a Dispatch</h3>
        <p className="text-base text-muted-foreground">
          {round ? `Round ${round.position}, ${round.title}, accepts: ${allowed.map((k) => KIND_LABELS[k].label.toLowerCase()).join(", ")}. ` : ""}
          You can post {limits.max_dispatches_per_round - (compose?.postedThisRound ?? 0)} more {hasRounds ? "in this round" : "here"}, and edit each for{" "}
          {Math.round(limits.edit_window_seconds / 60)} minutes after posting.
        </p>
        <ComposeForm
          campaignId={campaign.id}
          slug={campaign.slug}
          limits={limits}
          kinds={topLevelKinds}
          opinionNotAdvice={campaign.opinion_not_advice}
          askSide={campaign.format === "oxford"}
          initialWait={cooldownSecondsLeft(compose?.lastPostedAt ?? null, now, limits)}
          aiHelp={aiHelp}
        />
      </div>
    );
  }

  const threads = (
    <DispatchThreads
      key={new Date(now).toISOString()}
      since={new Date(now).toISOString()}
      initialRows={page.rows}
      initialNextBefore={page.nextBefore}
      initialMine={mine}
      context={{
        campaignId: campaign.id,
        slug: campaign.slug,
        open,
        repliesAllowed,
        opinionNotAdvice: campaign.opinion_not_advice,
        askSide: campaign.format === "oxford",
        viewerId: viewer?.userId ?? null,
        canInteract: signedIn,
        limits,
        reactionTypes,
        serverNow: now,
        myAppeals: compose?.appeals ?? {},
        aiHelp,
      }}
    />
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="dispatches-heading" id="dispatches">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="dispatches-heading" className="text-2xl font-bold">
          Dispatches
        </h2>
        {signedIn ? <FollowCampaignButton campaignId={campaign.id} slug={campaign.slug} following={compose?.followsCampaign ?? false} /> : null}
      </div>
      {campaign.is_sensitive && campaign.content_note ? (
        <ContentGate campaignId={campaign.id} note={campaign.content_note}>
          {composer}
          {threads}
        </ContentGate>
      ) : (
        <>
          {composer}
          {threads}
        </>
      )}
    </section>
  );
}
