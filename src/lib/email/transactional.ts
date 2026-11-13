import "server-only";
import { createHash } from "node:crypto";
import { resolveTransport, type Transport } from "./transport";
import type { TransactionalEmail } from "./templates";

/**
 * Sends one email that is not a subscription (an acknowledgement, or an alert
 * to the team) through the SAME transport as the outbox (Resend in production,
 * Mailpit locally). No new provider. Returns false when it could not be sent;
 * it never throws and never logs the recipient or the message.
 */
export async function sendTransactional(to: string, email: TransactionalEmail, key: string, transport: Transport = resolveTransport()): Promise<boolean> {
  if (transport.kind === "misconfigured") {
    console.error(`Email not sent: ${transport.reason}`);
    return false;
  }
  try {
    await transport.send({
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      idempotencyKey: createHash("sha256").update(`${key}:${to}`).digest("hex").slice(0, 48),
    });
    return true;
  } catch (e) {
    // Only the failure reason: no address, no message text.
    console.error("Transactional email failed", (e instanceof Error ? e.message : String(e)).slice(0, 200));
    return false;
  }
}
