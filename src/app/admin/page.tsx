import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { getAiUsage, getCoachUsefulness, getModerationQueue } from "@/lib/admin-data";
import { estimateCostUsd, resolveModel } from "@/lib/ai/config";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: "Admin console" };
export const dynamic = "force-dynamic";

const FEATURE_LABELS: Record<string, string> = {
  screen_dispatch: "Dispatch screening",
  screen_handle: "Handle screening",
  screen_profile: "Name and bio screening",
  nudge: "Nudges",
  coach: "Coach",
};

export default async function AdminHome() {
  await requireAdmin("/admin");
  const supabase = await createClient();
  const [{ items, handles }, usage, coach, { data: settings }] = await Promise.all([
    getModerationQueue(),
    getAiUsage(),
    getCoachUsefulness(),
    supabase.rpc("admin_community_settings").single(),
  ]);
  const s = settings as { ai_enabled: boolean; ai_daily_cap_global: number; ai_model_screening: string | null; ai_model_nudge: string | null; ai_model_coach: string | null } | null;
  const today = usage.filter((u) => u.day === usage[0]?.day);
  const callsToday = today.reduce((n, u) => n + u.calls, 0);
  const modelFor = (feature: string) =>
    s ? resolveModel(feature === "coach" ? "coach" : feature === "nudge" ? "nudge" : "screening", s) : "claude-haiku-5-5";
  const cost = (rows: typeof usage) => rows.reduce((t, u) => t + estimateCostUsd(modelFor(u.feature), u.input_tokens, u.output_tokens), 0);

  return (
    <Page title="Admin console" intro="Admins only. Every change here is recorded in the audit log.">
      <AdminNav current="/admin" />

      {s && !s.ai_enabled ? (
        <p role="alert" className="rounded-lg border-2 border-destructive p-4 text-lg font-semibold text-destructive">
          AI features are switched off. Dispatches follow the fallback rule in Settings and appear in Moderation for a human look.
        </p>
      ) : null}

      <section aria-labelledby="queue-h" className="flex flex-col gap-2 rounded-xl border-2 border-border p-4">
        <h2 id="queue-h" className="text-2xl font-bold">
          Moderation
        </h2>
        <p className="text-lg">
          {items.length} Dispatch{items.length === 1 ? "" : "es"} and {handles.length} handle{handles.length === 1 ? "" : "s"} waiting for a person.
        </p>
        <Link href="/admin/moderation" className="inline-flex min-h-12 items-center text-lg font-semibold text-primary underline">
          Open the queue
        </Link>
      </section>

      <section aria-labelledby="spend-h" className="flex flex-col gap-3 rounded-xl border-2 border-border p-4">
        <h2 id="spend-h" className="text-2xl font-bold">
          AI spend
        </h2>
        <p className="text-lg">
          Today: {callsToday.toLocaleString("en-GB")} of {s?.ai_daily_cap_global.toLocaleString("en-GB") ?? "?"} calls, about ${cost(today).toFixed(2)}. Last 14 days: about $
          {cost(usage).toFixed(2)}. Estimates from token counts and list prices.
        </p>
        {usage.length ? (
          <ul className="flex flex-col gap-2" aria-label="AI calls and tokens per feature per day">
            {usage.map((u) => (
              <li key={`${u.day}-${u.feature}`} className="rounded-lg border border-border p-3 text-base">
                <p className="font-semibold">
                  {u.day} · {FEATURE_LABELS[u.feature] ?? u.feature}
                </p>
                <p className="tabular-nums">
                  {u.calls.toLocaleString("en-GB")} call{u.calls === 1 ? "" : "s"}, {u.failures} failed · {u.input_tokens.toLocaleString("en-GB")} tokens in,{" "}
                  {u.output_tokens.toLocaleString("en-GB")} out · about ${estimateCostUsd(modelFor(u.feature), u.input_tokens, u.output_tokens).toFixed(4)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg text-muted-foreground">No AI calls in the last 14 days.</p>
        )}
      </section>

      <section aria-labelledby="coach-h" className="flex flex-col gap-2 rounded-xl border-2 border-border p-4">
        <h2 id="coach-h" className="text-2xl font-bold">
          Coach usefulness
        </h2>
        <p className="text-lg">
          {coach.rated
            ? `${Math.round((coach.helpful / coach.rated) * 100)}% found it useful (${coach.helpful} of ${coach.rated} ratings).`
            : "No ratings yet."}{" "}
          {coach.unrated} piece{coach.unrated === 1 ? "" : "s"} of feedback not rated.
        </p>
        {coach.comments.length ? (
          <ul className="flex flex-col gap-1 text-lg">
            {coach.comments.map((c) => (
              <li key={c.rated_at}>
                {c.helpful ? "Useful" : "Not useful"}: “{c.comment}”
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </Page>
  );
}
