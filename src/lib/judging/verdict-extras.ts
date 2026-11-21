import { CRITERIA, type Criteria, type Criterion, type Position } from "./blend";

// Display-only figures for the public Verdict page. Pure: no database or framework code. Nothing here is read by the blend,
// the weights or the winner: the Verdict is computed elsewhere and these numbers only describe the same scores.

/** A panel average is shown only when at least this many judges contributed to it, so one judge's scores cannot be read from it. */
export const MIN_PANEL_JUDGES = 3;
/** The positions chart is shown only when at least this many members recorded a position (positions are private). */
export const MIN_POSITIONS_FOR_CHART = 10;

export type CriteriaScoreRow = { dispatch_id: string } & Criteria;
export type PanelScoreRow = CriteriaScoreRow & { judge_id: string };

export type StrategistCriteria = {
  /** Mean of the 1-5 scores per criterion, or null when too few judges contributed. */
  panel: Criteria | null;
  /** Number of judges behind the panel figures (used only to decide whether to show them). */
  panelJudges: number;
  /** AI rubric mean per criterion (admin overrides already applied), or null when no Dispatch was scored. */
  ai: Criteria | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function meanCriteria(rows: Criteria[]): Criteria | null {
  if (!rows.length) return null;
  const out = {} as Criteria;
  for (const c of CRITERIA) out[c] = mean(rows.map((r) => r[c]))!;
  return out;
}

/**
 * Per author: for each criterion, the mean over the author's Dispatches of the mean judge score (the same way the blend builds the
 * panel component, but kept per criterion). Only aggregates leave this function: no judge id and no single judge's score.
 */
export function criteriaByAuthor(
  dispatches: { id: string; author_id: string }[],
  panel: PanelScoreRow[],
  ai: CriteriaScoreRow[],
): Map<string, StrategistCriteria> {
  const byAuthor = new Map<string, string[]>();
  for (const d of dispatches) byAuthor.set(d.author_id, [...(byAuthor.get(d.author_id) ?? []), d.id]);
  const result = new Map<string, StrategistCriteria>();
  for (const [author, ids] of byAuthor) {
    const own = new Set(ids);
    const judges = new Set<string>();
    const perDispatch: Criteria[] = [];
    for (const id of ids) {
      const rows = panel.filter((p) => p.dispatch_id === id);
      for (const r of rows) judges.add(r.judge_id);
      const m = meanCriteria(rows);
      if (m) perDispatch.push(m);
    }
    const aiRows = ai.filter((a) => own.has(a.dispatch_id));
    result.set(author, {
      panel: judges.size >= MIN_PANEL_JUDGES ? meanCriteria(perDispatch) : null,
      panelJudges: judges.size,
      ai: meanCriteria(aiRows),
    });
  }
  return result;
}

export type PositionTotals = Record<Position, number>;
export type PositionsChart =
  | { shown: false }
  | { shown: true; recorded: number; beforeN: number; afterN: number; before: PositionTotals | null; after: PositionTotals | null };

const empty = (): PositionTotals => ({ for: 0, against: 0, undecided: 0 });

/**
 * Anonymous before and after totals. Suppressed entirely under MIN_POSITIONS_FOR_CHART members who recorded a position. A side
 * (before or after) is also withheld when fewer than that many members recorded it, because a tiny side would identify people.
 */
export function positionsChart(rows: { before: Position | null; after: Position | null }[]): PositionsChart {
  const recorded = rows.filter((r) => r.before || r.after).length;
  if (recorded < MIN_POSITIONS_FOR_CHART) return { shown: false };
  const before = empty();
  const after = empty();
  let beforeN = 0;
  let afterN = 0;
  for (const r of rows) {
    if (r.before) {
      before[r.before] += 1;
      beforeN += 1;
    }
    if (r.after) {
      after[r.after] += 1;
      afterN += 1;
    }
  }
  return {
    shown: true,
    recorded,
    beforeN,
    afterN,
    before: beforeN >= MIN_POSITIONS_FOR_CHART ? before : null,
    after: afterN >= MIN_POSITIONS_FOR_CHART ? after : null,
  };
}

export type MovedCount = { shown: false } | { shown: true; moved: number; of: number };

/**
 * "Moved N" (spec item c). PURE AND NOT WIRED to any page. Members who recorded BOTH a before and an after position, and how many of
 * them changed it. Hidden under MIN_POSITIONS_FOR_CHART such members, the same threshold and the same consented rows as the positions
 * chart. A single number only: never who moved, and never a direction.
 */
export function movedCount(rows: { before: Position | null; after: Position | null }[]): MovedCount {
  const both = rows.filter((r) => r.before && r.after);
  if (both.length < MIN_POSITIONS_FOR_CHART) return { shown: false };
  return { shown: true, moved: both.filter((r) => r.before !== r.after).length, of: both.length };
}

export const CRITERION_LABELS: Record<Criterion, string> = { logic: "Logic", evidence: "Evidence", originality: "Originality", responsiveness: "Responsiveness" };
export const POSITION_LABELS: Record<Position, string> = { for: "For", against: "Against", undecided: "Undecided" };
