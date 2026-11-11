// The Verdict blend (CLAUDE.md rule 7). Pure: no database, clock or framework
// code, so every rule here is unit tested (blend.test.ts).
//
// How a Strategist's score is built (docs: SESSION_LOG_SPRINT_5.md, "Scoring"):
//   1. Each component is normalised to 0-100.
//        panel   mean over the Strategist's Dispatches of the mean judge score,
//                where a judge's score is the mean of the four 1-5 criteria,
//                mapped 1 -> 0 and 5 -> 100
//        AI      the same, from the AI rubric (admin overrides applied)
//        peer    reputation-weighted votes received, as a share of the top
//                Strategist's (top = 100)
//        mind    "this changed my mind" credit from people whose position
//                moved, as a share of the top Strategist's (top = 100)
//   2. blended = sum(weight x component) / 100, with the weights snapshotted
//      from the Campaign's judging_weights version (or an admin override).
//   3. final = blended + steelman bonus (at most +5).
// A component with weight above zero that has no data is NOT reweighted away:
// the Strategist's final score is left empty and the draft needs an admin.

export const CRITERIA = ["logic", "evidence", "originality", "responsiveness"] as const;
export type Criterion = (typeof CRITERIA)[number];
export type Criteria = Record<Criterion, number>;

export type Position = "for" | "against" | "undecided";
export type DispatchKind = "argument" | "rebuttal" | "evidence";

export type Weights = {
  /** judging_weights.version, or null for an admin override. */
  version: number | null;
  panel: number;
  peer: number;
  ai_rubric: number;
  mind_change: number;
  source: "campaign" | "override";
  /** Why an admin overrode the Campaign's weights. */
  reason?: string;
};

export type JudgingSettings = {
  peer_vote_credits: number;
  reputation_cap_multiple: number;
  steelman_bonus_max: number;
  steelman_bonus_per_dispatch: number;
  steelman_min_confirmations: number;
  steelman_ai_min_confidence: number;
};

export type JudgingInputs = {
  dispatches: { id: string; author_id: string; kind: DispatchKind; created_at: string }[];
  judges: { assigned: number; submitted: number };
  /** Submitted (locked) panel scores only. */
  panel: ({ dispatch_id: string; judge_id: string } & Criteria)[];
  votes: { dispatch_id: string; voter_id: string }[];
  /** Reputation points of voters (missing = 0). */
  reputation: Record<string, number>;
  ai: ({ dispatch_id: string; steelman_detected: boolean; steelman_confidence: number } & Criteria)[];
  steelman: { dispatch_id: string; user_id: string }[];
  positions: { user_id: string; before: Position | null; after: Position | null }[];
  picks: { user_id: string; dispatch_id: string }[];
  /** Authors who took part in an earlier Campaign: not newcomers. */
  prior_participants: string[];
  rubric_jobs: { pending: number; failed: number };
  peer_window_open: boolean;
  settings: JudgingSettings;
};

export type Component = "panel" | "peer" | "ai_rubric" | "mind_change";
export const COMPONENTS: Component[] = ["panel", "peer", "ai_rubric", "mind_change"];

export type AttentionCode =
  | "no_dispatches"
  | "no_weights"
  | "no_panel"
  | "panel_incomplete"
  | "panel_missing_strategist"
  | "no_peer_votes"
  | "peer_window_open"
  | "ai_pending"
  | "ai_failed"
  | "ai_missing"
  | "no_mind_change"
  | "unresolved_tie";

export type Attention = { code: AttentionCode; detail: string; user_id?: string; component?: Component };

export type StrategistScore = {
  user_id: string;
  rank: number | null;
  dispatches: number;
  components: Record<Component, number | null>;
  raw: { peer_weight: number; voters: number; mind_credits: number };
  steelman_bonus: number;
  steelman_dispatches: string[];
  blended: number | null;
  final: number | null;
  first_dispatch_at: string;
  newcomer: boolean;
  /** How this Strategist's place was settled when the score tied. */
  tie_break?: string;
};

export type DispatchScore = {
  id: string;
  author_id: string;
  kind: DispatchKind;
  created_at: string;
  panel: number | null;
  ai: number | null;
  /** 0-100, for best evidence: panel and AI "evidence" criterion. */
  evidence: number | null;
  peer_weight: number;
  quality: number | null;
  steelman: boolean;
};

