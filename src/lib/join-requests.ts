import { z } from "zod";

// Shared by the public "ask to join" form and the admin invites screen.

export const MAX_BATCH = 50;
export const NOTE_MAX = 200;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower case, no surrounding spaces. Returns null when it is not an email address. */
export function normaliseEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

/** Control characters (including line breaks) become spaces; the rest is trimmed. */
export function cleanNote(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export const joinRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .max(320, "That email address is too long.")
    .transform((v, ctx) => {
      const email = normaliseEmail(v);
      if (!email) {
        ctx.addIssue({ code: "custom", message: "Enter your email address, for example name@example.com." });
        return z.NEVER;
      }
      return email;
    }),
  note: z
    .string()
    .transform(cleanNote)
    .pipe(z.string().max(NOTE_MAX, `Keep your note to ${NOTE_MAX} characters or fewer.`)),
});

/**
 * Splits a pasted list of addresses (one per line, or separated by commas, semicolons or spaces).
 * Duplicates (in any case) are dropped; anything that is not an address is reported back.
 */
export function parseEmailList(text: string): { emails: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) continue;
    const email = normaliseEmail(raw.replace(/^<|>$/g, ""));
    if (!email) {
      invalid.push(raw.slice(0, 80));
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return { emails, invalid };
}

/** The short plain-text message an admin pastes into their own email or chat, with the link in it. */
export function inviteMessage(link: string, expiryDays?: number): string {
  return [
    "You are invited to The Grand Strategist: a place to argue a question before a deadline and be judged on the quality of the argument.",
    "",
    `Create your account: ${link}`,
    "",
    `Use the email address this was sent to. The invite works once${expiryDays ? ` and lasts ${expiryDays} days` : ""}.`,
  ].join("\n");
}

export type IssueResult = {
  request_id: string | null;
  email: string;
  status: "issued" | "not_found" | "not_pending" | "already_member" | "already_invited" | "bad_email";
  invite_id: string | null;
  send_after: string | null;
  expires_at: string | null;
};

export const ISSUE_STATUS_WORDS: Record<IssueResult["status"], string> = {
  issued: "Invite made",
  not_found: "Not found",
  not_pending: "Already decided",
  already_member: "Already has an account",
  already_invited: "Already invited",
  bad_email: "Not an email address",
};

export type Budget = {
  app_cap: number;
  app_sent_today: number;
  invite_limit: number;
  invite_sent_today: number;
  invite_waiting_today: number;
  provider_limit: number;
  auth_emails_estimate: number;
  room_today: number;
  invite_waiting_total: number;
  expiry_days: number;
};

/** What the approve button promises: how many invitations go out today and how many wait for later days. */
export function splitBySendDay(count: number, roomToday: number): { today: number; later: number } {
  const today = Math.max(0, Math.min(count, roomToday));
  return { today, later: count - today };
}

export type OverviewRow = {
  request_id: string;
  email: string;
  status: string;
  source: string;
  created_at: string;
  decided_at: string | null;
  invite_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  used: boolean;
  email_state: string | null;
  send_after: string | null;
};

export type InviteState = "joined" | "revoked" | "expired" | "rejected" | "waiting" | "emailed" | "link_shown" | "not_sent" | "failed" | "closed";

/** What an admin should read about one decided request: whether the person joined, and where the invitation stands. */
export function describeInvite(row: OverviewRow, now: number): InviteState {
  if (row.status === "rejected") return "rejected";
  if (row.used || row.status === "joined") return "joined";
  if (row.revoked_at || row.status === "revoked") return "revoked";
  if (row.status === "expired" || (row.expires_at && Date.parse(row.expires_at) <= now)) return "expired";
  if (!row.invite_id) return "closed";
  if (row.email_state === "sent") return "emailed";
  if (row.email_state === "queued" || row.email_state === "sending") return "waiting";
  if (row.email_state === "failed") return "failed";
  if (row.email_state === "skipped") return "not_sent";
  return "link_shown";
}

export const INVITE_STATE_WORDS: Record<InviteState, string> = {
  joined: "Joined",
  revoked: "Revoked",
  expired: "Expired, not used",
  rejected: "Rejected",
  waiting: "Waiting to send",
  emailed: "Emailed, not used yet",
  link_shown: "Link shown to you, not emailed",
  not_sent: "Not sent",
  failed: "Could not be sent",
  closed: "Closed",
};

/** True when Revoke and Re-issue make sense: an invite that is still live. */
export function canRevoke(state: InviteState): boolean {
  return state === "waiting" || state === "emailed" || state === "link_shown" || state === "failed" || state === "not_sent";
}

/** True when a fresh invite can be made: it has not been used and no live invite stands. */
export function canReissue(state: InviteState): boolean {
  return state === "revoked" || state === "expired" || canRevoke(state);
}
