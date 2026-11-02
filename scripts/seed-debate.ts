/**
 * A threaded debate between 20 test Strategists, for LOCAL development only.
 *
 *   set -a && . ./.env.test.local && set +a && npm run seed:debate
 *
 * Prints the target first and refuses anything but local Supabase. Idempotent:
 * running it again writes nothing. All content is marked as test data.
 */
import { DEBATE_PASSWORD, DEBATE_SLUG, assertLocal, debateEmail, debateHandles, seedDebate } from "./lib/debate-seed";
import { describeTarget, loadEnv, requireVar } from "./lib/env";

loadEnv();

async function main() {
  const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
  console.log(`Target: ${describeTarget(url)}`);
  assertLocal(url);
  const result = await seedDebate(
    { url, serviceKey: requireVar("SUPABASE_SERVICE_ROLE_KEY"), anonKey: requireVar("NEXT_PUBLIC_SUPABASE_ANON_KEY") },
    (msg) => console.log(msg),
  );
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
  console.log(`\nCampaign: ${site}/campaigns/${DEBATE_SLUG}`);
  console.log(`Test Strategists: ${debateEmail(0)} to ${debateEmail(19)} (handles ${debateHandles[0]} to ${debateHandles[19]}).`);
  console.log(`Their password (local test data only): ${DEBATE_PASSWORD}`);
  if (!result.created) console.log("The debate already existed, so nothing was changed.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
