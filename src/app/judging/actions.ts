"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const MESSAGES: Record<string, string> = {
  NOT_A_JUDGE: "You are not on the panel for this Campaign.",
  PANEL_LOCKED: "You have already submitted. Your scores are locked.",
  NOT_CLOSED: "Judging starts when the Campaign closes.",
  VERDICT_PUBLISHED: "The Verdict has been published, so scores can no longer change.",
  NOT_ELIGIBLE: "A Dispatch was hidden or withdrawn since you opened this page. Refresh and try again.",
  OWN_DISPATCH: "Judges cannot score their own Dispatches.",
  PANEL_INCOMPLETE: "Score every Dispatch before you submit. Your scores so far have been saved as a draft.",
};

const score = z.coerce.number().int().min(1).max(5);
const row = z.object({ dispatch_id: z.uuid(), logic: score, evidence: score, originality: score, responsiveness: score, comment: z.string().trim().max(1000).optional() });

/**
 * Saves the judge's scores. Rows with any criterion left blank are skipped
 * (they stay unscored). "submit" also locks the scores, after the database has
 * checked every Dispatch is scored.
 */
export async function savePanelScores(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { formError: "Sign in to judge." };
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!z.uuid().safeParse(campaignId).success) return { formError: "Something went wrong. Refresh the page." };
  const submit = formData.get("intent") === "submit";
  if (submit && formData.get("confirm") !== "on") return { formError: "Tick the box to confirm you are ready to submit.", fieldErrors: { confirm: "Tick this to submit." } };

  const ids = formData.getAll("dispatch").map(String);
  const rows: z.infer<typeof row>[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const id of ids) {
    const raw = {
      dispatch_id: id,
      logic: formData.get(`${id}.logic`),
      evidence: formData.get(`${id}.evidence`),
      originality: formData.get(`${id}.originality`),
      responsiveness: formData.get(`${id}.responsiveness`),
      comment: String(formData.get(`${id}.comment`) ?? ""),
    };
    if (!raw.logic && !raw.evidence && !raw.originality && !raw.responsiveness) continue;
    const parsed = row.safeParse(raw);
    if (!parsed.success) {
      fieldErrors[id] = "Give all four scores (1 to 5), or leave all four blank for now.";
      continue;
    }
    rows.push(parsed.data);
  }
  if (Object.keys(fieldErrors).length) return { formError: "Some Dispatches have only some of their scores. Nothing was saved.", fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: rows, p_submit: false });
  if (error) {
    const code = /^([A-Z_]+):/.exec(error.message)?.[1];
    return { formError: (code && MESSAGES[code]) || "We could not save your scores.", formHint: "Your answers are still on this page. Try again in a moment." };
  }
  if (submit) {
    const { error: submitError } = await supabase.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: [], p_submit: true });
    if (submitError) {
      const code = /^([A-Z_]+):/.exec(submitError.message)?.[1];
      return { formError: (code && MESSAGES[code]) || "We saved your scores as a draft but could not submit them.", formHint: "Check every Dispatch has all four scores." };
    }
    revalidatePath(`/judging/${campaignId}`);
    revalidatePath("/judging");
    return { success: "Submitted. Your scores are locked and will be part of the Verdict. Thank you." };
  }
  return { success: `Draft saved (${rows.length} Dispatch${rows.length === 1 ? "" : "es"} scored). You can come back and change it until you submit.` };
}
