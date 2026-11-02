import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { CampaignForm } from "../campaign-form";

export const metadata: Metadata = { title: "Create a Campaign" };

export default async function NewCampaignPage() {
  await requireAdmin("/admin/campaigns/new");
  return (
    <Page title="Create a Campaign" intro="Times are UK time. Save as a draft first if you are not ready to publish." narrow>
      <Button asChild variant="outline" className="self-start">
        <Link href="/admin/campaigns">Back to Manage Campaigns</Link>
      </Button>
      <CampaignForm
        values={{ title: "", slug: "", summary: "", rules: "", category: "", format: "", status: "draft", startsAt: "", endsAt: "", isSensitive: false, contentNote: "", opinionNotAdvice: false, notes: "", rounds: [] }}
      />
    </Page>
  );
}
