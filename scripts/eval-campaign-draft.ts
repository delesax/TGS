/**
 * Runs the Campaign draft helper on one or more sets of source notes and reports, per set, whether the draft was accepted or
 * discarded and why. See docs/CAMPAIGN_DRAFT_HELPER_SPEC.md, "Tests built from real model output, and a real-model check".
 *
 *   npm run eval:campaign-draft                                  fake provider, free, no network, one invented note set
 *   npm run eval:campaign-draft -- --notes=a.txt,b.txt           your own note sets (fake provider)
 *   npm run eval:campaign-draft -- --real --notes=a.txt,b.txt    the real model; needs ANTHROPIC_API_KEY. Never run in CI.
 *
 * A note-set file: the first line is the Campaign question, the rest is the pasted notes. The notes are read only from the files you
 * name. They are not copied into any output; the raw failing model answers are (see below), so use notes you are happy to keep locally.
 *
 * Output:
 *   terminal and evals/out/campaign-draft-<provider>-<date>.md   one row per note set: ok or the failure category, tokens and cost
 *   evals/out/campaign-draft-raw-<provider>-<date>.json          the raw model text and reason for every failed attempt (git-ignored)
 *
 * Failure categories are the engine's own (json_parse, schema_field, validator, refusal, truncation, ...); "validator" is one of our
 * rules and the first problem is named. Exits 1 on any discarded draft, any call error or a run that stopped early.
 * A fake-provider pass says nothing about the real model: the coach eval passed 20 of 20 on the fake while the real model failed 8.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { campaignDraftProblems, campaignDraftWith } from "../src/lib/ai/campaign-draft";
import { estimateCostUsd, resolveModel } from "../src/lib/ai/config";
import type { AttemptDetail } from "../src/lib/ai/types";
import { scriptDeps } from "./lib/ai-deps";
import { loadEnv } from "./lib/env";

loadEnv();
const real = process.argv.includes("--real");
const notesArg = process.argv.find((a) => a.startsWith("--notes="));
const CAP_USD = 2;
const MAX_CONSECUTIVE_ERRORS = 2;

// Invented, public-safe notes for a free smoke run (not real facts).
const BUILT_IN = {
  name: "built-in invented example",
  title: "Should the Example Council close three libraries?",
  notes: [
    "The Example Council announced a plan on 12 March 2026 to close three libraries by 1 April 2027.",
    'A spokesperson said "the plan will save £2.4 million a year" in a written statement.',
    "Supporters argue the money is better spent on social care. Critics argue the libraries serve people with nowhere else to go.",
    "A public consultation closes on 30 June 2026 and a council vote is expected in September 2026.",
  ].join("\n"),
};

type NoteSet = { name: string; title: string; notes: string };

function loadSets(): NoteSet[] {
  if (!notesArg) return [BUILT_IN];
  return notesArg
    .slice("--notes=".length)
    .split(",")
    .filter(Boolean)
    .map((file) => {
      const [first, ...rest] = readFileSync(file, "utf8").split(/\r?\n/);
      return { name: file, title: first.trim(), notes: rest.join("\n").trim() };
    });
}

type Row = { set: NoteSet; result: string; category: string; problem: string; inputTokens: number; outputTokens: number; usd: number; attempts: AttemptDetail[] };

async function main() {
  const deps = scriptDeps({ real });
  const model = resolveModel("judging", deps.settings);
  const sets = loadSets();
  console.log(`${real ? `REAL model ${model}` : "Fake provider (no network, no cost)"}. ${sets.length} note set(s).`);
  const rows: Row[] = [];
  let spent = 0;
  let errorStreak = 0;
  let aborted = false;
  for (const set of sets) {
    if (spent > CAP_USD) {
      console.error(`Stopped: the spending cap ($${CAP_USD}) was reached.`);
      aborted = true;
      break;
    }
    if (real && errorStreak >= MAX_CONSECUTIVE_ERRORS) {
      console.error("Stopped: calls are failing with an error, not a bad answer. Check the API key and the model name; nothing more was sent.");
      aborted = true;
      break;
    }
    const r = await campaignDraftWith(deps, { title: set.title, notes: set.notes });
    const rec = r.record;
    const usd = rec ? estimateCostUsd(rec.model, rec.inputTokens, rec.outputTokens) : 0;
    spent += usd;
    const attempts = r.attempts ?? [];
    let result = "ok";
    let category = "";
    let problem = "";
    if (r.ok) {
      // The validator again, as a guard: an accepted draft must have no problems.
      const again = campaignDraftProblems(r.draft, set.notes);
      if (again.length) {
        result = "FAILED";
        category = "validator (accepted, then rejected)";
        problem = again[0];
      }
      errorStreak = 0;
    } else {
      result = "discarded";
      category = attempts.length ? attempts[attempts.length - 1].category : r.why;
      problem = r.problems?.[0] ?? attempts[attempts.length - 1]?.detail ?? "";
      errorStreak = r.why === "invalid_output" ? 0 : errorStreak + 1;
    }
    rows.push({ set, result, category, problem: problem.slice(0, 120), inputTokens: rec?.inputTokens ?? 0, outputTokens: rec?.outputTokens ?? 0, usd, attempts });
  }

  const date = new Date().toISOString().slice(0, 10);
  const prov = real ? "real" : "fake";
  const failed = rows.filter((r) => r.result !== "ok");
  const lines = [
    `# Campaign draft helper evaluation, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Provider: ${real ? `real, ${model}` : "fake (keyword-driven stand-in, not the real model)"}.`,
    "",
    "| note set | result | failure category | first problem | input tokens | output tokens | est. cost |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.set.name} | ${r.result} | ${r.category} | ${r.problem.replace(/\|/g, "/")} | ${r.inputTokens} | ${r.outputTokens} | $${r.usd.toFixed(4)} |`),
    "",
    `Totals: ${rows.length} note set(s), ${rows.length - failed.length} ok, ${failed.length} not ok; $${spent.toFixed(4)}${aborted ? "; STOPPED EARLY" : ""}.`,
    "",
  ];
  mkdirSync("evals/out", { recursive: true });
  writeFileSync(`evals/out/campaign-draft-${prov}-${date}.md`, lines.join("\n"));
  const raw = rows.filter((r) => r.attempts.length || r.result !== "ok").map((r) => ({ set: r.set.name, result: r.result, category: r.category, problem: r.problem, attempts: r.attempts }));
  writeFileSync(`evals/out/campaign-draft-raw-${prov}-${date}.json`, JSON.stringify({ provider: prov, model: real ? model : "fake", failures: raw }, null, 2) + "\n");
  console.log(lines.join("\n"));
  console.log(`Wrote evals/out/campaign-draft-${prov}-${date}.md and the raw failures file.`);
  if (failed.length || aborted) process.exit(1);
}

main().catch((e) => {
  // Never print a provider message: it could carry part of the notes.
  console.error("The evaluation could not run:", e instanceof Error ? e.name : "error");
  process.exit(1);
});
