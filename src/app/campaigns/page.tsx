import type { Metadata } from "next";
import Link from "next/link";
import { CampaignBadges } from "@/components/campaign-badges";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth";
import { getServerNow, listCampaigns, type CampaignSummary } from "@/lib/campaign-data";
import { describeDuration, formatUkDateTime, groupCampaigns, secondsLeft, statusAt } from "@/lib/campaigns";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

function CampaignCard({ campaign, now }: { campaign: CampaignSummary; now: number }) {
  const status = statusAt(campaign, now);
  const when =
    status === "open"
      ? `Closes in ${describeDuration(secondsLeft(Date.parse(campaign.ends_at), now))}. Deadline: ${formatUkDateTime(campaign.ends_at)}`
      : status === "scheduled"
        ? `Opens ${formatUkDateTime(campaign.starts_at)}`
        : `Closed ${formatUkDateTime(campaign.ends_at)}`;
  return (
    <li className="surface-card soft-hover p-5 hover:shadow-[var(--shadow-raised)]">
      <h3>
        <Link href={`/campaigns/${campaign.slug}`} className="no-underline underline-offset-4 hover:underline focus-visible:underline">
          {campaign.title}
        </Link>
      </h3>
      <div className="mt-2.5">
        <CampaignBadges status={status} category={campaign.category} format={campaign.format} />
      </div>
      {campaign.is_sensitive ? <p className="mt-3 text-base font-semibold">Sensitive topic: a content note is shown first.</p> : null}
      <p className="mt-2.5 text-base text-muted-foreground">{when}</p>
    </li>
  );
}

const SECTIONS = [
  { key: "open", title: "Open now", emptyTitle: "No Campaigns open right now", empty: "No Campaign is open right now. When one opens, read it and write a Dispatch. Check Opening soon for the next." },
  { key: "soon", title: "Opening soon", emptyTitle: "None opening soon", empty: "No Campaign is scheduled yet. New ones appear here first, so you can read the question before it opens." },
  { key: "closed", title: "Closed", emptyTitle: "None closed yet", empty: "No Campaign has closed yet. When one does, its Verdict appears here." },
] as const;

export default async function CampaignsPage() {
  const [viewer, campaigns, now] = await Promise.all([getViewer(), listCampaigns(), getServerNow()]);
  const groups = groupCampaigns(campaigns, now);
  const drafts = campaigns.filter((c) => c.status === "draft").length;

  return (
    <Page title="Campaigns" intro="Each Campaign is a question with a deadline. The best argument before the clock runs out wins.">
      {viewer?.isAdmin ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/admin/campaigns/new">Create a Campaign</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/admin/moderation">Moderation</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/campaigns">Manage Campaigns{drafts ? ` (${drafts} draft${drafts === 1 ? "" : "s"})` : ""}</Link>
          </Button>
        </div>
      ) : null}

      {SECTIONS.map((section) => (
        <section key={section.key} aria-labelledby={`${section.key}-heading`} className="flex flex-col gap-4">
          <h2 id={`${section.key}-heading`}>
            {section.title}
          </h2>
          {groups[section.key].length ? (
            <ul className="grid items-stretch gap-3 md:grid-cols-2 min-[1500px]:grid-cols-3 min-[2000px]:grid-cols-4">
              {groups[section.key].map((c) => (
                <CampaignCard key={c.id} campaign={c} now={now} />
              ))}
            </ul>
          ) : (
            <EmptyState title={section.emptyTitle}>{section.empty}</EmptyState>
          )}
        </section>
      ))}

      <Button asChild variant="secondary" className="self-start">
        <Link href="/">Back to home</Link>
      </Button>
    </Page>
  );
}
