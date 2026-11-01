/**
 * Create a short-lived test Campaign in the LOCAL database, to watch it open,
 * change round and close on schedule.
 *
 *   npm run campaign:test                 opens in 1 minute, two 2-minute rounds
 *   npm run campaign:test -- --in 2 --round 3
 *
 * Times are rounded up to the next whole minute, because the scheduler runs on
 * the minute. Refuses to run against the hosted project.
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { describeTarget, loadEnv, requireVar } from "./lib/env";

loadEnv();
const { values } = parseArgs({ options: { in: { type: "string", default: "1" }, round: { type: "string", default: "2" } } });
const opensIn = Number(values.in);
const roundMinutes = Number(values.round);
if (!(opensIn >= 1 && opensIn <= 60 && roundMinutes >= 1 && roundMinutes <= 60)) throw new Error("--in and --round must be 1 to 60 minutes");

const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(new URL(url).host)) {
  console.error(`Refusing: ${describeTarget(url)}. Test Campaigns are for local Supabase only.`);
  process.exit(1);
}
const admin = createClient(url, requireVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function main() {
  console.log(`Target: ${describeTarget(url)}`);
  const { data: nowIso } = await admin.rpc("server_now");
  const minute = 60_000;
  const start = Math.ceil(Date.parse(nowIso as string) / minute) * minute + (opensIn - 1) * minute;
  const iso = (ms: number) => new Date(ms).toISOString();
  const slug = `test-${randomUUID().slice(0, 8)}`;

  const { data, error } = await admin
    .from("campaigns")
    .insert({
      slug,
      title: `[Test] One-minute Campaign ${slug.slice(5)}`,
      summary: "A short-lived Campaign for checking the countdown and scheduler.",
      category: "technology",
      format: "progressive",
      status: "scheduled",
      starts_at: iso(start),
      ends_at: iso(start + 2 * roundMinutes * minute),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: roundError } = await admin.from("campaign_rounds").insert([
    { campaign_id: data.id, position: 1, title: "Round one", starts_at: iso(start), ends_at: iso(start + roundMinutes * minute) },
    { campaign_id: data.id, position: 2, title: "Round two", starts_at: iso(start + roundMinutes * minute), ends_at: iso(start + 2 * roundMinutes * minute) },
  ]);
  if (roundError) throw new Error(roundError.message);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  console.log(`Opens  ${iso(start)}`);
  console.log(`Closes ${iso(start + 2 * roundMinutes * minute)}`);
  console.log(`Page: ${site}/campaigns/${slug}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
