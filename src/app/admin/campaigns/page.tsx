import type { Metadata } from "next";
import Link from "next/link";
import { CampaignBadges } from "@/components/campaign-badges";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatUkDateTime, statusAt } from "@/lib/campaigns";
import { getCampaignAdminFields, getServerNow } from "@/lib/campaign-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Manage Campaigns" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  slug: string;
  title: string;
  category: "financial_services" | "energy" | "technology" | "education" | "health_social_care";
  format: "open_arena" | "oxford" | "progressive";
  status: "draft" | "scheduled" | "open" | "closed";
  starts_at: string;
  ends_at: string;
  wave: number | null;
};

export default async function AdminCampaignsPage() {
  await requireAdmin("/admin/campaigns");
  const supabase = await createClient();
  const [{ data, error }, now] = await Promise.all([
    supabase.from("campaigns").select("id, slug, title, category, format, status, starts_at, ends_at, wave").order("starts_at"),
    getServerNow(),
  ]);
  if (error) throw new Error("Could not load Campaigns");
  const rows = data as Row[];
  const adminFields = await getCampaignAdminFields(rows.map((r) => r.id));

  return (
    <Page title="Manage Campaigns" intro="Admins only. Every change is recorded in the audit log.">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/admin/campaigns/new">Create a Campaign</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/admin/reports">Reports</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/campaigns">Back to Campaigns</Link>
        </Button>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-4">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-xl font-semibold">{c.title}</h2>
              <CampaignBadges status={statusAt(c, now)} category={c.category} format={c.format} />
              <p className="text-base text-muted-foreground">
                {formatUkDateTime(c.starts_at)} to {formatUkDateTime(c.ends_at)}
                {c.wave ? ` · Launch wave ${c.wave}` : ""}
              </p>
              {adminFields.get(c.id)?.needs_owner_decision ? (
                <p role="note" className="rounded-lg border-2 border-accent-foreground bg-accent p-3 text-base text-accent-foreground">
                  <strong>Owner decision needed:</strong> {adminFields.get(c.id)?.needs_owner_decision}
                </p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild variant="secondary">
                  <Link href={`/admin/campaigns/${c.id}`}>Edit</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/campaigns/${c.slug}`}>View page</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No Campaigns yet">Create the first one, or load the launch topics with npm run topics:load.</EmptyState>
      )}
    </Page>
  );
}
