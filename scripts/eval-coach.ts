/**
 * Runs the coach on the 20 fixed sample drafts (evals/coach-samples.json) and
 * writes a table the owner can rate from 1 to 5.
 *
 *   npm run eval:coach                           fake provider, free, no network, current default prompt
 *   npm run eval:coach -- --real                 the real model; needs ANTHROPIC_API_KEY
 *   npm run eval:coach -- --versions=1,2         the same drafts through each prompt version, then a comparison
 *
 * Writes evals/out/coach-<provider>-v<N>-<date>.md and a matching .csv with an
 * empty "owner rating (1-5)" column, and, with several versions, a comparison
 * of cost, failures and changed ratings. Done when the average is 4 or better.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import samples from "../evals/coach-samples.json";
import { estimateCostUsd, resolveModel } from "../src/lib/ai/config";
import { coachWith } from "../src/lib/ai/engine";
import { PROMPTS } from "../src/lib/ai/prompts";
import type { CoachOutput } from "../src/lib/ai/schemas";
import { scriptDeps } from "./lib/ai-deps";
import { loadEnv } from "./lib/env";

loadEnv();
const real = process.argv.includes("--real");
const versionsArg = process.argv.find((a) => a.startsWith("--versions="));
const versions = versionsArg ? versionsArg.slice("--versions=".length).split(",").map(Number) : [PROMPTS.coach.version];
const CAP_USD = 5;

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
const csv = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const FOUR = ["clarity", "evidence", "steelman", "tone"] as const;

type Run = { version: number; byId: Map<string, CoachOutput | null>; spent: number; inputTokens: number; outputTokens: number; failures: number; weakest: number };

async function runVersion(version: number, deps: ReturnType<typeof scriptDeps>, model: string): Promise<Run> {
  const run: Run = { version, byId: new Map(), spent: 0, inputTokens: 0, outputTokens: 0, failures: 0, weakest: 0 };
  const md = [
    `# Coach evaluation, prompt v${version}, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Provider: ${real ? `real, ${model}` : "fake (keyword-driven stand-in, not the real model)"}. Rate each row 1 (useless) to 5 (very useful). Check also that the coach never wrote replacement text.`,
    "",
    "| id | draft | clarity | evidence | steelman | tone | questions | weakest link | owner rating (1-5) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const rows = [["id", "campaign", "kind", "draft", "clarity", "evidence", "steelman", "tone", "questions", "weakest link", "owner rating (1-5)"].map(csv).join(",")];
  for (const s of samples.items) {
    if (run.spent > CAP_USD) {
      console.log("Stopped: the spending cap was reached.");
      break;
    }
    const r = await coachWith(deps, s.draft, { title: s.campaign_title, kind: s.kind }, null, { promptVersion: version });
    if (r.record) {
      run.spent += estimateCostUsd(r.record.model, r.record.inputTokens, r.record.outputTokens);
      run.inputTokens += r.record.inputTokens;
      run.outputTokens += r.record.outputTokens;
    }
    if (!r.ok) {
      run.failures += 1;
      run.byId.set(s.id, null);
      md.push(`| ${s.id} | ${cell(s.draft.slice(0, 80))}… | (no feedback: ${r.why}) | | | | | | |`);
      rows.push([s.id, s.campaign_title, s.kind, s.draft, `no feedback: ${r.why}`, "", "", "", "", "", ""].map(csv).join(","));
      continue;
    }
    const f = r.feedback;
    run.byId.set(s.id, f);
    if (f.weakest_link) run.weakest += 1;
    const p = (x: { rating: string; comment: string }) => `${x.rating}: ${x.comment}`;
    md.push(`| ${s.id} | ${cell(s.draft.slice(0, 80))}${s.draft.length > 80 ? "…" : ""} | ${cell(p(f.clarity))} | ${cell(p(f.evidence))} | ${cell(p(f.steelman))} | ${cell(p(f.tone))} | ${cell(f.questions.join(" / "))} | ${cell(f.weakest_link ?? "")} | |`);
    rows.push([s.id, s.campaign_title, s.kind, s.draft, p(f.clarity), p(f.evidence), p(f.steelman), p(f.tone), f.questions.join(" / "), f.weakest_link ?? "", ""].map(csv).join(","));
  }
  md.push("", `Estimated spend: $${run.spent.toFixed(4)} (${run.inputTokens} input and ${run.outputTokens} output tokens).`, "");
  mkdirSync("evals/out", { recursive: true });
  const base = `evals/out/coach-${real ? "real" : "fake"}-v${version}-${new Date().toISOString().slice(0, 10)}`;
  writeFileSync(`${base}.md`, md.join("\n"));
  writeFileSync(`${base}.csv`, rows.join("\r\n") + "\r\n");
  console.log(`v${version}: wrote ${base}.md and ${base}.csv for rating.`);
  return run;
}

async function main() {
  const deps = scriptDeps({ real });
  const model = resolveModel("coach", deps.settings);
  console.log(`${real ? `REAL model ${model}` : "Fake provider (no network, no cost)"}. ${samples.items.length} drafts, prompt version(s) ${versions.join(", ")}.`);
  const runs: Run[] = [];
  for (const v of versions) runs.push(await runVersion(v, deps, model));

  const lines = ["version | failures | weakest link shown | input tokens | output tokens | cost (USD)"];
  for (const r of runs) lines.push(`v${r.version} | ${r.failures}/${samples.items.length} | ${r.weakest}/${samples.items.length} | ${r.inputTokens} | ${r.outputTokens} | ${r.spent.toFixed(4)}`);
  if (runs.length > 1) {
    const [a, ...others] = runs;
    for (const b of others) {
      let changed = 0;
      let compared = 0;
      for (const [id, fa] of a.byId) {
        const fb = b.byId.get(id);
        if (!fa || !fb) continue;
        compared += 1;
        if (FOUR.some((k) => fa[k].rating !== fb[k].rating)) changed += 1;
      }
      lines.push(`v${a.version} vs v${b.version}: ${changed} of ${compared} drafts got a different rating on any of the four parts; cost ratio ${(b.spent / (a.spent || 1)).toFixed(2)}x.`);
    }
  }
  console.log("\n" + lines.join("\n"));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
