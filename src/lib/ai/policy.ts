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
 * Quoted passages, read left to right as whole pairs: "double", “curly” or 'single'. Reading whole pairs means a closing mark is
 * never mistaken for the next opening one. A single quote counts as a quotation mark only when it stands apart from letters, so the
 * apostrophes in "doesn't" and "teachers' phones" are not quote marks. An opening single quote may follow a bracket, a digit or
 * punctuation (so a rewrite cannot hide behind one), but not a letter, and not a lone "s" ("the 1990's"). (The first version of this rule paired any two quote-like characters
 * 40 or more characters apart and rejected ordinary feedback; see evals/coach-validator-false-positives.json.)
 */
const QUOTED = /"([^"]*)"|“([^”]*)”|(?<!\p{L})['‘](?!s(?![\p{L}\p{N}]))((?:[^'‘’]|(?<=[\p{L}\p{N}])['’](?=[\p{L}\p{N}]))*)['’](?![\p{L}\p{N}])/gu;

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
  return weakestLinkRule(text, draft) === null;
}

const COACH_PARTS = ["clarity", "evidence", "steelman", "tone"] as const;
/** Words that make a following part word an ordinary noun ("no claim for evidence", "a lack of clarity"), not the part being named. */
const ORDINARY_NOUN_BEFORE = /\b(?:no|any|for|without|of|more|some|little|enough)$/i;

/**
 * The parts of the coach a sentence names. A part is named when it follows "the", "your", "its", "this", "that" or "their"
 * ("The clarity is the main problem"), or when it appears anywhere else as other than an ordinary noun. A part word that follows
 * "no", "for", "of" and the like ("... no claim for evidence ...") is just a noun and is not counted. (Found on the real eval, c12:
 * a sentence that named one weakest part was dropped for using "evidence" as an ordinary noun. A sentence that names two parts as
 * parts, "The evidence and the tone are both weak", is still dropped.)
 */
function partsNamed(t: string): string[] {
  return COACH_PARTS.filter((w) => {
    if (new RegExp(`\\b(?:the|your|its|this|that|their)\\s+${w}\\b`, "i").test(t)) return true;
    for (const m of t.matchAll(new RegExp(`\\b${w}\\b`, "gi"))) {
      if (!ORDINARY_NOUN_BEFORE.test(t.slice(0, m.index).trimEnd())) return true;
    }
    return false;
  });
}

/** The same check, naming the rule that dropped the sentence, or null if it is fine. */
export function weakestLinkRule(text: string | undefined, draft: string): string | null {
  if (!text) return "empty";
  const t = text.trim();
  if (t.length < 3 || t.length > 200) return `length ${t.length}`;
  if (t.split(/[.!?]+\s+\S/).length > 1) return "more than one sentence";
  const parts = partsNamed(t);
  if (parts.length !== 1) return parts.length === 0 ? "names none of the four parts" : `names several parts (${parts.join(", ")})`;
  const banned = t.match(/\b(?:scores?|scored|scoring|ratings?|rated|ranks?|ranked|ranking|wins?|won|winning|winners?|loses?|losing|judges?|verdicts?|leaderboard)\b/i);
  if (banned) return `mentions scores, ranks or winning (${banned[0]})`;
  if (/\d+\s*\/\s*\d+/.test(t)) return "a score-like ratio";
  if (REWRITE_PHRASES.some((re) => re.test(t))) return "offers a rewrite";
  if (/["“‘][^"”’]{8,}["”’]/.test(t)) return "quotes a passage";
  const figure = (t.match(/\d[\d,.]*/g) ?? []).find((n) => !draft.includes(n));
  return figure ? `a figure that is not in the draft (${figure})` : null;
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
    for (const m of t.matchAll(QUOTED)) {
      const passage = m[1] ?? m[2] ?? m[3] ?? "";
      const quoted = plain(passage);
      if (passage.length >= 40 && quoted.split(" ").length >= 8 && !normalisedDraft.includes(quoted)) return `long_quote_not_in_draft in ${where[i]}: ${passage.slice(0, 50)}`;
    }
  }
  return null;
}
