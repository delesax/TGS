"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, profileSchema } from "@/lib/validation";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { formError: "You have been signed out.", formHint: "Please sign in again. Your changes were not saved." };

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    expertiseTag: formData.get("expertiseTag") ?? "",
    bio: formData.get("bio") ?? "",
  });
  if (!parsed.success) {
    return { formError: "Please check the highlighted answers.", fieldErrors: fieldErrors(parsed.error) };
  }

  // Uses the signed-in user's own client, so row-level security applies.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName || null,
      expertise_tag: parsed.data.expertiseTag || null,
      bio: parsed.data.bio || null,
    })
    .eq("id", viewer.userId);

  if (error) {
    console.error("updateProfile failed", error.code);
    return { formError: "We could not save your changes.", formHint: "Please try again in a moment. What you typed is still here." };
  }

  revalidatePath("/profile");
  revalidatePath("/dossier");
  return { success: "Your profile has been saved." };
}
