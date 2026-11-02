import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatUkShort } from "@/lib/campaigns";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DismissButton, HideForm, RestoreButton } from "./moderation-controls";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  harassment: "Harassment or a personal attack",
  hate: "Hate towards a group",
  impersonation: "Impersonation",
  misleading: "Deliberately misleading",
  spam: "Spam or advertising",
  off_topic: "Off topic",
  other: "Something else",
};

type ReportRow = {
  id: string;
  reason: string;
  details: string | null;
  created_at: string;
  dispatch: {
    id: string;
    body: string;
    created_at: string;
    hidden_at: string | null;
    withdrawn_at: string | null;
    campaign: { slug: string; title: string } | null;
    author: { handle: string | null } | null;
  } | null;
};

type HiddenRow = { id: string; body: string; hidden_at: string; hidden_reason: string | null; campaign: { slug: string; title: string } | null };

export default async function ReportsPage() {
  await requireAdmin("/admin/reports");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispatch_reports")
    .select(
      "id, reason, details, created_at, dispatch:dispatches(id, body, created_at, hidden_at, withdrawn_at, campaign:campaigns(slug, title), author:profiles!dispatches_author_id_fkey(handle))",
    )
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error("Could not load reports");

  // Group open reports by Dispatch, oldest first.
  const groups = new Map<string, { dispatch: NonNullable<ReportRow["dispatch"]>; reports: ReportRow[] }>();
  for (const r of (data as unknown as ReportRow[]) ?? []) {
    if (!r.dispatch) continue;
    if (!groups.has(r.dispatch.id)) groups.set(r.dispatch.id, { dispatch: r.dispatch, reports: [] });
    groups.get(r.dispatch.id)!.reports.push(r);
  }

  // Moderator notes are not readable through the browser roles, so the hidden
  // list is read with the service role after the admin check above.
  const { data: hidden } = await createAdminClient()
    .from("dispatches")
    .select("id, body, hidden_at, hidden_reason, campaign:campaigns(slug, title)")
    .not("hidden_at", "is", null)
    .order("hidden_at", { ascending: false })
    .limit(50);
  const hiddenRows = (hidden as unknown as HiddenRow[]) ?? [];

  return (
    <Page
      title="Reports"
      intro="Admins only. Reported Dispatches wait here for a decision. Hiding keeps the original and can be undone. Automatic screening arrives in the next sprint; until then this queue is the only safeguard."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="outline">
          <Link href="/admin/campaigns">Manage Campaigns</Link>
        </Button>
      </div>

      <section aria-labelledby="open-heading" className="flex flex-col gap-4">
        <h2 id="open-heading" className="text-2xl font-bold">
          Waiting for a decision ({groups.size})
        </h2>
        {groups.size ? (
          <ul className="flex flex-col gap-4">
            {[...groups.values()].map(({ dispatch, reports }) => (
              <li key={dispatch.id} className="flex flex-col gap-3 rounded-xl border-2 border-border bg-card p-4">
                <p className="text-base text-muted-foreground">
                  @{dispatch.author?.handle ?? "unknown"} in{" "}
                  {dispatch.campaign ? (
                    <Link href={`/campaigns/${dispatch.campaign.slug}#dispatch-${dispatch.id}`} className="font-semibold underline">
                      {dispatch.campaign.title}
                    </Link>
                  ) : (
                    "a Campaign"
                  )}
                  , {formatUkShort(dispatch.created_at)}
                </p>
                <blockquote className="whitespace-pre-line border-l-4 border-border pl-3 text-lg [overflow-wrap:anywhere]">{dispatch.body}</blockquote>
                <div>
                  <p className="text-lg font-semibold">
                    {reports.length} report{reports.length === 1 ? "" : "s"}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {reports.map((r) => (
                      <li key={r.id} className="text-base">
                        {REASON_LABELS[r.reason] ?? r.reason}
                        {r.details ? `: “${r.details}”` : ""} ({formatUkShort(r.created_at)})
                      </li>
                    ))}
                  </ul>
                </div>
                {dispatch.hidden_at ? (
                  <p className="text-lg font-semibold">Already hidden.</p>
                ) : (
                  <div className="flex flex-col gap-4 border-t border-border pt-3">
                    <HideForm dispatchId={dispatch.id} />
                    <DismissButton dispatchId={dispatch.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No open reports">When a Strategist reports a Dispatch, it appears here.</EmptyState>
        )}
      </section>

      <section aria-labelledby="hidden-heading" className="flex flex-col gap-4">
        <h2 id="hidden-heading" className="text-2xl font-bold">
          Hidden Dispatches
        </h2>
        {hiddenRows.length ? (
          <ul className="flex flex-col gap-3">
            {hiddenRows.map((h) => (
              <li key={h.id} className="flex flex-col gap-2 rounded-xl border border-border p-4">
                <p className="text-base text-muted-foreground">
                  Hidden {formatUkShort(h.hidden_at)} in {h.campaign?.title ?? "a Campaign"}
                </p>
                <p className="text-lg">
                  <strong>Reason:</strong> {h.hidden_reason ?? "none given"}
                </p>
                <RestoreButton dispatchId={h.id} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing hidden">Dispatches you hide will be listed here so they can be restored.</EmptyState>
        )}
      </section>
    </Page>
  );
}
