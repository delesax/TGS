"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Stop recording my positions": withdraws the consent. The database function
 * deletes positions on open Campaigns, unlinks the ones on closed Campaigns,
 * clears the consent and writes one audit entry.
 */
export async function stopRecordingPositions(): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { formError: "Please sign in first." };
  const { data, error } = await createAdminClient().rpc("withdraw_positions_consent", { p_user_id: viewer.userId });
  if (error) {
    console.error("withdraw_positions_consent failed", error.code);
    return { formError: "We could not stop recording your positions.", formHint: "Nothing has changed. Please try again in a moment." };
  }
  revalidatePath("/profile");
  const n = Number((data as { open_positions_deleted?: number } | null)?.open_positions_deleted ?? 0);
  return {
    success: `We have stopped recording your positions. ${n} position${n === 1 ? "" : "s"} on open Campaigns ${n === 1 ? "was" : "were"} deleted.`,
  };
}
