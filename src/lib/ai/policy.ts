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
export function containsReplacementText(feedback: CoachOutput, draft: string): boolean {
  const texts = [feedback.clarity.comment, feedback.evidence.comment, feedback.steelman.comment, feedback.tone.comment, ...feedback.questions];
  const plain = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  const normalisedDraft = plain(draft);
  for (const t of texts) {
    if (REWRITE_PHRASES.some((re) => re.test(t))) return true;
    for (const m of t.matchAll(/["“‘']([^"”’']{40,})["”’']/g)) {
      const quoted = plain(m[1]);
      if (quoted.split(" ").length >= 8 && !normalisedDraft.includes(quoted)) return true;
    }
  }
  return false;
}
