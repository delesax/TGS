"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveEmailPreferences(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { formError: "Please sign in first." };
  const stopAll = formData.get("stopAll") === "on";
  const values = stopAll
    ? { replies: false, campaign_updates: false, closing_soon: false, moderation: false, unsubscribed_all_at: new Date().toISOString() }
    : {
        replies: formData.get("replies") === "on",
        campaign_updates: formData.get("campaign_updates") === "on",
        closing_soon: formData.get("closing_soon") === "on",
        moderation: formData.get("moderation") === "on",
        // Turning any email back on undoes "stop all".
        unsubscribed_all_at: null,
      };
  const supabase = await createClient();
  const { error } = await supabase.from("notification_preferences").update(values).eq("user_id", viewer.userId);
  if (error) return { formError: "We could not save your email settings.", formHint: "Please try again in a moment." };
  revalidatePath("/profile/email");
  return { success: stopAll ? "Saved. We will not send you any emails." : "Saved. Your email settings have been updated." };
}
