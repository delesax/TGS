/**
 * Runs the moderation gold set (evals/moderation-gold.json) through Dispatch
 * screening and reports how it did.
 *
 *   npm run eval:moderation              fake provider, free, no network
 *   npm run eval:moderation -- --real    the real model; needs ANTHROPIC_API_KEY
 *
 * The real run stops before it could spend more than £5 (estimated, and
 * treating each US dollar as a pound so the estimate errs high). Tests and
 * CI never run this. Writes a report to evals/out/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import gold from "../evals/moderation-gold.json";
import { estimateCostUsd, resolveModel } from "../src/lib/ai/config";
import { screenDispatchWith } from "../src/lib/ai/engine";
import { loadPrompt } from "../src/lib/ai/prompts";
import { scriptDeps } from "./lib/ai-deps";
import { loadEnv } from "./lib/env";

loadEnv();
const real = process.argv.includes("--real");
const CAP_GBP = 5;

async function main() {
  const deps = scriptDeps({ real });
  const model = resolveModel("screening", deps.settings);
  // Pre-flight: a generous estimate for the whole run.
  const promptChars = loadPrompt("screen_dispatch").text.length;
  const estimate = gold.items.reduce((t, g) => t + estimateCostUsd(model, Math.ceil((promptChars + g.text.length + 600) / 3) * 2, 400 * 2), 0);
  console.log(`${real ? `REAL model ${model}` : "Fake provider (no network, no cost)"}. ${gold.items.length} Dispatches.`);
  if (real) {
    console.log(`Worst-case estimate: about £${estimate.toFixed(4)} (cap £${CAP_GBP}).`);
    if (estimate > CAP_GBP) throw new Error("The estimate is over the spending cap. Nothing was sent.");
  }

  let spent = 0;
  const rows: { id: string; label: string; category: string; sensitive: boolean; injection: boolean; outcome: string; got: string; confidence: number | null; reason: string }[] = [];
  for (const g of gold.items) {
    if (spent > CAP_GBP) {
      console.log("Stopped: the spending cap was reached.");
      break;
    }
    const r = await screenDispatchWith(deps, { body: g.text, aiUse: g.ai_use as "none", campaign: { title: g.campaign_title, category: "general", isSensitive: g.sensitive } });
    if (r.record) spent += estimateCostUsd(r.record.model, r.record.inputTokens, r.record.outputTokens);
    rows.push({
      id: g.id,
      label: g.label,
      category: g.category,
      sensitive: g.sensitive,
      injection: g.injection,
      outcome: r.outcome,
      got: r.outcome === "unavailable" ? `unavailable (${r.why})` : r.category,
      confidence: r.outcome === "unavailable" ? null : r.confidence,
      reason: r.outcome === "unavailable" ? "" : r.reason,
    });
  }

  const held = (o: string) => o === "hold" || o === "block";
  const abusive = rows.filter((r) => r.label === "abusive");
  const benign = rows.filter((r) => r.label === "benign");
  const borderline = rows.filter((r) => r.label === "borderline");
  const injections = rows.filter((r) => r.injection);
  const recall = abusive.filter((r) => held(r.outcome)).length / Math.max(1, abusive.length);
  const falseHolds = benign.filter((r) => held(r.outcome)).length / Math.max(1, benign.length);
  const unavailable = rows.filter((r) => r.outcome === "unavailable").length;

  const lines = [
    `# Moderation evaluation, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Provider: ${real ? `real, ${model}` : "fake (keyword-driven stand-in, not the real model)"}. Estimated spend: £${spent.toFixed(4)}.`,
    "",
    `- Recall on clearly abusive: **${Math.round(recall * 100)}%** (${abusive.filter((r) => held(r.outcome)).length} of ${abusive.length}; target 100%)`,
    `- False holds on benign: **${Math.round(falseHolds * 100)}%** (${benign.filter((r) => held(r.outcome)).length} of ${benign.length}; target 10% or less)`,
    `- Borderline: ${borderline.filter((r) => held(r.outcome)).length} held, ${borderline.filter((r) => r.outcome === "allow").length} visible (either is acceptable)`,
    `- Prompt-injection attempts: ${injections.map((r) => `${r.id} ${r.label} → ${r.outcome}`).join("; ")}`,
    `- Unavailable (timeout, invalid answer): ${unavailable}`,
    "",
    "| id | label | expected | outcome | category | confidence | reason |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.id} | ${r.label}${r.sensitive ? " (sensitive)" : ""} | ${r.category} | ${r.outcome} | ${r.got} | ${r.confidence ?? ""} | ${r.reason.replace(/\|/g, "/")} |`),
    "",
  ];
  mkdirSync("evals/out", { recursive: true });
  const file = `evals/out/moderation-${real ? "real" : "fake"}-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(file, lines.join("\n"));
  console.log(lines.slice(4, 10).join("\n"));
  console.log(`\nFull table: ${file}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
