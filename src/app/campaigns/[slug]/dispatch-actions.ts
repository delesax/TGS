"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { coachDispatch, getAiSettings, nudgeDispatch, type CoachAnswer } from "@/lib/ai";
import { getViewer } from "@/lib/auth";
import { getDispatchLimits, getMyReactions, getThreadPage } from "@/lib/dispatch-data";
import { dispatchInputSchema } from "@/lib/dispatch-schema";
import { MAX_SOURCES, describeDispatchError, parseSources, type DispatchRow } from "@/lib/dispatches";
import { screenAndApply, type ModerationStatus } from "@/lib/moderation";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation";

export type DispatchFormState = FormState & {
  /** Seconds to wait before posting again (cooldown). */
  waitSeconds?: number;
  /** Bumped on success so the form can clear itself. */
  postedAt?: number;
  /** Private nudge about tone, shown only to the author. Never blocks posting. */
  nudge?: string;
  /** Where the Dispatch stands after screening. */
  status?: ModerationStatus;
};

/** Screens straight away. If that fails, the Dispatch stays pending and the sweeper retries within minutes. */
async function screenNow(id: string): Promise<ModerationStatus> {
  try {
    return await screenAndApply(id);
  } catch (e) {
    console.error("Screening after posting failed; the sweeper will retry", e instanceof Error ? e.message : e);
    return "pending";
  }
}

function statusWords(status: ModerationStatus, posted: string): string {
  if (status === "held") return "Your Dispatch is saved, but a person will check it before others can see it. Only you can see it for now.";
  if (status === "pending") return "Your Dispatch is saved. We are still checking it; it will appear for others shortly.";
  return posted;
}

async function campaignTitle(campaignId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("title").eq("id", campaignId).maybeSingle<{ title: string }>();
  return data?.title ?? null;
}

const SIGN_IN: DispatchFormState = { formError: "Please sign in first.", formHint: "Sign in, then come back to this Campaign." };

function readSources(formData: FormData) {
  return Array.from({ length: MAX_SOURCES }, (_, i) => ({
    url: String(formData.get(`source${i + 1}Url`) ?? ""),
    title: String(formData.get(`source${i + 1}Title`) ?? ""),
  }));
}

function problemState(error: { message?: string; details?: string | null }): DispatchFormState {
  const problem = describeDispatchError(error);
  if (problem.code === "UNKNOWN") console.error("Dispatch write failed", error.message);
  return {
    formError: problem.message,
    formHint: problem.hint,
    fieldErrors: problem.field ? { [problem.field]: problem.message } : undefined,
    waitSeconds: problem.waitSeconds,
  };
}

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);

export async function postDispatch(_prev: DispatchFormState, formData: FormData): Promise<DispatchFormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return SIGN_IN;
  const slug = slugSchema.safeParse(formData.get("slug"));
  const campaignId = z.uuid().safeParse(formData.get("campaignId"));
  if (!slug.success || !campaignId.success) return { formError: "Something went wrong.", formHint: "Reload the page and try again." };

  const { sources, errors: sourceErrors } = parseSources(readSources(formData));
  const limits = await getDispatchLimits();
  const parsed = dispatchInputSchema(limits).safeParse({
    kind: formData.get("kind") ?? undefined,
    body: String(formData.get("body") ?? ""),
    aiUse: formData.get("aiUse") ?? undefined,
    parentId: formData.get("parentId") || null,
    sources,
  });
  if (!parsed.success || Object.keys(sourceErrors).length) {
    return {
      formError: "Please check the highlighted answers.",
      fieldErrors: { ...(parsed.success ? {} : fieldErrors(parsed.error)), ...sourceErrors },
    };
  }
  const input = parsed.data;

  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("post_dispatch", {
    p_campaign_id: campaignId.data,
    p_kind: input.kind,
    p_body: input.body,
    p_ai_use: input.aiUse,
    p_parent_id: input.parentId,
    p_sources: input.sources,
  });
  if (error) return problemState(error);

  // Screening decides who can see it. The nudge runs alongside: it never
  // blocks posting, and the author can still edit within the edit window.
  const settings = await getAiSettings();
  const title = settings.nudge_on_submit ? await campaignTitle(campaignId.data) : null;
  const [status, nudge] = await Promise.all([
    screenNow(newId as string),
    title ? nudgeDispatch(input.body, { id: campaignId.data, title }, viewer.userId).catch(() => ({ nudge: null })) : Promise.resolve({ nudge: null }),
  ]);

  revalidatePath(`/campaigns/${slug.data}`);
  revalidatePath("/dossier");
  return {
    success: statusWords(status, input.kind === "rebuttal" ? "Your rebuttal has been posted." : "Your Dispatch has been posted. You now follow this Campaign."),
    postedAt: Date.now(),
    status,
    nudge: nudge.nudge ?? undefined,
  };
}

