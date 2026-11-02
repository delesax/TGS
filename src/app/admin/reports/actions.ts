"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Admin moderation. The database functions check the JWT role claim again, so
// these cannot be used by anyone else even if called directly.

async function adminOnly(): Promise<FormState | null> {
  const viewer = await getViewer();
  return viewer?.isAdmin ? null : { formError: "Only admins can do this." };
}

export async function hideDispatch(_prev: FormState, formData: FormData): Promise<FormState> {
  const denied = await adminOnly();
  if (denied) return denied;
  const parsed = z
    .object({ dispatchId: z.uuid(), reason: z.string().trim().min(1, "Give a short reason. It is kept in the audit log.").max(500, "Keep the reason to 500 characters or fewer.") })
    .safeParse({ dispatchId: formData.get("dispatchId"), reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { formError: "Please give a reason.", fieldErrors: { reason: parsed.error.issues[0].message } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hide_dispatch", { p_id: parsed.data.dispatchId, p_reason: parsed.data.reason });
  if (error) return { formError: "We could not hide that Dispatch.", formHint: "Please try again." };
  revalidatePath("/admin/reports");
  return { success: "Hidden. The original is kept and the change is in the audit log." };
}

export type AdminResult = { ok: true } | { ok: false; message: string };

export async function restoreDispatch(dispatchId: string): Promise<AdminResult> {
  if (await adminOnly()) return { ok: false, message: "Only admins can do this." };
  if (!z.uuid().safeParse(dispatchId).success) return { ok: false, message: "Something went wrong." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_dispatch", { p_id: dispatchId });
  if (error) return { ok: false, message: "We could not restore that Dispatch. Please try again." };
  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function dismissReports(dispatchId: string): Promise<AdminResult> {
  if (await adminOnly()) return { ok: false, message: "Only admins can do this." };
  if (!z.uuid().safeParse(dispatchId).success) return { ok: false, message: "Something went wrong." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_reports", { p_dispatch_id: dispatchId });
  if (error) return { ok: false, message: "We could not dismiss those reports. Please try again." };
  revalidatePath("/admin/reports");
  return { ok: true };
}
