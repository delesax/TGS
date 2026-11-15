import { formatUkDateTime } from "@/lib/campaigns";
import { inviteLink } from "@/lib/invite-codes";
import { transactionalEmail, type TransactionalEmail } from "./templates";

// The invitation email, for an address that has no account yet. It is not a subscription (no stop link): it says why
// it was sent. The code travels only in this email's link.

export type InvitePayload = { invite_id: string; code?: string; expires_at?: string };

export function inviteEmail(site: string, payload: InvitePayload): TransactionalEmail {
  const code = String(payload.code ?? "");
  const href = inviteLink(site, code);
  const expiry = payload.expires_at ? `The link works once and stops working on ${formatUkDateTime(payload.expires_at)}.` : "The link works once.";
  return transactionalEmail(
    "Your invitation to The Grand Strategist",
    [
      "You have been invited to The Grand Strategist, a place to argue a question before a deadline and be judged on the quality of the argument.",
      "Use the button below to create your account. Please sign up with this email address: the invitation only works for it.",
      expiry,
      "If you were not expecting this, you can ignore it. Nothing happens unless you use the link.",
    ],
    "You are getting this because an administrator invited this email address. We have not added it to any list.",
    { label: "Create your account", href },
  );
}
