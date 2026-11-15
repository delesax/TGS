import type { Metadata } from "next";
import { EmptyState, Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { getServerNow } from "@/lib/campaign-data";
import { formatUkShort } from "@/lib/campaigns";
import { INVITE_STATE_WORDS, canReissue, canRevoke, describeInvite, type Budget, type OverviewRow } from "@/lib/join-requests";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";
import { BudgetPanel, IssuedActions, PendingPanel, type PendingRequest } from "./invites-forms";

export const metadata: Metadata = { title: "Invites" };
export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  await requireAdmin("/admin/invites");
  const supabase = await createClient();
  const [pendingRes, overviewRes, budgetRes, now] = await Promise.all([
    supabase.from("join_requests").select("id, email, note, source, created_at").eq("status", "pending").order("created_at").limit(200),
    supabase.rpc("admin_invites_overview"),
    supabase.rpc("invite_email_budget"),
    getServerNow(),
  ]);
  const failed = pendingRes.error || overviewRes.error || budgetRes.error;
  const pending = (pendingRes.data ?? []) as PendingRequest[];
  const rows = (overviewRes.data ?? []) as OverviewRow[];
  const budget = budgetRes.data as Budget | null;

  return (
    <Page title="Invites" intro="Approve requests to join, or paste addresses, and send each person a single-use invite for their own email address.">
      <AdminNav current="/admin/invites" />
      {failed || !budget ? (
        <EmptyState title="We could not load the invites">Refresh the page. If it keeps happening, check the database is reachable and the latest migration is applied.</EmptyState>
      ) : (
        <>
          <BudgetPanel budget={budget} />
          <PendingPanel requests={pending} budget={budget} />
          <section aria-labelledby="issued-h" className="flex flex-col gap-3">
            <h2 id="issued-h" className="text-xl font-semibold">
              Decided requests and invites
            </h2>
            {rows.length === 0 ? (
              <p className="text-base">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {rows.map((r) => {
                  const state = describeInvite(r, now);
                  return (
                    <li key={r.request_id} className="rounded-[12px] border border-hairline bg-card p-4">
                      <p className="break-all text-lg font-semibold">{r.email}</p>
                      <p className="text-base">
                        {INVITE_STATE_WORDS[state]}
                        {r.expires_at && (state === "emailed" || state === "link_shown" || state === "waiting") ? ` · works until ${formatUkShort(r.expires_at)}` : ""}
                        {state === "waiting" && r.send_after ? ` · goes out ${formatUkShort(r.send_after)}` : ""}
                        {r.decided_at ? ` · decided ${formatUkShort(r.decided_at)}` : ""}
                      </p>
                      {r.invite_id && (canRevoke(state) || canReissue(state)) ? <IssuedActions inviteId={r.invite_id} canRevoke={canRevoke(state)} canReissue={canReissue(state)} /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