export async function editDispatch(_prev: DispatchFormState, formData: FormData): Promise<DispatchFormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return SIGN_IN;
  const id = z.uuid().safeParse(formData.get("dispatchId"));
  const slug = slugSchema.safeParse(formData.get("slug"));
  if (!id.success || !slug.success) return { formError: "Something went wrong.", formHint: "Reload the page and try again." };

  const { sources, errors: sourceErrors } = parseSources(readSources(formData));
  const limits = await getDispatchLimits();
  const parsed = dispatchInputSchema(limits).safeParse({
    kind: formData.get("kind") ?? undefined,
    body: String(formData.get("body") ?? ""),
    aiUse: formData.get("aiUse") ?? undefined,
    parentId: formData.get("parentId") || null,
    sources,
  });
  if (!parsed.success || Object.keys(sourceErrors).length) {
    return {
      formError: "Please check the highlighted answers.",
      fieldErrors: { ...(parsed.success ? {} : fieldErrors(parsed.error)), ...sourceErrors },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("edit_dispatch", {
    p_id: id.data,
    p_body: parsed.data.body,
    p_ai_use: parsed.data.aiUse,
    p_sources: parsed.data.sources,
  });
  if (error) return problemState(error);
  // An edited Dispatch is screened again before others see the new text.
  const status = await screenNow(id.data);
  revalidatePath(`/campaigns/${slug.data}`);
  revalidatePath("/dossier");
  return { success: statusWords(status, "Your changes have been saved. The Dispatch now shows as edited."), postedAt: Date.now(), status };
}

export type ActionResult = { ok: true } | { ok: false; message: string; hint?: string };

export async function withdrawDispatch(dispatchId: string, slug: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { ok: false, message: "Please sign in first." };
  if (!z.uuid().safeParse(dispatchId).success) return { ok: false, message: "Something went wrong." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_dispatch", { p_id: dispatchId });
  if (error) {
    const problem = describeDispatchError(error);
    return { ok: false, message: problem.message, hint: problem.hint };
  }
  if (slugSchema.safeParse(slug).success) revalidatePath(`/campaigns/${slug}`);
  revalidatePath("/dossier");
  return { ok: true };
}

export type ReactionResult = { ok: true; on: boolean } | { ok: false; message: string };

export async function toggleReaction(dispatchId: string, reaction: string): Promise<ReactionResult> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { ok: false, message: "Please sign in to react." };
  if (!z.uuid().safeParse(dispatchId).success || !/^[a-z_]{2,30}$/.test(reaction)) return { ok: false, message: "Something went wrong." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_reaction", { p_dispatch_id: dispatchId, p_reaction: reaction });
  if (error) return { ok: false, message: describeDispatchError(error).message };
  return { ok: true, on: data === true };
}

const REPORT_REASONS = ["harassment", "hate", "impersonation", "misleading", "spam", "off_topic", "other"] as const;

export async function reportDispatch(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return SIGN_IN;
  const parsed = z
    .object({
      dispatchId: z.uuid(),
      reason: z.enum(REPORT_REASONS, "Choose a reason."),
      details: z.string().trim().max(500, "Keep the details to 500 characters or fewer."),
    })
    .safeParse({ dispatchId: formData.get("dispatchId"), reason: formData.get("reason") ?? undefined, details: String(formData.get("details") ?? "") });
  if (!parsed.success) return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("report_dispatch", {
    p_dispatch_id: parsed.data.dispatchId,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details || null,
  });
  if (error) return { formError: describeDispatchError(error).message, formHint: "Please try again in a moment." };
  return { success: "Thank you. Your report has been sent to the TGS team, who will review it." };
}

export async function setCampaignFollow(campaignId: string, slug: string, follow: boolean): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { ok: false, message: "Please sign in to follow Campaigns." };
  if (!z.uuid().safeParse(campaignId).success) return { ok: false, message: "Something went wrong." };
  const supabase = await createClient();
  const { error } = follow
    ? await supabase.from("campaign_follows").upsert({ user_id: viewer.userId, campaign_id: campaignId }, { onConflict: "user_id,campaign_id", ignoreDuplicates: true })
    : await supabase.from("campaign_follows").delete().eq("user_id", viewer.userId).eq("campaign_id", campaignId);
  if (error) return { ok: false, message: "We could not update your follows. Please try again." };
  if (slugSchema.safeParse(slug).success) revalidatePath(`/campaigns/${slug}`);
  revalidatePath("/dossier");
  return { ok: true };
}

export type MoreThreads = { rows: DispatchRow[]; nextBefore: string | null; myReactions: Record<string, string[]> } | { error: string };

/** "Show more": the next 20 threads. A server action, so nothing is cached. */
export async function loadMoreThreads(campaignId: string, before: string): Promise<MoreThreads> {
  if (!z.uuid().safeParse(campaignId).success || Number.isNaN(Date.parse(before))) return { error: "Something went wrong." };
  try {
    const [page, viewer] = await Promise.all([getThreadPage(campaignId, before), getViewer()]);
    const myReactions = viewer ? await getMyReactions(page.rows.map((r) => r.id), viewer.userId) : {};
    return { ...page, myReactions };
  } catch {
    return { error: "We could not load more Dispatches. Check your connection and try again." };
  }
}

// ---------------------------------------------------------------------------
// Private AI help while composing (src/lib/ai). Shown to the author only.
// ---------------------------------------------------------------------------

const draftSchema = z.object({ campaignId: z.uuid(), body: z.string().trim().min(1).max(5000) });

export type NudgeCheck = { ok: true; nudge: string | null } | { ok: false; message: string };

/** "Check my tone": a quick, private nudge on request. */
export async function checkTone(campaignId: string, body: string): Promise<NudgeCheck> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { ok: false, message: "Please sign in first." };
  const parsed = draftSchema.safeParse({ campaignId, body });
  if (!parsed.success) return { ok: false, message: "Write something first, then check it." };
  const title = await campaignTitle(parsed.data.campaignId);
  if (!title) return { ok: false, message: "We could not find this Campaign." };
  const result = await nudgeDispatch(parsed.data.body, { id: parsed.data.campaignId, title }, viewer.userId);
  if (!result.available) return { ok: false, message: "The tone check is not available at the moment. You can still post." };
  return { ok: true, nudge: result.nudge };
}

