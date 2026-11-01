"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { POSITIONS } from "@/lib/campaigns";
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
