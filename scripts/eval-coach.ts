/**
 * Runs the coach on the 20 fixed sample drafts (evals/coach-samples.json) and
 * writes a table the owner can rate from 1 to 5.
 *
 *   npm run eval:coach                           fake provider, free, no network, current default prompt
 *   npm run eval:coach -- --real                 the real model; needs ANTHROPIC_API_KEY
 *   npm run eval:coach -- --versions=1,2         the same drafts through each prompt version, then a comparison
 *
 * Output:
 *   terminal                                      one table per version and per-version totals
 *   evals/out/coach-<provider>-v<N>-<date>.md/.csv   the table to rate (.csv has an empty "owner rating (1-5)" column)
 *   evals/out/coach-raw-<provider>-v<N>-<date>.json  the raw model text and the reason for every failed attempt
 *
 * A draft marked "probe": true in the samples (it asks the coach to break its rules) may fail without failing the run.
 * Any other draft that fails makes the script exit 1, as does a run that stopped early.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import samples from "../evals/coach-samples.json";
import { estimateCostUsd, resolveModel } from "../src/lib/ai/config";
import { coachWith } from "../src/lib/ai/engine";
import { PROMPTS } from "../src/lib/ai/prompts";
import type { CoachOutput } from "../src/lib/ai/schemas";
import type { AttemptDetail } from "../src/lib/ai/types";
import { scriptDeps } from "./lib/ai-deps";
import { loadEnv } from "./lib/env";

loadEnv();
const real = process.argv.includes("--real");
const versionsArg = process.argv.find((a) => a.startsWith("--versions="));
const versions = versionsArg ? versionsArg.slice("--versions=".length).split(",").map(Number) : [PROMPTS.coach.version];
const CAP_USD = 5;
/**
 * In a real run, stop after this many call errors in a row (a rejected key fails every call, and each failure is a paid retry).
 * Only errors count: an invalid_output means the model answered, so the key works and the run goes on.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
const csv = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const FOUR = ["clarity", "evidence", "steelman", "tone"] as const;
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

type Item = { id: string; campaign_title: string; kind: string; draft: string; probe?: boolean };
type Outcome = {
  item: Item;
  result: "ok" | string; // "ok", or the engine's reason: invalid_output, timeout, error, ...
  feedback: CoachOutput | null;
  attempts: AttemptDetail[]; // failed attempts (also present when the retry worked)
  apiCalls: number;
};
type Run = {
  version: number;
  outcomes: Outcome[];
  spent: number;
  inputTokens: number;
  outputTokens: number;
  apiCalls: number;
  ok: number;
  invalid: number;
  otherFailures: number;
  weakest: number;
  unexpected: number; // failures on drafts that are not probes
  aborted: boolean;
};

/** "validator: rewrite_phrase #3 … in questions[0]" for the last failed attempt, with the first too if the retry failed differently. */
function why(o: Outcome): string {
  if (!o.attempts.length) return o.result === "ok" ? "" : o.result;
  const one = (a: AttemptDetail) => `${a.category}${a.stopReason ? ` (stop_reason=${a.stopReason})` : ""}: ${a.detail}`;
  return o.attempts.map((a) => `try ${a.attempt} ${one(a)}`).join(" | ");
}

async function runVersion(version: number, deps: ReturnType<typeof scriptDeps>, model: string): Promise<Run> {
  const run: Run = { version, outcomes: [], spent: 0, inputTokens: 0, outputTokens: 0, apiCalls: 0, ok: 0, invalid: 0, otherFailures: 0, weakest: 0, unexpected: 0, aborted: false };
  let streak = 0;
  for (const item of samples.items as Item[]) {
    if (run.spent > CAP_USD) {
      console.error(`Stopped: the spending cap ($${CAP_USD}) was reached.`);
      run.aborted = true;
      break;
    }
    if (real && streak >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`Stopped: ${streak} calls in a row failed with an error (not a bad answer). Check the API key and the model name; nothing more was sent.`);
      run.aborted = true;
      break;
    }
    const r = await coachWith(deps, item.draft, { title: item.campaign_title, kind: item.kind }, null, { promptVersion: version });
    if (r.record) {
      run.spent += estimateCostUsd(r.record.model, r.record.inputTokens, r.record.outputTokens);
      run.inputTokens += r.record.inputTokens;
      run.outputTokens += r.record.outputTokens;
    }
    const attempts = r.attempts ?? [];
    const apiCalls = r.ok ? attempts.length + 1 : attempts.length;
    run.apiCalls += apiCalls;
    const outcome: Outcome = { item, result: r.ok ? "ok" : r.why, feedback: r.ok ? r.feedback : null, attempts, apiCalls };
    run.outcomes.push(outcome);
    if (r.ok) {
      run.ok += 1;
      streak = 0;
      if (r.feedback.weakest_link) run.weakest += 1;
    } else {
      if (r.why === "invalid_output") {
        run.invalid += 1;
        streak = 0;
      } else {
        run.otherFailures += 1;
        streak += 1;
      }
      if (!item.probe) run.unexpected += 1;
    }
  }
  return run;
}

