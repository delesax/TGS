import type { Attention, BlendResult, Component, ProposedAward } from "./blend";

// The Verdict's plain-English rationale, written from the component scores.
// Strategists appear as @{user:<id>} tokens, never as handles: the page shows
// each one's current handle, so a renamed or deleted account is never frozen
// into the record (and audit_log never holds a handle).

export const COMPONENT_LABELS: Record<Component, string> = {
  panel: "panel",
  peer: "peer votes",
  ai_rubric: "AI rubric",
  mind_change: "mind-change",
};

export const AWARD_LABELS: Record<ProposedAward["category"], string> = {
  grand_strategist: "Grand Strategist",
  best_rebuttal: "Best rebuttal",
  best_evidence: "Best evidence",
  most_persuasive: "Most persuasive",
  best_newcomer: "Best newcomer",
};

const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const token = (id: string) => `@{user:${id}}`;

export function attentionSummary(attention: Attention[]): string {
  return attention.map((a) => a.detail).join(" ");
}

export function templateRationale(result: BlendResult, campaignTitle: string): string {
  const w = result.weights;
  const weightsLine = `The Verdict blends four parts: panel ${w.panel}%, peer votes ${w.peer}%, AI rubric ${w.ai_rubric}% and mind-change ${w.mind_change}%${
    w.source === "override" ? " (weights set by an admin for this Verdict)" : ""
  }. A steelman bonus of up to 5 points rewards fairly restating the other side before answering it.`;

  const winner = result.strategists.find((s) => s.user_id === result.winner_id);
  if (!winner) {
    return [`No Grand Strategist can be named yet for “${campaignTitle}”.`, weightsLine, attentionSummary(result.attention)].filter(Boolean).join("\n\n");
  }

  const parts = (["panel", "peer", "ai_rubric", "mind_change"] as Component[])
    .filter((c) => w[c] > 0)
    .map((c) => `${COMPONENT_LABELS[c]} ${n(winner.components[c] ?? 0)}`);
  const lines = [
    `${token(winner.user_id)} is the Grand Strategist for “${campaignTitle}”, with a final score of ${n(winner.final!)} out of 100${
      winner.steelman_bonus > 0 ? `, including a steelman bonus of ${n(winner.steelman_bonus)}` : ""
    }.`,
    `Their scores out of 100: ${parts.join(", ")}.`,
  ];
  if (winner.tie_break) lines.push(`They were level on score with the runner-up and placed first on the tie-break: ${winner.tie_break.replace(/^Placed above on /, "").replace(/\.$/, "")}.`);

  const runnersUp = result.strategists.filter((s) => s.rank !== null && s.rank > 1 && s.rank <= 3);
  if (runnersUp.length) lines.push(`Next: ${runnersUp.map((s) => `${token(s.user_id)} (${n(s.final!)})`).join(", ")}.`);
  lines.push(weightsLine);

  const awards = result.awards.filter((a) => a.category !== "grand_strategist");
  if (awards.length) lines.push(`Awards: ${awards.map((a) => `${AWARD_LABELS[a.category]}, ${token(a.profile_id)}`).join("; ")}.`);
  return lines.join("\n\n");
}

/** Replaces @{user:<id>} tokens with "@handle", or "a former Strategist". */
export function renderRationale(text: string, handles: Map<string, string | null>): string {
  return text.replace(/@\{user:([0-9a-f-]{36})\}/g, (_, id: string) => {
    const handle = handles.get(id);
    return handle ? `@${handle}` : "a former Strategist";
  });
}

/** Splits text into plain parts and Strategist references, for linking on the page. */
export function rationaleParts(text: string): ({ text: string } | { userId: string })[] {
  const out: ({ text: string } | { userId: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(/@\{user:([0-9a-f-]{36})\}/g)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ userId: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Every user id referenced in a rationale or award text. */
export function referencedUsers(...texts: string[]): string[] {
  return [...new Set(texts.flatMap((t) => [...t.matchAll(/@\{user:([0-9a-f-]{36})\}/g)].map((m) => m[1])))];
}
