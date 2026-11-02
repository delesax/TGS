import "server-only";
import { screenDispatch } from "@/lib/ai";
import { screeningPayload } from "@/lib/ai/payload";
import { createAdminClient } from "@/lib/supabase/admin";

// Screening a Dispatch and applying the result. Called straight after posting
// or editing, and by the sweeper (/api/moderation/sweep) for any Dispatch
// left pending for 2 minutes. The database function decides the effect, so
// the rules live in one place.

export type ModerationStatus = "pending" | "visible" | "held" | "removed";

type PendingRow = {
  id: string;
  body: string;
  ai_use: "none" | "assisted" | "generated";
  screening: string;
  moderation_status: ModerationStatus;
  campaign: { title: string; category: string; is_sensitive: boolean } | null;
};

/** Screens one Dispatch if it is still waiting, and returns its status afterwards. */
export async function screenAndApply(dispatchId: string): Promise<ModerationStatus> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("dispatches")
    .select("id, body, ai_use, screening, moderation_status, campaign:campaigns(title, category, is_sensitive)")
    .eq("id", dispatchId)
    .single();
  if (error || !data) throw new Error("Could not load the Dispatch to screen");
  const row = data as unknown as PendingRow;
  if (row.screening !== "awaiting" || row.moderation_status !== "pending") return row.moderation_status;

  const result = await screenDispatch({
    body: row.body,
    aiUse: row.ai_use,
    campaign: { title: row.campaign?.title ?? "", category: row.campaign?.category ?? "", isSensitive: Boolean(row.campaign?.is_sensitive) },
  });
  const { data: status, error: applyError } = await db.rpc("apply_dispatch_screening", { p_dispatch_id: dispatchId, p_result: screeningPayload(result) });
  if (applyError) throw new Error(`Could not apply screening: ${applyError.message}`);
  return status as ModerationStatus;
}

/** The sweeper: re-screens Dispatches stuck in "Checking…" for 2 minutes or more. */
export async function sweepPending(limit = 20): Promise<{ claimed: number; visible: number; held: number; failed: number }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_pending_screening", { p_limit: limit });
  if (error) throw new Error(`Could not claim pending Dispatches: ${error.message}`);
  const summary = { claimed: 0, visible: 0, held: 0, failed: 0 };
  for (const row of (data as { id: string }[]) ?? []) {
    summary.claimed += 1;
    try {
      const status = await screenAndApply(row.id);
      if (status === "visible") summary.visible += 1;
      else if (status === "held") summary.held += 1;
    } catch (e) {
      summary.failed += 1;
      console.error("Sweep failed for a Dispatch", e instanceof Error ? e.message : e);
    }
  }
  return summary;
}
