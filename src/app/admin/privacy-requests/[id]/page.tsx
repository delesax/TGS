import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { formatUkDateTime } from "@/lib/campaigns";
import { REQUEST_TYPE_LABELS, STATUS_LABELS, daysUntil, dueState, type RequestType } from "@/lib/privacy-requests";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "../../admin-nav";
import { UpdateForm } from "../update-form";

export const metadata: Metadata = { title: "Privacy request" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  created_at: string;
  type: RequestType;
  email: string;
  user_id: string | null;
  message: string;
  status: string;
  acknowledged_at: string | null;
  due_at: string;
  closed_at: string | null;
  outcome_note: string | null;
};

export default async function PrivacyRequestPage({ params }: PageProps<"/admin/privacy-requests/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/privacy-requests/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_list_privacy_requests", { p_status: null });
  const row = ((data ?? []) as Row[]).find((r) => r.id === id);
  if (!row) notFound();
  // Reading personal data is itself recorded (request id only).
  await supabase.rpc("admin_open_privacy_request", { p_id: id });
  const state = dueState(row.status, row.due_at);
  const days = daysUntil(row.due_at);

  return (
    <Page title={REQUEST_TYPE_LABELS[row.type] ?? row.type} intro={`Reference ${row.id.slice(0, 8)} · ${STATUS_LABELS[row.status as keyof typeof STATUS_LABELS] ?? row.status}`}>
      <AdminNav current="/admin/privacy-requests" />
      <Link href="/admin/privacy-requests" className="font-semibold underline">
        Back to all requests
      </Link>
      <dl className="grid gap-1 text-lg">
        <dt className="font-semibold">From</dt>
        <dd className="mb-2">{row.email}{row.user_id ? " (a signed-in account)" : " (not signed in: confirm who they are before acting)"}</dd>
        <dt className="font-semibold">Received</dt>
        <dd className="mb-2">{formatUkDateTime(row.created_at)}</dd>
        <dt className="font-semibold">Acknowledged</dt>
        <dd className="mb-2">{row.acknowledged_at ? formatUkDateTime(row.acknowledged_at) : "Not yet (the acknowledgement email may not have been sent)"}</dd>
        <dt className="font-semibold">Reply due</dt>
        <dd className={state === "overdue" ? "mb-2 font-bold text-destructive" : state === "soon" ? "mb-2 font-bold" : "mb-2"}>
          {formatUkDateTime(row.due_at)}
          {state === "overdue" ? ` (overdue by ${Math.abs(days)} days)` : state === "closed" ? "" : ` (${days} days left)`}
        </dd>
      </dl>
      <section aria-labelledby="msg-h" className="rounded-xl border-2 border-border bg-muted p-4">
        <h2 id="msg-h" className="text-xl font-semibold">
          Their message
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-lg [overflow-wrap:anywhere]">{row.message}</p>
      </section>
      <UpdateForm id={row.id} status={row.status} note={row.outcome_note ?? ""} />
    </Page>
  );
}
