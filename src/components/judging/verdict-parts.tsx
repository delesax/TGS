import Link from "next/link";
import type { Attention, ProposedAward, StrategistScore, Weights } from "@/lib/judging/blend";
import { COMPONENT_ORDER } from "@/lib/judging/data";
import { AWARD_LABELS, COMPONENT_LABELS, rationaleParts } from "@/lib/judging/rationale";

// Pieces shared by the public Verdict page and the admin review. Server
// components: no client JavaScript.

export function StrategistName({ id, handles }: { id: string; handles: Map<string, string | null> }) {
  const handle = handles.get(id);
  return handle ? (
    <Link href={`/strategists/${handle}`} className="font-semibold text-primary underline underline-offset-2">
      @{handle}
    </Link>
  ) : (
    <span>a former Strategist</span>
  );
}

/** The rationale, paragraph by paragraph, with each Strategist linked. */
export function Rationale({ text, handles }: { text: string; handles: Map<string, string | null> }) {
  return (
    <div className="flex flex-col gap-4 text-lg">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-line">
          {rationaleParts(para).map((part, j) => ("text" in part ? <span key={j}>{part.text}</span> : <StrategistName key={j} id={part.userId} handles={handles} />))}
        </p>
      ))}
    </div>
  );
}

const fmt = (n: number | null) => (n === null ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(1));

export function WeightsLine({ weights }: { weights: Weights }) {
  return (
    <p className="text-lg">
      Weights used: panel {weights.panel}%, peer votes {weights.peer}%, AI rubric {weights.ai_rubric}%, mind-change {weights.mind_change}%.{" "}
      {weights.source === "override" ? (
        <span>Set by an admin for this Verdict{weights.reason ? `: ${weights.reason}` : ""}.</span>
      ) : (
        <span>These are the weights the Campaign opened with (version {weights.version}).</span>
      )}
    </p>
  );
}

/**
 * The component breakdown. On phones, one card per Strategist (a definition
 * list, so nothing scrolls sideways); from tablet width up, a real table with
 * row and column headers. Only one of the two is displayed, so assistive
 * technology meets it once.
 */
export function Breakdown({ scores, handles, caption }: { scores: StrategistScore[]; handles: Map<string, string | null>; caption: string }) {
  return (
    <>
      <ol aria-label={caption} className="flex flex-col gap-3 sm:hidden">
        {scores.map((s) => (
          <li key={s.user_id} className="rounded-xl border border-border p-4 text-lg">
            <p className="font-semibold">
              {s.rank ? `${s.rank}. ` : ""}
              <StrategistName id={s.user_id} handles={handles} />
            </p>
            {s.tie_break ? <p className="text-base text-muted-foreground">{s.tie_break}</p> : null}
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              {COMPONENT_ORDER.map((c) => (
                <div key={c} className="contents">
                  <dt className="capitalize">{COMPONENT_LABELS[c]}</dt>
                  <dd className="text-right">{fmt(s.components[c])}</dd>
                </div>
              ))}
              <dt>Steelman bonus</dt>
              <dd className="text-right">{s.steelman_bonus ? `+${fmt(s.steelman_bonus)}` : "0"}</dd>
              <dt className="font-bold">Final</dt>
              <dd className="text-right font-bold">{fmt(s.final)}</dd>
            </dl>
          </li>
        ))}
      </ol>
      <table className="hidden w-full border-collapse rounded-xl text-left text-lg sm:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted">
          <tr>
            <th scope="col" className="p-3">
              Place
            </th>
            <th scope="col" className="p-3">
              Strategist
            </th>
            {COMPONENT_ORDER.map((c) => (
              <th key={c} scope="col" className="p-3 capitalize">
                {COMPONENT_LABELS[c]}
              </th>
            ))}
            <th scope="col" className="p-3">
              Steelman bonus
            </th>
            <th scope="col" className="p-3">
              Final
            </th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => (
            <tr key={s.user_id} className="border-t border-border align-top">
              <td className="p-3 font-semibold">{s.rank ?? "–"}</td>
              <th scope="row" className="p-3 font-normal">
                <StrategistName id={s.user_id} handles={handles} />
                {s.tie_break ? <span className="block text-base text-muted-foreground">{s.tie_break}</span> : null}
              </th>
              {COMPONENT_ORDER.map((c) => (
                <td key={c} className="p-3">
                  {fmt(s.components[c])}
                </td>
              ))}
              <td className="p-3">{s.steelman_bonus ? `+${fmt(s.steelman_bonus)}` : "0"}</td>
              <td className="p-3 font-bold">{fmt(s.final)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function AwardList({ awards, handles, campaignSlug }: { awards: Pick<ProposedAward, "category" | "profile_id" | "dispatch_id" | "rationale">[]; handles: Map<string, string | null>; campaignSlug: string }) {
  if (!awards.length) return <p className="text-lg">No awards.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {awards.map((a) => (
        <li key={a.category} className="rounded-xl border border-border p-4">
          <p className="text-xl font-bold">{AWARD_LABELS[a.category]}</p>
          <p className="text-lg">
            <StrategistName id={a.profile_id} handles={handles} />
          </p>
          <div className="mt-1 text-base text-muted-foreground">
            <Rationale text={a.rationale} handles={handles} />
          </div>
          {a.dispatch_id ? (
            <Link href={`/campaigns/${campaignSlug}#dispatch-${a.dispatch_id}`} className="mt-1 inline-flex min-h-12 items-center text-lg text-primary underline">
              Read the Dispatch
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AttentionList({ items, handles }: { items: Attention[]; handles: Map<string, string | null> }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-6 text-lg">
      {items.map((a, i) => (
        <li key={i}>
          {a.info ? <span className="font-semibold">For review: </span> : null}
          {a.detail}
          {a.user_id ? (
            <>
              {" "}
              (<StrategistName id={a.user_id} handles={handles} />)
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export const VERDICT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  appealed: "Under appeal",
  final: "Final",
  superseded: "Replaced by a revised Verdict",
  discarded: "Discarded draft",
};
