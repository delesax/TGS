"use server";

import type { FormState } from "@/components/form";
import { parseUnsubscribe, unsubscribe } from "@/lib/email/unsubscribe";

export async function confirmUnsubscribe(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseUnsubscribe(formData.get("token"), formData.get("kind"));
  if (!parsed) return { formError: "That unsubscribe link is not complete.", formHint: "Use the link from the email, or change your email settings after signing in." };
  try {
    const ok = await unsubscribe(parsed.token, parsed.kind);
    if (!ok) return { formError: "We could not find that link.", formHint: "It may be from an old account. Sign in and use Email settings instead." };
    return { success: parsed.kind === "all" ? "Done. We will not send you any more emails." : "Done. We will not send you these emails any more." };
  } catch {
    return { formError: "Something went wrong.", formHint: "Please try again in a moment." };
  }
}
