import { CAMPAIGN_NOTES_MAX_CHARS, CAMPAIGN_NOTES_MIN_CHARS } from "../campaign-draft-limits";
import { TIMEOUT_MS, estimateCostUsd, resolveModel } from "./config";
import { figureAndDateProblems, knownFromNotes, normText } from "./campaign-draft-normalise";
import { MOTIVE_PHRASES, callStructured, guarded, urlsIn, type EngineDeps } from "./engine";
import { campaignDraftSchema, type CampaignDraftOutput } from "./schemas";
import type { AttemptDetail, CallRecord, Unavailable } from "./types";
import { buildUserMessage } from "./untrusted";

// The Campaign draft helper (admin only): from source notes the admin pastes, one AI call drafts a public summary, a fact-check
// table and re-check dates. Nothing is saved, published or fetched. The checks below are mechanical and run on every draft: a
// figure, date, quotation, web address or handle that is not in the notes discards the whole draft.

export { CAMPAIGN_NOTES_MAX_CHARS, CAMPAIGN_NOTES_MIN_CHARS };

/** The reasons a draft fails, or an empty list. `notes` is exactly what the model was shown. */
export function campaignDraftProblems(draft: CampaignDraftOutput, notes: string): string[] {
  const problems: string[] = [];
  // Both the notes and every model-written string are normalised the same way before the checks (campaign-draft-normalise.ts), so a
  // format difference (smart quotes, "£1m" and "£1 million", "3rd December") is never mistaken for an invention. Values are never made equal.
  const src = normText(notes);
  const known = knownFromNotes(notes);
  const knownUrls = new Set(urlsIn(notes));

  // Every piece of text the admin will read, so one rule covers all of it.
  const texts: [string, string][] = [
    ["summary", draft.summary],
    ...draft.claims.map((c, i): [string, string] => [`claims[${i}].claim`, c.claim]),
    ...draft.recheck_lines.map((l, i): [string, string] => [`recheck_lines[${i}]`, l]),
  ];
  for (const [where, text] of texts) {
    problems.push(...figureAndDateProblems(where, text, known));
    for (const u of urlsIn(text)) if (!knownUrls.has(u)) problems.push(`${where}: a web address that is not in the notes: ${u.slice(0, 40)}`);
    if (/@\{user:|@[A-Za-z0-9_]{2,}/.test(text)) problems.push(`${where}: a handle or mention`);
  }
  // Quotation marks in the summary must wrap words copied exactly from the notes.
  for (const m of normText(draft.summary).matchAll(/"([^"]{3,})"/g)) {
    if (!src.includes(m[1])) problems.push(`summary: an invented quotation: ${m[1].slice(0, 40)}`);
  }
  // No stated motive or intent that the notes do not state in the same words.
  for (const m of draft.summary.matchAll(MOTIVE_PHRASES)) {
    if (!src.includes(normText(m[0]))) problems.push(`summary: an inferred motive or intent: ${m[0]}`);
  }
  if (draft.summary.length > 2000) problems.push("summary: longer than the Campaign form's 2,000 characters");
  if (draft.summary.trim().split(/\s+/).length < 20) problems.push("summary: fewer than 20 words");
  // The table: a source line and an exact quote that are really in the notes, and nothing claimed as checked.
  draft.claims.forEach((c, i) => {
    if (!src.includes(normText(c.source_line))) problems.push(`claims[${i}]: the source line is not in the notes`);
    if (!src.includes(normText(c.exact_quote))) problems.push(`claims[${i}]: the exact quote is not in the notes`);
    else if (!normText(c.source_line).includes(normText(c.exact_quote))) problems.push(`claims[${i}]: the quote is not part of its source line`);
    if (c.status !== "unverified") problems.push(`claims[${i}]: status is not "unverified"`);
  });
  return problems;
}

export type CampaignDraftResult =
  | { ok: true; draft: CampaignDraftOutput; usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }; record: CallRecord; attempts?: AttemptDetail[] }
  | { ok: false; why: Unavailable | "notes_too_short" | "notes_too_long"; record: CallRecord | null; problems?: string[]; attempts?: AttemptDetail[] };
// `attempts` is for the eval script only (the failure category of each attempt, with the raw model text). The server action returns
// named fields and never passes it on, so the browser never receives raw model text.

/**
 * One call. Counted in ai_usage under the existing feature "judge_rationale" (no new feature key, so no migration): it counts
 * against the global daily cap like the winner's summary. The caller has already checked the person is an admin and within
 * their own daily limit.
 */
export async function campaignDraftWith(deps: EngineDeps, input: { title: string; notes: string }): Promise<CampaignDraftResult> {
  const notes = input.notes.trim();
  if (notes.length < CAMPAIGN_NOTES_MIN_CHARS) return { ok: false, why: "notes_too_short", record: null };
  if (notes.length > CAMPAIGN_NOTES_MAX_CHARS) return { ok: false, why: "notes_too_long", record: null };
  const model = resolveModel("judging", deps.settings, deps.env);
  const user = buildUserMessage({ "Campaign question": input.title }, [{ label: "notes", text: notes }]);
  let problems: string[] = [];
  const result = await guarded(
    deps,
    "judge_rationale",
    null,
    user.length,
    (p) =>
      callStructured(p, {
        task: "campaign_draft",
        prompt: "campaign_draft",
        model,
        user,
        schema: campaignDraftSchema,
        timeoutMs: deps.timeouts?.judging ?? TIMEOUT_MS.judging,
        maxTokens: 4000,
        accept: (v) => {
          problems = campaignDraftProblems(v, notes);
          return problems.length === 0 ? true : problems[0];
        },
      }),
    CAMPAIGN_NOTES_MAX_CHARS + 1000,
  );
  if (!result.ok) return { ok: false, why: result.why, record: result.record, ...(result.why === "invalid_output" && problems.length ? { problems } : {}), ...(result.attempts ? { attempts: result.attempts } : {}) };
  const r = result.record;
  return { ok: true, draft: result.value, usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, estimatedCostUsd: estimateCostUsd(r.model, r.inputTokens, r.outputTokens) }, record: r, ...(result.attempts ? { attempts: result.attempts } : {}) };
}
