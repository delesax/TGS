import { formatUkDateTime } from "@/lib/campaigns";
import { render, type EmailContent, type EmailKind, type Recipient } from "./templates";

// Sprint 5 judging emails. Plain words; the payload carries only what the
// email says (the Campaign's slug and title, and the outcome), never scores,
// votes or anyone's handle.

export const JUDGING_KINDS = ["judge_assigned", "peer_voting_open", "verdict_published", "verdict_appeal_outcome"] as const;
export type JudgingKind = (typeof JUDGING_KINDS)[number];

export type JudgingPayload = {
  campaign_slug: string;
  campaign_title: string;
  ends_at?: string;
  voting_closes_at?: string;
  revised?: boolean;
  outcome?: "upheld" | "rejected";
};

export function isJudgingKind(kind: EmailKind): kind is JudgingKind {
  return (JUDGING_KINDS as readonly string[]).includes(kind);
}

export function judgingEmail(site: string, recipient: Recipient, kind: JudgingKind, p: JudgingPayload): EmailContent {
  const campaign = `${site}/campaigns/${p.campaign_slug}`;
  switch (kind) {
    case "judge_assigned":
      return render(site, recipient, "campaign_updates", `You are on the judging panel: ${p.campaign_title}`, "An admin has asked you to judge a Campaign.", [
        {
          heading: p.campaign_title,
          lines: [
            p.ends_at ? `The Campaign closes ${formatUkDateTime(p.ends_at)}. You can score its Dispatches once it has closed.` : "You can score its Dispatches once it has closed.",
            "You score each Dispatch from 1 to 5 on logic, evidence, originality and responsiveness. You can save a draft and come back; once you submit, your scores are locked.",
          ],
          link: { href: `${site}/judging`, label: "Open your judging" },
        },
      ]);
    case "peer_voting_open":
      return render(site, recipient, "campaign_updates", `Voting is open: ${p.campaign_title}`, "A Campaign you posted in has closed, and peer voting is now open.", [
        {
          heading: p.campaign_title,
          lines: [
            "Vote for the Dispatches you found strongest (not your own), confirm any that fairly restate the other side, and say which one changed your mind, if any did.",
            p.voting_closes_at ? `Voting closes ${formatUkDateTime(p.voting_closes_at)}.` : "",
          ].filter(Boolean),
          link: { href: `${campaign}/vote`, label: "Vote now" },
        },
      ]);
    case "verdict_published":
      return render(
        site,
        recipient,
        "campaign_updates",
        `${p.revised ? "Revised Verdict" : "The Verdict"}: ${p.campaign_title}`,
        p.revised ? "After an appeal, a revised Verdict has been published for a Campaign you took part in or follow." : "The Verdict is in for a Campaign you took part in or follow.",
        [{ heading: p.campaign_title, lines: ["See who was named Grand Strategist, the awards, and how the decision was reached."], link: { href: `${campaign}/verdict`, label: "Read the Verdict" } }],
      );
    case "verdict_appeal_outcome":
      return render(
        site,
        recipient,
        "moderation",
        p.outcome === "upheld" ? "Your appeal was upheld" : "Your appeal was not upheld",
        p.outcome === "upheld"
          ? "We have looked at your appeal against a Verdict and upheld it. The Verdict will be reviewed and a revised one published."
          : "We have looked at your appeal against a Verdict. The Verdict stands, and this decision is final.",
        [{ heading: p.campaign_title, lines: [], link: { href: `${campaign}/verdict`, label: "See the Verdict" } }],
      );
  }
}