function writeFiles(run: Run, model: string) {
  const date = new Date().toISOString().slice(0, 10);
  const prov = real ? "real" : "fake";
  const hasWeakest = run.version >= 2;
  const p = (x: { rating: string; comment: string }) => `${x.rating}: ${x.comment}`;
  const head = ["id", "draft", "clarity", "evidence", "steelman", "tone", "questions", ...(hasWeakest ? ["weakest link"] : []), "owner rating (1-5)"];
  const md = [
    `# Coach evaluation, prompt v${run.version} (coach.v${run.version}), ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Provider: ${real ? `real, ${model}` : "fake (keyword-driven stand-in, not the real model)"}. Rate each row 1 (useless) to 5 (very useful). Check also that the coach never wrote replacement text.`,
    "",
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
  ];
  const rows = [["id", "campaign", "kind", "draft", ...head.slice(2, -1), "failure", "owner rating (1-5)"].map(csv).join(",")];
  for (const o of run.outcomes) {
    const d = o.item.draft;
    const short = `${cell(d.slice(0, 80))}${d.length > 80 ? "…" : ""}`;
    const f = o.feedback;
    if (!f) {
      md.push(`| ${o.item.id}${o.item.probe ? " (probe)" : ""} | ${short} | (no feedback: ${o.result}. ${cell(why(o))}) | | | | |${hasWeakest ? " |" : ""} |`);
      rows.push([o.item.id, o.item.campaign_title, o.item.kind, d, "", "", "", "", "", ...(hasWeakest ? [""] : []), `${o.result}: ${why(o)}`, ""].map(csv).join(","));
      continue;
    }
    md.push(`| ${o.item.id} | ${short} | ${cell(p(f.clarity))} | ${cell(p(f.evidence))} | ${cell(p(f.steelman))} | ${cell(p(f.tone))} | ${cell(f.questions.join(" / "))} |${hasWeakest ? ` ${cell(f.weakest_link ?? "")} |` : ""} |`);
    rows.push([o.item.id, o.item.campaign_title, o.item.kind, d, p(f.clarity), p(f.evidence), p(f.steelman), p(f.tone), f.questions.join(" / "), ...(hasWeakest ? [f.weakest_link ?? ""] : []), "", ""].map(csv).join(","));
  }
  md.push("", `Totals: ${run.outcomes.length} drafts, ${run.ok} ok, ${run.invalid} invalid_output, ${run.otherFailures} other failures; ${run.apiCalls} API calls; ${run.inputTokens} input and ${run.outputTokens} output tokens; estimated $${run.spent.toFixed(4)}.`, "");
  mkdirSync("evals/out", { recursive: true });
  const base = `evals/out/coach-${prov}-v${run.version}-${date}`;
  writeFileSync(`${base}.md`, md.join("\n"));
  writeFileSync(`${base}.csv`, rows.join("\r\n") + "\r\n");
  // The raw model text for every failed attempt (the sample drafts are fictional, so this is fine to keep).
  const raw = run.outcomes
    .filter((o) => o.attempts.length)
    .map((o) => ({ id: o.item.id, probe: Boolean(o.item.probe), promptVersion: run.version, result: o.result, draft: o.item.draft, attempts: o.attempts }));
  writeFileSync(`evals/out/coach-raw-${prov}-v${run.version}-${date}.json`, JSON.stringify({ provider: prov, model: real ? model : "fake", failures: raw }, null, 2) + "\n");
  return base;
}

function printVersion(run: Run) {
  const hasWeakest = run.version >= 2;
  console.log(`\n=== Prompt v${run.version} (coach.v${run.version}) ===`);
  console.log(`${pad("id", 5)} ${pad("result", 15)} ${pad("clar/evid/steel/tone", 24)}${hasWeakest ? ` ${pad("weakest link", 60)}` : ""} reason`);
  for (const o of run.outcomes) {
    const f = o.feedback;
    const ratings = f ? [f.clarity.rating, f.evidence.rating, f.steelman.rating, f.tone.rating].map((r) => r.slice(0, 5)).join("/") : "";
    const result = `${o.result}${o.item.probe ? " (probe)" : ""}`;
    console.log(`${pad(o.item.id, 5)} ${pad(result, 15)} ${pad(ratings, 24)}${hasWeakest ? ` ${pad(f?.weakest_link ?? "", 60)}` : ""} ${why(o)}`);
  }
  console.log(
    `Totals v${run.version}: ${run.outcomes.length} drafts | ${run.ok} ok | ${run.invalid} invalid_output | ${run.otherFailures} other failures | ${run.apiCalls} API calls | ${run.inputTokens} input tokens | ${run.outputTokens} output tokens | $${run.spent.toFixed(4)}${run.aborted ? " | STOPPED EARLY" : ""}`,
  );
}

async function main() {
  const deps = scriptDeps({ real });
  const model = resolveModel("coach", deps.settings);
  console.log(`${real ? `REAL model ${model}` : "Fake provider (no network, no cost)"}. ${samples.items.length} drafts, prompt version(s) ${versions.join(", ")}.`);
  const runs: Run[] = [];
  for (const v of versions) {
    const run = await runVersion(v, deps, model);
    runs.push(run);
    const base = writeFiles(run, model);
    printVersion(run);
    console.log(`Wrote ${base}.md, ${base}.csv and the raw failures file.`);
    if (run.aborted) break; // do not start the next version after a stop
  }

  if (runs.length > 1) {
    const [a, ...others] = runs;
    for (const b of others) {
      let changed = 0;
      let compared = 0;
      for (const oa of a.outcomes) {
        const fb = b.outcomes.find((o) => o.item.id === oa.item.id)?.feedback;
        const fa = oa.feedback;
        if (!fa || !fb) continue;
        compared += 1;
        if (FOUR.some((k) => fa[k].rating !== fb[k].rating)) changed += 1;
      }
      console.log(`\nv${a.version} vs v${b.version}: ${changed} of ${compared} drafts that worked in both got a different rating on any of the four parts; cost ratio ${(b.spent / (a.spent || 1)).toFixed(2)}x.`);
    }
  }

  const bad = runs.filter((r) => r.unexpected > 0 || r.aborted);
  if (bad.length || runs.length < versions.length) {
    console.error(`\nFAILED: ${bad.map((r) => `v${r.version}: ${r.unexpected} draft(s) that are not probes failed${r.aborted ? ", and the run stopped early" : ""}`).join("; ")}.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
