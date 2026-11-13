"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { recomputeForAdmin } from "@/lib/judging/processor";
import { createClient } from "@/lib/supabase/server";

// Judging admin actions. Each checks the admin role here and again in the
// database (the functions read the JWT role claim). Recompute runs with the
// service role on the server, after the role check below, and records the
// admin as the actor. Everything is audit-logged by the database.

async function admin() {
  const viewer = await getViewer();
  return viewer?.isAdmin ? viewer : null;
}

const MESSAGES: Record<string, string> = {
  NOT_ADMIN: "Only admins can do this.",
  NOT_FOUND: "That item no longer exists or has already been dealt with.",
  NO_SUCH_STRATEGIST: "No Strategist has that handle.",
  VERDICT_PUBLISHED: "The Verdict is already published. Changes now go through an appeal.",
  VERDICT_FINAL: "This Verdict is final.",
  PANEL_LOCKED: "This judge has submitted; their scores are locked.",
  NOT_DRAFT: "Only a draft can be changed. Refresh the page.",
  NEEDS_ATTENTION: "Resolve the items flagged on this draft first, then recompute.",
  NO_WINNER: "This draft names no Grand Strategist.",
  NOT_CLOSED: "The Campaign has not closed yet.",
  REASON_REQUIRED: "Give a reason. It is kept in the audit log.",
  WEIGHTS_SUM: "The four weights must be whole numbers adding up to 100.",
  WINDOWS_ORDER: "The judging window must be at least as long as the peer voting window.",
  BAD_SCORES: "Each score must be a whole number from 1 to 5.",
  RATIONALE_LENGTH: "The rationale must be 1 to 8,000 characters.",
};

function problem(message: string | undefined, fallback: string): FormState {
  const code = /^([A-Z_]+):/.exec(message ?? "")?.[1];
  return { formError: (code && MESSAGES[code]) || fallback, formHint: "Refresh the page to see the latest state." };
}

const uuid = z.uuid();
const reason = z.string().trim().min(1).max(500);
// No revalidation where the form itself disappears once the action succeeds
// (publish, an appeal decision, removing a judge): any revalidation re-renders
// this page and the confirmation would vanish with its form. It stays on
// screen until the page is reloaded, as in the moderation queue.
const kept = (message: string): FormState => ({ success: `${message} Reload the page to see the latest state.` });
const done = (campaignId: string, message: string): FormState => {
  revalidatePath(`/admin/judging/${campaignId}`);
  revalidatePath("/admin/judging");
  return { success: message };
};

