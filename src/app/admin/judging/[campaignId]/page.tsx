import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckboxField, TextAreaField, TextField } from "@/components/form";
import { AttentionList, AwardList, Breakdown, Rationale, VERDICT_STATUS_LABELS, WeightsLine } from "@/components/judging/verdict-parts";
import { EmptyState, Page } from "@/components/page";
import { requireAdmin } from "@/lib/auth";
import { getServerNow } from "@/lib/campaign-data";
import { formatUkDateTime, formatUkShort } from "@/lib/campaigns";
import { KIND_LABELS } from "@/lib/dispatches";
import { getEligibleDispatches, getHandles, handleOf, VERDICT_COLUMNS, type VerdictRow } from "@/lib/judging/data";
import { referencedUsers } from "@/lib/judging/rationale";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "../../admin-nav";
import { assignJudge, decideAppeal, editRationale, overrideAiScore, publishVerdict, recomputeVerdict, requeueRubric, unassignJudge } from "../actions";
import { AdminForm } from "../forms";
import { stage, type StatusRow } from "../status";

export const metadata: Metadata = { title: "Judging a Campaign" };
export const dynamic = "force-dynamic";

type Judge = { judge_id: string; assigned_at: string; submitted_at: string | null };
type AiScore = {
  id: string;
  dispatch_id: string;
  model: string;
  provider: string;
  prompt_version: string;
  logic: number;
  evidence: number;
  originality: number;
  responsiveness: number;
  rationale: string;
  steelman_detected: boolean;
  steelman_confidence: number;
  override_scores: Record<string, number> | null;
  override_reason: string | null;
  created_at: string;
};
type Appeal = { id: string; verdict_id: string; appellant_id: string; reason: string; status: string; decision_reason: string | null; created_at: string; decided_at: string | null; same_admin: boolean | null };

function Score({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-block rounded-md border border-border px-2 py-0.5">
      {label} {value}
    </span>
  );
}

