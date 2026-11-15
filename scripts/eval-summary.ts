/**
 * Real-model spot check of the winner's summary (judge-summary.v1) over gold-set Campaigns.
 *
 *   npx tsx scripts/eval-summary.ts --real [--cap-usd 0.10] "<Campaign title>" ...
 *
 * For each Campaign it treats the gold-set items as the winner's Dispatches, drafts one summary and reports: word count, the
 * mechanical checks (quotation, figure, address, handle), and the usage. Stops before it could pass the cap. Never prints a key.
 * Not run by tests or CI. Without --real it uses the fake provider.
 */
import gold from "../evals/judging/gold-set.json";
import { judgeSummaryWith, summaryProblems } from "../src/lib/ai/engine";
import { scriptDeps } from "./lib/ai-deps";
import { loadEnv } from "./lib/env";

loadEnv();
const real = process.argv.includes("--real");
const debug = process.argv.includes("--debug");
const capIdx = process.argv.indexOf("--cap-usd");
const CAP = capIdx >= 0 ? Number(process.argv[capIdx + 1]) : 0.1;
const titles = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--cap-usd" && all[i - 1] !== "--only");

async function main() {
  const base = scriptDeps({ real });
  const inner = base.provider;
  // --debug prints each raw answer and the mechanical-check failures, so a rejected draft can be understood.
  const deps = debug && inner
    ? {
        ...base,
        provider: {
          ...inner,
          async complete(req: Parameters<typeof inner.complete>[0]) {
            const res = await inner.complete(req);
            console.log(`[debug] tokens in=${res.inputTokens} out=${res.outputTokens}`);
            console.log(`[debug] raw answer: ${res.text.slice(0, 1500)}`);
            try {
              const parsed = JSON.parse(res.text) as { summary?: string };
              const source = req.user.split("<untrusted_text>").slice(1).join(" ");
              if (parsed.summary) console.log(`[debug] checks: ${JSON.stringify(summaryProblems(parsed.summary, source))}`);
            } catch {
              console.log("[debug] answer was not JSON");
            }
            return res;
          },
        },
      }
    : base;
  let spent = 0;
  for (const title of titles) {
    // --only argument keeps one side's own case (the gold set mixes both sides' items, so all three together are not one author).
    const onlyIdx = process.argv.indexOf("--only");
    const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
    const items = gold.items.filter((i) => i.campaign_title === title && (!only || i.kind === only));
    if (!items.length) {
      console.log(`No gold items for "${title}"`);
      continue;
    }
    if (spent >= CAP) {
      console.log("Cap reached; stopping.");
      break;
    }
    const dispatches = items.map((i) => ({ id: i.id, kind: i.kind, body: i.text, sources: null }));
    const r = await judgeSummaryWith(deps, { topic: title, dispatches });
    console.log(`\n=== ${title} (${items.length} Dispatches, ${items.reduce((n, i) => n + i.text.length, 0)} chars)`);
    if (!r.ok) {
      console.log(`FAILED: ${r.why}`);
      continue;
    }
    spent += r.usage.estimatedCostUsd;
    const source = dispatches.map((d) => d.body).join("\n\n");
    console.log(r.summary);
    console.log(`words=${r.summary.trim().split(/\s+/).length} problems=${JSON.stringify(summaryProblems(r.summary, source))} best=${r.bestDispatchId}`);
    console.log(`model=${r.record.model} prompt=v${r.record.promptVersion} in=${r.usage.inputTokens} out=${r.usage.outputTokens} cost=$${r.usage.estimatedCostUsd.toFixed(4)}`);
  }
  console.log(`\nTotal estimated cost: $${spent.toFixed(4)} (cap $${CAP})`);
}
main().catch((e) => {
  console.error(String((e as Error).message).replace(/sk-ant-[A-Za-z0-9_=-]+/g, "[key hidden]"));
  process.exit(1);
});
