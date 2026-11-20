import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { getCampaign } from "@/lib/campaign-data";
import { buildOpenArenaRules } from "@/lib/campaign-rules";
import { FORMAT_LABELS, type Format } from "@/lib/campaigns";
import { getDispatchLimits } from "@/lib/dispatch-data";
import { DraftHelperForm } from "./draft-helper-form";

export const metadata: Metadata = { title: "Campaign draft helper" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DraftHelperPage({ params }: PageProps<"/admin/campaigns/[id]/draft-helper">) {
  const { id } = await params;
  await requireAdmin(`/admin/campaigns/${id}/draft-helper`);
  if (!UUID.test(id)) notFound();
  const c = await getCampaign({ id });
  if (!c) notFound();
  // The rules come from the live limits, read now, so the text cannot be stale.
  const rules = buildOpenArenaRules(await getDispatchLimits());
  const rulesNote = c.format === "open_arena" ? null : `These rules are written for an open arena. This Campaign is "${FORMAT_LABELS[c.format as Format] ?? c.format}", so edit them before you use them.`;

  return (
    <Page title="Campaign draft helper" intro={c.title} narrow>
      <p role="note" className="rounded-lg border border-accent-foreground/50 bg-accent p-4 text-base text-accent-foreground">
        <strong>{"AI draft - verify every fact."}</strong> Paste your source notes and get a draft to read and copy. Nothing is saved to the Campaign or published, and links in your
        notes are never opened. Your notes are sent to our AI provider, Anthropic, to draft this, and we do not keep them. Ten drafts a day per admin.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="outline">
          <Link href={`/admin/campaigns/${c.id}`}>Back to Edit Campaign</Link>
        </Button>
      </div>
      <DraftHelperForm campaignId={c.id} rules={rules} rulesNote={rulesNote} />
    </Page>
  );
}
