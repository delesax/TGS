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
    <li className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-2xl font-semibold">
        <Link href={`/campaigns/${campaign.slug}`} className="underline underline-offset-4">
          {campaign.title}
        </Link>
      </h3>
      <div className="mt-3">
        <CampaignBadges status={status} category={campaign.category} format={campaign.format} />
      </div>
      {campaign.is_sensitive ? <p className="mt-3 text-lg font-semibold">Sensitive topic: a content note is shown first.</p> : null}
      <p className="mt-3 text-lg text-muted-foreground">{when}</p>
    </li>
  );
}

const SECTIONS = [
  { key: "open", title: "Open now", empty: "No Campaigns are open right now. Look under Opening soon for the next one." },
  { key: "soon", title: "Opening soon", empty: "Nothing is scheduled yet. New Campaigns are announced here first." },
  { key: "closed", title: "Closed", empty: "No Campaigns have closed yet. Verdicts will appear here." },
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
            <Link href="/admin/reports">Reports</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/campaigns">Manage Campaigns{drafts ? ` (${drafts} draft${drafts === 1 ? "" : "s"})` : ""}</Link>
          </Button>
        </div>
      ) : null}

      {SECTIONS.map((section) => (
        <section key={section.key} aria-labelledby={`${section.key}-heading`} className="flex flex-col gap-4">
          <h2 id={`${section.key}-heading`} className="text-2xl font-bold">
            {section.title}
          </h2>
          {groups[section.key].length ? (
            <ul className="flex flex-col gap-4">
              {groups[section.key].map((c) => (
                <CampaignCard key={c.id} campaign={c} now={now} />
              ))}
            </ul>
          ) : (
            <EmptyState title={`Nothing ${section.title.toLowerCase()}`}>{section.empty}</EmptyState>
          )}
        </section>
      ))}

      <Button asChild variant="secondary" className="self-start">
        <Link href="/">Back to home</Link>
      </Button>
    </Page>
  );
}
