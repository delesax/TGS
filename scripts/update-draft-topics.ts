/**
 * ONE-OFF. Bring the DRAFT launch Campaigns on the project in line with the
 * 7 November 2026 topic decisions (Bank of England, Rosebank, assisted dying).
 *
 *   npx tsx scripts/update-draft-topics.ts              dry run: prints a diff, writes nothing
 *   npx tsx scripts/update-draft-topics.ts --confirm    writes (do not run until the owner says so)
 *
 * Touches ONLY Campaigns whose status is still `draft`, matched by slug, and never
 * their schedule. See src/lib/draft-topic-update.ts.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { applyDraftUpdates, formatPlans, planDraftUpdates } from "../src/lib/draft-topic-update";
import { topicFileSchema } from "../src/lib/launch-topics";
import { describeTarget, loadEnv, requireVar } from "./lib/env";

loadEnv();

const { values } = parseArgs({ options: { confirm: { type: "boolean", default: false }, file: { type: "string", default: "supabase/data/launch-topics.json" } } });

async function main() {
  const file = topicFileSchema.parse(JSON.parse(readFileSync(values.file!, "utf8")));
  const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
  console.log(`Target: ${describeTarget(url)}`);
  console.log(values.confirm ? "CONFIRM: changes will be written." : "DRY RUN: nothing will be written.");
  const client = createClient(url, requireVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const plans = await planDraftUpdates(client, file);
  for (const line of formatPlans(plans)) console.log(line);

  const todo = plans.filter((p) => p.action === "update").length;
  if (!values.confirm) {
    console.log(`\n${todo} Campaign${todo === 1 ? "" : "s"} would change. This was a dry run. Add --confirm to write.`);
    return;
  }
  const { updated, refused } = await applyDraftUpdates(client, plans);
  console.log(`\nUpdated: ${updated.join(", ") || "none"}.${refused.length ? ` Refused (no longer draft): ${refused.join(", ")}.` : ""}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
