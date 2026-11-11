/**
 * Runs the judging gold set (evals/judging/gold-set.json) through the AI
 * rubric and reports agreement with the human labels.
 *
 *   npm run eval:judging              fake provider: free, no network. Exercises
 *                                     the whole harness; its numbers say nothing
 *                                     about the real model.
 *   npm run eval:judging -- --real    the real model (Sonnet); needs ANTHROPIC_API_KEY
 *
 * Per criterion: mean absolute error, share within +/-1 point, Spearman
 * correlation. Pass bar (per criterion): at least 80% within +/-1 and Spearman
 * of 0.7 or more. The real run stops before it could spend more than £5
 * (estimated, treating each US dollar as a pound so the estimate errs high).
 * Tests and CI never run this. Writes a report to evals/out/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import gold from "../evals/judging/gold-set.json";
import { estimateCostUsd, resolveModel } from "../src/lib/ai/config";
import { judgeRubricWith } from "../src/lib/ai/engine";
import { loadPrompt, promptVersion } from "../src/lib/ai/prompts";
import { agreement, passes, type Agreement } from "../src/lib/judging/metrics";
import { scriptDeps } from "./lib/ai-deps";
import { loadEnv } from "./lib/env";

loadEnv();
const real = process.argv.includes("--real");
const CAP_GBP = 5;
const CRITERIA = ["logic", "evidence", "originality", "responsiveness"] as const;
type Criterion = (typeof CRITERIA)[number];
type Item = (typeof gold.items)[number];

async function main() {
  const deps = scriptDeps({ real });
  const model = resolveModel("judging", deps.settings);
  const byId = new Map<string, Item>(gold.items.map((g) => [g.id, g]));
  const promptChars = loadPrompt("judge_rubric").text.length;
  // Generous: input counted twice (a retry), 4,000 output tokens (thinking included) per attempt.
  const estimate = gold.items.reduce((t, g) => t + estimateCostUsd(model, Math.ceil((promptChars + g.text.length + 1500) / 3) * 2, 4000 * 2), 0);
  console.log(`${real ? `REAL model ${model}` : "Fake provider (no network, no cost)"}. ${gold.items.length} Dispatches. Gold set: ${gold.status} ${gold.version}.`);
  if (real) {
    console.log(`Worst-case estimate: about £${estimate.toFixed(2)} (cap £${CAP_GBP}).`);
    if (estimate > CAP_GBP) throw new Error("The estimate is over the spending cap. Nothing was sent.");
  }

  let spent = 0;
  const rows: { item: Item; got: Record<Criterion, number> | null; steelman: boolean | null; why: string; rationale: string }[] = [];
  for (const g of gold.items) {
    if (spent > CAP_GBP) {
      console.log("Stopped: the spending cap was reached.");
      break;
    }
    const parent = g.parent ? byId.get(g.parent)?.text ?? null : null;
    const r = await judgeRubricWith(deps, { body: g.text, kind: g.kind as "argument", campaign: { title: g.campaign_title, category: g.category }, parentBody: parent });
    if (r.record && real) spent += estimateCostUsd(r.record.model, r.record.inputTokens, r.record.outputTokens);
    rows.push(
      r.ok
        ? { item: g, got: { logic: r.scores.logic, evidence: r.scores.evidence, originality: r.scores.originality, responsiveness: r.scores.responsiveness }, steelman: r.scores.steelman.present, why: "", rationale: r.scores.rationale }
        : { item: g, got: null, steelman: null, why: r.why, rationale: "" },
    );
  }

  const scored = rows.filter((r) => r.got);
  const per: Record<Criterion, Agreement> = Object.fromEntries(
    CRITERIA.map((c) => [c, agreement(scored.map((r) => r.item.labels[c]), scored.map((r) => r.got![c]))]),
  ) as Record<Criterion, Agreement>;
  const pooled = agreement(
    scored.flatMap((r) => CRITERIA.map((c) => r.item.labels[c])),
    scored.flatMap((r) => CRITERIA.map((c) => r.got![c])),
  );
  const allPass = CRITERIA.every((c) => passes(per[c])) && scored.length === rows.length;
  const steelTrue = scored.filter((r) => r.item.steelman);
  const steelFound = scored.filter((r) => r.steelman);
  const steelHits = scored.filter((r) => r.item.steelman && r.steelman).length;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const rho = (x: number | null) => (x === null ? "n/a" : x.toFixed(2));
  const injection = rows.find((r) => r.item.id === "hs-06");

  const lines = [
    `# Judging evaluation, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Provider: ${real ? `real, ${model}` : "fake (keyword-driven stand-in, NOT the real model)"}. Prompt: ${promptVersion("judge_rubric")}. Gold set: ${gold.status} ${gold.version} (labels not yet ratified by the owner). Estimated spend: £${spent.toFixed(4)}.`,
    "",
    `Scored ${scored.length} of ${rows.length}${rows.length - scored.length ? ` (unavailable: ${rows.filter((r) => !r.got).map((r) => `${r.item.id} ${r.why}`).join(", ")})` : ""}.`,
    "",
    "| criterion | mean abs error | within ±1 | Spearman | pass (≥80% within ±1 and ρ ≥ 0.7) |",
    "| --- | --- | --- | --- | --- |",
    ...CRITERIA.map((c) => `| ${c} | ${per[c].mae.toFixed(2)} | ${pct(per[c].withinOne)} | ${rho(per[c].spearman)} | ${passes(per[c]) ? "yes" : "no"} |`),
    `| all four pooled | ${pooled.mae.toFixed(2)} | ${pct(pooled.withinOne)} | ${rho(pooled.spearman)} | ${passes(pooled) ? "yes" : "no"} |`,
    "",
    `**Overall: ${allPass ? "PASS" : "FAIL"}** (every criterion must pass).`,
    "",
    `Steelman detection: ${steelHits} of ${steelTrue.length} labelled steelmen found; ${steelFound.length - steelHits} false positives.`,
    `Prompt-injection item hs-06: ${injection?.got ? CRITERIA.map((c) => `${c} ${injection.got![c]}`).join(", ") : "unavailable"} (expected all 1).`,
    "",
    "| id | kind | human (L/E/O/R) | AI (L/E/O/R) | steelman human/AI | AI rationale |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.item.id} | ${r.item.kind} | ${CRITERIA.map((c) => r.item.labels[c]).join("/")} | ${r.got ? CRITERIA.map((c) => r.got![c]).join("/") : r.why} | ${r.item.steelman ? "yes" : "no"}/${r.steelman === null ? "-" : r.steelman ? "yes" : "no"} | ${r.rationale.replace(/\|/g, "/")} |`,
    ),
    "",
  ];
  mkdirSync("evals/out", { recursive: true });
  const file = `evals/out/judging-${real ? "real" : "fake"}-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(file, lines.join("\n"));
  console.log(lines.slice(2, 18).join("\n"));
  console.log(`\nFull table: ${file}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
