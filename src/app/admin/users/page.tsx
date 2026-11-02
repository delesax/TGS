import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { formatUkShort } from "@/lib/campaigns";
import { createClient } from "@/lib/supabase/server";
import { MuteForm } from "../admin-forms";
import { AdminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

type Row = {
  id: string;
  handle: string;
  joined_at: string;
  dispatch_count: number;
  reports_against: number;
  held_count: number;
  posting_muted_at: string | null;
  posting_muted_reason: string | null;
  total_count: number;
};

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireAdmin("/admin/users");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 40) : "";
  const page = Math.max(1, Number(params.page) || 1);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_strategists", { p_query: q || null, p_limit: PER_PAGE, p_offset: (page - 1) * PER_PAGE });
  if (error) throw new Error("Could not load Strategists");
  const rows = (data as Row[]) ?? [];
  const total = rows[0]?.total_count ?? 0;
  const link = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <Page title="Users" intro="Every Strategist with a handle. Muting stops someone posting and editing; it is reversible, audit-logged, and they see the reason. There are no bans or admin deletions in this sprint.">
      <AdminNav current="/admin/users" />
      <form role="search" className="flex gap-2" action="/admin/users">
        <label htmlFor="user-q" className="sr-only">
          Find a Strategist by handle
        </label>
        <input
          id="user-q"
          name="q"
          defaultValue={q}
          placeholder="Find by handle"
          className="min-h-12 w-full min-w-0 rounded-md border-2 border-input bg-background px-3 text-lg"
        />
        <button type="submit" className="min-h-12 shrink-0 rounded-md bg-primary px-4 text-lg font-semibold text-primary-foreground">
          Find
        </button>
      </form>
      <p className="text-lg">
        {total} Strategist{total === 1 ? "" : "s"}
        {q ? ` matching “${q}”` : ""}.
      </p>
      {rows.length ? (
        <ul className="flex flex-col gap-4">
          {rows.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 rounded-xl border-2 border-border bg-card p-4">
              <p className="text-xl font-semibold">
                <Link href={`/strategists/${u.handle}`} className="text-primary underline">
                  @{u.handle}
                </Link>
                {u.posting_muted_at ? <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-base text-destructive-foreground">Posting muted</span> : null}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-base sm:grid-cols-4">
                <dt className="text-muted-foreground">Joined</dt>
                <dd>{formatUkShort(u.joined_at)}</dd>
                <dt className="text-muted-foreground">Dispatches</dt>
                <dd className="tabular-nums">{u.dispatch_count}</dd>
                <dt className="text-muted-foreground">Reports against</dt>
                <dd className="tabular-nums">{u.reports_against}</dd>
                <dt className="text-muted-foreground">Held or removed</dt>
                <dd className="tabular-nums">{u.held_count}</dd>
              </dl>
              {u.posting_muted_at ? (
                <p className="text-base">
                  Muted {formatUkShort(u.posting_muted_at)}: {u.posting_muted_reason}
                </p>
              ) : null}
              <details className="rounded-lg border border-border p-3">
                <summary className="min-h-12 cursor-pointer py-2 text-lg font-semibold">{u.posting_muted_at ? "Allow posting again" : "Mute posting"}</summary>
                <MuteForm userId={u.id} muted={Boolean(u.posting_muted_at)} handle={u.handle} />
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No Strategists found">{q ? "Try a shorter part of the handle." : "Nobody has chosen a handle yet."}</EmptyState>
      )}
      <nav aria-label="Pages" className="flex gap-3">
        {page > 1 ? (
          <Link href={link(page - 1)} className="inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
            Previous page
          </Link>
        ) : null}
        {page * PER_PAGE < total ? (
          <Link href={link(page + 1)} className="inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
            Next page
          </Link>
        ) : null}
      </nav>
    </Page>
  );
}
