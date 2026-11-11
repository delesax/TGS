import { formatUkDateTime } from "@/lib/campaigns";

// Email wording and markup. Pure functions, unit tested. Plain text and HTML
// say the same thing; HTML is simple, large and readable, with a language set.

export type EmailKind =
  | "reply"
  | "campaign_opened"
  | "campaign_round_changed"
  | "campaign_closed"
  | "campaign_closing_soon"
  | "moderation_outcome"
  // Sprint 5 judging (wording in judging-templates.ts)
  | "judge_assigned"
  | "peer_voting_open"
  | "verdict_published"
  | "verdict_appeal_outcome";

export type ReplyItem = { dispatch_id: string; campaign_slug: string; campaign_title: string; replier_handle: string | null; excerpt: string };
export type CampaignPayload = { campaign_slug: string; campaign_title: string; ends_at?: string; round?: number | null; round_title?: string | null };

export type PreferenceKey = "replies" | "campaign_updates" | "closing_soon" | "moderation";

export const PREFERENCE_FOR_KIND: Record<EmailKind, PreferenceKey> = {
  reply: "replies",
  campaign_opened: "campaign_updates",
  campaign_round_changed: "campaign_updates",
  campaign_closed: "campaign_updates",
  campaign_closing_soon: "closing_soon",
  moderation_outcome: "moderation",
  // No new preference: judging news about a Campaign is a Campaign update,
  // and an appeal outcome is a decision about the person's own participation.
  judge_assigned: "campaign_updates",
  peer_voting_open: "campaign_updates",
  verdict_published: "campaign_updates",
  verdict_appeal_outcome: "moderation",
};

export type EmailContent = { subject: string; text: string; html: string; unsubscribeUrl: string; preference: PreferenceKey };

export type Recipient = { handle: string | null; unsubscribeToken: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function unsubscribeLink(site: string, token: string, preference: PreferenceKey | "all") {
  return `${site}/email/unsubscribe?token=${encodeURIComponent(token)}&kind=${preference}`;
}

const PREFERENCE_WORDS: Record<PreferenceKey, string> = {
  replies: "replies to your Dispatches",
  campaign_updates: "updates about Campaigns you follow",
  closing_soon: "reminders before a Campaign you are in closes",
  moderation: "moderation decisions on your Dispatches",
};

type Block = { heading?: string; lines: string[]; link?: { href: string; label: string } };

export function render(site: string, recipient: Recipient, preference: PreferenceKey, subject: string, intro: string, blocks: Block[]): EmailContent {
  const unsubscribeUrl = unsubscribeLink(site, recipient.unsubscribeToken, preference);
  const settingsUrl = `${site}/profile/email`;
  const greeting = recipient.handle ? `Hello @${recipient.handle},` : "Hello,";
  const footerText = `You are getting this because of your email settings: ${PREFERENCE_WORDS[preference]}.\nStop these emails: ${unsubscribeUrl}\nAll email settings: ${settingsUrl}\n\nThe Grand Strategist`;

  const text = [
    greeting,
    "",
    intro,
    "",
    ...blocks.flatMap((b) => [...(b.heading ? [b.heading] : []), ...b.lines, ...(b.link ? [`${b.link.label}: ${b.link.href}`] : []), ""]),
    "--",
    footerText,
  ].join("\n");

  const p = (s: string) => `<p style="margin:0 0 16px;font-size:18px;line-height:1.5;color:#111827">${s}</p>`;
  const blockHtml = blocks
    .map(
      (b) => `<div style="margin:0 0 20px;padding:16px;border:1px solid #d1d5db;border-radius:8px">
${b.heading ? `<h2 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:#111827">${escapeHtml(b.heading)}</h2>` : ""}
${b.lines.map((l) => p(escapeHtml(l))).join("\n")}
${b.link ? `<p style="margin:0;font-size:18px"><a href="${escapeHtml(b.link.href)}" style="color:#1e3a5f;font-weight:bold;text-decoration:underline">${escapeHtml(b.link.label)}</a></p>` : ""}
</div>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en-GB">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<div role="article" aria-label="${escapeHtml(subject)}" lang="en-GB" style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">
<p style="margin:0 0 24px;font-size:20px;font-weight:bold;color:#1e3a5f">The Grand Strategist</p>
${p(escapeHtml(greeting))}
${p(escapeHtml(intro))}
${blockHtml}
<hr style="border:none;border-top:1px solid #d1d5db;margin:24px 0">
<p style="margin:0 0 8px;font-size:16px;line-height:1.5;color:#374151">You are getting this because of your email settings: ${escapeHtml(PREFERENCE_WORDS[preference])}.</p>
<p style="margin:0 0 8px;font-size:16px;line-height:1.5"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#1e3a5f;text-decoration:underline">Stop these emails</a> &middot; <a href="${escapeHtml(settingsUrl)}" style="color:#1e3a5f;text-decoration:underline">All email settings</a></p>
</div>
</body>
</html>`;

  return { subject, text, html, unsubscribeUrl, preference };
}

/** One digest for every reply waiting for this person. */
export function replyDigest(site: string, recipient: Recipient, items: ReplyItem[]): EmailContent {
  const n = items.length;
  const subject = n === 1 ? `@${items[0].replier_handle ?? "A Strategist"} replied to your Dispatch` : `${n} replies to your Dispatches`;
  const intro = n === 1 ? "Someone has answered your Dispatch." : `You have ${n} new replies to your Dispatches.`;
  const blocks = items.map((i) => ({
    heading: `@${i.replier_handle ?? "A Strategist"} in “${i.campaign_title}”`,
    lines: [i.excerpt.length >= 240 ? `${i.excerpt.trimEnd()}…` : i.excerpt],
    link: { href: `${site}/campaigns/${i.campaign_slug}#dispatch-${i.dispatch_id}`, label: "Read the reply" },
  }));
  return render(site, recipient, "replies", subject, intro, blocks);
}

