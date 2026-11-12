import "server-only";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_ATTEMPTS, idempotencyKey, planDelivery, retryDelayMinutes, type OutboxRow, type PlannedMessage, type RecipientInfo } from "./plan";
import { isJudgingKind, judgingEmail, type JudgingPayload } from "./judging-templates";
import { campaignEmail, moderationEmail, replyDigest, type CampaignPayload, type ModerationPayload, type ReplyItem } from "./templates";
import { resolveTransport, type Transport } from "./transport";

// The one server-side email module. Reads the outbox, decides what to send,
// sends through the configured transport and records the outcome on each row.

export type ProcessSummary = { claimed: number; sent: number; skipped: number; deferred: number; retrying: number; failed: number; error?: string };

function content(site: string, recipient: RecipientInfo, message: PlannedMessage) {
  const who = { handle: recipient.handle, unsubscribeToken: recipient.unsubscribe_token };
  if (message.kind === "reply") return replyDigest(site, who, message.rows.map((r) => r.payload as unknown as ReplyItem));
  if (message.kind === "moderation_outcome") return moderationEmail(site, who, message.rows[0].payload as unknown as ModerationPayload);
  if (isJudgingKind(message.kind)) return judgingEmail(site, who, message.kind, message.rows[0].payload as unknown as JudgingPayload);
  return campaignEmail(site, who, message.kind, message.rows[0].payload as unknown as CampaignPayload);
}

export async function processOutbox({ limit = 100, transport = resolveTransport() }: { limit?: number; transport?: Transport } = {}): Promise<ProcessSummary> {
  const summary: ProcessSummary = { claimed: 0, sent: 0, skipped: 0, deferred: 0, retrying: 0, failed: 0 };
  if (transport.kind === "misconfigured") {
    // Fail safe: claim nothing, so every email waits in the queue until this is fixed.
    console.error(`Email not sent: ${transport.reason}`);
    return { ...summary, error: `Email is not configured: ${transport.reason}` };
  }

  const db = createAdminClient();
  const site = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const { data: claimed, error } = await db.rpc("claim_email_batch", { p_limit: limit });
  if (error) throw new Error(`Could not claim emails: ${error.message}`);
  const rows = (claimed as OutboxRow[]) ?? [];
  summary.claimed = rows.length;
  if (!rows.length) return summary;

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const replyIds = rows.filter((r) => r.kind === "reply").map((r) => String(r.payload.dispatch_id));
  const [{ data: recipients, error: recipientsError }, { data: replyStates }] = await Promise.all([
    db.rpc("email_recipients", { p_user_ids: userIds }),
    replyIds.length ? db.from("dispatches").select("id, withdrawn_at, hidden_at, moderation_status").in("id", replyIds) : Promise.resolve({ data: [] }),
  ]);
  if (recipientsError) {
    await db.from("email_outbox").update({ status: "queued", locked_at: null }).in("id", rows.map((r) => r.id));
    throw new Error(`Could not read recipients: ${recipientsError.message}`);
  }
  const byUser = new Map((recipients as RecipientInfo[]).map((r) => [r.user_id, r]));
  const unavailableReplies = new Set(
    ((replyStates as { id: string; withdrawn_at: string | null; hidden_at: string | null; moderation_status: string }[]) ?? [])
      .filter((d) => d.withdrawn_at || d.hidden_at || d.moderation_status !== "visible")
      .map((d) => d.id),
  );
  const now = Date.now();

  for (const userId of userIds) {
    const recipient = byUser.get(userId);
    const plan = planDelivery(
      rows.filter((r) => r.user_id === userId),
      recipient,
      { now, unavailableReplies },
    );

    for (const s of plan.skipped) {
      await db.from("email_outbox").update({ status: "skipped", locked_at: null, last_error: s.reason }).eq("id", s.id);
    }
    summary.skipped += plan.skipped.length;

    if (plan.deferred.length) {
      // Over today's cap: try again in an hour. Not counted as a failed attempt.
      const later = new Date(now + 3_600_000).toISOString();
      for (const id of plan.deferred) {
        const row = rows.find((r) => r.id === id)!;
        await db.from("email_outbox").update({ status: "queued", locked_at: null, send_after: later, attempts: Math.max(0, row.attempts - 1), last_error: "daily cap reached" }).eq("id", id);
      }
      summary.deferred += plan.deferred.length;
    }

    for (const message of plan.messages) {
      const ids = message.rows.map((r) => r.id);
      const email = content(site, recipient!, message);
      try {
        const messageId = await transport.send({
          to: recipient!.email!,
          subject: email.subject,
          text: email.text,
          html: email.html,
          idempotencyKey: idempotencyKey(message),
          unsubscribeUrl: email.unsubscribeUrl,
          unsubscribePostUrl: `${site}/api/email/unsubscribe?token=${encodeURIComponent(recipient!.unsubscribe_token)}&kind=${email.preference}`,
        });
        await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), message_id: messageId, locked_at: null, last_error: null }).in("id", ids);
        summary.sent += ids.length;
      } catch (e) {
        const reason = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        console.error("Email send failed", message.kind, reason);
        for (const row of message.rows) {
          const giveUp = row.attempts >= MAX_ATTEMPTS;
          await db
            .from("email_outbox")
            .update({
              status: giveUp ? "failed" : "queued",
              locked_at: null,
              last_error: reason,
              send_after: new Date(now + retryDelayMinutes(row.attempts) * 60_000).toISOString(),
            })
            .eq("id", row.id);
          if (giveUp) summary.failed += 1;
          else summary.retrying += 1;
        }
      }
    }
  }
  return summary;
}
