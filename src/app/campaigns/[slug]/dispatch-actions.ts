"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { screenDispatch } from "@/lib/ai";
import { getViewer } from "@/lib/auth";
import { getDispatchLimits, getMyReactions, getThreadPage } from "@/lib/dispatch-data";
import { dispatchInputSchema } from "@/lib/dispatch-schema";
import { MAX_SOURCES, describeDispatchError, parseSources, type DispatchRow } from "@/lib/dispatches";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation";

export type DispatchFormState = FormState & {
  /** Seconds to wait before posting again (cooldown). */
  waitSeconds?: number;
  /** Bumped on success so the form can clear itself. */
  postedAt?: number;
};

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

  // Sprint 4 hook: AI screening and the undeclared-AI check run here.
  await screenDispatch({ body: input.body, aiUse: input.aiUse });

  const supabase = await createClient();
  const { error } = await supabase.rpc("post_dispatch", {
    p_campaign_id: campaignId.data,
    p_kind: input.kind,
    p_body: input.body,
    p_ai_use: input.aiUse,
    p_parent_id: input.parentId,
    p_sources: input.sources,
  });
  if (error) return problemState(error);

  revalidatePath(`/campaigns/${slug.data}`);
  revalidatePath("/dossier");
  return {
    success: input.kind === "rebuttal" ? "Your rebuttal has been posted." : "Your Dispatch has been posted. You now follow this Campaign.",
    postedAt: Date.now(),
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
  revalidatePath(`/campaigns/${slug.data}`);
  revalidatePath("/dossier");
  return { success: "Your changes have been saved. The Dispatch now shows as edited.", postedAt: Date.now() };
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
