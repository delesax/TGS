import type { DispatchLimits } from "@/lib/dispatches";

// The rules text for an open-arena Campaign, built in ONE place from the live Dispatch limits (community_settings, read with
// getDispatchLimits) and the fixed paragraphs below. The Campaign draft helper shows it; no AI writes any of it. A stale copy of
// this text was pasted into a Campaign once, so tests fail if it disagrees with the limits or with docs/campaigns/*.md.

const n = (value: number) => value.toLocaleString("en-GB");

/** 30 -> "30 seconds", 300 -> "5 minutes", 60 -> "1 minute", 90 -> "90 seconds". */
export function describeDuration(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${n(minutes)} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${n(seconds)} ${seconds === 1 ? "second" : "seconds"}`;
}

/** The corrected paragraph (15 Nov 2026): the 48-hour, 24-hour and 72-hour figures are the live pick rules, not Dispatch limits. */
export const CHANGING_YOUR_MIND =
  "If a Dispatch changes your mind, you can pick it. Your account must be at least 48 hours old and you must have taken part in this Campaign. You can pick while the Campaign is open or during its 72-hour peer-voting window. For your pick to count, your recorded position must have changed over at least 24 hours.";

export function buildOpenArenaRules(limits: DispatchLimits): string {
  return [
    "This is an open arena: there are no rounds. You can post at any time while the Campaign is open.",
    "",
    "What you can post",
    `An Argument can be up to ${n(limits.argument_max_chars)} characters. A Rebuttal can be up to ${n(limits.rebuttal_max_chars)} characters. Evidence can be up to ${n(limits.evidence_max_chars)} characters.`,
    `You can post up to ${n(limits.max_dispatches_per_round)} Dispatches in this Campaign. If you reach the limit, the message may say "in this round": it means the Campaign.`,
    `You can post again ${describeDuration(limits.cooldown_seconds)} after your last Dispatch, and you can edit a Dispatch for ${describeDuration(limits.edit_window_seconds)} after posting it.`,
    "",
    "Being open about AI",
    "Each Dispatch carries a declaration: none, assisted or generated. It is shown publicly. Please declare honestly.",
    "",
    "Keeping it civil",
    "Handles and Dispatches are screened. Anything held is hidden until a person has checked it. Screening never deletes anything, and only an admin can remove a Dispatch. Argue with the idea, not the person.",
    "",
    "Changing your mind",
    CHANGING_YOUR_MIND,
    "",
    "How it is judged",
    'The four criteria and the blend of judging weights are set out under "How this Campaign is judged" on this page, and are fixed before the Campaign opens.',
    "",
    "The clock",
    "The countdown on this page uses the server's time. It is the only clock that counts.",
  ].join("\n");
}
