import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { getCampaign, getCampaignAdminFields } from "@/lib/campaign-data";
import { DISPATCH_KINDS, toUkInputValue } from "@/lib/campaigns";
import { formatUkDateTime } from "@/lib/campaigns";
import { CampaignForm } from "../campaign-form";
import { RubricPanel } from "../rubric-panel";

export const metadata: Metadata = { title: "Edit Campaign" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditCampaignPage({ params, searchParams }: PageProps<"/admin/campaigns/[id]">) {
  const { id } = await params;
  const { saved, rubric } = await searchParams;
  await requireAdmin(`/admin/campaigns/${id}`);
  if (!UUID.test(id)) notFound();
  const c = await getCampaign({ id });
  if (!c) notFound();
  const adminFields = (await getCampaignAdminFields([c.id])).get(c.id);

  return (
    <Page title="Edit Campaign" intro={c.title} narrow>
      {saved ? (
        <p role="status" className="rounded-lg border-2 border-success bg-success/10 p-4 text-lg font-semibold">
          Saved. The change has been recorded in the audit log.
        </p>
      ) : null}
      {rubric ? (
        <p role="status" className="rounded-lg border-2 border-success bg-success/10 p-4 text-lg font-semibold">
          The rubric is published. The change has been recorded in the audit log.
        </p>
      ) : null}
      {adminFields?.needs_owner_decision ? (
        <p role="note" className="rounded-lg border-2 border-accent-foreground bg-accent p-4 text-lg text-accent-foreground">
          <strong>Owner decision needed:</strong> {adminFields.needs_owner_decision} It cannot be scheduled until this is cleared in the database.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="outline">
          <Link href="/admin/campaigns">Back to Manage Campaigns</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/campaigns/${c.slug}`}>View page</Link>
        </Button>
      </div>
      <RubricPanel campaignId={c.id} publishedLabel={c.rubric_published_at ? formatUkDateTime(c.rubric_published_at) : null} />
      <CampaignForm
        key={`${c.id}-${saved ?? ""}`}
        values={{
          id: c.id,
          title: c.title,
          slug: c.slug,
          summary: c.summary ?? "",
          rules: c.rules ?? "",
          category: c.category,
          format: c.format,
          status: c.status === "draft" ? "draft" : "scheduled",
          startsAt: toUkInputValue(c.starts_at),
          endsAt: toUkInputValue(c.ends_at),
          isSensitive: c.is_sensitive,
          contentNote: c.content_note ?? "",
          opinionNotAdvice: c.opinion_not_advice,
          notes: adminFields?.notes ?? "",
          rounds: c.rounds.map((r) => ({
            title: r.title,
            startsAt: toUkInputValue(r.starts_at),
            endsAt: toUkInputValue(r.ends_at),
            allowedKinds: r.allowed_kinds ?? [...DISPATCH_KINDS],
          })),
        }}
      />
    </Page>
  );
}
