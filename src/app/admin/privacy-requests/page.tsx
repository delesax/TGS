import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { getServerNow } from "@/lib/campaign-data";
import { formatUkShort } from "@/lib/campaigns";
import { REQUEST_TYPE_LABELS, STATUSES, STATUS_LABELS, daysUntil, dueState, type RequestType } from "@/lib/privacy-requests";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AdminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Privacy requests" };
export const dynamic = "force-dynamic";

type Row = { id: string; created_at: string; type: RequestType; status: string; due_at: string; acknowledged_at: string | null };

export default async function PrivacyRequestsPage({ searchParams }: PageProps<"/admin/privacy-requests">) {
  await requireAdmin("/admin/privacy-requests");
  const { status } = await searchParams;
  const filter = typeof status === "string" && (STATUSES as readonly string[]).includes(status) ? status : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_privacy_requests", { p_status: filter });
  const rows = (data ?? []) as Row[];
  const now = await getServerNow();

  return (
    <Page title="Privacy requests" intro="Messages from “Contact us about your data”. Reply within one month; acknowledge a complaint within 30 days.">
      <AdminNav current="/admin/privacy-requests" />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {[null, ...STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin/privacy-requests?status=${s}` : "/admin/privacy-requests"}
            aria-current={s === filter ? "page" : undefined}
            className={cn(
              "inline-flex min-h-12 items-center rounded-md border-2 px-3 text-lg font-semibold",
              s === filter ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
            )}
          >
            {s ? STATUS_LABELS[s] : "All"}
          </Link>
        ))}
      </nav>
      {error ? (
        <EmptyState title="We could not load the requests">Refresh the page. If it keeps happening, check the database is reachable.</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No requests here">Nothing is waiting{filter ? ` with the status “${STATUS_LABELS[filter as keyof typeof STATUS_LABELS]}”` : ""}.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const state = dueState(r.status, r.due_at, now);
            const days = daysUntil(r.due_at, now);
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-xl border-2 p-4",
                  state === "overdue" ? "border-destructive bg-destructive/10" : state === "soon" ? "border-accent-foreground bg-accent" : "border-border bg-card",
                )}
              >
                <Link href={`/admin/privacy-requests/${r.id}`} className="text-xl font-semibold underline">
                  {REQUEST_TYPE_LABELS[r.type] ?? r.type}
                </Link>
                <p className="text-lg">
                  {STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status} · received {formatUkShort(r.created_at)} · reference {r.id.slice(0, 8)}
                </p>
                <p className={cn("text-lg", state === "overdue" ? "font-bold text-destructive" : state === "soon" ? "font-bold" : "")}>
                  {state === "closed"
                    ? "Closed"
                    : state === "overdue"
                      ? `OVERDUE by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} (was due ${formatUkShort(r.due_at)})`
                      : `Due ${formatUkShort(r.due_at)} (${days} day${days === 1 ? "" : "s"} left)${state === "soon" ? ", due soon" : ""}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
