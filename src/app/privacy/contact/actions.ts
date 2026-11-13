"use server";

import type { FormState } from "@/components/form";
import { getViewer } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { sendTransactional } from "@/lib/email/transactional";
import { transactionalEmail } from "@/lib/email/templates";
import { LEGAL, legalHas } from "@/lib/legal";
import { REQUEST_TYPE_LABELS, privacyRequestSchema } from "@/lib/privacy-requests";
import { createAdminClient } from "@/lib/supabase/admin";
import { fieldErrors } from "@/lib/validation";

/**
 * "Contact us about your data". Saves the request, sends the person an
 * acknowledgement at once and alerts the privacy mailbox. The message text is
 * never logged and never put in an email to the team.
 */
export async function submitPrivacyRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  // A hidden field only a bot fills in. Say "sent" and do nothing.
  if (String(formData.get("website") ?? "").trim() !== "") {
    return { success: "Thank you. We have your message." };
  }

  const viewer = await getViewer();
  // Signed in: the address on the account, whatever the form says.
  const email = viewer ? viewer.email : String(formData.get("email") ?? "");
  const parsed = privacyRequestSchema.safeParse({ type: formData.get("type") ?? undefined, email, message: String(formData.get("message") ?? "") });
  if (!parsed.success) {
    return { formError: "Please check the highlighted answers.", formHint: "Nothing has been sent yet. What you typed is still here.", fieldErrors: fieldErrors(parsed.error) };
  }
  const { type, message } = parsed.data;

  const admin = createAdminClient();
  const { data: id, error } = await admin.rpc("create_privacy_request", {
    p_type: type,
    p_email: parsed.data.email,
    p_user_id: viewer?.userId ?? null,
    p_message: message,
  });
  if (error || !id) {
    if (/RATE_LIMITED/.test(error?.message ?? "")) {
      return {
        formError: "You have sent several messages today.",
        formHint: "We have them, and we will reply to each. Please wait until tomorrow before sending another.",
      };
    }
    console.error("create_privacy_request failed", error?.code);
    return { formError: "We could not send your message.", formHint: "Nothing was saved. Please try again in a few minutes, or email us directly." };
  }

  const site = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const isComplaint = type === "complaint";
  const ack = transactionalEmail(
    "We have your message",
    [
      "We have your message. We will reply within one month.",
      ...(isComplaint ? ["Because it is a complaint, we will tell you the outcome without unnecessary delay."] : []),
      `Your reference: ${String(id).slice(0, 8)}`,
    ],
    "You are getting this because you sent us a message through “Contact us about your data”.",
  );
  if (await sendTransactional(parsed.data.email, ack, `privacy-ack:${id}`)) {
    await admin.rpc("acknowledge_privacy_request", { p_id: id });
  }

  if (legalHas("privacyEmail")) {
    const alert = transactionalEmail(
      "New privacy request",
      [`A new privacy request has arrived: ${REQUEST_TYPE_LABELS[type]}.`, `Open it in the admin area: ${site}/admin/privacy-requests/${id}`],
      "You are getting this because you are the privacy contact for The Grand Strategist.",
    );
    await sendTransactional(LEGAL.privacyEmail, alert, `privacy-alert:${id}`);
  } else {
    console.error("Privacy alert email not sent: LEGAL.privacyEmail is not set");
  }

  return { success: "Thank you. We have your message and sent you an email to confirm. We will reply within one month." };
}
