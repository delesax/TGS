import type { Metadata } from "next";
import Link from "next/link";
import { CheckboxField, TextField } from "@/components/form";
import { EmptyState, Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { CATEGORY_LABELS, formatUkShort } from "@/lib/campaigns";
import { getJudgingSettings } from "@/lib/judging/data";
import { createClient } from "@/lib/supabase/server";
import { WeightsForm } from "../admin-forms";
import { AdminNav } from "../admin-nav";
import { saveJudgingSettings, setJudgePromptVersion } from "./actions";
import { AdminForm } from "./forms";
import { stage, type StatusRow } from "./status";

export const metadata: Metadata = { title: "Judging" };
export const dynamic = "force-dynamic";

type Version = { version: number; panel: number; peer: number; ai_rubric: number; mind_change: number; note: string | null; created_at: string };
export default async function JudgingPage() {
  await requireAdmin("/admin/judging");
  const supabase = await createClient();
  const [{ data, error }, { data: used }, { data: board, error: boardError }, settings] = await Promise.all([
    supabase.from("judging_weights").select("version, panel, peer, ai_rubric, mind_change, note, created_at").order("version", { ascending: false }),
    supabase.from("campaigns").select("judging_weights_version").not("judging_weights_version", "is", null),
    supabase.rpc("admin_judging_status", { p_campaign_id: null }),
    getJudgingSettings(),
  ]);
  if (error || boardError) throw new Error("Could not load judging");
  // Read separately so a database without the setting yet still shows the rest of the page.
  const { data: promptRow } = await supabase.from("judging_settings").select("judge_prompt_version").maybeSingle<{ judge_prompt_version: number }>();
  const promptVersionNow = promptRow?.judge_prompt_version ?? null;
  const versions = (data as Version[]) ?? [];
  const usage = new Map<number, number>();
  for (const c of (used as { judging_weights_version: number }[]) ?? []) usage.set(c.judging_weights_version, (usage.get(c.judging_weights_version) ?? 0) + 1);
  const current = versions[0];
  const rows = (board as StatusRow[]) ?? [];

  return (
    <Page title="Judging" intro="Panels, AI scoring, draft Verdicts, publishing and appeals for every Campaign, plus the weights and windows that apply.">
      <AdminNav current="/admin/judging" />

      <section aria-labelledby="board-h" className="flex flex-col gap-3">
        <h2 id="board-h" className="text-2xl font-bold">
          Status by Campaign
        </h2>
        {rows.length ? (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.campaign_id} className="flex flex-col gap-1 rounded-xl border border-border p-4 text-lg">
                <Link href={`/admin/judging/${r.campaign_id}`} className="text-xl font-semibold text-primary underline [overflow-wrap:anywhere]">
                  {r.title}
                </Link>
                <p className="font-semibold">{stage(r)}</p>
                <p className="text-base text-muted-foreground">
                  {CATEGORY_LABELS[r.category]} · closes {formatUkShort(r.ends_at)} · {r.eligible_dispatches} Dispatches · panel {r.judges_submitted}/{r.judges_assigned} submitted · AI{" "}
                  {r.ai_scored} scored{r.ai_pending ? `, ${r.ai_pending} waiting` : ""}
                  {r.ai_failed ? `, ${r.ai_failed} failed` : ""} · {r.peer_votes} votes from {r.voters} voters · {r.picks} mind-change picks
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No open or closed Campaigns">Campaigns appear here once they open.</EmptyState>
        )}
      </section>

      <section aria-labelledby="settings-h" className="flex flex-col gap-3">
        <h2 id="settings-h" className="text-2xl font-bold">
          Windows and votes
        </h2>
        <p className="text-lg">
          Steelman bonus: up to {settings.steelman_bonus_max} points, needing the AI&apos;s detection and {settings.steelman_min_confirmations} confirmations from other people. Voter
          weight cap: {settings.reputation_cap_multiple} times the median voter.
        </p>
        <AdminForm action={saveJudgingSettings} label="Judging settings" submitLabel="Save settings">
          <TextField name="peer_window_hours" label="Peer voting window (hours after the close)" type="number" inputMode="numeric" min={1} max={720} defaultValue={settings.peer_window_hours} />
          <TextField name="judging_window_hours" label="Draft Verdict due (hours after the close)" type="number" inputMode="numeric" min={1} max={1440} defaultValue={settings.judging_window_hours} />
          <TextField name="peer_vote_credits" label="Votes each Strategist can cast per Campaign" type="number" inputMode="numeric" min={1} max={50} defaultValue={settings.peer_vote_credits} />
          <TextField name="appeal_window_days" label="Appeal window (days after publication)" type="number" inputMode="numeric" min={1} max={60} defaultValue={settings.appeal_window_days} />
          <TextField name="min_voter_account_age_hours" label="Account age before votes, confirmations and picks count (hours)" hint="Panel judges are exempt. 0 switches the rule off." type="number" inputMode="numeric" min={0} max={720} defaultValue={settings.min_voter_account_age_hours} />
          <TextField name="max_steelman_confirmations" label="Steelman confirmations each person can give per Campaign" type="number" inputMode="numeric" min={1} max={20} defaultValue={settings.max_steelman_confirmations} />
          <TextField name="min_position_span_hours" label="Hours a position change must span to earn mind-change credit" hint="Between the recorded before and after. 0 switches the rule off." type="number" inputMode="numeric" min={0} max={720} defaultValue={settings.min_position_span_hours} />
          <CheckboxField name="ai_rationale_wording" label="Let the AI improve the wording of draft rationales (marked as AI-assisted; scores never change)" defaultChecked={settings.ai_rationale_wording} />
        </AdminForm>
      </section>

      <section aria-labelledby="prompt-h" className="flex flex-col gap-3">
        <h2 id="prompt-h" className="text-2xl font-bold">
          Judge prompt version
        </h2>
        <p className="text-lg">
          Version 2 tells the AI judge it cannot verify any source and asks it to list up to three claims for a person to check; version 1 is the original wording. The change takes effect the next time scoring runs, with no deploy. Scores already stored keep the version that wrote them.
          {promptVersionNow === null ? " (This database does not have the setting yet: the judge uses version 1.)" : ` Now using version ${promptVersionNow}.`}
        </p>
        {promptVersionNow !== null ? (
          <AdminForm action={setJudgePromptVersion} label="Judge prompt version" submitLabel="Save version">
            <div className="flex flex-col gap-2">
              <label htmlFor="judge_prompt_version" className="text-lg font-semibold">
                Version to use
              </label>
              <select id="judge_prompt_version" name="version" defaultValue={String(promptVersionNow)} className="min-h-12 rounded-md border-2 border-input bg-background px-3 text-lg">
                <option value="1">Version 1 (original)</option>
                <option value="2">Version 2 (cannot verify sources; lists claims to check)</option>
              </select>
            </div>
            <TextField id="judge_prompt_reason" name="reason" label="Reason (kept in the audit log)" maxLength={500} required />
          </AdminForm>
        ) : null}
      </section>

      <section aria-labelledby="weights-h" className="flex flex-col gap-3">
        <h2 id="weights-h" className="text-2xl font-bold">
          Weights
        </h2>
        <p className="text-lg">
          Saving creates a new version for Campaigns that have not opened yet. A Campaign keeps the version it opened with, and every Verdict stores the weights it used.
          To use different weights for one Verdict, override them when you recompute it.
        </p>
        {current ? <WeightsForm current={current} /> : null}
        <h3 className="text-xl font-semibold">Versions</h3>
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
