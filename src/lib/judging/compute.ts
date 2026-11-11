import type { SupabaseClient } from "@supabase/supabase-js";
import { judgeRationaleWith, judgeRubricWith, type EngineDeps } from "@/lib/ai/engine";
import type { Unavailable } from "@/lib/ai/types";
import { blend, type BlendResult, type JudgingInputs, type Weights } from "./blend";
import { templateRationale } from "./rationale";

// Judging work that talks to the database, with the database client and AI
// dependencies passed in. No "server-only" import, so the seed script and the
// evaluation can run it too; the app calls it from src/lib/judging/processor.ts
// (server only) with the service-role client.

export type RawInputs = JudgingInputs & {
  now: string;
  campaign: { id: string; slug: string; title: string; category: string; status: string; starts_at: string; ends_at: string; weights_version: number | null };
  weights: { version: number; panel: number; peer: number; ai_rubric: number; mind_change: number } | null;
  settings: JudgingInputs["settings"] & { ai_rationale_wording: boolean; peer_window_hours: number; judging_window_hours: number; appeal_window_days: number };
};

export async function loadInputs(db: SupabaseClient, campaignId: string): Promise<RawInputs> {
  const { data, error } = await db.rpc("judging_inputs", { p_campaign_id: campaignId });
  if (error || !data) throw new Error(`Could not read judging inputs: ${error?.message ?? "no data"}`);
  const raw = data as RawInputs;
  const num = (x: unknown) => Number(x);
  return {
    ...raw,
    settings: {
      ...raw.settings,
      reputation_cap_multiple: num(raw.settings.reputation_cap_multiple),
      steelman_bonus_max: num(raw.settings.steelman_bonus_max),
      steelman_bonus_per_dispatch: num(raw.settings.steelman_bonus_per_dispatch),
      steelman_ai_min_confidence: num(raw.settings.steelman_ai_min_confidence),
    },
    ai: raw.ai.map((a) => ({ ...a, steelman_confidence: num(a.steelman_confidence) })),
  };
}

export type WeightsOverride = { panel: number; peer: number; ai_rubric: number; mind_change: number; reason: string };

export function chooseWeights(inputs: Pick<RawInputs, "weights">, override?: WeightsOverride | null): Weights | null {
  if (override) {
    const parts = [override.panel, override.peer, override.ai_rubric, override.mind_change];
    if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 100) || parts.reduce((a, b) => a + b, 0) !== 100) {
      throw new Error("WEIGHTS_SUM: the four weights must be whole numbers adding up to 100");
    }
    if (!override.reason.trim()) throw new Error("REASON_REQUIRED: say why the weights are overridden");
    return { version: null, panel: override.panel, peer: override.peer, ai_rubric: override.ai_rubric, mind_change: override.mind_change, source: "override", reason: override.reason.trim() };
  }
  return inputs.weights ? { ...inputs.weights, source: "campaign" } : null;
}

export type DraftOptions = {
  /** The admin who asked, or null for the scheduled processor. */
  actorId: string | null;
  override?: WeightsOverride | null;
  /** AI dependencies for the optional rationale wording (judging_settings.ai_rationale_wording). */
  wordingDeps?: EngineDeps | null;
};

export async function computeDraftVerdict(db: SupabaseClient, campaignId: string, opts: DraftOptions): Promise<{ verdictId: string; result: BlendResult }> {
  const inputs = await loadInputs(db, campaignId);
  const weights = chooseWeights(inputs, opts.override);
  const result = blend(inputs, weights);

  let rationale = templateRationale(result, inputs.campaign.title);
  let wording: { model: string; promptVersion: string } | null = null;
  if (inputs.settings.ai_rationale_wording && opts.wordingDeps && result.winner_id) {
    const worded = await judgeRationaleWith(opts.wordingDeps, rationale);
    if (worded.ok) {
      rationale = worded.rationale;
      wording = { model: worded.record.model, promptVersion: worded.record.promptVersion };
    }
  }

  const draft = {
    needs_attention: result.attention.length > 0 || !result.winner_id,
    attention_reasons: result.attention,
    weights_snapshot: result.weights,
    component_scores: result.strategists,
    proposed_awards: result.awards,
    winner_id: result.winner_id,
    rationale,
    rationale_ai_assisted: Boolean(wording),
    rationale_model: wording?.model ?? null,
    rationale_prompt_version: wording?.promptVersion ?? null,
  };
  const { data, error } = await db.rpc("store_verdict_draft", { p_campaign_id: campaignId, p_actor: opts.actorId, p_draft: draft });
  if (error) throw new Error(error.message);
  return { verdictId: data as string, result };
}

