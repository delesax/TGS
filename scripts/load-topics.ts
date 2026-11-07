/**
 * Load the fifteen launch topics as DRAFT Campaigns.
 *
 *   npm run topics:load -- --start 2026-12-01
 *
 * Topics run back to back in wave order, each for default_duration_days, from
 * midnight UK time on --start. You choose the start date; the script never
 * invents one. Idempotent by slug: existing Campaigns are skipped, never changed.
 * Prints the target host and asks before writing anything.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { buildTopicRows, loadTopics, topicFileSchema } from "../src/lib/launch-topics";
import { describeTarget, loadEnv, requireVar } from "./lib/env";

loadEnv();

const { values } = parseArgs({ options: { start: { type: "string" }, concurrent: { type: "boolean", default: false }, file: { type: "string", default: "supabase/data/launch-topics.json" } } });
if (!values.start) {
  console.error("Usage: npm run topics:load -- --start YYYY-MM-DD [--concurrent]   (the date the first topic opens, UK time)");
  process.exit(1);
}

async function main() {
  const parsed = topicFileSchema.safeParse(JSON.parse(readFileSync(values.file!, "utf8")));
  if (!parsed.success) {
    console.error("The topics file is not valid:");
    for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    process.exit(1);
  }
  const rows = buildTopicRows(parsed.data, values.start!, { concurrent: values.concurrent });

  const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
  console.log(`Target: ${describeTarget(url)}`);
  console.log(`Will create up to ${rows.length} DRAFT Campaigns (existing slugs are skipped):`);
  for (const r of rows) {
    const flags = [r.needs_owner_decision ? "NEEDS OWNER DECISION" : null, r.is_sensitive ? "sensitive" : null].filter(Boolean).join(", ");
    console.log(`  wave ${r.wave}  ${r.starts_at.slice(0, 10)}  ${r.slug}${flags ? `  [${flags}]` : ""}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Type yes to continue: ")).trim().toLowerCase();
  rl.close();
  if (answer !== "yes") {
    console.log("Nothing written.");
    return;
  }

  const admin = createClient(url, requireVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { created, skipped } = await loadTopics(admin, rows);
  console.log(`Created ${created.length} draft${created.length === 1 ? "" : "s"}. Skipped ${skipped.length} that already existed.`);
  for (const r of rows.filter((x) => x.needs_owner_decision && created.includes(x.slug))) {
    console.log(`Owner decision needed for ${r.slug}: ${r.needs_owner_decision}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
