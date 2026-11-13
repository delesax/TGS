"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form";
import { deleteAccount } from "@/lib/account-deletion";
import { getViewer } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Delete my account (anonymise, never cascade into Dispatches). Only when
 * community_settings.account_deletion_enabled is on. Needs the handle typed
 * out and the password entered again. The database does the anonymising
 * (anonymise_profile) and the audit entry; then the sign-in is deleted.
 */
export async function deleteMyAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { formError: "Please sign in first." };
  const admin = createAdminClient();
  const { data: settings } = await admin.from("community_settings").select("account_deletion_enabled").single<{ account_deletion_enabled: boolean }>();
  if (!settings?.account_deletion_enabled) return { formError: "Deleting your account is not switched on yet." };

  const typed = String(formData.get("handle") ?? "").trim().replace(/^@/, "");
  const password = String(formData.get("password") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (typed.toLowerCase() !== viewer.profile.handle.toLowerCase()) fieldErrors.handle = `Type your handle, ${viewer.profile.handle}, exactly to confirm.`;
  if (!password) fieldErrors.password = "Enter your password.";
  if (formData.get("understood") !== "on") fieldErrors.understood = "Tick the box to confirm you understand what happens.";
  if (Object.keys(fieldErrors).length) return { formError: "Please check the highlighted answers.", formHint: "Nothing has been deleted.", fieldErrors };

  // Check the password on a separate client, so this session is not replaced.
  const env = publicEnv();
  const check = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: passwordError } = await check.auth.signInWithPassword({ email: viewer.email, password });
  if (passwordError) return { formError: "That password is not right.", formHint: "Nothing has been deleted. Try again, or reset your password first.", fieldErrors: { password: "That password is not right." } };
  await check.auth.signOut({ scope: "local" });

  const result = await deleteAccount(admin, viewer.userId, "self_service");
  if (!result.ok) {
    console.error("deleteAccount failed", result.reason);
    return { formError: "We could not delete your account.", formHint: "Nothing has been deleted. Please try again in a moment." };
  }
  if (!result.signInDeleted) console.error("Deleting the sign-in failed after anonymising; the profile is already anonymised");

  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => undefined);
  const kept = Number(result.summary.kept_dispatches ?? 0);
  redirect(`/account-deleted?kept=${kept}`);
}
