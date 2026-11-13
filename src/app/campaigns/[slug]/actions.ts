"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { POSITIONS } from "@/lib/campaigns";
import { LEGAL } from "@/lib/legal";
import { hasPositionsConsent } from "@/lib/positions-consent";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const positionSchema = z.object({
  campaignId: z.uuid(),
  slug: z.string().min(1),
  stage: z.enum(["before", "after"]),
  position: z.enum(POSITIONS, "Choose For, Against or Undecided."),
});

export async function recordPosition(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) {
    return { formError: "Please sign in first.", formHint: "Sign in, then come back to this Campaign to record your position." };
  }

  const parsed = positionSchema.safeParse({
    campaignId: formData.get("campaignId"),
    slug: formData.get("slug"),
    stage: formData.get("stage"),
    position: formData.get("position") ?? undefined,
  });
  if (!parsed.success) {
    return { formError: "Please choose a position.", fieldErrors: { position: "Choose For, Against or Undecided." } };
  }
  const { campaignId, slug, stage, position } = parsed.data;

  // Recording a position is optional and needs explicit consent first (it can
  // reveal political opinion, which is special category data). The first time,
  // the box must be ticked; we store when, and which policy version.
  if (!(await hasPositionsConsent(viewer.userId))) {
    if (formData.get("consent") !== "on") {
      return {
        formError: "Please tick the box to agree before we record your position.",
        formHint: "Recording your position is optional. You can still take part in the debate without it.",
        fieldErrors: { consent: "Tick the box to agree to us recording your position, or leave your position blank." },
      };
    }
    const { error: consentError } = await createAdminClient()
      .from("profiles")
      .update({ positions_consent_at: new Date().toISOString(), positions_consent_version: LEGAL.privacyVersion })
      .eq("id", viewer.userId);
    if (consentError) {
      console.error("positions consent failed", consentError.code);
      return { formError: "We could not save your choice.", formHint: "Please try again in a moment." };
    }
  }

  const column = stage === "before" ? "before_position" : "after_position";

  // The user's own client: row-level security and the database timing rules apply.
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("campaign_positions")
    .select("campaign_id")
    .eq("campaign_id", campaignId)
    .eq("user_id", viewer.userId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("campaign_positions").update({ [column]: position }).eq("campaign_id", campaignId).eq("user_id", viewer.userId)
    : await supabase.from("campaign_positions").insert({ campaign_id: campaignId, user_id: viewer.userId, [column]: position });

  if (error) {
    const locked = /POSITION_/.test(error.message);
    console.error("recordPosition failed", error.code);
    revalidatePath(`/campaigns/${slug}`);
    return locked
      ? {
          formError: "Your position could not be recorded at this stage.",
          formHint:
            stage === "before"
              ? "The Campaign has already started, so the before position is closed. You can record where you end up instead."
              : "The Campaign has closed, so positions can no longer change.",
        }
      : { formError: "We could not save your position.", formHint: "Please try again in a moment." };
  }

  revalidatePath(`/campaigns/${slug}`);
  return { success: stage === "before" ? "Your starting position has been recorded." : "Your position now has been recorded." };
}

/** Clears the person's own position on a Campaign that is still open. */
export async function clearPosition(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { formError: "Please sign in first." };
  const campaignId = z.uuid().safeParse(formData.get("campaignId"));
  const slug = z.string().min(1).safeParse(formData.get("slug"));
  if (!campaignId.success || !slug.success) return { formError: "Something went wrong.", formHint: "Reload the page and try again." };

  const supabase = await createClient();
  const { error } = await supabase.from("campaign_positions").delete().eq("campaign_id", campaignId.data).eq("user_id", viewer.userId);
  if (error) {
    console.error("clearPosition failed", error.code);
    return { formError: "We could not clear your position.", formHint: "Please try again in a moment." };
  }
  revalidatePath(`/campaigns/${slug.data}`);
  return { success: "Your position has been cleared." };
}
