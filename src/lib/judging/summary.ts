import "server-only";
import { aiEngineDeps } from "@/lib/ai";
import { judgeSummaryWith } from "@/lib/ai/engine";
import type { Unavailable } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/admin";

// The winner's summary: an AI DRAFT of the winner's own Dispatches, stored in verdict_summary_drafts (admin-only). It reaches the
// public Verdict only when an admin approves it (approve_verdict_summary). Drafting is on demand from Admin, never automatic,
// and nothing here reads or writes scores, rankings, awards or the blend.

export type DraftSummaryResult = { ok: true; draftId: string } | { ok: false; message: string };

const WHY: Record<Unavailable | "no_dispatches", string> = {
  off: "AI is switched off in Settings.",
  no_provider: "No AI provider is configured.",
  global_cap: "The daily AI limit has been reached. Try again tomorrow or raise the limit in Settings.",
  user_cap: "The daily AI limit has been reached.",
  coach_cap: "The daily AI limit has been reached.",
  too_long: "The winner's Dispatches are too long to summarise.",
  timeout: "The AI took too long. Try again.",
  invalid_output: "The AI's answer did not pass the checks (for example an invented quotation or figure). Try again, or write the summary yourself.",
  error: "The AI could not be reached. Try again, or write the summary yourself.",
  no_dispatches: "The winner has no visible Dispatches to summarise.",
};

/** The caller must already have been checked as an admin (see the server action). */
export async function draftWinnerSummary(verdictId: string, adminId: string): Promise<DraftSummaryResult> {
  const db = createAdminClient();
  const { data: v } = await db.from("verdicts").select("id, campaign_id, status, winner_id").eq("id", verdictId).maybeSingle();
  if (!v || v.status !== "draft") return { ok: false, message: "Only a draft Verdict can take a summary. Refresh the page." };
  if (!v.winner_id) return { ok: false, message: "This draft names no Grand Strategist." };
  const [{ data: campaign }, { data: rows }] = await Promise.all([
    db.from("campaigns").select("title").eq("id", v.campaign_id).maybeSingle(),
    db
      .from("dispatches")
      .select("id, kind, body, sources")
      .eq("campaign_id", v.campaign_id)
      .eq("author_id", v.winner_id)
      .eq("moderation_status", "visible")
      .is("withdrawn_at", null)
      .is("hidden_at", null)
      .order("created_at")
      .limit(100),
  ]);
  const result = await judgeSummaryWith(await aiEngineDeps(), {
    topic: campaign?.title ?? "",
    dispatches: (rows ?? []).map((r) => ({ id: r.id as string, kind: r.kind as string, body: r.body as string, sources: r.sources as { url: string; title?: string | null }[] | null })),
  });
  if (!result.ok) return { ok: false, message: WHY[result.why] ?? WHY.error };
  const { data, error } = await db.rpc("store_verdict_summary_draft", {
    p_verdict_id: v.id,
    p_actor: adminId,
    p_draft: {
      winner_id: v.winner_id,
      summary: result.summary,
      best_dispatch_id: result.bestDispatchId,
      model: result.record.model,
      prompt_version: result.record.promptVersion,
      input_dispatch_ids: result.inputDispatchIds,
      output: {
        provider: result.record.provider,
        latency_ms: result.record.latencyMs,
        usage: { input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens, estimated_cost_usd: result.usage.estimatedCostUsd },
      },
    },
  });
  if (error) return { ok: false, message: /DRAFT_LIMIT/.test(error.message) ? "Five drafts is the limit for one Verdict. Edit the latest one instead." : "We could not save the draft." };
  return { ok: true, draftId: data as string };
}
