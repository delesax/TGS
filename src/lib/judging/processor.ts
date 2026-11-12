import "server-only";
import { aiEngineDeps } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeDraftVerdict, processRubricBatch, type RubricSummary, type WeightsOverride } from "./compute";

// The judging processor: called by /api/judging/process (pg_cron through
// pg_net, with the shared secret) and by the admin console. Scores due
// Dispatches with the AI rubric, then computes draft Verdicts that are due.

export async function processJudging(): Promise<RubricSummary & { drafts: number; draftErrors: number }> {
  const db = createAdminClient();
  const deps = await aiEngineDeps();
  const rubric = await processRubricBatch(db, deps, 10);
  let drafts = 0;
  let draftErrors = 0;
  const { data: due, error } = await db.rpc("judging_due_campaigns");
  if (error) throw new Error(`Could not list due Campaigns: ${error.message}`);
  for (const id of (due as string[]) ?? []) {
    try {
      await computeDraftVerdict(db, id, { actorId: null, wordingDeps: deps });
      drafts += 1;
    } catch (e) {
      draftErrors += 1;
      console.error("Draft Verdict failed", e instanceof Error ? e.message : e);
    }
  }
  return { ...rubric, drafts, draftErrors };
}

/** Admin "Recompute": the caller must already be checked as an admin. */
export async function recomputeForAdmin(campaignId: string, adminId: string, override: WeightsOverride | null) {
  const db = createAdminClient();
  return computeDraftVerdict(db, campaignId, { actorId: adminId, override, wordingDeps: await aiEngineDeps() });
}
