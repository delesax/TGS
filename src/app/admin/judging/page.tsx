import type { Metadata } from "next";
import { Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { formatUkShort } from "@/lib/campaigns";
import { createClient } from "@/lib/supabase/server";
import { WeightsForm } from "../admin-forms";
import { AdminNav } from "../admin-nav";

export const metadata: Metadata = { title: "Judging weights" };
export const dynamic = "force-dynamic";

type Version = { version: number; panel: number; peer: number; ai_rubric: number; mind_change: number; note: string | null; created_at: string };

export default async function JudgingPage() {
  await requireAdmin("/admin/judging");
  const supabase = await createClient();
  const [{ data, error }, { data: used }] = await Promise.all([
    supabase.from("judging_weights").select("version, panel, peer, ai_rubric, mind_change, note, created_at").order("version", { ascending: false }),
    supabase.from("campaigns").select("judging_weights_version").not("judging_weights_version", "is", null),
  ]);
  if (error) throw new Error("Could not load judging weights");
  const versions = (data as Version[]) ?? [];
  const usage = new Map<number, number>();
  for (const c of (used as { judging_weights_version: number }[]) ?? []) usage.set(c.judging_weights_version, (usage.get(c.judging_weights_version) ?? 0) + 1);
  const current = versions[0];

  return (
    <Page
      title="Judging weights"
      intro="How the Verdict blends its four parts (CLAUDE.md rule 7). Saving creates a new version for Campaigns that have not opened yet. A Campaign keeps the version it opened with, so its weights cannot change once it is open. Judging itself arrives in Sprint 5."
    >
      <AdminNav current="/admin/judging" />
      {current ? <WeightsForm current={current} /> : null}
      <section aria-labelledby="versions-h" className="flex flex-col gap-3">
        <h2 id="versions-h" className="text-2xl font-bold">
          Versions
        </h2>
        <ul className="flex flex-col gap-3">
          {versions.map((v) => (
            <li key={v.version} className="rounded-xl border border-border p-4 text-lg">
              <p className="font-semibold">
                Version {v.version}
                {v === current ? " (current)" : ""} · {formatUkShort(v.created_at)}
              </p>
              <p>
                Panel {v.panel}%, peer {v.peer}%, AI rubric {v.ai_rubric}%, mind-change {v.mind_change}%
              </p>
              <p className="text-base text-muted-foreground">
                {usage.get(v.version) ? `Locked: used by ${usage.get(v.version)} opened Campaign${usage.get(v.version) === 1 ? "" : "s"}.` : "Not used by an opened Campaign yet."}
                {v.note ? ` Note: ${v.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </Page>
  );
}
