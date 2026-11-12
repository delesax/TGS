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
 * of 0.7 or more. The real run stops before it could spend more than £5:
 * token costs are priced in US dollars and converted at USD_PER_GBP, set
 * below the market rate so the pound figure errs high. It stops at once if
 * the API rejects the key, and exits with an error if any item could not be
 * scored (the report is still written). Error details never include the key.
 * Tests and CI never run this. Writes a report to evals/out/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import gold from "../evals/judging/gold-set.json";
import { estimateCostUsd, resolveModel } from "../src/lib/ai/config";
import { judgeRubricWith, type EngineDeps } from "../src/lib/ai/engine";
import { loadPrompt, promptVersion } from "../src/lib/ai/prompts";
import { agreement, passes, type Agreement } from "../src/lib/judging/metrics";
import { scriptDeps } from "./lib/ai-deps";
import { loadEnv } from "./lib/env";

loadEnv();
const real = process.argv.includes("--real");
const CAP_GBP = 5;
/** Deliberately below the market rate (about 1.3), so costs in pounds err high. */
const USD_PER_GBP = 1.2;
const gbp = (usd: number) => usd / USD_PER_GBP;
const money = (usd: number) => `£${gbp(usd).toFixed(2)} ($${usd.toFixed(2)})`;

/** A provider error, with anything that looks like a key masked. */
type ProviderError = { status: number | null; message: string };
function describeError(e: unknown): ProviderError {
  const err = e as { status?: number; error?: { error?: { type?: string; message?: string } }; message?: string };
  const status = typeof err?.status === "number" ? err.status : null;
  const detail = err?.error?.error ? `${err.error.error.type ?? "error"}: ${err.error.error.message ?? ""}` : String(err?.message ?? e);
  return { status, message: detail.replace(/sk-ant-[A-Za-z0-9_=-]+/g, "[key hidden]").slice(0, 200) };
}

/** Wraps the provider so the eval can say why a call failed (the engine only says "error"). */
function watchErrors(deps: EngineDeps): { deps: EngineDeps; errors: ProviderError[] } {
  const errors: ProviderError[] = [];
  const inner = deps.provider;
  if (!inner) return { deps, errors };
  return {
    errors,
    deps: {
      ...deps,
      provider: {
        ...inner,
        async complete(req) {
          try {
            return await inner.complete(req);
          } catch (e) {
            errors.push(describeError(e));
            throw e;
          }
        },
      },
    },
  };
}
const CRITERIA = ["logic", "evidence", "originality", "responsiveness"] as const;
type Criterion = (typeof CRITERIA)[number];
type Item = (typeof gold.items)[number];

async function main() {
  const { deps, errors } = watchErrors(scriptDeps({ real }));
  const model = resolveModel("judging", deps.settings);
  const byId = new Map<string, Item>(gold.items.map((g) => [g.id, g]));
  const promptChars = loadPrompt("judge_rubric").text.length;
  // Generous: input counted twice (a retry), 4,000 output tokens (thinking included) per attempt.
  const estimate = gold.items.reduce((t, g) => t + estimateCostUsd(model, Math.ceil((promptChars + g.text.length + 1500) / 3) * 2, 4000 * 2), 0);
  console.log(`${real ? `REAL model ${model}` : "Fake provider (no network, no cost)"}. ${gold.items.length} Dispatches. Gold set: ${gold.status} ${gold.version}.`);
  if (real) {
    console.log(`Worst-case estimate: about ${money(estimate)}; cap £${CAP_GBP}.`);
    if (gbp(estimate) > CAP_GBP) throw new Error("The estimate is over the spending cap. Nothing was sent.");
  }

  let spent = 0;
  const rows: { item: Item; got: Record<Criterion, number> | null; steelman: boolean | null; why: string; rationale: string }[] = [];
  for (const g of gold.items) {
    if (gbp(spent) > CAP_GBP) {
      console.log("Stopped: the spending cap was reached.");
      break;
    }
    const parent = g.parent ? byId.get(g.parent)?.text ?? null : null;
    const r = await judgeRubricWith(deps, { body: g.text, kind: g.kind as "argument", campaign: { title: g.campaign_title, category: g.category }, parentBody: parent });
    if (r.record && real) spent += estimateCostUsd(r.record.model, r.record.inputTokens, r.record.outputTokens);
    const rejected = errors.find((e) => e.status === 401 || e.status === 403);
    if (rejected) {
      console.log(`Stopped: the API rejected the key (${rejected.status} ${rejected.message}). Check ANTHROPIC_API_KEY: it should be an API key from the Anthropic Console, starting sk-ant-api.`);
      rows.push({ item: g, got: null, steelman: null, why: "key rejected", rationale: "" });
      break;
    }
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
  const complete = scored.length === gold.items.length;
  const allPass = CRITERIA.every((c) => passes(per[c])) && complete;
  const steelTrue = scored.filter((r) => r.item.steelman);
  const steelFound = scored.filter((r) => r.steelman);
  const steelHits = scored.filter((r) => r.item.steelman && r.steelman).length;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const rho = (x: number | null) => (x === null ? "n/a" : x.toFixed(2));
  const injection = rows.find((r) => r.item.id === "hs-06");

  const lines = [
    `# Judging evaluation, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Provider: ${real ? `real, ${model}` : "fake (keyword-driven stand-in, NOT the real model)"}. Prompt: ${promptVersion("judge_rubric")}. Gold set: ${gold.status} ${gold.version} (labels not yet ratified by the owner). Estimated spend: ${money(spent)}.`,
    "",
    `Scored ${scored.length} of ${gold.items.length}${rows.length - scored.length ? ` (unavailable: ${rows.filter((r) => !r.got).map((r) => `${r.item.id} ${r.why}`).join(", ")})` : ""}${rows.length < gold.items.length ? `; ${gold.items.length - rows.length} not attempted` : ""}.`,
    ...(errors.length ? ["", `First provider error: ${errors[0].status ?? "no status"} ${errors[0].message}`] : []),
    "",
    "| criterion | mean abs error | within ±1 | Spearman | pass (≥80% within ±1 and ρ ≥ 0.7) |",
    "| --- | --- | --- | --- | --- |",
    ...CRITERIA.map((c) => `| ${c} | ${per[c].mae.toFixed(2)} | ${pct(per[c].withinOne)} | ${rho(per[c].spearman)} | ${passes(per[c]) ? "yes" : "no"} |`),
    `| all four pooled | ${pooled.mae.toFixed(2)} | ${pct(pooled.withinOne)} | ${rho(pooled.spearman)} | ${passes(pooled) ? "yes" : "no"} |`,
    "",
    complete
      ? `**Overall: ${allPass ? "PASS" : "FAIL"}** (every criterion must pass).`
      : `**Overall: INCOMPLETE** (${gold.items.length - scored.length} of ${gold.items.length} not scored; these numbers do not count).`,
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
  console.log(lines.slice(2, lines.indexOf("| id | kind | human (L/E/O/R) | AI (L/E/O/R) | steelman human/AI | AI rationale |") - 1).join("\n"));
  console.log(`\nFull table: ${file}`);
  if (!complete) {
    console.error(`\nIncomplete: ${gold.items.length - scored.length} of ${gold.items.length} items were not scored. Exiting with an error.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
