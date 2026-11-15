/**
 * Real-model spot check of the winner's summary (the judge-summary prompt) on realistic winner inputs.
 *
 *   npx tsx scripts/eval-summary.ts --real --fixtures [--cap-usd 0.10] [--debug]
 *   npx tsx scripts/eval-summary.ts --real --only argument "<gold-set Campaign title>"   (older gold-set mode)
 *
 * --fixtures uses evals/judging/summary-fixtures.json: each case is ONE author's own Dispatches (including rebuttals that restate
 * the other side), with their types. For each case it reports the Dispatch types, the summary, the word count, the validator's
 * verdict and the usage. The total comes from the engine's own usage calls (record), so rejected attempts and retries are counted;
 * it stops before it could pass the cap. --debug prints each raw answer and its check failures. Never prints a key.
 * Not run by tests or CI. Without --real it uses the fake provider.
 */
import fixtures from "../evals/judging/summary-fixtures.json";
import gold from "../evals/judging/gold-set.json";
import { estimateCostUsd, resolveModel } from "../src/lib/ai/config";
import { judgeSummaryWith, summaryProblems, type EngineDeps, type SummaryDispatchInput } from "../src/lib/ai/engine";
import { scriptDeps } from "./lib/ai-deps";
import { loadEnv } from "./lib/env";

loadEnv();
const real = process.argv.includes("--real");
const debug = process.argv.includes("--debug");
const useFixtures = process.argv.includes("--fixtures");
const capIdx = process.argv.indexOf("--cap-usd");
const CAP = capIdx >= 0 ? Number(process.argv[capIdx + 1]) : 0.1;
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
const titles = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--cap-usd" && all[i - 1] !== "--only");

type Case = { title: string; note?: string; dispatches: SummaryDispatchInput[] };

function cases(): Case[] {
  if (useFixtures) return fixtures.cases.map((c) => ({ title: c.title, note: c.note, dispatches: c.dispatches as SummaryDispatchInput[] }));
  return titles.map((title) => ({
    title,
    dispatches: gold.items.filter((i) => i.campaign_title === title && (!only || i.kind === only)).map((i) => ({ id: i.id, kind: i.kind, body: i.text, sources: null })),
  }));
}

async function main() {
  const base = scriptDeps({ real });
  const model = resolveModel("judging", base.settings);
  // The usage log: every provider call the engine records (accepted, rejected or failed), priced at the model's rate.
  const log: { inputTokens: number; outputTokens: number; failed: boolean; usd: number }[] = [];
  const total = () => log.reduce((n, l) => n + l.usd, 0);
  const inner = base.provider;
  const deps: EngineDeps = {
    ...base,
    record: async (feature, userId, inputTokens, outputTokens, failed) => {
      log.push({ inputTokens, outputTokens, failed, usd: estimateCostUsd(model, inputTokens, outputTokens) });
      await base.record(feature, userId, inputTokens, outputTokens, failed);
    },
    provider:
      debug && inner
        ? {
            ...inner,
            async complete(req) {
              const res = await inner.complete(req);
              console.log(`[debug] raw answer: ${res.text.slice(0, 1800)}`);
              try {
                const parsed = JSON.parse(res.text) as { summary?: string };
                if (parsed.summary) console.log(`[debug] words=${parsed.summary.trim().split(/\s+/).length}`);
              } catch {
                console.log("[debug] answer was not JSON");
              }
              return res;
            },
          }
        : inner,
  };

  for (const c of cases()) {
    if (!c.dispatches.length) {
      console.log(`No Dispatches for "${c.title}"`);
      continue;
    }
    if (total() >= CAP) {
      console.log("Cap reached; stopping.");
      break;
    }
    const before = log.length;
    const r = await judgeSummaryWith(deps, { topic: c.title, dispatches: c.dispatches });
    const types = c.dispatches.map((d, i) => `D${i + 1} ${d.kind}`).join(", ");
    console.log(`\n=== ${c.title}\nDispatch types given: ${types}${c.note ? `\nCase: ${c.note}` : ""}`);
    const attempts = log.slice(before);
    const spentHere = attempts.reduce((n, l) => n + l.usd, 0);
    if (!r.ok) {
      console.log(`REJECTED by the validator/engine: ${r.why} (calls this case: ${attempts.length}, cost $${spentHere.toFixed(4)})`);
      continue;
    }
    const source = c.dispatches
      .map((d) => (d.sources?.length ? `${d.body}\n\nSources cited: ${d.sources.map((s) => `${s.title ? s.title + " " : ""}${s.url}`.trim()).join("; ")}` : d.body))
      .join("\n\n");
    console.log(r.summary);
    console.log(`ACCEPTED. words=${r.summary.trim().split(/\s+/).length} problems=${JSON.stringify(summaryProblems(r.summary, source))} best=${r.bestDispatchId}`);
    console.log(`model=${r.record.model} prompt=${r.record.promptVersion} calls this case=${attempts.length} in=${attempts.reduce((n, l) => n + l.inputTokens, 0)} out=${attempts.reduce((n, l) => n + l.outputTokens, 0)} cost=$${spentHere.toFixed(4)}`);
  }
  console.log(`\nTrue total from the usage log: ${log.length} calls, $${total().toFixed(4)} (cap $${CAP})`);
}
main().catch((e) => {
  console.error(String((e as Error).message).replace(/sk-ant-[A-Za-z0-9_=-]+/g, "[key hidden]"));
  process.exit(1);
});
