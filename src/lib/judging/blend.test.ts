import { describe, expect, it } from "vitest";
import { blend, compareStrategists, criteriaToScore, median, movement, steelmanBonus, voterWeights, type Criteria, type JudgingInputs, type StrategistScore, type Weights } from "./blend";
import { chooseWeights } from "./compute";
import { referencedUsers, renderRationale, templateRationale } from "./rationale";

const DEFAULT_WEIGHTS: Weights = { version: 1, panel: 40, peer: 25, ai_rubric: 25, mind_change: 10, source: "campaign" };
const SETTINGS: JudgingInputs["settings"] = {
  peer_vote_credits: 5,
  reputation_cap_multiple: 3,
  steelman_bonus_max: 5,
  steelman_bonus_per_dispatch: 2.5,
  steelman_min_confirmations: 2,
  steelman_ai_min_confidence: 0.6,
};

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = uid(1);
const B = uid(2);
const C = uid(3);
const V = [uid(11), uid(12), uid(13), uid(14)];
const c = (n: number): Criteria => ({ logic: n, evidence: n, originality: n, responsiveness: n });

/** Three Strategists, one Dispatch each, every component present. A is best on panel and AI. */
function inputs(overrides: Partial<JudgingInputs> = {}): JudgingInputs {
  return {
    dispatches: [
      { id: "da", author_id: A, kind: "argument", created_at: "2026-11-01T10:00:00Z" },
      { id: "db", author_id: B, kind: "rebuttal", created_at: "2026-11-01T11:00:00Z" },
      { id: "dc", author_id: C, kind: "evidence", created_at: "2026-11-01T12:00:00Z" },
    ],
    judges: { assigned: 1, submitted: 1 },
    panel: [
      { dispatch_id: "da", judge_id: "j1", ...c(5) },
      { dispatch_id: "db", judge_id: "j1", ...c(3) },
      { dispatch_id: "dc", judge_id: "j1", ...c(2) },
    ],
    votes: [
      { dispatch_id: "da", voter_id: B },
      { dispatch_id: "db", voter_id: A },
      { dispatch_id: "da", voter_id: C },
    ],
    reputation: {},
    ai: [
      { dispatch_id: "da", ...c(4), steelman_detected: false, steelman_confidence: 0 },
      { dispatch_id: "db", ...c(3), steelman_detected: false, steelman_confidence: 0 },
      { dispatch_id: "dc", ...c(2), steelman_detected: false, steelman_confidence: 0 },
    ],
    steelman: [],
    positions: [
      { user_id: V[0], before: "for", after: "against" },
      { user_id: V[1], before: "undecided", after: "for" },
    ],
    picks: [
      { user_id: V[0], dispatch_id: "da" },
      { user_id: V[1], dispatch_id: "db" },
    ],
    prior_participants: [A],
    rubric_jobs: { pending: 0, failed: 0 },
    peer_window_open: false,
    settings: SETTINGS,
    ...overrides,
  };
}

describe("normalising components", () => {
  it("maps the mean of four 1-5 criteria to 0-100", () => {
    expect(criteriaToScore(c(1))).toBe(0);
    expect(criteriaToScore(c(5))).toBe(100);
    expect(criteriaToScore({ logic: 3, evidence: 3, originality: 4, responsiveness: 2 })).toBe(50);
  });

  it("counts a full switch of position as 1 and a move to or from undecided as 0.5", () => {
    expect(movement("for", "against")).toBe(1);
    expect(movement("undecided", "for")).toBe(0.5);
    expect(movement("for", "for")).toBe(0);
    expect(movement(null, "for")).toBe(0);
  });
});

