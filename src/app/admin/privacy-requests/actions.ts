"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { STATUSES } from "@/lib/privacy-requests";
import { createClient } from "@/lib/supabase/server";

/** Change a privacy request's status and outcome note. The database checks the admin role again and writes the audit entry (request id only). */
export async function updatePrivacyRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return { formError: "Only admins can do this." };
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(STATUSES, "Choose a status."), note: z.string().trim().max(5000, "Keep the note to 5,000 characters or fewer.") })
    .safeParse({ id: formData.get("id"), status: formData.get("status") ?? undefined, note: String(formData.get("note") ?? "") });
  if (!parsed.success) {
    return { formError: "Please check the highlighted answers.", fieldErrors: { status: "Choose a status.", note: "Keep the note to 5,000 characters or fewer." } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_privacy_request", { p_id: parsed.data.id, p_status: parsed.data.status, p_outcome_note: parsed.data.note });
  if (error) {
    console.error("admin_update_privacy_request failed", error.code);
    return { formError: "We could not save that change.", formHint: "Refresh the page and try again." };
  }
  revalidatePath("/admin/privacy-requests");
  revalidatePath(`/admin/privacy-requests/${parsed.data.id}`);
  return { success: "Saved." };
}
