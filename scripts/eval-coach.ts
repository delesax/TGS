/**
 * Runs the coach on the 20 fixed sample drafts (evals/coach-samples.json) and
 * writes a table the owner can rate from 1 to 5.
 *
 *   npm run eval:coach              fake provider, free, no network
 *   npm run eval:coach -- --real    the real model; needs ANTHROPIC_API_KEY
 *
 * Writes evals/out/coach-<provider>-<date>.md and a matching .csv with an
 * empty "owner rating (1-5)" column. Done when the average is 4 or better.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import samples from "../evals/coach-samples.json";
import { estimateCostUsd, resolveModel } from "../src/lib/ai/config";
import { coachWith } from "../src/lib/ai/engine";
import { scriptDeps } from "./lib/ai-deps";
import { loadEnv } from "./lib/env";

loadEnv();
const real = process.argv.includes("--real");
const CAP_GBP = 5;

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
const csv = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

async function main() {
  const deps = scriptDeps({ real });
  const model = resolveModel("coach", deps.settings);
  console.log(`${real ? `REAL model ${model}` : "Fake provider (no network, no cost)"}. ${samples.items.length} drafts.`);
  let spent = 0;
  const md = [
    `# Coach evaluation, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Provider: ${real ? `real, ${model}` : "fake (keyword-driven stand-in, not the real model)"}. Rate each row 1 (useless) to 5 (very useful). Check also that the coach never wrote replacement text.`,
    "",
    "| id | draft | clarity | evidence | steelman | tone | questions | owner rating (1-5) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const rows = [["id", "campaign", "kind", "draft", "clarity", "evidence", "steelman", "tone", "questions", "owner rating (1-5)"].map(csv).join(",")];
  for (const s of samples.items) {
    if (spent > CAP_GBP) {
      console.log("Stopped: the spending cap was reached.");
      break;
    }
    const r = await coachWith(deps, s.draft, { title: s.campaign_title, kind: s.kind }, null);
    if (r.record) spent += estimateCostUsd(r.record.model, r.record.inputTokens, r.record.outputTokens);
    if (!r.ok) {
      md.push(`| ${s.id} | ${cell(s.draft.slice(0, 80))}… | (no feedback: ${r.why}) | | | | | |`);
      rows.push([s.id, s.campaign_title, s.kind, s.draft, `no feedback: ${r.why}`, "", "", "", "", ""].map(csv).join(","));
      continue;
    }
    const f = r.feedback;
    const p = (x: { rating: string; comment: string }) => `${x.rating}: ${x.comment}`;
    md.push(`| ${s.id} | ${cell(s.draft.slice(0, 80))}${s.draft.length > 80 ? "…" : ""} | ${cell(p(f.clarity))} | ${cell(p(f.evidence))} | ${cell(p(f.steelman))} | ${cell(p(f.tone))} | ${cell(f.questions.join(" / "))} | |`);
    rows.push([s.id, s.campaign_title, s.kind, s.draft, p(f.clarity), p(f.evidence), p(f.steelman), p(f.tone), f.questions.join(" / "), ""].map(csv).join(","));
  }
  md.push("", `Estimated spend: £${spent.toFixed(4)}.`, "");
  mkdirSync("evals/out", { recursive: true });
  const base = `evals/out/coach-${real ? "real" : "fake"}-${new Date().toISOString().slice(0, 10)}`;
  writeFileSync(`${base}.md`, md.join("\n"));
  writeFileSync(`${base}.csv`, rows.join("\r\n") + "\r\n");
  console.log(`Wrote ${base}.md and ${base}.csv for rating.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
