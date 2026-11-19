import type { CoachOutput, DispatchCategory } from "./schemas";

// Turning a model's answer into a decision. Pure functions, unit tested.

/** Categories serious enough that a confident flag is a high-priority hold ("block"). */
const SEVERE: DispatchCategory[] = ["threats", "hate", "personal_information", "self_harm"];
const BLOCK_CONFIDENCE = 0.9;

/**
 * allow, hold or block from a category and confidence. Sensitive Campaigns
 * (CLAUDE.md rule 13) use the stricter, lower threshold. AI never deletes:
 * "block" is stored and treated as a high-priority hold.
 */
export function decideScreeningOutcome(
  category: string,
  confidence: number,
  sensitive: boolean,
  thresholds: { hold_threshold: number; sensitive_hold_threshold: number },
): "allow" | "hold" | "block" {
  if (category === "none") return "allow";
  const threshold = sensitive ? thresholds.sensitive_hold_threshold : thresholds.hold_threshold;
  if (confidence < threshold) return "allow";
  if (SEVERE.includes(category as DispatchCategory) && confidence >= BLOCK_CONFIDENCE) return "block";
  return "hold";
}

/** Plain words for the admin queue. */
export const CATEGORY_LABELS: Record<string, string> = {
  none: "Nothing found",
  hate: "Hate towards a group",
  harassment: "Harassment or a personal attack",
  impersonation: "Impersonation",
  threats: "Threats",
  personal_information: "Sharing personal information",
  sexual_content: "Sexual content",
  self_harm: "Encouraging self-harm",
  spam: "Spam",
};

const REWRITE_PHRASES = [
  /\bhere(?:'s| is) (?:a|an|my|your) (?:re-?write|revised|improved|better) /i,
  /\b(?:re-?written|revised) (?:version|draft|text)\b/i,
  /\byou could (?:write|say|put it)\b/i,
  /\btry (?:writing|saying|phrasing)\b/i,
  /\breplace (?:it|this|that) with\b/i,
  /\binstead,? write\b/i,
];

/**
 * The coach asks questions and points at weaknesses; it must not write
 * replacement text (owner decision 3). Rejects feedback that offers a
 * rewrite, or quotes a long passage that is not the Strategist's own.
 */
/**
 * The weakest-link sentence (coach prompt v2) is kept only if it is one sentence about exactly one of the four parts, says nothing
 * about scores, ranks or winning, offers no rewrite and brings in no figure that is not in the draft. Otherwise the field is dropped
 * and the rest of the feedback is shown as usual.
 */
export function weakestLinkOk(text: string | undefined, draft: string): text is string {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 3 || t.length > 200) return false;
  if (t.split(/[.!?]+\s+\S/).length > 1) return false;
  const parts = ["clarity", "evidence", "steelman", "tone"].filter((w) => new RegExp(`\\b${w}\\b`, "i").test(t));
  if (parts.length !== 1) return false;
  if (/\b(?:scores?|scored|scoring|ratings?|rated|ranks?|ranked|ranking|wins?|won|winning|winners?|loses?|losing|judges?|verdicts?|leaderboard)\b/i.test(t)) return false;
  if (/\d+\s*\/\s*\d+/.test(t)) return false;
  if (REWRITE_PHRASES.some((re) => re.test(t))) return false;
  if (/["“‘][^"”’]{8,}["”’]/.test(t)) return false;
  const figures = t.match(/\d[\d,.]*/g) ?? [];
  return figures.every((n) => draft.includes(n));
}

export function containsReplacementText(feedback: CoachOutput, draft: string): boolean {
  return replacementTextRule(feedback, draft) !== null;
}

/**
 * The same check, naming the rule that fired and where (for example "rewrite_phrase #2 in questions[0]"), or null if the feedback
 * is fine. Used to say why a draft was rejected; containsReplacementText is its yes/no form.
 */
export function replacementTextRule(feedback: CoachOutput, draft: string): string | null {
  const texts = [feedback.clarity.comment, feedback.evidence.comment, feedback.steelman.comment, feedback.tone.comment, ...feedback.questions];
  const where = ["clarity.comment", "evidence.comment", "steelman.comment", "tone.comment", ...feedback.questions.map((_, i) => `questions[${i}]`)];
  const plain = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  const normalisedDraft = plain(draft);
  for (const [i, t] of texts.entries()) {
    const phrase = REWRITE_PHRASES.findIndex((re) => re.test(t));
    if (phrase >= 0) return `rewrite_phrase #${phrase + 1} ${REWRITE_PHRASES[phrase]} in ${where[i]}`;
    for (const m of t.matchAll(/["“‘']([^"”’']{40,})["”’']/g)) {
      const quoted = plain(m[1]);
      if (quoted.split(" ").length >= 8 && !normalisedDraft.includes(quoted)) return `long_quote_not_in_draft in ${where[i]}: ${m[1].slice(0, 50)}`;
    }
  }
  return null;
}
