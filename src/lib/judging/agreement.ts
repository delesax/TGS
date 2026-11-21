// Peer-vote agreement (spec item e, docs/POST_LAUNCH_GAPS_SPEC.md). PURE AND NOT WIRED: nothing imports this yet, no migration exists,
// the blend and the published weights are untouched, and no Campaign uses it. It is the arithmetic the spec describes, tested on its
// own so the design can be reviewed (and the legal question answered) before anything is connected to a Verdict.
//
// Circularity guard: agreement is measured against quality built from the panel and the AI rubric ONLY. Peer votes never feed it,
// so voters cannot raise their own agreement by voting alike.

export type Vote = { voter_id: string; dispatch_id: string };

export type AgreementCount = { votes: number; agreed: number };

/** The median of a list (mean of the two middle values for an even count); null for an empty list. */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * For one finished Campaign: how many of each voter's votes went to a Dispatch in the top half by quality (at or above the median of
 * the scored Dispatches). `quality` maps a Dispatch id to its panel-and-AI quality, 0 to 100; a Dispatch with no quality is not
 * counted (the vote is skipped, neither for nor against). With fewer than 2 scored Dispatches there is no "top half": nothing counts.
 */
export function agreementByVoter(votes: Vote[], quality: Record<string, number | null | undefined>): Map<string, AgreementCount> {
  const scored = Object.values(quality).filter((q): q is number => typeof q === "number");
  const cut = scored.length >= 2 ? median(scored) : null;
  const out = new Map<string, AgreementCount>();
  if (cut === null) return out;
  for (const v of votes) {
    const q = quality[v.dispatch_id];
    if (typeof q !== "number") continue;
    const row = out.get(v.voter_id) ?? { votes: 0, agreed: 0 };
    row.votes += 1;
    if (q >= cut) row.agreed += 1;
    out.set(v.voter_id, row);
  }
  return out;
}

export const AGREEMENT_MIN_VOTES = 10;
export const AGREEMENT_WINDOW_CAMPAIGNS = 5;

/**
 * A voter's agreement rate over their most recent Campaigns (newest first in `history`, one entry per Campaign they voted in), or
 * null until they have at least `minVotes` votes in the window, so one Campaign cannot move it.
 */
export function agreementRate(history: AgreementCount[], opts: { window?: number; minVotes?: number } = {}): number | null {
  const window = opts.window ?? AGREEMENT_WINDOW_CAMPAIGNS;
  const minVotes = opts.minVotes ?? AGREEMENT_MIN_VOTES;
  const recent = history.slice(0, window);
  const votes = recent.reduce((n, h) => n + h.votes, 0);
  if (votes < minVotes) return null;
  return recent.reduce((n, h) => n + h.agreed, 0) / votes;
}

/** Bounds on a vote's weight factor: nobody is silenced and nobody can swamp. */
export type FactorBounds = { min: number; max: number };
export const DEFAULT_FACTOR_BOUNDS: FactorBounds = { min: 0.5, max: 1.5 };

/**
 * The multiplier on a voter's weight. No rate yet gives exactly 1 (a new voter is neither helped nor hurt). Otherwise it runs
 * linearly from `min` at a rate of 0 to `max` at a rate of 1, and an average rate of 0.5 gives the midpoint of the bounds.
 * The numbers are a placeholder: the spec says the real bounds are chosen from data after three Verdicts.
 */
export function voteWeightFactor(rate: number | null, bounds: FactorBounds = DEFAULT_FACTOR_BOUNDS): number {
  if (rate === null) return 1;
  const r = Math.min(1, Math.max(0, rate));
  return Math.round((bounds.min + (bounds.max - bounds.min) * r) * 1000) / 1000;
}
