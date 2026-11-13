import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Signals" };
export const dynamic = "force-dynamic";

type Signal = { code: string; campaign_id?: string; invite_id?: string; users: string[]; detail: string };
type Report = {
  generated_at: string;
  days: number;
  signals: Signal[];
  handles: Record<string, string | null>;
  campaigns: Record<string, { slug: string; title: string }>;
};

const LABELS: Record<string, { title: string; meaning: string }> = {
  vote_concentration: { title: "Votes concentrated on one author", meaning: "A voter sent at least 80% of at least three votes to one author." },
  mutual_votes: { title: "Mutual votes", meaning: "Two Strategists each voted for a Dispatch written by the other." },
  shared_targets: { title: "Shared vote targets", meaning: "Two voters voted for the same three or more Dispatches." },
  burst_votes: { title: "Burst voting", meaning: "Four or more votes by one voter within 10 seconds." },
  invite_burst: { title: "Sign-up burst on one invite", meaning: "Three or more accounts created within 10 minutes on one invite." },
  email_family: { title: "Same mailbox", meaning: "Accounts whose email is the same mailbox once +tags (and dots for Gmail) are removed. No address is shown." },
  reciprocal_picks: { title: "Reciprocal mind-change picks", meaning: "Two Strategists each picked the other as the Dispatch that changed their mind." },
  steelman_concentration: { title: "Steelman confirmations for one author", meaning: "One person confirmed three or more steelmen, all for one author." },
  reciprocal_steelman: { title: "Reciprocal steelman confirmations", meaning: "Two Strategists each confirmed a steelman written by the other." },
};
const ORDER = Object.keys(LABELS);

export default async function SignalsPage() {
  await requireAdmin("/admin/signals");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_integrity_signals", { p_days: 30 });
  if (error || !data) throw new Error("Could not load the integrity signals");
  const report = data as Report;
  const who = (id: string) => (report.handles[id] ? `@${report.handles[id]}` : "a deleted or unnamed account");
  const groups = ORDER.map((code) => ({ code, items: report.signals.filter((s) => s.code === code) })).filter((g) => g.items.length);

  return (
    <Page
      title="Signals"
      intro={`Patterns that may mean accounts are working together, from the last ${report.days} days. These are flags for a person to look at: nothing here changes a score, a weight or an account, and a pattern is not proof. No IP addresses are used.`}
    >
      <AdminNav current="/admin/signals" />
      {groups.length === 0 ? (
        <p className="text-lg">No signals. Nothing in the last {report.days} days matches any of the patterns.</p>
      ) : (
        groups.map((g) => (
          <section key={g.code} aria-labelledby={`${g.code}-h`} className="flex flex-col gap-3">
            <h2 id={`${g.code}-h`} className="text-2xl font-bold">
              {LABELS[g.code].title} ({g.items.length})
            </h2>
            <p className="text-lg text-muted-foreground">{LABELS[g.code].meaning}</p>
            <ul className="flex flex-col gap-2 text-lg">
              {g.items.map((s, i) => (
                <li key={i} className="rounded-lg border-2 border-border p-3">
                  {s.users.map(who).join(", ")}
                  {s.campaign_id && report.campaigns[s.campaign_id] ? (
                    <>
                      {" in "}
                      <Link href={`/campaigns/${report.campaigns[s.campaign_id].slug}`} className="font-semibold text-primary underline">
                        {report.campaigns[s.campaign_id].title}
                      </Link>
                    </>
                  ) : null}
                  . {s.detail}.
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Page>
  );
}