// ---------------------------------------------------------------------------
// AI rubric jobs
// ---------------------------------------------------------------------------

type JobRow = { dispatch_id: string; campaign_id: string; attempts: number };
type DispatchRow = {
  id: string;
  body: string;
  kind: "argument" | "rebuttal" | "evidence";
  parent: { body: string; hidden_at: string | null; withdrawn_at: string | null; moderation_status: string } | null;
  campaign: { title: string; category: string } | null;
};

/** Waiting does not use up an attempt; a real failure backs off 5, 10, 20, 40 minutes. */
const WAIT_REASONS: Unavailable[] = ["off", "global_cap", "no_provider"];

export type RubricSummary = { claimed: number; scored: number; waiting: number; retrying: number; failed: number };

export async function processRubricBatch(db: SupabaseClient, deps: EngineDeps, limit = 10): Promise<RubricSummary> {
  const summary: RubricSummary = { claimed: 0, scored: 0, waiting: 0, retrying: 0, failed: 0 };
  const { data, error } = await db.rpc("claim_rubric_batch", { p_limit: limit });
  if (error) throw new Error(`Could not claim AI rubric jobs: ${error.message}`);
  for (const job of (data as JobRow[]) ?? []) {
    summary.claimed += 1;
    const release = async (why: string, minutes: number, count: boolean) => {
      const { data: status } = await db.rpc("release_rubric_job", { p_dispatch_id: job.dispatch_id, p_error: why, p_retry_minutes: minutes, p_count_attempt: count });
      if (status === "failed") summary.failed += 1;
      else if (count) summary.retrying += 1;
      else summary.waiting += 1;
    };
    try {
      const { data: row, error: loadError } = await db.from("dispatches").select("id, body, kind, parent_id, campaign:campaigns(title, category)").eq("id", job.dispatch_id).single();
      if (loadError || !row) throw new Error(loadError?.message ?? "Dispatch not found");
      const d = row as unknown as DispatchRow & { parent_id: string | null };
      d.parent = null;
      if (d.parent_id) {
        const { data: parent } = await db.from("dispatches").select("body, hidden_at, withdrawn_at, moderation_status").eq("id", d.parent_id).maybeSingle();
        d.parent = (parent as DispatchRow["parent"]) ?? null;
      }
      // A hidden or withdrawn parent is not shown to the model.
      const parentVisible = d.parent && !d.parent.hidden_at && !d.parent.withdrawn_at && d.parent.moderation_status === "visible";
      const result = await judgeRubricWith(deps, {
        body: d.body,
        kind: d.kind,
        campaign: { title: d.campaign?.title ?? "", category: d.campaign?.category ?? "" },
        parentBody: parentVisible ? d.parent!.body : null,
      });
      if (!result.ok) {
        if (WAIT_REASONS.includes(result.why)) await release(`AI unavailable: ${result.why}`, 60, false);
        else await release(`AI rubric failed: ${result.why}`, 5 * 2 ** Math.min(Math.max(job.attempts - 1, 0), 3), true);
        continue;
      }
      const s = result.scores;
      const { error: storeError } = await db.rpc("store_rubric_score", {
        p_dispatch_id: d.id,
        p_result: {
          provider: result.record.provider,
          model: result.record.model,
          prompt_version: result.record.promptVersion,
          logic: s.logic,
          evidence: s.evidence,
          originality: s.originality,
          responsiveness: s.responsiveness,
          rationale: s.rationale,
          steelman_detected: s.steelman.present,
          steelman_confidence: Math.round(s.steelman.confidence * 100) / 100,
          steelman_note: s.steelman.note,
          output: s,
          input_tokens: result.record.inputTokens,
          output_tokens: result.record.outputTokens,
          latency_ms: result.record.latencyMs,
        },
      });
      if (storeError) throw new Error(storeError.message);
      summary.scored += 1;
    } catch (e) {
      console.error("AI rubric job failed", e instanceof Error ? e.message : e);
      await release(`Processor error: ${e instanceof Error ? e.message : String(e)}`, 5 * 2 ** Math.min(Math.max(job.attempts - 1, 0), 3), true);
    }
  }
  return summary;
}