describe("blending with the snapshot weights", () => {
  it("applies the weights to every component and names the winner", () => {
    const r = blend(inputs(), DEFAULT_WEIGHTS);
    expect(r.attention).toEqual([]);
    const a = r.strategists.find((s) => s.user_id === A)!;
    // panel 100, peer 100 (top), AI 75, mind-change 100 (top: 1 credit)
    expect(a.components).toEqual({ panel: 100, peer: 100, ai_rubric: 75, mind_change: 100 });
    expect(a.blended).toBe(0.4 * 100 + 0.25 * 100 + 0.25 * 75 + 0.1 * 100);
    expect(r.winner_id).toBe(A);
    expect(r.strategists.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it("records the weights it used, so a later change of weights does not alter the Verdict", () => {
    const r = blend(inputs(), DEFAULT_WEIGHTS);
    expect(r.weights).toEqual(DEFAULT_WEIGHTS);
    const other = blend(inputs(), { ...DEFAULT_WEIGHTS, version: 2, panel: 10, ai_rubric: 55 });
    expect(other.weights.version).toBe(2);
    expect(other.strategists[0].blended).not.toBe(r.strategists[0].blended);
  });

  it("takes the Campaign's weights unless an admin overrides them with a reason", () => {
    const campaign = { weights: { version: 3, panel: 40, peer: 25, ai_rubric: 25, mind_change: 10 } };
    expect(chooseWeights(campaign)).toEqual({ ...campaign.weights, source: "campaign" });
    expect(chooseWeights(campaign, { panel: 50, peer: 25, ai_rubric: 25, mind_change: 0, reason: "No positions recorded" })).toMatchObject({
      version: null,
      source: "override",
      mind_change: 0,
      reason: "No positions recorded",
    });
    expect(() => chooseWeights(campaign, { panel: 50, peer: 25, ai_rubric: 25, mind_change: 10, reason: "x" })).toThrow(/WEIGHTS_SUM/);
    expect(() => chooseWeights(campaign, { panel: 50, peer: 25, ai_rubric: 25, mind_change: 0, reason: " " })).toThrow(/REASON_REQUIRED/);
  });
});

describe("missing components are never silently reweighted", () => {
  it("leaves final scores empty and flags the draft when no panel has submitted", () => {
    const r = blend(inputs({ panel: [], judges: { assigned: 2, submitted: 0 } }), DEFAULT_WEIGHTS);
    expect(r.attention.map((a) => a.code)).toContain("no_panel");
    expect(r.strategists.every((s) => s.final === null && s.components.panel === null)).toBe(true);
    expect(r.winner_id).toBeNull();
    expect(r.awards).toEqual([]);
  });

  it("flags missing mind-change data, no peer votes, open voting and pending or failed AI scoring", () => {
    expect(blend(inputs({ positions: [] }), DEFAULT_WEIGHTS).attention.map((a) => a.code)).toEqual(["no_mind_change"]);
    expect(blend(inputs({ votes: [] }), DEFAULT_WEIGHTS).attention.map((a) => a.code)).toEqual(["no_peer_votes"]);
    expect(blend(inputs({ peer_window_open: true }), DEFAULT_WEIGHTS).attention.map((a) => a.code)).toEqual(["peer_window_open"]);
    expect(blend(inputs({ rubric_jobs: { pending: 2, failed: 0 } }), DEFAULT_WEIGHTS).attention.map((a) => a.code)).toEqual(["ai_pending"]);
    expect(blend(inputs({ rubric_jobs: { pending: 0, failed: 1 } }), DEFAULT_WEIGHTS).attention.map((a) => a.code)).toEqual(["ai_failed"]);
    const partialAi = blend(inputs({ ai: inputs().ai.slice(1) }), DEFAULT_WEIGHTS);
    expect(partialAi.attention.map((a) => a.code)).toEqual(["ai_missing"]);
    expect(partialAi.strategists.find((s) => s.user_id === A)!.final).toBeNull();
  });

  it("flags a Strategist the panel did not score", () => {
    const r = blend(inputs({ panel: inputs().panel.slice(0, 2) }), DEFAULT_WEIGHTS);
    expect(r.attention).toContainEqual(expect.objectContaining({ code: "panel_missing_strategist", user_id: C }));
    expect(r.strategists.find((s) => s.user_id === C)!.final).toBeNull();
  });

  it("does not need a component whose weight is zero (an explicit admin choice)", () => {
    const r = blend(inputs({ positions: [] }), { ...DEFAULT_WEIGHTS, panel: 50, mind_change: 0, version: null, source: "override", reason: "No positions" });
    expect(r.attention).toEqual([]);
    expect(r.winner_id).toBe(A);
  });

  it("flags a Campaign with no weights version", () => {
    expect(blend(inputs(), null).attention.map((a) => a.code)).toContain("no_weights");
  });
});

describe("tie-breaks", () => {
  const base = (over: Partial<StrategistScore>): StrategistScore => ({
    user_id: A,
    rank: null,
    dispatches: 1,
    components: { panel: 50, peer: 50, ai_rubric: 50, mind_change: 50 },
    raw: { peer_weight: 1, voters: 1, mind_credits: 0 },
    steelman_bonus: 0,
    steelman_dispatches: [],
    blended: 50,
    final: 50,
    first_dispatch_at: "2026-11-01T10:00:00Z",
    newcomer: false,
    ...over,
  });

  it("orders by final score first", () => {
    expect(compareStrategists(base({ final: 60 }), base({ final: 50 })).order).toBeLessThan(0);
  });

  it("then panel, then AI rubric, then distinct voters, then the earlier first Dispatch", () => {
    expect(compareStrategists(base({ components: { panel: 60, peer: 0, ai_rubric: 0, mind_change: 0 } }), base({})).by).toBe("panel score");
    expect(compareStrategists(base({ components: { panel: 50, peer: 50, ai_rubric: 70, mind_change: 50 } }), base({})).by).toBe("AI rubric score");
    expect(compareStrategists(base({ raw: { peer_weight: 1, voters: 3, mind_credits: 0 } }), base({})).by).toBe("number of peer voters");
    const earlier = compareStrategists(base({ first_dispatch_at: "2026-11-01T09:00:00Z" }), base({}));
    expect(earlier.by).toBe("earlier first Dispatch");
    expect(earlier.order).toBeLessThan(0);
  });

  it("explains a tie settled by a tie-break in the ranking", () => {
    // A and B identical except B's Dispatch came later: A wins on the last tie-break.
    const r = blend(
      inputs({
        dispatches: [
          { id: "da", author_id: A, kind: "argument", created_at: "2026-11-01T10:00:00Z" },
          { id: "db", author_id: B, kind: "argument", created_at: "2026-11-01T11:00:00Z" },
        ],
        panel: [
          { dispatch_id: "da", judge_id: "j1", ...c(4) },
          { dispatch_id: "db", judge_id: "j1", ...c(4) },
        ],
        ai: [
          { dispatch_id: "da", ...c(4), steelman_detected: false, steelman_confidence: 0 },
          { dispatch_id: "db", ...c(4), steelman_detected: false, steelman_confidence: 0 },
        ],
        votes: [
          { dispatch_id: "da", voter_id: V[0] },
          { dispatch_id: "db", voter_id: V[1] },
        ],
        picks: [],
        positions: [{ user_id: V[0], before: "for", after: "for" }],
      }),
      DEFAULT_WEIGHTS,
    );
    expect(r.winner_id).toBe(A);
    expect(r.strategists[0].tie_break).toMatch(/earlier first Dispatch/);
    expect(r.strategists[1].rank).toBe(2);
  });

  it("does not pick a winner when two are level after every tie-break", () => {
    const same = "2026-11-01T10:00:00Z";
    const r = blend(
      inputs({
        dispatches: [
          { id: "da", author_id: A, kind: "argument", created_at: same },
          { id: "db", author_id: B, kind: "argument", created_at: same },
        ],
        panel: [
          { dispatch_id: "da", judge_id: "j1", ...c(4) },
          { dispatch_id: "db", judge_id: "j1", ...c(4) },
        ],
        ai: [
          { dispatch_id: "da", ...c(4), steelman_detected: false, steelman_confidence: 0 },
          { dispatch_id: "db", ...c(4), steelman_detected: false, steelman_confidence: 0 },
        ],
        votes: [
          { dispatch_id: "da", voter_id: V[0] },
          { dispatch_id: "db", voter_id: V[1] },
        ],
        picks: [],
        positions: [{ user_id: V[0], before: "for", after: "for" }],
      }),
      DEFAULT_WEIGHTS,
    );
    expect(r.attention.map((a) => a.code)).toContain("unresolved_tie");
    expect(r.winner_id).toBeNull();
    expect(r.strategists.map((s) => s.rank)).toEqual([1, 1]);
  });
});

describe("steelman bonus", () => {
  it("is capped at 5 points, whatever the settings say", () => {
    expect(steelmanBonus(1, SETTINGS)).toBe(2.5);
    expect(steelmanBonus(2, SETTINGS)).toBe(5);
    expect(steelmanBonus(10, SETTINGS)).toBe(5);
    expect(steelmanBonus(10, { steelman_bonus_max: 50, steelman_bonus_per_dispatch: 5 })).toBe(5);
  });

  it("needs both the AI detection and enough confirmations from other people", () => {
    const ai = inputs().ai.map((a) => (a.dispatch_id === "dc" ? { ...a, steelman_detected: true, steelman_confidence: 0.9 } : a));
    const confirmedByOthers = [
      { dispatch_id: "dc", user_id: A },
      { dispatch_id: "dc", user_id: B },
    ];
    const ok = blend(inputs({ ai, steelman: confirmedByOthers }), DEFAULT_WEIGHTS).strategists.find((s) => s.user_id === C)!;
    expect(ok.steelman_bonus).toBe(2.5);
    expect(ok.final).toBe(ok.blended! + 2.5);

    const aiOnly = blend(inputs({ ai, steelman: [] }), DEFAULT_WEIGHTS).strategists.find((s) => s.user_id === C)!;
    expect(aiOnly.steelman_bonus).toBe(0);

    const peersOnly = blend(inputs({ steelman: confirmedByOthers }), DEFAULT_WEIGHTS).strategists.find((s) => s.user_id === C)!;
    expect(peersOnly.steelman_bonus).toBe(0);
  });

  it("cannot be self-awarded: the author's own confirmation does not count", () => {
    const ai = inputs().ai.map((a) => (a.dispatch_id === "dc" ? { ...a, steelman_detected: true, steelman_confidence: 0.9 } : a));
    const r = blend(
      inputs({
        ai,
        steelman: [
          { dispatch_id: "dc", user_id: C },
          { dispatch_id: "dc", user_id: A },
        ],
      }),
      DEFAULT_WEIGHTS,
    );
    expect(r.strategists.find((s) => s.user_id === C)!.steelman_bonus).toBe(0);
  });
});

describe("reputation-weighted peer votes", () => {
  it("gives a newcomer weight 1 and grows with reputation", () => {
    const w = voterWeights([V[0], V[1]], { [V[1]]: 3 }, 3);
    expect(w.get(V[0])).toBe(1);
    expect(w.get(V[1])).toBe(3);
  });

  it("caps any voter at 3 times the median weight", () => {
    const w = voterWeights([V[0], V[1], V[2]], { [V[2]]: 100_000 }, 3);
    expect(median([...w.values()])).toBe(1);
    expect(w.get(V[2])).toBe(3);
  });

  it("ignores votes on your own Dispatch even if one reached the data", () => {
    const r = blend(inputs({ votes: [{ dispatch_id: "da", voter_id: A }, { dispatch_id: "db", voter_id: C }] }), DEFAULT_WEIGHTS);
    expect(r.strategists.find((s) => s.user_id === A)!.raw.voters).toBe(0);
  });
});

describe("mind-change", () => {
  it("credits only picks from people whose position moved, and never your own Dispatch", () => {
    const r = blend(
      inputs({
        positions: [
          { user_id: V[0], before: "for", after: "against" },
          { user_id: V[1], before: "for", after: "for" },
          { user_id: B, before: "against", after: "for" },
        ],
        picks: [
          { user_id: V[0], dispatch_id: "dc" },
          { user_id: V[1], dispatch_id: "da" },
          { user_id: B, dispatch_id: "db" },
        ],
      }),
      DEFAULT_WEIGHTS,
    );
    const byUser = new Map(r.strategists.map((s) => [s.user_id, s]));
    expect(byUser.get(C)!.raw.mind_credits).toBe(1);
    expect(byUser.get(A)!.raw.mind_credits).toBe(0);
    expect(byUser.get(B)!.raw.mind_credits).toBe(0);
    expect(byUser.get(C)!.components.mind_change).toBe(100);
  });
});

describe("awards and rationale", () => {
  it("proposes the Grand Strategist and the category awards", () => {
    const r = blend(inputs(), DEFAULT_WEIGHTS);
    const byCategory = Object.fromEntries(r.awards.map((a) => [a.category, a]));
    expect(byCategory.grand_strategist.profile_id).toBe(A);
    expect(byCategory.best_rebuttal).toMatchObject({ profile_id: B, dispatch_id: "db" });
    expect(byCategory.best_evidence.profile_id).toBe(A);
    expect(byCategory.most_persuasive.profile_id).toBe(A);
    // A took part before; the winner is never best newcomer; B placed higher than C.
    expect(byCategory.best_newcomer.profile_id).toBe(B);
  });

  it("writes a rationale with user tokens, never handles, and renders them later", () => {
    const r = blend(inputs(), DEFAULT_WEIGHTS);
    const text = templateRationale(r, "Should X?");
    expect(text).toContain(`@{user:${A}}`);
    expect(text).toMatch(/panel 40%, peer votes 25%, AI rubric 25% and mind-change 10%/);
    expect(referencedUsers(text)).toEqual(expect.arrayContaining([A, B, C]));
    const shown = renderRationale(text, new Map([[A, "Ada"], [B, null]]));
    expect(shown).toContain("@Ada is the Grand Strategist");
    expect(shown).toContain("a former Strategist");
    expect(shown).not.toContain("@{user:");
  });

  it("says why no winner can be named when the draft needs attention", () => {
    const r = blend(inputs({ votes: [] }), DEFAULT_WEIGHTS);
    expect(templateRationale(r, "Should X?")).toMatch(/No Grand Strategist can be named yet[\s\S]*No peer votes were cast/);
  });
});

describe("mind-change picks (Sprint 7)", () => {
  const T0 = "2026-11-01T00:00:00Z";
  const DAY_LATER = "2026-11-02T01:00:00Z";
  const HOUR_LATER = "2026-11-01T01:00:00Z";
  const mind = (r: ReturnType<typeof blend>, id: string) => r.strategists.find((x) => x.user_id === id)!.raw.mind_credits;

  it("gives no credit when the position change spans less than a day, and full credit when it spans a day", () => {
    const quick = blend(
      inputs({ positions: [{ user_id: V[0], before: "for", after: "against", before_at: T0, after_at: HOUR_LATER }], picks: [{ user_id: V[0], dispatch_id: "da" }] }),
      DEFAULT_WEIGHTS,
    );
    expect(mind(quick, A)).toBe(0);
    const slow = blend(
      inputs({ positions: [{ user_id: V[0], before: "for", after: "against", before_at: T0, after_at: DAY_LATER }], picks: [{ user_id: V[0], dispatch_id: "da" }] }),
      DEFAULT_WEIGHTS,
    );
    expect(mind(slow, A)).toBe(1);
  });

  it("uses the span setting (not a constant) and treats missing times as satisfied", () => {
    const base = { user_id: V[0], before: "for" as const, after: "against" as const };
    const picks = [{ user_id: V[0], dispatch_id: "da" }];
    const strict = blend(inputs({ positions: [{ ...base, before_at: T0, after_at: DAY_LATER }], picks, settings: { ...SETTINGS, min_position_span_hours: 48 } }), DEFAULT_WEIGHTS);
    expect(mind(strict, A)).toBe(0);
    const off = blend(inputs({ positions: [{ ...base, before_at: T0, after_at: T0 }], picks, settings: { ...SETTINGS, min_position_span_hours: 0 } }), DEFAULT_WEIGHTS);
    expect(mind(off, A)).toBe(1);
    const missing = blend(inputs({ positions: [base], picks }), DEFAULT_WEIGHTS);
    expect(mind(missing, A)).toBe(1);
  });

  it("weights each pick like a peer vote: a reputable picker counts more than a newcomer, capped at the multiple", () => {
    const pos = (u: string) => ({ user_id: u, before: "for" as const, after: "against" as const, before_at: T0, after_at: DAY_LATER });
    const r = blend(
      inputs({
        positions: [pos(V[0]), pos(V[1]), pos(V[2])],
        picks: [
          { user_id: V[0], dispatch_id: "da" },
          { user_id: V[1], dispatch_id: "db" },
          { user_id: V[2], dispatch_id: "db" },
        ],
        reputation: { [V[0]]: 7 },
      }),
      DEFAULT_WEIGHTS,
    );
    // V[0] has 7 points: weight 1 + log2(8) = 4, capped at 3 x the median picker (median weight 1) = 3.
    expect(mind(r, A)).toBeCloseTo(3);
    expect(mind(r, B)).toBeCloseTo(2);
  });
});

describe("integrity signals (Sprint 7)", () => {
  const signal = { code: "mutual_votes", users: [B, C], detail: "Each voted for a Dispatch written by the other" };

  it("are listed for review but never block publishing and never change a score", () => {
    const plain = blend(inputs(), DEFAULT_WEIGHTS);
    const flagged = blend(inputs({ integrity: [signal, { ...signal, code: "burst_votes", users: [B] }] }), DEFAULT_WEIGHTS);
    const item = flagged.attention.find((a) => a.code === "integrity_signals");
    expect(item?.info).toBe(true);
    expect(item?.detail).toMatch(/2 integrity signals/);
    expect(item?.detail).toMatch(/involving 2 Strategists/);
    expect(item?.detail).toMatch(/Nothing has changed any score/);
    // Scores, ranks and winner are identical with and without the signals.
    expect(flagged.strategists.map((x) => [x.user_id, x.final, x.rank])).toEqual(plain.strategists.map((x) => [x.user_id, x.final, x.rank]));
    expect(flagged.winner_id).toBe(plain.winner_id);
    // Only info items: the draft would not need attention for them.
    expect(flagged.attention.filter((a) => !a.info)).toEqual(plain.attention);
  });

  it("add nothing when there are none or when the database does not send them", () => {
    expect(blend(inputs({ integrity: [] }), DEFAULT_WEIGHTS).attention.find((a) => a.code === "integrity_signals")).toBeUndefined();
    expect(blend(inputs(), DEFAULT_WEIGHTS).attention.find((a) => a.code === "integrity_signals")).toBeUndefined();
  });
});