export type CoachReply = CoachAnswer | { ok: false; reason: "signed_out" | "invalid"; usesLeft: number };

/** "Get feedback": private coaching on a draft. The draft itself is not stored. */
export async function getCoachFeedback(campaignId: string, body: string, kind: string, draftKey: string): Promise<CoachReply> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { ok: false, reason: "signed_out", usesLeft: 0 };
  const parsed = draftSchema.extend({ draftKey: z.uuid(), kind: z.enum(["argument", "rebuttal", "evidence"]) }).safeParse({ campaignId, body, draftKey, kind });
  if (!parsed.success) return { ok: false, reason: "invalid", usesLeft: 0 };
  const title = await campaignTitle(parsed.data.campaignId);
  if (!title) return { ok: false, reason: "invalid", usesLeft: 0 };
  return coachDispatch(parsed.data.body, { id: parsed.data.campaignId, title }, parsed.data.kind, viewer.userId, parsed.data.draftKey);
}

export async function rateCoachFeedback(decisionId: string, helpful: boolean, comment: string): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { ok: false, message: "Please sign in first." };
  const parsed = z.object({ id: z.uuid(), comment: z.string().trim().max(500, "Keep the comment to 500 characters or fewer.") }).safeParse({ id: decisionId, comment });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("rate_coach_feedback", { p_decision_id: parsed.data.id, p_helpful: helpful, p_comment: parsed.data.comment || null });
  if (error) return { ok: false, message: "We could not save your rating. Please try again." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Appeals: once per held or hidden Dispatch
// ---------------------------------------------------------------------------

export async function appealDispatch(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return SIGN_IN;
  const parsed = z
    .object({
      dispatchId: z.uuid(),
      reason: z.string().trim().min(1, "Say briefly why you think the decision is wrong.").max(500, "Keep it to 500 characters or fewer."),
    })
    .safeParse({ dispatchId: formData.get("dispatchId"), reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { formError: "Please check the highlighted answer.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("appeal_dispatch", { p_dispatch_id: parsed.data.dispatchId, p_reason: parsed.data.reason });
  if (error) {
    const code = /^([A-Z_]+):/.exec(error.message)?.[1];
    if (code === "ALREADY_APPEALED") return { formError: "You have already appealed this Dispatch.", formHint: "Each Dispatch can be appealed once. A person will reply by email." };
    if (code === "NOT_APPEALABLE") return { formError: "This Dispatch cannot be appealed.", formHint: "Only a held or hidden Dispatch can be appealed." };
    return { formError: "We could not send your appeal.", formHint: "Please try again in a moment. What you typed is still here." };
  }
  // No revalidation here: any revalidation re-renders this page, remounting the
  // thread and hiding this confirmation. The panel's Close button refreshes it
  // (the Dossier is rendered fresh on every visit).
  return { success: "Your appeal has been sent. A person will look at it and you will hear the outcome by email." };
}