export default async function AdminCampaignJudgingPage({ params }: PageProps<"/admin/judging/[campaignId]">) {
  const { campaignId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(campaignId)) notFound();
  await requireAdmin(`/admin/judging/${campaignId}`);
  const supabase = await createClient();
  const [{ data: statusRows }, { data: judgesData }, { data: aiData }, { data: verdictData }, { data: appealData }, { data: weightsData }, dispatches, now] = await Promise.all([
    supabase.rpc("admin_judging_status", { p_campaign_id: campaignId }),
    supabase.from("judge_assignments").select("judge_id, assigned_at, submitted_at").eq("campaign_id", campaignId).order("assigned_at"),
    supabase
      .from("ai_rubric_scores")
      .select("id, dispatch_id, model, provider, prompt_version, logic, evidence, originality, responsiveness, rationale, steelman_detected, steelman_confidence, override_scores, override_reason, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
    supabase.from("verdicts").select(VERDICT_COLUMNS).eq("campaign_id", campaignId).order("version", { ascending: false }),
    supabase.from("verdict_appeals").select("id, verdict_id, appellant_id, reason, status, decision_reason, created_at, decided_at, same_admin").eq("campaign_id", campaignId).order("created_at"),
    supabase.from("campaigns").select("judging_weights_version, weights:judging_weights(panel, peer, ai_rubric, mind_change)").eq("id", campaignId).maybeSingle(),
    getEligibleDispatches(campaignId),
    getServerNow(),
  ]);
  const status = ((statusRows as StatusRow[]) ?? [])[0];
  if (!status) notFound();
  const judges = (judgesData as Judge[]) ?? [];
  const verdicts = (verdictData as VerdictRow[]) ?? [];
  const draft = verdicts.find((v) => v.status === "draft");
  const live = verdicts.find((v) => ["published", "appealed", "final"].includes(v.status));
  const appeals = (appealData as Appeal[]) ?? [];
  const latestAi = new Map<string, AiScore>();
  for (const s of (aiData as AiScore[]) ?? []) if (!latestAi.has(s.dispatch_id)) latestAi.set(s.dispatch_id, s);
  const campaignWeights = (weightsData as unknown as { weights: { panel: number; peer: number; ai_rubric: number; mind_change: number } | null } | null)?.weights;

  const handles = await getHandles([
    ...judges.map((j) => j.judge_id),
    ...appeals.map((a) => a.appellant_id),
    ...verdicts.flatMap((v) => [...v.component_scores.map((s) => s.user_id), ...v.proposed_awards.map((a) => a.profile_id), ...v.attention_reasons.flatMap((a) => (a.user_id ? [a.user_id] : []))]),
    ...verdicts.flatMap((v) => referencedUsers(v.rationale)),
  ]);
  const h = (id: string) => (handles.get(id) ? `@${handles.get(id)}` : "a former Strategist");
  const hidden = { campaignId };
  const closed = status.status === "closed" || Date.parse(status.ends_at) <= now;
  const canChange = !live || live.status === "appealed";

  return (
    <Page title={status.title} intro={`Judging: ${stage(status)}.`}>
      <AdminNav current="/admin/judging" />
      <p className="text-lg">
        <Link href={`/campaigns/${status.slug}`} className="font-semibold text-primary underline">
          Campaign page
        </Link>
        {" · "}
        <Link href={`/campaigns/${status.slug}/verdict`} className="font-semibold text-primary underline">
          Public Verdict page
        </Link>
        {" · "}
        <Link href="/admin/judging" className="font-semibold text-primary underline">
          All Campaigns
        </Link>
      </p>

      <section aria-labelledby="status-h" className="flex flex-col gap-2 rounded-xl border border-border p-4 text-lg">
        <h2 id="status-h" className="text-2xl font-bold">
          Status
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>Closes {formatUkDateTime(status.ends_at)}. Peer voting closes {formatUkDateTime(status.peer_window_closes_at)}. Draft due {formatUkDateTime(status.draft_due_at)}.</li>
          <li>{status.eligible_dispatches} eligible Dispatches.</li>
          <li>
            Panel: {status.judges_submitted} of {status.judges_assigned} judges submitted.
          </li>
          <li>
            AI rubric: {status.ai_scored} scored, {status.ai_pending} waiting, {status.ai_failed} failed.
          </li>
          <li>
            Peer: {status.peer_votes} votes from {status.voters} voters; {status.steelman_confirmations} steelman confirmations; {status.picks} mind-change picks.
          </li>
        </ul>
      </section>

      <section aria-labelledby="panel-h" className="flex flex-col gap-3">
        <h2 id="panel-h" className="text-2xl font-bold">
          Panel
        </h2>
        <p className="text-lg">Judges see only Campaigns they are assigned to, and only once they close. You cannot see a judge&apos;s scores until they submit.</p>
        {judges.length ? (
          <ul className="flex flex-col gap-3">
            {judges.map((j) => (
              <li key={j.judge_id} className="flex flex-col gap-2 rounded-xl border border-border p-4">
                <p className="text-lg font-semibold">{h(j.judge_id)}</p>
                <p className="text-base text-muted-foreground">
                  Assigned {formatUkShort(j.assigned_at)}. {j.submitted_at ? `Submitted ${formatUkShort(j.submitted_at)}: locked.` : "Not submitted yet."}
                </p>
                {!j.submitted_at && canChange ? (
                  <details>
                    <summary className="min-h-12 cursor-pointer py-2 text-lg font-semibold text-primary underline">Remove from the panel</summary>
                    <AdminForm action={unassignJudge} label={`Remove ${h(j.judge_id)}`} hidden={{ ...hidden, judgeId: j.judge_id }} submitLabel="Remove this judge">
                      <TextField name="reason" id={`reason-${j.judge_id}`} label="Reason (kept in the audit log)" maxLength={500} />
                    </AdminForm>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No judges yet">Assign at least one judge. A Verdict cannot be published without panel scores unless you override the panel weight to 0.</EmptyState>
        )}
        {canChange ? (
          <AdminForm action={assignJudge} label="Assign a judge" hidden={hidden} submitLabel="Assign judge">
            <TextField name="handle" label="Judge's handle" hint="They will be emailed. Prefer someone who did not post in this Campaign." placeholder="@handle" autoComplete="off" />
          </AdminForm>
        ) : null}
      </section>

      <section aria-labelledby="draft-h" className="flex flex-col gap-4">
        <h2 id="draft-h" className="text-2xl font-bold">
          Draft Verdict
        </h2>
        {draft ? (
          <div className="flex flex-col gap-4 rounded-xl border-2 border-primary p-4">
            <p className="text-lg">
              Version {draft.version}, computed {formatUkDateTime(draft.computed_at)} {draft.computed_by ? `by ${h(draft.computed_by)}` : "by the scheduler"}.
              {draft.rationale_ai_assisted ? ` Rationale worded with AI help (${draft.rationale_model}).` : ""}
            </p>
            {draft.needs_attention ? (
              <div role="note" className="rounded-lg border-2 border-destructive p-4">
                <p className="text-lg font-bold">Needs attention before it can be published</p>
                <AttentionList items={draft.attention_reasons} handles={handles} />
                <p className="mt-2 text-base">
                  Missing parts are never reweighted automatically. Fix the gap (for example, wait for voting, re-run AI scoring, remove a judge who will not submit), or recompute
                  with override weights that give the missing part 0, with a reason.
                </p>
              </div>
            ) : null}
            <WeightsLine weights={draft.weights_snapshot} />
            <Breakdown scores={draft.component_scores} handles={handles} caption="Draft scores by Strategist" />
            <h3 className="text-xl font-semibold">Proposed awards</h3>
            <AwardList awards={draft.proposed_awards} handles={handles} campaignSlug={status.slug} />
            <h3 className="text-xl font-semibold">Rationale (as it will appear)</h3>
            <Rationale text={draft.rationale} handles={handles} />
            <details>
              <summary className="min-h-12 cursor-pointer py-2 text-lg font-semibold text-primary underline">Edit the rationale</summary>
              <AdminForm action={editRationale} label="Edit the rationale" hidden={{ ...hidden, verdictId: draft.id }} submitLabel="Save rationale">
                <TextAreaField
                  name="rationale"
                  label="Rationale"
                  hint="Keep the @{user:…} tokens: each shows the Strategist's current handle. Do not type handles in. The before and after are kept in the audit log."
                  rows={10}
                  maxLength={8000}
                  defaultValue={draft.rationale}
                />
              </AdminForm>
            </details>
            {!draft.needs_attention ? (
              <AdminForm action={publishVerdict} label="Publish the Verdict" hidden={{ ...hidden, verdictId: draft.id, slug: status.slug }} submitLabel="Publish the Verdict" pendingLabel="Publishing…">
                <CheckboxField name="confirm" label="I have reviewed the scores, awards and rationale. Publish now, name the Grand Strategist, issue the awards and email participants." />
              </AdminForm>
            ) : null}
          </div>
        ) : (
          <EmptyState title="No draft">
            {closed
              ? "A draft is computed automatically when the judging window ends, or you can compute one now."
              : "The Campaign has not closed yet. Drafts can be computed after the close."}
          </EmptyState>
        )}
        {closed && canChange ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
            <h3 className="text-xl font-semibold">{draft ? "Recompute" : "Compute a draft now"}</h3>
            <p className="text-lg">
              Uses the latest submitted panel scores, votes, picks and AI scores, and the weights this Campaign opened with
              {campaignWeights ? ` (panel ${campaignWeights.panel}%, peer ${campaignWeights.peer}%, AI ${campaignWeights.ai_rubric}%, mind-change ${campaignWeights.mind_change}%)` : ""}. The
              old draft is kept as discarded.
            </p>
            <AdminForm action={recomputeVerdict} label="Recompute the draft" hidden={hidden} submitLabel={draft ? "Recompute the draft" : "Compute the draft"} pendingLabel="Computing…">
              <CheckboxField name="override" label="Override the weights for this Verdict only" />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField name="panel" label="Panel (%)" type="number" inputMode="numeric" min={0} max={100} defaultValue={campaignWeights?.panel ?? 40} />
                <TextField name="peer" label="Peer votes (%)" type="number" inputMode="numeric" min={0} max={100} defaultValue={campaignWeights?.peer ?? 25} />
                <TextField name="ai_rubric" label="AI rubric (%)" type="number" inputMode="numeric" min={0} max={100} defaultValue={campaignWeights?.ai_rubric ?? 25} />
                <TextField name="mind_change" label="Mind-change (%)" type="number" inputMode="numeric" min={0} max={100} defaultValue={campaignWeights?.mind_change ?? 10} />
              </div>
              <TextField name="reason" label="Reason for overriding (required when overriding; published with the Verdict)" maxLength={500} />
            </AdminForm>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="live-h" className="flex flex-col gap-3">
        <h2 id="live-h" className="text-2xl font-bold">
          Published Verdict and appeals
        </h2>
        {live ? (
          <p className="text-lg">
            Version {live.version}: {VERDICT_STATUS_LABELS[live.status]}. Published {live.published_at ? formatUkDateTime(live.published_at) : ""}. Appeals close{" "}
            {live.appeal_closes_at ? formatUkDateTime(live.appeal_closes_at) : ""}.
          </p>
        ) : (
          <p className="text-lg">Nothing published yet.</p>
        )}
        {appeals.length ? (
          <ul className="flex flex-col gap-3">
            {appeals.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-border p-4">
                <p className="text-lg font-semibold">
                  {h(a.appellant_id)} · {formatUkShort(a.created_at)} · {a.status}
                </p>
                <p className="whitespace-pre-line text-lg">{a.reason}</p>
                {a.status === "open" ? (
                  <AdminForm action={decideAppeal} label={`Decide the appeal by ${h(a.appellant_id)}`} hidden={{ ...hidden, appealId: a.id }} submitLabel="Record decision">
                    <fieldset className="flex flex-col gap-2">
                      <legend className="text-lg font-semibold">Decision</legend>
                      <label className="flex min-h-12 items-center gap-3 text-lg">
                        <input type="radio" name="outcome" value="rejected" className="size-6 accent-primary" /> Reject: the Verdict stands
                      </label>
                      <label className="flex min-h-12 items-center gap-3 text-lg">
                        <input type="radio" name="outcome" value="upheld" className="size-6 accent-primary" /> Uphold: recompute and publish a revised Verdict
                      </label>
                    </fieldset>
                    <TextAreaField name="reason" id={`appeal-reason-${a.id}`} label="Reasons (kept in the audit log)" rows={3} maxLength={1000} />
                  </AdminForm>
                ) : (
                  <p className="text-base text-muted-foreground">
                    Decided {a.decided_at ? formatUkShort(a.decided_at) : ""}: {a.decision_reason}
                    {a.same_admin ? " (decided by the admin who published the Verdict)" : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg">No appeals.</p>
        )}
      </section>

      <section aria-labelledby="ai-h" className="flex flex-col gap-3">
        <h2 id="ai-h" className="text-2xl font-bold">
          AI rubric by Dispatch
        </h2>
        <p className="text-lg">Every AI score keeps its model, prompt version and reason. Override a score with a reason, or re-run it; then recompute the draft.</p>
        {dispatches.length ? (
          <ul className="flex flex-col gap-3">
            {dispatches.map((d) => {
              const s = latestAi.get(d.id);
              const shown = s?.override_scores ?? s;
              return (
                <li key={d.id} className="flex flex-col gap-2 rounded-xl border border-border p-4">
                  <p className="text-lg font-semibold">
                    {handleOf(d)} · {KIND_LABELS[d.kind].label}
                  </p>
                  <p className="line-clamp-3 text-base [overflow-wrap:anywhere]">{d.body}</p>
                  {s && shown ? (
                    <>
                      <p className="flex flex-wrap gap-2 text-base">
                        <Score label="Logic" value={shown.logic} />
                        <Score label="Evidence" value={shown.evidence} />
                        <Score label="Originality" value={shown.originality} />
                        <Score label="Responsiveness" value={shown.responsiveness} />
                        {s.steelman_detected ? <span className="font-semibold">Steelman detected ({Math.round(Number(s.steelman_confidence) * 100)}%)</span> : null}
                      </p>
                      <p className="text-base text-muted-foreground">
                        {s.rationale} ({s.provider === "fake" ? "stand-in provider" : s.model}, {s.prompt_version})
                        {s.override_reason ? ` Overridden: ${s.override_reason}` : ""}
                      </p>
                      {canChange ? (
                        <details>
                          <summary className="min-h-12 cursor-pointer py-2 text-lg font-semibold text-primary underline">Override this score</summary>
                          <AdminForm action={overrideAiScore} label="Override AI score" hidden={{ ...hidden, scoreId: s.id }} submitLabel="Save override">
                            <div className="grid grid-cols-2 gap-3">
                              {(["logic", "evidence", "originality", "responsiveness"] as const).map((k) => (
                                <TextField key={k} id={`${s.id}-${k}`} name={k} label={`${k[0].toUpperCase()}${k.slice(1)} (1-5)`} type="number" inputMode="numeric" min={1} max={5} defaultValue={shown[k]} />
                              ))}
                            </div>
                            <TextField id={`${s.id}-reason`} name="reason" label="Reason (kept in the audit log)" maxLength={500} />
                          </AdminForm>
                        </details>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-base">Not scored yet.</p>
                  )}
                  {canChange && closed ? (
                    <AdminForm action={requeueRubric} label="Re-run AI scoring" hidden={{ ...hidden, dispatchId: d.id }} submitLabel="Re-run AI scoring" pendingLabel="Queuing…" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No Dispatches">This Campaign has no eligible Dispatches.</EmptyState>
        )}
      </section>

      <section aria-labelledby="history-h" className="flex flex-col gap-3">
        <h2 id="history-h" className="text-2xl font-bold">
          Verdict history
        </h2>
        {verdicts.length ? (
          <ul className="flex flex-col gap-2 text-lg">
            {verdicts.map((v) => (
              <li key={v.id}>
                Version {v.version}: {VERDICT_STATUS_LABELS[v.status]}, computed {formatUkShort(v.computed_at)}
                {v.weights_snapshot.source === "override" ? " with override weights" : ""}.
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg">None yet. Every compute, edit, publish and appeal decision is in the audit log.</p>
        )}
      </section>
    </Page>
  );
}
