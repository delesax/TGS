"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { screenProfileText } from "@/lib/ai";
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

  // Display names and bios are screened when switched on in Settings (owner
  // decision 9; default: handles only). Only changed wording is screened.
  const changes: { kind: "display_name" | "bio"; field: string; value: string }[] = [];
  if (parsed.data.displayName && parsed.data.displayName !== (viewer.profile?.display_name ?? "")) changes.push({ kind: "display_name", field: "displayName", value: parsed.data.displayName });
  if (parsed.data.bio && parsed.data.bio !== (viewer.profile?.bio ?? "")) changes.push({ kind: "bio", field: "bio", value: parsed.data.bio });
  for (const change of changes) {
    const screening = await screenProfileText(change.kind, change.value, viewer.userId);
    if (screening && screening.outcome !== "allow" && screening.outcome !== "unavailable") {
      return {
        formError: "Please change the highlighted wording.",
        formHint: "Nothing has been saved yet. What you typed is still here.",
        fieldErrors: { [change.field]: screening.reason },
      };
    }
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
