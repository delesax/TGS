"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { screenHandle } from "@/lib/ai";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleSchema } from "@/lib/validation";

/**
 * Screens the chosen handle and, if it passes, saves it. The handle column
 * cannot be written from the browser, so this server action is the only way in.
 * Every screening decision is stored in ai_decisions for admin review.
 */
export async function chooseHandle(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/onboarding");
  if (viewer.profile?.handle) redirect("/dossier");

  const parsed = handleSchema.safeParse(formData.get("handle"));
  if (!parsed.success) {
    return { formError: "Please choose a different handle.", fieldErrors: { handle: parsed.error.issues[0].message } };
  }
  const handle = parsed.data;
  const admin = createAdminClient();

  // Case-insensitive match; "_" is a wildcard in ILIKE, so escape it.
  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .ilike("handle", handle.replace(/_/g, "\\_"))
    .neq("id", viewer.userId)
    .maybeSingle();
  if (taken) {
    return {
      formError: "That handle is already taken.",
      fieldErrors: { handle: `Someone is already using @${handle}. Try adding a word or a number.` },
    };
  }

  const screening = await screenHandle(handle);
  await admin.from("ai_decisions").insert({
    subject_type: "handle",
    subject_id: handle,
    user_id: viewer.userId,
    model: screening.model,
    prompt_version: screening.promptVersion,
    outcome: screening.outcome,
    reason: screening.reason,
    output: screening.output,
  });

  if (screening.outcome !== "allow") {
    return { formError: "That handle cannot be used.", fieldErrors: { handle: screening.reason } };
  }

  const { error } = await admin
    .from("profiles")
    .update({ handle, handle_set_at: new Date().toISOString() })
    .eq("id", viewer.userId)
    .is("handle", null);

  if (error) {
    // 23505: unique violation, someone took it a moment ago.
    if (error.code === "23505") {
      return { formError: "That handle is already taken.", fieldErrors: { handle: `Someone has just taken @${handle}. Please try another.` } };
    }
    console.error("chooseHandle update failed", error.code);
    return { formError: "We could not save your handle.", formHint: "Please try again in a moment." };
  }

  await admin.from("audit_log").insert({
    actor_id: viewer.userId,
    action: "profile.handle_set",
    target_table: "profiles",
    target_id: viewer.userId,
    details: { handle },
  });

  redirect("/dossier?welcome=1");
}
