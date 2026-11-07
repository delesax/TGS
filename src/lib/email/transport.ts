// Chooses how email is sent, by environment. No keys live in the repository.
//   EMAIL_TRANSPORT=resend  (or RESEND_API_KEY set): Resend, needs EMAIL_FROM on a verified domain
//   EMAIL_TRANSPORT=mailpit (or MAILPIT_URL set):    the local test inbox, never real people
// Anything missing fails safely: nothing is sent and the reason is logged.

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Same key for a retry of the same message, so the provider sends it once. */
  idempotencyKey: string;
  /** Omitted for emails that are not subscriptions (security and account emails, replies to a request). */
  unsubscribeUrl?: string;
  unsubscribePostUrl?: string;
};

export type Transport =
  | { kind: "resend" | "mailpit"; from: string; send: (email: OutgoingEmail) => Promise<string> }
  | { kind: "misconfigured"; reason: string };

function headersFor(email: OutgoingEmail): Record<string, string> {
  if (!email.unsubscribeUrl || !email.unsubscribePostUrl) return {};
  return {
    "List-Unsubscribe": `<${email.unsubscribePostUrl}>, <${email.unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function resolveTransport(env: Record<string, string | undefined> = process.env): Transport {
  const choice = env.EMAIL_TRANSPORT ?? (env.RESEND_API_KEY ? "resend" : env.MAILPIT_URL ? "mailpit" : "");

  if (choice === "resend") {
    const key = env.RESEND_API_KEY;
    const from = env.EMAIL_FROM;
    if (!key) return { kind: "misconfigured", reason: "RESEND_API_KEY is not set" };
    if (!from) return { kind: "misconfigured", reason: "EMAIL_FROM is not set (it must use the verified Resend sending domain)" };
    return {
      kind: "resend",
      from,
      async send(email) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": email.idempotencyKey },
          body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html, headers: headersFor(email) }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
        if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.name ?? ""} ${body.message ?? ""}`.trim());
        return body.id;
      },
    };
  }

  if (choice === "mailpit") {
    const base = env.MAILPIT_URL;
    if (!base) return { kind: "misconfigured", reason: "MAILPIT_URL is not set" };
    const from = env.EMAIL_FROM ?? "The Grand Strategist (local) <no-reply@tgs.localhost>";
    return {
      kind: "mailpit",
      from,
      async send(email) {
        const match = /^(.*)<(.+)>$/.exec(from);
        const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            From: { Email: match ? match[2].trim() : from, Name: match ? match[1].trim() : "" },
            To: [{ Email: email.to }],
            Subject: email.subject,
            Text: email.text,
            HTML: email.html,
            Headers: headersFor(email),
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const body = (await res.json().catch(() => ({}))) as { ID?: string };
        if (!res.ok || !body.ID) throw new Error(`Mailpit ${res.status}`);
        return body.ID;
      },
    };
  }

  return { kind: "misconfigured", reason: "no email transport is configured (set RESEND_API_KEY and EMAIL_FROM, or MAILPIT_URL locally)" };
}