export type ModerationPayload = { dispatch_id: string; campaign_slug: string; campaign_title: string; outcome: "held" | "released" | "kept_held" | "removed"; appeal?: boolean };

/** Plain words about a moderation decision. Never the moderator's private reason or the AI's. */
export function moderationEmail(site: string, recipient: Recipient, m: ModerationPayload): EmailContent {
  const href = `${site}/campaigns/${m.campaign_slug}#dispatch-${m.dispatch_id}`;
  const appeal = m.appeal ? "We have looked at your appeal. " : "";
  const words: Record<ModerationPayload["outcome"], { subject: string; intro: string; lines: string[] }> = {
    held: {
      subject: "Your Dispatch is waiting for a check",
      intro: "A person will check one of your Dispatches before others can see it.",
      lines: ["Only you can see it for now. You do not need to do anything.", "If you think this is a mistake, you can appeal once from the Dispatch."],
    },
    released: {
      subject: m.appeal ? "Your appeal was upheld" : "Your Dispatch is now visible",
      intro: `${appeal}A person has checked your Dispatch and it is now visible to everyone.`,
      lines: [],
    },
    kept_held: {
      subject: m.appeal ? "Your appeal was not upheld" : "Your Dispatch stays hidden",
      intro: `${appeal}A person has checked your Dispatch. It stays hidden from others because it does not meet our community rules.`,
      lines: m.appeal ? ["This decision is final."] : ["If you think this is a mistake, you can appeal once from the Dispatch."],
    },
    removed: {
      subject: m.appeal ? "Your appeal was not upheld" : "A moderator removed your Dispatch",
      intro: `${appeal}A person has removed one of your Dispatches because it does not meet our community rules. Others now see "Removed by a moderator."`,
      lines: m.appeal ? ["This decision is final. The original is kept for our records, not deleted."] : ["The original is kept for our records, not deleted.", "If you think this is a mistake, you can appeal once from the Dispatch."],
    },
  };
  const w = words[m.outcome];
  return render(site, recipient, "moderation", w.subject, w.intro, [{ heading: m.campaign_title, lines: w.lines, link: { href, label: "See your Dispatch" } }]);
}

export function campaignEmail(
  site: string,
  recipient: Recipient,
  kind: "campaign_opened" | "campaign_round_changed" | "campaign_closed" | "campaign_closing_soon",
  c: CampaignPayload,
): EmailContent {
  const href = `${site}/campaigns/${c.campaign_slug}`;
  const deadline = c.ends_at ? `Deadline: ${formatUkDateTime(c.ends_at)}.` : "";
  switch (kind) {
    case "campaign_opened":
      return render(site, recipient, "campaign_updates", `Now open: ${c.campaign_title}`, "A Campaign you follow is now open for Dispatches.", [
        { heading: c.campaign_title, lines: [deadline].filter(Boolean), link: { href, label: "Make your case" } },
      ]);
    case "campaign_round_changed":
      return render(site, recipient, "campaign_updates", `Round ${c.round}: ${c.round_title ?? "next round"} – ${c.campaign_title}`, "A Campaign you follow has moved to its next round.", [
        { heading: c.campaign_title, lines: [`Round ${c.round}${c.round_title ? `, ${c.round_title},` : ""} has started.`, deadline].filter(Boolean), link: { href, label: "See the round" } },
      ]);
    case "campaign_closed":
      return render(site, recipient, "campaign_updates", `Closed: ${c.campaign_title}`, "A Campaign you follow has closed. No more Dispatches can be posted.", [
        { heading: c.campaign_title, lines: ["The Verdict will be published on the Campaign page."], link: { href, label: "Read the debate" } },
      ]);
    case "campaign_closing_soon":
      return render(site, recipient, "closing_soon", `Closes within 24 hours: ${c.campaign_title}`, "A Campaign you are in closes within 24 hours.", [
        { heading: c.campaign_title, lines: [deadline, "Last chance to post, and to record where you stand now."].filter(Boolean), link: { href, label: "Go to the Campaign" } },
      ]);
  }
}
