import { PREFERENCE_FOR_KIND, type EmailKind } from "./templates";

// Decides, for one person, which queued events become which emails. Pure and
// unit tested: no clocks or database calls inside.

export type OutboxRow = { id: number; user_id: string; kind: EmailKind; payload: Record<string, unknown>; attempts: number };

export type RecipientInfo = {
  user_id: string;
  email: string | null;
  confirmed: boolean;
  handle: string | null;
  replies: boolean;
  campaign_updates: boolean;
  closing_soon: boolean;
  moderation: boolean;
  unsubscribed_all: boolean;
  unsubscribe_token: string;
  sent_last_24h: number;
  daily_cap: number;
};

export type PlannedMessage = { kind: EmailKind; rows: OutboxRow[] };

export type DeliveryPlan = {
  messages: PlannedMessage[];
  skipped: { id: number; reason: string }[];
  /** Over today's cap: kept in the queue for later. */
  deferred: number[];
};

// Most time-sensitive first, so the cap never holds back a closing reminder.
const PRIORITY: EmailKind[] = ["moderation_outcome", "campaign_closing_soon", "campaign_opened", "campaign_round_changed", "campaign_closed", "reply"];

export function planDelivery(
  rows: OutboxRow[],
  recipient: RecipientInfo | undefined,
  context: { now: number; unavailableReplies: Set<string> },
): DeliveryPlan {
  const plan: DeliveryPlan = { messages: [], skipped: [], deferred: [] };
  const skipAll = (reason: string) => {
    plan.skipped.push(...rows.map((r) => ({ id: r.id, reason })));
    return plan;
  };
  if (!recipient || !recipient.email) return skipAll("no account");
  if (!recipient.confirmed) return skipAll("email address not confirmed");
  if (recipient.unsubscribed_all) return skipAll("unsubscribed from all email");

  const replies: OutboxRow[] = [];
  const singles: OutboxRow[] = [];
  for (const row of rows) {
    if (!recipient[PREFERENCE_FOR_KIND[row.kind]]) {
      plan.skipped.push({ id: row.id, reason: `turned off: ${PREFERENCE_FOR_KIND[row.kind]}` });
    } else if (row.kind === "reply" && context.unavailableReplies.has(String(row.payload.dispatch_id))) {
      plan.skipped.push({ id: row.id, reason: "reply withdrawn or hidden" });
    } else if (row.kind === "campaign_closing_soon" && typeof row.payload.ends_at === "string" && Date.parse(row.payload.ends_at) <= context.now) {
      plan.skipped.push({ id: row.id, reason: "Campaign already closed" });
    } else if (row.kind === "reply") {
      replies.push(row);
    } else {
      singles.push(row);
    }
  }

  const messages: PlannedMessage[] = singles.map((r) => ({ kind: r.kind, rows: [r] }));
  if (replies.length) messages.push({ kind: "reply", rows: replies });
  messages.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));

  const allowance = Math.max(0, recipient.daily_cap - recipient.sent_last_24h);
  plan.messages = messages.slice(0, allowance);
  plan.deferred = messages.slice(allowance).flatMap((m) => m.rows.map((r) => r.id));
  return plan;
}

/** Same key every time the same rows are retried, so the provider sends the message once. */
export function idempotencyKey(message: PlannedMessage): string {
  return `tgs-${message.kind}-${message.rows.map((r) => r.id).sort((a, b) => a - b).join("-")}`.slice(0, 256);
}

/** Wait before retrying a failed send: 5, 10, 20, 40 minutes. */
export function retryDelayMinutes(attempts: number): number {
  return 5 * 2 ** Math.max(0, Math.min(attempts - 1, 3));
}

export const MAX_ATTEMPTS = 5;