export type ProposedAward = {
  category: "grand_strategist" | "best_rebuttal" | "best_evidence" | "most_persuasive" | "best_newcomer";
  profile_id: string;
  dispatch_id: string | null;
  rationale: string;
};

export type BlendResult = {
  weights: Weights;
  strategists: StrategistScore[];
  dispatches: DispatchScore[];
  winner_id: string | null;
  attention: Attention[];
  awards: ProposedAward[];
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Mean of the four 1-5 criteria, mapped to 0-100. */
export function criteriaToScore(c: Criteria): number {
  const m = (c.logic + c.evidence + c.originality + c.responsiveness) / 4;
  return ((m - 1) / 4) * 100;
}

/** 1-5 mapped to 0-100. */
const oneToFive = (n: number) => ((n - 1) / 4) * 100;

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * A voter's weight: 1 + log2(1 + reputation points), so a newcomer counts 1,
 * a Strategist with 3 points counts 3. Capped at `capMultiple` times the median
 * weight of this Campaign's voters, so no one voter outweighs a thoughtful
 * minority by more than that.
 */
export function voterWeights(voterIds: string[], reputation: Record<string, number>, capMultiple: number): Map<string, number> {
  const unique = [...new Set(voterIds)];
  const raw = new Map(unique.map((id) => [id, 1 + Math.log2(1 + Math.max(0, reputation[id] ?? 0))]));
  const cap = capMultiple * median([...raw.values()]);
  return new Map([...raw].map(([id, w]) => [id, Math.min(w, cap)]));
}

/** How far a position moved: a full switch counts 1, to or from undecided 0.5. */
export function movement(before: Position | null, after: Position | null): number {
  if (!before || !after || before === after) return 0;
  return before === "undecided" || after === "undecided" ? 0.5 : 1;
}

/** The steelman bonus for a Strategist, capped. */
export function steelmanBonus(qualifying: number, settings: Pick<JudgingSettings, "steelman_bonus_max" | "steelman_bonus_per_dispatch">): number {
  return round2(Math.min(Math.min(settings.steelman_bonus_max, 5), qualifying * settings.steelman_bonus_per_dispatch));
}

// ---------------------------------------------------------------------------
// Ranking and tie-breaks
// ---------------------------------------------------------------------------

/**
 * Highest final score first (compared to two decimal places). Ties are broken,
 * in order, by: higher panel score; higher AI rubric score; more distinct peer
 * voters; earlier first Dispatch. If two Strategists are still level, the tie
 * stands and, at the top, the draft needs an admin. There is no coin toss.
 */
export function compareStrategists(a: StrategistScore, b: StrategistScore): { order: number; by: string | null } {
  const fa = a.final === null ? -Infinity : round2(a.final);
  const fb = b.final === null ? -Infinity : round2(b.final);
  if (fa !== fb) return { order: fb - fa, by: null };
  const steps: [string, number][] = [
    ["panel score", (b.components.panel ?? -1) - (a.components.panel ?? -1)],
    ["AI rubric score", (b.components.ai_rubric ?? -1) - (a.components.ai_rubric ?? -1)],
    ["number of peer voters", b.raw.voters - a.raw.voters],
    ["earlier first Dispatch", Date.parse(a.first_dispatch_at) - Date.parse(b.first_dispatch_at)],
  ];
  for (const [by, diff] of steps) if (round2(diff) !== 0) return { order: diff, by };
  return { order: 0, by: null };
}

function rank(list: StrategistScore[]): { ranked: StrategistScore[]; topTie: boolean } {
  const ranked = [...list].sort((a, b) => compareStrategists(a, b).order || a.user_id.localeCompare(b.user_id));
  let topTie = false;
  ranked.forEach((s, i) => {
    if (s.final === null) {
      s.rank = null;
      return;
    }
    const prev = ranked[i - 1];
    if (prev && prev.final !== null) {
      const cmp = compareStrategists(prev, s);
      if (cmp.order === 0) {
        s.rank = prev.rank;
        if (prev.rank === 1) topTie = true;
        return;
      }
      if (round2(prev.final) === round2(s.final) && cmp.by) {
        prev.tie_break ??= `Placed above on ${cmp.by}.`;
        s.tie_break = `Placed below on ${cmp.by}.`;
      }
    }
    s.rank = i + 1;
  });
  return { ranked, topTie };
}

// ---------------------------------------------------------------------------
// The blend
// ---------------------------------------------------------------------------

export function blend(inputs: JudgingInputs, weights: Weights | null): BlendResult {
  const attention: Attention[] = [];
  const w: Weights = weights ?? { version: null, panel: 0, peer: 0, ai_rubric: 0, mind_change: 0, source: "campaign" };
  if (!weights) attention.push({ code: "no_weights", detail: "This Campaign has no judging weights version." });
  const weighted = (c: Component) => w[c] > 0;

  const eligible = new Map(inputs.dispatches.map((d) => [d.id, d]));
  const authors = [...new Set(inputs.dispatches.map((d) => d.author_id))];
  if (!authors.length) attention.push({ code: "no_dispatches", detail: "No eligible Dispatches: nothing to judge." });

  // Panel: per Dispatch, mean over judges.
  const panelByDispatch = new Map<string, number[]>();
  const panelEvidence = new Map<string, number[]>();
  for (const p of inputs.panel) {
    if (!eligible.has(p.dispatch_id)) continue;
    panelByDispatch.set(p.dispatch_id, [...(panelByDispatch.get(p.dispatch_id) ?? []), criteriaToScore(p)]);
    panelEvidence.set(p.dispatch_id, [...(panelEvidence.get(p.dispatch_id) ?? []), oneToFive(p.evidence)]);
  }
  // AI rubric: one (latest) score per Dispatch.
  const aiByDispatch = new Map(inputs.ai.filter((a) => eligible.has(a.dispatch_id)).map((a) => [a.dispatch_id, a]));

  // Peer: reputation-weighted, never on your own Dispatch (also enforced in the database).
  const votes = inputs.votes.filter((v) => eligible.has(v.dispatch_id) && eligible.get(v.dispatch_id)!.author_id !== v.voter_id);
  const weightOf = voterWeights(
    votes.map((v) => v.voter_id),
    inputs.reputation,
    inputs.settings.reputation_cap_multiple,
  );
  const peerByDispatch = new Map<string, number>();
  for (const v of votes) peerByDispatch.set(v.dispatch_id, (peerByDispatch.get(v.dispatch_id) ?? 0) + weightOf.get(v.voter_id)!);

  // Steelman: AI-detected AND confirmed by enough other people (never the author).
  const confirmations = new Map<string, number>();
  for (const f of inputs.steelman) {
    const d = eligible.get(f.dispatch_id);
    if (d && d.author_id !== f.user_id) confirmations.set(f.dispatch_id, (confirmations.get(f.dispatch_id) ?? 0) + 1);
  }
  const steelmanOk = (id: string) => {
    const ai = aiByDispatch.get(id);
    return Boolean(
      ai && ai.steelman_detected && ai.steelman_confidence >= inputs.settings.steelman_ai_min_confidence && (confirmations.get(id) ?? 0) >= inputs.settings.steelman_min_confirmations,
    );
  };

  // Mind-change: picks by people whose position moved, credited to the author.
  const moved = new Map(inputs.positions.map((p) => [p.user_id, movement(p.before, p.after)]));
  const hasPositions = inputs.positions.some((p) => p.before && p.after);
  const mindCredits = new Map<string, number>();
  for (const pick of inputs.picks) {
    const d = eligible.get(pick.dispatch_id);
    const m = moved.get(pick.user_id) ?? 0;
    if (!d || d.author_id === pick.user_id || m === 0) continue;
    mindCredits.set(d.author_id, (mindCredits.get(d.author_id) ?? 0) + m);
  }

  // Dispatch scores (for awards and the breakdown).
  const qualityWeights = { panel: w.panel, ai: w.ai_rubric };
  const dispatches: DispatchScore[] = inputs.dispatches.map((d) => {
    const panel = mean(panelByDispatch.get(d.id) ?? []);
    const ai = aiByDispatch.get(d.id);
    const aiScore = ai ? criteriaToScore(ai) : null;
    const evidenceParts = [...(panelEvidence.get(d.id) ?? []), ...(ai ? [oneToFive(ai.evidence)] : [])];
    const parts: [number | null, number][] = [
      [panel, qualityWeights.panel || 1],
      [aiScore, qualityWeights.ai || 1],
    ];
    const present = parts.filter(([v]) => v !== null) as [number, number][];
    const quality = present.length ? present.reduce((t, [v, k]) => t + v * k, 0) / present.reduce((t, [, k]) => t + k, 0) : null;
    return {
      id: d.id,
      author_id: d.author_id,
      kind: d.kind,
      created_at: d.created_at,
      panel: panel === null ? null : round2(panel),
      ai: aiScore === null ? null : round2(aiScore),
      evidence: evidenceParts.length ? round2(mean(evidenceParts)!) : null,
      peer_weight: round2(peerByDispatch.get(d.id) ?? 0),
      quality: quality === null ? null : round2(quality),
      steelman: steelmanOk(d.id),
    };
  });

  // Campaign-level gaps.
  if (weighted("panel")) {
    if (inputs.judges.submitted === 0) attention.push({ code: "no_panel", component: "panel", detail: "No judge has submitted panel scores." });
    else if (inputs.judges.submitted < inputs.judges.assigned)
      attention.push({ code: "panel_incomplete", component: "panel", detail: `${inputs.judges.submitted} of ${inputs.judges.assigned} judges have submitted.` });
  }
  if (weighted("peer")) {
    if (inputs.peer_window_open) attention.push({ code: "peer_window_open", component: "peer", detail: "Peer voting is still open." });
    else if (!votes.length) attention.push({ code: "no_peer_votes", component: "peer", detail: "No peer votes were cast." });
  }
  if (weighted("ai_rubric")) {
    if (inputs.rubric_jobs.pending) attention.push({ code: "ai_pending", component: "ai_rubric", detail: `${inputs.rubric_jobs.pending} Dispatch(es) still waiting for AI scoring.` });
    if (inputs.rubric_jobs.failed) attention.push({ code: "ai_failed", component: "ai_rubric", detail: `AI scoring failed for ${inputs.rubric_jobs.failed} Dispatch(es). Re-run it or override.` });
    const unscored = inputs.dispatches.filter((d) => !aiByDispatch.has(d.id)).length;
    if (unscored && !inputs.rubric_jobs.pending && !inputs.rubric_jobs.failed)
      attention.push({ code: "ai_missing", component: "ai_rubric", detail: `${unscored} Dispatch(es) have no AI rubric score.` });
  }
  if (weighted("mind_change") && !hasPositions)
    attention.push({ code: "no_mind_change", component: "mind_change", detail: "Nobody recorded both a before and an after position, so movement cannot be measured." });

  const campaignMissing = new Set(attention.filter((a) => a.component).map((a) => a.component!));
  // An open peer window or pending AI scoring makes the component incomplete, not just flagged.

  const maxPeer = Math.max(0, ...authors.map((u) => dispatches.filter((d) => d.author_id === u).reduce((t, d) => t + d.peer_weight, 0)));
  const maxMind = Math.max(0, ...mindCredits.values());

  const priors = new Set(inputs.prior_participants);
  const strategists: StrategistScore[] = authors.map((user_id) => {
    const mine = dispatches.filter((d) => d.author_id === user_id);
    const panelScores = mine.map((d) => d.panel).filter((x): x is number => x !== null);
    const aiScores = mine.map((d) => d.ai).filter((x): x is number => x !== null);
    const peerWeight = mine.reduce((t, d) => t + d.peer_weight, 0);
    const voters = new Set(votes.filter((v) => eligible.get(v.dispatch_id)!.author_id === user_id).map((v) => v.voter_id)).size;
    const credits = mindCredits.get(user_id) ?? 0;

    const components: Record<Component, number | null> = {
      panel: campaignMissing.has("panel") || !panelScores.length ? null : round2(mean(panelScores)!),
      ai_rubric: campaignMissing.has("ai_rubric") || aiScores.length < mine.length ? null : round2(mean(aiScores)!),
      peer: campaignMissing.has("peer") ? null : round2(maxPeer > 0 ? (peerWeight / maxPeer) * 100 : 0),
      mind_change: campaignMissing.has("mind_change") ? null : round2(maxMind > 0 ? (credits / maxMind) * 100 : 0),
    };
    if (weighted("panel") && !campaignMissing.has("panel") && !panelScores.length)
      attention.push({ code: "panel_missing_strategist", component: "panel", user_id, detail: "No submitted panel score for any of this Strategist's Dispatches." });

    const steelmanDispatches = mine.filter((d) => d.steelman).map((d) => d.id);
    const bonus = steelmanBonus(steelmanDispatches.length, inputs.settings);
    const complete = COMPONENTS.every((c) => !weighted(c) || components[c] !== null);
    const blended = weights && complete ? round2(COMPONENTS.reduce((t, c) => t + (weighted(c) ? (w[c] * components[c]!) / 100 : 0), 0)) : null;

    return {
      user_id,
      rank: null,
      dispatches: mine.length,
      components,
      raw: { peer_weight: round2(peerWeight), voters, mind_credits: credits },
      steelman_bonus: bonus,
      steelman_dispatches: steelmanDispatches,
      blended,
      final: blended === null ? null : round2(blended + bonus),
      first_dispatch_at: mine.map((d) => d.created_at).sort()[0],
      newcomer: !priors.has(user_id),
    };
  });

  const { ranked, topTie } = rank(strategists);
  if (topTie) attention.push({ code: "unresolved_tie", detail: "Two or more Strategists are level at the top after every tie-break. An admin must decide." });
  const winner = !topTie && ranked[0]?.rank === 1 ? ranked[0] : null;

  return {
    weights: w,
    strategists: ranked,
    dispatches,
    winner_id: winner?.user_id ?? null,
    attention,
    awards: winner ? proposeAwards(winner, ranked, dispatches) : [],
  };
}

// ---------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------

const token = (userId: string) => `@{user:${userId}}`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Best first; ties go to the earlier Dispatch. */
function topBy<T extends { created_at: string }>(items: T[], score: (t: T) => number | null): T | null {
  let best: T | null = null;
  for (const item of items) {
    const s = score(item);
    if (s === null) continue;
    const b = best ? score(best)! : -Infinity;
    if (s > b || (s === b && best && item.created_at < best.created_at)) best = item;
  }
  return best;
}

/**
 * Grand Strategist: the winner. Best rebuttal: the highest-quality rebuttal.
 * Best evidence: the Dispatch with the highest evidence criterion (panel and
 * AI). Most persuasive: most mind-change credit (falls back to peer weight if
 * nobody's mind moved). Best newcomer: the highest-placed Strategist in their
 * first Campaign, other than the winner.
 */
export function proposeAwards(winner: StrategistScore, ranked: StrategistScore[], dispatches: DispatchScore[]): ProposedAward[] {
  const awards: ProposedAward[] = [
    {
      category: "grand_strategist",
      profile_id: winner.user_id,
      dispatch_id: null,
      rationale: `${token(winner.user_id)} had the highest final score: ${fmt(winner.final!)}.`,
    },
  ];
  const rebuttal = topBy(
    dispatches.filter((d) => d.kind === "rebuttal"),
    (d) => d.quality,
  );
  if (rebuttal)
    awards.push({ category: "best_rebuttal", profile_id: rebuttal.author_id, dispatch_id: rebuttal.id, rationale: `${token(rebuttal.author_id)} wrote the highest-scoring rebuttal (${fmt(rebuttal.quality!)} out of 100 from the panel and AI rubric).` });

  const evidence = topBy(dispatches, (d) => (d.evidence === null ? null : d.evidence + (d.quality ?? 0) / 1000));
  if (evidence)
    awards.push({ category: "best_evidence", profile_id: evidence.author_id, dispatch_id: evidence.id, rationale: `${token(evidence.author_id)} made the best-evidenced Dispatch (evidence score ${fmt(evidence.evidence!)} out of 100).` });

  const withFinal = ranked.filter((s) => s.final !== null);
  const byMind = [...withFinal].sort((a, b) => b.raw.mind_credits - a.raw.mind_credits || (a.rank ?? 99) - (b.rank ?? 99))[0];
  if (byMind && byMind.raw.mind_credits > 0) {
    awards.push({ category: "most_persuasive", profile_id: byMind.user_id, dispatch_id: null, rationale: `${token(byMind.user_id)} changed the most minds: their Dispatches were picked by Strategists whose position moved (${fmt(byMind.raw.mind_credits)} movement credit).` });
  } else {
    const byPeer = [...withFinal].sort((a, b) => b.raw.peer_weight - a.raw.peer_weight || (a.rank ?? 99) - (b.rank ?? 99))[0];
    if (byPeer && byPeer.raw.peer_weight > 0)
      awards.push({ category: "most_persuasive", profile_id: byPeer.user_id, dispatch_id: null, rationale: `${token(byPeer.user_id)} received the most weighted peer votes. Nobody recorded a change of mind, so peer votes decided this award.` });
  }

  const newcomer = withFinal.find((s) => s.newcomer && s.user_id !== winner.user_id);
  if (newcomer)
    awards.push({ category: "best_newcomer", profile_id: newcomer.user_id, dispatch_id: null, rationale: `${token(newcomer.user_id)} placed highest among Strategists in their first Campaign (final score ${fmt(newcomer.final!)}).` });
  return awards;
}
