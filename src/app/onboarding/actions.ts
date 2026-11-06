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
 * Every screening decision is stored in ai_decisions for admin review. A
 * handle the AI does not allow waits for a person (the admin moderation
 * queue); the Strategist can choose another in the meantime.
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

  // A deleted account (tombstone) can never get a handle. getViewer() already treats
  // it as signed out; this and the database trigger are the backstops.
  const { data: own } = await admin.from("profiles").select("deleted_at").eq("id", viewer.userId).maybeSingle<{ deleted_at: string | null }>();
  if (own?.deleted_at) return { formError: "This account has been deleted.", formHint: "Create a new account with a new invite if you want to take part again." };

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

  // Deny-list first, then the AI screen. Every decision is stored in ai_decisions.
  const screening = await screenHandle(handle, viewer.userId);
  if (screening.outcome === "block" || screening.outcome === "hold") {
    if (screening.outcome === "hold" || (screening.outcome === "block" && screening.provider !== "denylist")) {
      // The AI did not allow it: a person checks, and the Strategist may choose another meanwhile.
      await admin
        .from("moderation_flags")
        .update({ status: "resolved", resolution: "dismissed", resolution_reason: "Replaced by a newer handle request.", resolved_at: new Date().toISOString() })
        .eq("user_id", viewer.userId)
        .eq("kind", "held_handle")
        .eq("status", "open");
      await admin.from("moderation_flags").insert({
        kind: "held_handle",
        user_id: viewer.userId,
        ai_decision_id: screening.decisionId,
        details: { handle, category: screening.category, reason: screening.reason },
      });
      return {
        formError: `A person will check @${handle} before it can be used.`,
        formHint: "This usually takes a day. You can wait, or choose a different handle now.",
        fieldErrors: { handle: screening.reason },
      };
    }
    return { formError: "That handle cannot be used.", fieldErrors: { handle: screening.reason } };
  }

  const { error } = await admin
    .from("profiles")
    .update({ handle, handle_set_at: new Date().toISOString() })
    .eq("id", viewer.userId)
    .is("handle", null)
    .is("deleted_at", null);

  if (error) {
    // 23505: unique violation, someone took it a moment ago.
    if (error.code === "23505") {
      return { formError: "That handle is already taken.", fieldErrors: { handle: `Someone has just taken @${handle}. Please try another.` } };
    }
    console.error("chooseHandle update failed", error.code);
    return { formError: "We could not save your handle.", formHint: "Please try again in a moment." };
  }

  // Screened by the deny-list only while the AI was unavailable: a person takes a look.
  if (screening.outcome === "unavailable") {
    await admin.from("moderation_flags").insert({ kind: "unscreened_handle", user_id: viewer.userId, details: { handle, why: screening.why } });
  }
  // A handle chosen instead of one waiting for review closes that request.
  await admin
    .from("moderation_flags")
    .update({ status: "resolved", resolution: "dismissed", resolution_reason: "The Strategist chose another handle.", resolved_at: new Date().toISOString() })
    .eq("user_id", viewer.userId)
    .eq("kind", "held_handle")
    .eq("status", "open");

  await admin.from("audit_log").insert({
    actor_id: viewer.userId,
    action: "profile.handle_set",
    target_table: "profiles",
    target_id: viewer.userId,
    details: { handle },
  });

  redirect("/dossier?welcome=1");
}
