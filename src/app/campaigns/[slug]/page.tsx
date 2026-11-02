import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignBadges, OpinionNotAdvice } from "@/components/campaign-badges";
import { Countdown } from "@/components/countdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";
import { getCampaign, getMyPosition, getServerNow } from "@/lib/campaign-data";
import { POSITION_LABELS, currentRound, formatUkDateTime, statusAt } from "@/lib/campaigns";
import { PositionForm } from "./position-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/campaigns/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await getCampaign({ slug });
  return { title: campaign?.title ?? "Campaign not found" };
}

export default async function CampaignPage({ params }: PageProps<"/campaigns/[slug]">) {
  const { slug } = await params;
  const [campaign, viewer, now] = await Promise.all([getCampaign({ slug }), getViewer(), getServerNow()]);
  if (!campaign) notFound();

  const status = statusAt(campaign, now);
  const round = status === "open" ? currentRound(campaign.rounds, now) : null;
  const position = viewer?.profile?.handle ? await getMyPosition(campaign.id, viewer.userId) : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:py-12">
      {campaign.is_sensitive && campaign.content_note ? (
        <section aria-label="Content note" className="rounded-xl border-2 border-accent-foreground bg-accent p-5 text-lg text-accent-foreground">
          <h2 className="text-xl font-bold">Content note</h2>
          <p className="mt-2 whitespace-pre-line">{campaign.content_note}</p>
        </section>
      ) : null}

      {status === "draft" ? (
        <p role="note" className="rounded-lg border-2 border-accent-foreground bg-accent p-4 text-lg text-accent-foreground">
          <strong>Draft.</strong> Only admins can see this Campaign.{" "}
          <Link href={`/admin/campaigns/${campaign.id}`} className="font-semibold underline">
            Edit it
          </Link>
          .
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">{campaign.title}</h1>
        <CampaignBadges status={status} category={campaign.category} format={campaign.format} />
      </div>

      {campaign.opinion_not_advice ? <OpinionNotAdvice /> : null}

      <Card>
        {status === "open" ? (
          <div className="flex flex-col gap-6">
            <Countdown id="campaign-countdown" target={campaign.ends_at} serverNow={now} label="Time left in this Campaign" doneLabel="This Campaign has closed." />
            <p className="text-lg">Deadline: {formatUkDateTime(campaign.ends_at)}</p>
            {round ? (
              <div className="border-t border-border pt-4">
                <Countdown
                  id="round-countdown"
                  size="small"
                  target={round.ends_at}
                  serverNow={now}
                  label={`Round ${round.position} of ${campaign.rounds.length}: ${round.title}. Time left in this round`}
                  doneLabel="This round has ended."
                />
              </div>
            ) : null}
          </div>
        ) : status === "scheduled" ? (
          <div className="flex flex-col gap-4">
            <Countdown id="campaign-countdown" target={campaign.starts_at} serverNow={now} label="Opens in" doneLabel="This Campaign is opening now." />
            <p className="text-lg">
              Opens {formatUkDateTime(campaign.starts_at)}. Closes {formatUkDateTime(campaign.ends_at)}.
            </p>
          </div>
        ) : status === "closed" ? (
          <div className="flex flex-col gap-2">
            <p className="text-2xl font-bold">This Campaign has closed.</p>
            <p className="text-lg">Closed {formatUkDateTime(campaign.ends_at)}. The Verdict will be published here.</p>
          </div>
        ) : (
          <p className="text-lg">
            Planned: {formatUkDateTime(campaign.starts_at)} to {formatUkDateTime(campaign.ends_at)}.
          </p>
        )}
      </Card>

      {campaign.summary ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">The question</h2>
          <p className="whitespace-pre-line text-lg">{campaign.summary}</p>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your position</CardTitle>
          <CardDescription>
            Say where you stand before the debate, and again once it is under way. Only you and the judges see this. It is how we measure who changed minds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "closed" && !position ? (
            <p className="text-lg">This Campaign has closed. Positions are now final.</p>
          ) : !viewer ? (
            <Button asChild className="max-w-full self-start whitespace-normal py-2 text-center">
              <Link href={`/login?next=${encodeURIComponent(`/campaigns/${campaign.slug}`)}`}>Sign in to record your position</Link>
            </Button>
          ) : !viewer.profile?.handle ? (
            <Button asChild className="max-w-full self-start whitespace-normal py-2 text-center">
              <Link href="/onboarding">Choose your handle first</Link>
            </Button>
          ) : status === "scheduled" ? (
            <PositionForm campaignId={campaign.id} slug={campaign.slug} stage="before" current={position?.before_position ?? null} />
          ) : status === "open" ? (
            <>
              <p className="text-lg">
                {position?.before_position
                  ? `Before the debate you said: ${POSITION_LABELS[position.before_position]}.`
                  : "You did not record a position before the debate started."}
              </p>
              <PositionForm campaignId={campaign.id} slug={campaign.slug} stage="after" current={position?.after_position ?? null} />
            </>
          ) : status === "closed" ? (
            <p className="text-lg">
              {position
                ? `Before: ${position.before_position ? POSITION_LABELS[position.before_position] : "not recorded"}. After: ${position.after_position ? POSITION_LABELS[position.after_position] : "not recorded"}. Positions are now final.`
                : "Positions are now final."}
            </p>
          ) : (
            <p className="text-lg">Positions open when the Campaign is scheduled.</p>
          )}
        </CardContent>
      </Card>

      {campaign.rounds.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="rounds-heading">
          <h2 id="rounds-heading" className="text-2xl font-bold">
            Rounds and deadlines
          </h2>
          <ol className="flex flex-col gap-3">
            {campaign.rounds.map((r) => {
              const isNow = round?.position === r.position;
              const done = Date.parse(r.ends_at) <= now;
              return (
                <li
                  key={r.position}
                  aria-current={isNow ? "step" : undefined}
                  className={`rounded-lg border-2 p-4 text-lg ${isNow ? "border-primary bg-muted" : "border-border"}`}
                >
                  <p className="font-semibold">
                    Round {r.position}: {r.title} {isNow ? "(now)" : done ? "(finished)" : ""}
                  </p>
                  <p>Starts {formatUkDateTime(r.starts_at)}</p>
                  <p>Deadline {formatUkDateTime(r.ends_at)}</p>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {campaign.rules ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">Rules</h2>
          <p className="whitespace-pre-line text-lg">{campaign.rules}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="dispatches-heading">
        <h2 id="dispatches-heading" className="text-2xl font-bold">
          Dispatches
        </h2>
        <p className="rounded-xl border-2 border-dashed border-border bg-muted p-5 text-lg">
          Dispatches open in the next update. For now, record your position above.
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="outline">
          <Link href="/campaigns">All Campaigns</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
