"use server";

import { z } from "zod";
import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const MESSAGES: Record<string, string> = {
  NOT_APPEALABLE: "This Verdict can no longer be appealed.",
  APPEAL_CLOSED: "The appeal window has closed.",
  NOT_A_PARTICIPANT: "Only Strategists who posted in this Campaign can appeal.",
  ALREADY_APPEALED: "You have already appealed this Verdict. You will be told the outcome.",
  REASON_REQUIRED: "Say briefly why, in up to 1,000 characters.",
};

export async function appealVerdict(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer?.profile?.handle) return { formError: "Sign in to appeal." };
  const parsed = z
    .object({
      verdictId: z.uuid(),
      slug: z.string().min(1).max(80),
      reason: z.string().trim().min(1, "Say briefly why you are appealing.").max(1000, "Keep it to 1,000 characters or fewer."),
    })
    .safeParse({ verdictId: formData.get("verdictId"), slug: formData.get("slug"), reason: String(formData.get("reason") ?? "") });
  if (!parsed.success) return { formError: "Please check your appeal.", fieldErrors: { reason: parsed.error.issues[0]?.message ?? "Check this" } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("appeal_verdict", { p_verdict_id: parsed.data.verdictId, p_reason: parsed.data.reason });
  if (error) {
    const code = /^([A-Z_]+):/.exec(error.message)?.[1];
    return { formError: (code && MESSAGES[code]) || "We could not send your appeal.", formHint: "Try again in a moment. If it keeps failing, contact us." };
  }
  // No revalidation: the page is rendered fresh on each visit, and a re-render
  // now would replace this confirmation with "You have appealed".
  return { success: "Your appeal has been sent. A person will look at it, and we will email you the outcome." };
}