export async function assignJudge(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { formError: "Only admins can do this." };
  const campaignId = String(fd.get("campaignId") ?? "");
  const handle = String(fd.get("handle") ?? "").trim();
  if (!uuid.safeParse(campaignId).success || !handle) return { formError: "Enter the judge's handle.", fieldErrors: { handle: "Enter a handle, for example @Ada" } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assign_judge", { p_campaign_id: campaignId, p_handle: handle });
  if (error) return problem(error.message, "We could not assign that judge.");
  const r = data as { already_assigned: boolean; is_participant: boolean };
  if (r.already_assigned) return { success: "That Strategist is already on the panel." };
  return done(
    campaignId,
    `Assigned and emailed.${r.is_participant ? " Note: they posted in this Campaign. They will not be shown their own Dispatches, but consider a judge who did not take part." : ""}`,
  );
}

export async function unassignJudge(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { formError: "Only admins can do this." };
  const campaignId = String(fd.get("campaignId") ?? "");
  const judgeId = String(fd.get("judgeId") ?? "");
  const why = reason.safeParse(fd.get("reason"));
  if (!why.success) return { formError: MESSAGES.REASON_REQUIRED };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unassign_judge", { p_campaign_id: campaignId, p_judge_id: judgeId, p_reason: why.data });
  if (error) return problem(error.message, "We could not remove that judge.");
  void campaignId;
  return kept("Removed from the panel. Their draft scores were discarded.");
}

const weight = z.coerce.number().int().min(0).max(100);

export async function recomputeVerdict(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await admin();
  if (!viewer) return { formError: "Only admins can do this." };
  const campaignId = String(fd.get("campaignId") ?? "");
  if (!uuid.safeParse(campaignId).success) return { formError: "Something went wrong." };
  let override = null;
  if (fd.get("override") === "on") {
    const parsed = z
      .object({ panel: weight, peer: weight, ai_rubric: weight, mind_change: weight, reason: z.string().trim().min(1, "Say why").max(500) })
      .safeParse({ panel: fd.get("panel"), peer: fd.get("peer"), ai_rubric: fd.get("ai_rubric"), mind_change: fd.get("mind_change"), reason: fd.get("reason") });
    if (!parsed.success) return { formError: "Check the override weights and give a reason." };
    override = parsed.data;
  }
  try {
    const { result } = await recomputeForAdmin(campaignId, viewer.userId, override);
    return done(
      campaignId,
      result.attention.length
        ? `New draft computed. It needs attention: ${result.attention.length} item${result.attention.length === 1 ? "" : "s"} below.`
        : "New draft computed. Review it below, then publish.",
    );
  } catch (e) {
    return problem(e instanceof Error ? e.message : undefined, "We could not compute a draft.");
  }
}

export async function editRationale(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { formError: "Only admins can do this." };
  const campaignId = String(fd.get("campaignId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("edit_verdict_rationale", { p_verdict_id: String(fd.get("verdictId") ?? ""), p_rationale: String(fd.get("rationale") ?? "") });
  if (error) return problem(error.message, "We could not save the rationale.");
  return done(campaignId, "Rationale saved. The edit is in the audit log.");
}

export async function publishVerdict(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { formError: "Only admins can do this." };
  if (fd.get("confirm") !== "on") return { formError: "Tick the box to confirm.", fieldErrors: { confirm: "Tick this to publish." } };
  const campaignId = String(fd.get("campaignId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_verdict", { p_verdict_id: String(fd.get("verdictId") ?? "") });
  if (error) return problem(error.message, "We could not publish the Verdict.");
  // The public pages are rendered fresh on every visit, so nothing to revalidate.
  void campaignId;
  return kept("Published. Awards are issued, Dossiers and the leaderboard are updated, and participants are being emailed.");
}

export async function decideAppeal(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { formError: "Only admins can do this." };
  const campaignId = String(fd.get("campaignId") ?? "");
  const outcome = String(fd.get("outcome") ?? "");
  const why = z.string().trim().min(1).max(1000).safeParse(fd.get("reason"));
  if (!["upheld", "rejected"].includes(outcome)) return { formError: "Choose upheld or rejected." };
  if (!why.success) return { formError: MESSAGES.REASON_REQUIRED };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_verdict_appeal", { p_appeal_id: String(fd.get("appealId") ?? ""), p_outcome: outcome, p_reason: why.data });
  if (error) return problem(error.message, "We could not record that decision.");
  void campaignId;
  return kept(outcome === "upheld" ? "Upheld. Recompute (with new weights if needed) and publish a revised Verdict; it will replace this one." : "Rejected. The appellant has been told.");
}

const crit = z.coerce.number().int().min(1).max(5);

export async function overrideAiScore(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { formError: "Only admins can do this." };
  const campaignId = String(fd.get("campaignId") ?? "");
  const parsed = z
    .object({ logic: crit, evidence: crit, originality: crit, responsiveness: crit, reason: z.string().trim().min(1).max(500) })
    .safeParse({ logic: fd.get("logic"), evidence: fd.get("evidence"), originality: fd.get("originality"), responsiveness: fd.get("responsiveness"), reason: fd.get("reason") });
  if (!parsed.success) return { formError: "Give four whole numbers from 1 to 5 and a reason." };
  const { reason: why, ...scores } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("override_ai_rubric_score", { p_score_id: String(fd.get("scoreId") ?? ""), p_scores: scores, p_reason: why });
  if (error) return problem(error.message, "We could not save the override.");
  return done(campaignId, "Override saved. Recompute the draft to use it.");
}

export async function requeueRubric(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { formError: "Only admins can do this." };
  const campaignId = String(fd.get("campaignId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("requeue_rubric_job", { p_dispatch_id: String(fd.get("dispatchId") ?? "") });
  if (error) return problem(error.message, "We could not queue it.");
  return done(campaignId, "Queued for AI scoring. It will run within a few minutes.");
}

const hours = z.coerce.number().int();

export async function saveJudgingSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  if (!(await admin())) return { formError: "Only admins can do this." };
  const parsed = z
    .object({
      peer: hours.min(1).max(720),
      judging: hours.min(1).max(1440),
      credits: hours.min(1).max(50),
      appeal: hours.min(1).max(60),
      minAge: hours.min(0).max(720),
      maxSteelman: hours.min(1).max(20),
      spanHours: hours.min(0).max(720),
    })
    .safeParse({ peer: fd.get("peer_window_hours"), judging: fd.get("judging_window_hours"), credits: fd.get("peer_vote_credits"), appeal: fd.get("appeal_window_days"), minAge: fd.get("min_voter_account_age_hours"), maxSteelman: fd.get("max_steelman_confirmations"), spanHours: fd.get("min_position_span_hours") });
  if (!parsed.success) return { formError: "Check the numbers: peer window 1-720 hours, judging window 1-1440 hours, 1-50 votes, 1-60 days, account age 0-720 hours, 1-20 steelman confirmations, position span 0-720 hours." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_judging_settings", {
    p_peer_window_hours: parsed.data.peer,
    p_judging_window_hours: parsed.data.judging,
    p_peer_vote_credits: parsed.data.credits,
    p_appeal_window_days: parsed.data.appeal,
    p_ai_rationale_wording: fd.get("ai_rationale_wording") === "on",
    p_min_voter_account_age_hours: parsed.data.minAge,
    p_max_steelman_confirmations: parsed.data.maxSteelman,
    p_min_position_span_hours: parsed.data.spanHours,
  });
  if (error) return problem(error.message, "We could not save the settings.");
  revalidatePath("/admin/judging");
  return { success: "Saved. The change is in the audit log." };
}
