import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { queryAudit, readAuditFilters } from "@/lib/audit";
import { formatUkShort } from "@/lib/campaigns";
import { AdminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin("/admin/audit");
  const params = await searchParams;
  const filters = readAuditFilters(params);
  const page = Math.max(1, Number(params.page) || 1);
  const { rows, handles, unknownActor } = await queryAudit(filters, PER_PAGE + 1, (page - 1) * PER_PAGE);
  const shown = rows.slice(0, PER_PAGE);
  const query = (extra: Record<string, string>) =>
    new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...extra }).toString();
  const input = "min-h-12 w-full min-w-0 rounded-md border-2 border-input bg-background px-3 text-lg";

  return (
    <Page title="Audit log" intro="Every recorded action, newest first. Entries cannot be changed or removed, even by admins.">
      <AdminNav current="/admin/audit" />
      <form className="grid gap-3 sm:grid-cols-2" action="/admin/audit" aria-label="Filter the audit log">
        <label className="flex flex-col gap-1 text-lg font-semibold">
          Who (handle, or “system”)
          <input name="actor" defaultValue={filters.actor} className={input} autoCapitalize="off" />
        </label>
        <label className="flex flex-col gap-1 text-lg font-semibold">
          Action starts with
          <input name="action" defaultValue={filters.action} placeholder="for example moderation." className={input} autoCapitalize="off" />
        </label>
        <label className="flex flex-col gap-1 text-lg font-semibold">
          From
          <input name="from" type="date" defaultValue={filters.from} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-lg font-semibold">
          To
          <input name="to" type="date" defaultValue={filters.to} className={input} />
        </label>
        <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row">
          <Button type="submit">Filter</Button>
          <Button asChild variant="outline">
            <Link href="/admin/audit">Clear filters</Link>
          </Button>
          <Button asChild variant="secondary">
            <a href={`/admin/audit/export?${query({})}`} download>
              <Download aria-hidden /> Download as CSV
            </a>
          </Button>
        </div>
      </form>
      {unknownActor ? <p role="alert" className="text-lg font-semibold text-destructive">No Strategist has the handle @{filters.actor}.</p> : null}
      {shown.length ? (
        <ol className="flex flex-col gap-2">
          {shown.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-lg border border-border p-3 text-base">
              <p className="font-semibold">
                {r.action} · {formatUkShort(r.created_at)}
              </p>
              <p>
                By {r.actor_id ? `@${handles.get(r.actor_id) ?? r.actor_id}` : "the system"}
                {r.target_table ? ` · ${r.target_table} ${r.target_id ?? ""}` : ""}
              </p>
              {Object.keys(r.details ?? {}).length ? (
                <details>
                  <summary className="min-h-10 cursor-pointer py-1">Details</summary>
                  <pre className="overflow-x-auto whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{JSON.stringify(r.details, null, 2)}</pre>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="No entries">Nothing matches these filters.</EmptyState>
      )}
      <nav aria-label="Pages" className="flex gap-3">
        {page > 1 ? (
          <Link href={`/admin/audit?${query({ page: String(page - 1) })}`} className="inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
            Newer
          </Link>
        ) : null}
        {rows.length > PER_PAGE ? (
          <Link href={`/admin/audit?${query({ page: String(page + 1) })}`} className="inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
            Older
          </Link>
        ) : null}
      </nav>
    </Page>
  );
}
