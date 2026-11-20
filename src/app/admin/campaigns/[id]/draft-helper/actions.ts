"use server";

import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { aiEngineDeps } from "@/lib/ai";
import { campaignDraftWith } from "@/lib/ai/campaign-draft";
import { CAMPAIGN_NOTES_MAX_CHARS, CAMPAIGN_NOTES_MIN_CHARS } from "@/lib/campaign-draft-limits";
import type { CampaignDraftOutput } from "@/lib/ai/schemas";
import type { Unavailable } from "@/lib/ai/types";
import { getCampaign } from "@/lib/campaign-data";
import { hashSubject, withinLimit } from "@/lib/rate-limit";

// Drafts text for an admin to read and copy. It saves nothing: no Campaign field, no table, no log of the notes or the draft.

export type DraftHelperState = FormState & {
  draft?: CampaignDraftOutput;
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
};

const WHY: Record<Unavailable | "notes_too_short" | "notes_too_long", string> = {
  off: "AI is switched off in Settings.",
  no_provider: "No AI provider is configured.",
  global_cap: "The daily AI limit has been reached. Try again tomorrow or raise the limit in Settings.",
  user_cap: "The daily AI limit has been reached.",
  coach_cap: "The daily AI limit has been reached.",
  too_long: "Your notes are too long.",
  notes_too_short: `Paste at least ${CAMPAIGN_NOTES_MIN_CHARS} characters of notes.`,
  notes_too_long: `Your notes are over ${CAMPAIGN_NOTES_MAX_CHARS.toLocaleString("en-GB")} characters. Shorten them.`,
  timeout: "The AI took too long. Try again.",
  invalid_output: "The draft did not pass the checks (for example a figure, date or quotation that is not in your notes). Nothing is shown. Try again, or write it yourself.",
  error: "The AI could not be reached. Try again.",
};

export async function draftCampaignText(_prev: DraftHelperState, formData: FormData): Promise<DraftHelperState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { formError: "Only admins can do this." };
  const id = z.uuid().safeParse(formData.get("campaignId"));
  if (!id.success) return { formError: "That Campaign could not be found." };
  const campaign = await getCampaign({ id: id.data });
  if (!campaign) return { formError: "That Campaign could not be found." };

  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length < CAMPAIGN_NOTES_MIN_CHARS) return { formError: "Please check the highlighted answers.", fieldErrors: { notes: WHY.notes_too_short } };
  if (notes.length > CAMPAIGN_NOTES_MAX_CHARS) return { formError: "Please check the highlighted answers.", fieldErrors: { notes: WHY.notes_too_long } };

  // 10 a day per admin. Counted before the call, so a draft that fails the checks still counts.
  if (!(await withinLimit("campaign_draft_admin", hashSubject(viewer.userId)))) {
    return { formError: "You have used your 10 drafts for today.", formHint: "The count starts again at 00:00 UTC. Nothing was sent." };
  }

  const result = await campaignDraftWith(await aiEngineDeps(), { title: campaign.title, notes });
  if (!result.ok) return { formError: WHY[result.why] ?? WHY.error, ...(result.problems?.length ? { formHint: `First problem found: ${result.problems[0]}` } : {}) };
  return { draft: result.draft, usage: result.usage, success: "Draft ready below. Verify every fact before using any of it." };
}
