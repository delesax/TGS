import Link from "next/link";
import { CRITERIA, type Position, type StrategistScore } from "@/lib/judging/blend";
import { CRITERION_LABELS, MIN_PANEL_JUDGES, MIN_POSITIONS_FOR_CHART, POSITION_LABELS, type PositionsChart, type StrategistCriteria } from "@/lib/judging/verdict-extras";
import { StrategistName } from "./verdict-parts";

// Display-only sections of the public Verdict page. Server components. Aggregates only: see getVerdictExtras.

const score = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n.toFixed(1));

export function CriteriaSection({ scores, criteria, handles }: { scores: StrategistScore[]; criteria: Map<string, StrategistCriteria>; handles: Map<string, string | null> }) {
  const rows = scores.filter((s) => criteria.get(s.user_id)?.panel || criteria.get(s.user_id)?.ai);
  if (!rows.length) return null;
  const anyHidden = rows.some((s) => !criteria.get(s.user_id)?.panel);
  return (
    <section aria-labelledby="criteria-h" className="flex flex-col gap-3">
      <h2 id="criteria-h">Scores by criterion</h2>
      <p className="text-lg">
        The panel and the AI rubric each score four criteria from 1 to 5. These are averages for each Strategist. A panel figure averages every judge who scored that
        Strategist&rsquo;s Dispatches. Individual judges&rsquo; scores are not shown.
      </p>
      {anyHidden ? (
        <p role="note" className="rounded-[10px] bg-muted/70 p-3 text-sm text-muted-foreground">
          A panel average is shown only when at least {MIN_PANEL_JUDGES} judges scored that Strategist, so that no single judge&rsquo;s scores can be worked out from it. A dash means it is
          not shown.
        </p>
      ) : null}
      <ol aria-label="Scores by criterion and Strategist" className="flex flex-col gap-3">
        {rows.map((s) => {
          const c = criteria.get(s.user_id)!;
          return (
            <li key={s.user_id} className="surface-card p-4 text-base">
              <p className="font-semibold">
                {s.rank ? `${s.rank}. ` : ""}
                <StrategistName id={s.user_id} handles={handles} />
              </p>
              <dl className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1">
                <dt className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">Criterion</dt>
                <dd className="text-right text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">Panel</dd>
                <dd className="text-right text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">AI rubric</dd>
                {CRITERIA.map((k) => (
                  <div key={k} className="contents">
                    <dt>{CRITERION_LABELS[k]}</dt>
                    <dd className="text-right tabular-nums">{score(c.panel?.[k])}</dd>
                    <dd className="text-right tabular-nums">{score(c.ai?.[k])}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const ORDER: Position[] = ["for", "against", "undecided"];

function sideOf({ title, totals }: { title: string; totals: Record<Position, number> | null }) {
  const n = totals ? ORDER.reduce((a, k) => a + totals[k], 0) : 0;
  return { title, totals, n } as const;
}

export function PositionsSection({ chart }: { chart: PositionsChart }) {
  return (
    <section aria-labelledby="positions-h" className="flex flex-col gap-3">
      <h2 id="positions-h">Did minds move?</h2>
      {!chart.shown ? (
        <p role="note" className="rounded-[10px] bg-muted/70 p-3 text-base text-muted-foreground">
          Strategists&rsquo; positions are private. Totals are shown only once at least {MIN_POSITIONS_FOR_CHART} members have recorded one, so that nobody can be picked out. This Campaign has not reached
          that number, so no totals are shown.
        </p>
      ) : (
        <>
          <p className="text-lg">
            Strategists who chose to record a position did so before and after reading the Campaign. These are anonymous totals: no one&rsquo;s own position is shown. See the{" "}
            <Link href="/privacy" className="text-primary underline underline-offset-4">
              privacy page
            </Link>
            .
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[sideOf({ title: "Before", totals: chart.before }), sideOf({ title: "After", totals: chart.after })].map((side) => (
              <div key={side.title} className="surface-card p-4 text-base">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{side.title}</h3>
                {side.totals ? (
                  <>
                    <ul className="mt-2 flex flex-col gap-2">
                      {ORDER.map((k) => {
                        const pct = side.n ? Math.round((side.totals![k] / side.n) * 100) : 0;
                        return (
                          <li key={k}>
                            <div className="flex items-baseline justify-between gap-4">
                              <span>{POSITION_LABELS[k]}</span>
                              <span className="tabular-nums">
                                {side.totals![k]} ({pct}%)
                              </span>
                            </div>
                            <span aria-hidden className="mt-1 block h-2 rounded-full bg-muted">
                              <span className="block h-2 rounded-full bg-gold" style={{ width: `${pct}%` }} />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-sm text-muted-foreground">{side.n} Strategists recorded this.</p>
                  </>
                ) : (
                  <p className="mt-2 text-muted-foreground">Not enough Strategists recorded this to show it without picking anyone out.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
