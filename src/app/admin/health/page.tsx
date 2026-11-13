import type { Metadata } from "next";
import { Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Health" };
export const dynamic = "force-dynamic";

type Job = { name: string; schedule: string; active: boolean; last_status: string | null; last_run: string | null };
type Health = {
  checked_at: string;
  email_queued: number;
  email_oldest_queued_seconds: number | null;
  email_failed_24h: number;
  rubric_jobs_waiting: number;
  rubric_oldest_seconds: number | null;
  moderation_pending: number;
  moderation_oldest_pending_seconds: number | null;
  ai_calls_today: number;
  ai_daily_cap: number;
  ai_enabled: boolean;
  switches: { posting_paused: boolean; signups_paused: boolean; emails_paused: boolean };
  jobs: Job[];
};
type EventRow = { id: number; created_at: string; kind: string; code: string | null; detail: Record<string, unknown> };

function age(seconds: number | null): string {
  if (seconds === null) return "nothing waiting";
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 3600)} hours`;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "short" }) : "never");

export default async function HealthPage() {
  await requireAdmin("/admin/health");
  const supabase = await createClient();
  const [{ data: health, error }, { data: events }] = await Promise.all([supabase.rpc("admin_health"), supabase.rpc("admin_recent_events", { p_limit: 50 })]);
  if (error || !health) throw new Error("Could not load the health report");
  const h = health as Health;
  const switchesOn = Object.entries(h.switches).filter(([, on]) => on).map(([k]) => k.replace("_", " "));
  const rows: [string, string][] = [
    ["Emails waiting", `${h.email_queued} (oldest: ${age(h.email_oldest_queued_seconds)}); failed in the last 24 hours: ${h.email_failed_24h}`],
    ["AI scoring jobs waiting", `${h.rubric_jobs_waiting} (oldest: ${age(h.rubric_oldest_seconds)})`],
    ["Dispatches still being checked", `${h.moderation_pending} (oldest: ${age(h.moderation_oldest_pending_seconds)})`],
    ["AI calls today", `${h.ai_calls_today} of ${h.ai_daily_cap}${h.ai_enabled ? "" : " (AI is switched off)"}`],
    ["Site switches", switchesOn.length ? `ON: ${switchesOn.join(", ")}` : "none on"],
  ];
  return (
    <Page title="Health" intro={`Queues, today's AI use and the last run of each scheduled job. Checked ${when(h.checked_at)}. Reload for the latest.`}>
      <AdminNav current="/admin/health" />
      <section aria-labelledby="queues-h" className="flex flex-col gap-3">
        <h2 id="queues-h" className="text-2xl font-bold">
          Queues and limits
        </h2>
        <dl className="grid gap-3 text-lg sm:grid-cols-[16rem_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="jobs-h" className="flex flex-col gap-3">
        <h2 id="jobs-h" className="text-2xl font-bold">
          Scheduled jobs
        </h2>
        <ul className="flex flex-col gap-2 text-lg">
          {h.jobs.map((j) => (
            <li key={j.name}>
              <span className="font-semibold">{j.name}</span> ({j.schedule}){j.active ? "" : " (switched off)"}: last run {when(j.last_run)}, {j.last_status ?? "no run yet"}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="events-h" className="flex flex-col gap-3">
        <h2 id="events-h" className="text-2xl font-bold">
          Recent events
        </h2>
        <p className="text-lg text-muted-foreground">Our own incident record, kept 30 days. Counts and short codes only.</p>
        {((events as EventRow[]) ?? []).length ? (
          <ul className="flex flex-col gap-2 text-lg">
            {((events as EventRow[]) ?? []).map((e) => (
              <li key={e.id}>
                {when(e.created_at)}: {e.kind}
                {e.code ? ` (${e.code})` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg">Nothing recorded.</p>
        )}
      </section>
    </Page>
  );
}
