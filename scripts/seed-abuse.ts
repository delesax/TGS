/**
 * Seeds the moderation gold set as real Dispatches, for LOCAL development and
 * demos only, and screens them with the FAKE provider (never the real API).
 *
 *   set -a && . ./.env.test.local && set +a && npm run seed:abuse
 *
 * Refuses anything but local Supabase (same check as seed:debate). Idempotent:
 * if the test Campaigns already exist, nothing is written. All content is
 * fictional test data from evals/moderation-gold.json.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import gold from "../evals/moderation-gold.json";
import { screenDispatchWith } from "../src/lib/ai/engine";
import { screeningPayload } from "../src/lib/ai/payload";
import { databaseDeps } from "./lib/ai-deps";
import { assertLocal } from "./lib/debate-seed";
import { describeTarget, loadEnv, requireVar } from "./lib/env";

loadEnv();

const PASSWORD = "abuse-seed-password";
const INVITE = "TEST-ABUSE-SEED";
const NAMES = ["Bramble", "Corvin", "Delphine", "Ellery", "Fenwick"];
const CAMPAIGNS = [
  { slug: "test-moderation-normal", title: "[Test data] Moderation check: open debate", sensitive: false },
  { slug: "test-moderation-sensitive", title: "[Test data] Moderation check: sensitive topic", sensitive: true },
];

async function main() {
  const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
  console.log(`Target: ${describeTarget(url)}`);
  assertLocal(url);
  const admin = createClient(url, requireVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const anonKey = requireVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const { data: existing } = await admin.from("campaigns").select("id").in("slug", CAMPAIGNS.map((c) => c.slug));
  if (existing?.length) {
    console.log("The moderation test Campaigns already exist, so nothing was changed.");
    return;
  }

  const now = Date.now();
  const campaignIds: Record<string, string> = {};
  for (const c of CAMPAIGNS) {
    const { data, error } = await admin
      .from("campaigns")
      .insert({
        slug: c.slug,
        title: c.title,
        summary: "Test data: the moderation gold set, posted and screened by the fake AI provider. Local only.",
        category: "technology",
        status: "open",
        starts_at: new Date(now - 3_600_000).toISOString(),
        ends_at: new Date(now + 7 * 86_400_000).toISOString(),
        is_sensitive: c.sensitive,
        content_note: c.sensitive ? "Test data: a sensitive Campaign used to check stricter moderation." : null,
      })
      .select("id")
      .single();
    if (error) throw error;
    campaignIds[c.slug] = data.id;
  }

  await admin.from("invites").upsert({ code: INVITE, note: "seed:abuse test Strategists (local only)", max_uses: 20 }, { onConflict: "code", ignoreDuplicates: true });
  const users: { id: string; client: SupabaseClient }[] = [];
  for (const [i, name] of NAMES.entries()) {
    const email = `abuse${String(i + 1).padStart(2, "0")}@example.test`;
    const { data: made, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { invite_code: INVITE, age_confirmed: true, terms_accepted: true, public_acknowledged: true, terms_version: "test", privacy_version: "test" },
    });
    if (error && !/already/i.test(error.message)) throw error;
    let created = made;
    if (!created?.user) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      created = { user: list.users.find((u) => u.email === email)! };
    }
    const id = created.user.id;
    await admin.from("profiles").update({ handle: `Test_${name}`, handle_set_at: new Date().toISOString() }).eq("id", id);
    const client: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signInError) throw signInError;
    for (const cid of Object.values(campaignIds)) await client.from("campaign_positions").insert({ campaign_id: cid, user_id: id, after_position: "for" });
    users.push({ id, client });
  }

  // Post through post_dispatch() like any Strategist, with the cooldown lifted for the seed.
  const { data: before } = await admin.from("community_settings").select("cooldown_seconds").single();
  await admin.from("community_settings").update({ cooldown_seconds: 0 }).eq("id", true);
  const deps = databaseDeps(admin);
  const tally: Record<string, Record<string, number>> = {};
  try {
    for (const [i, g] of gold.items.entries()) {
      const user = users[i % users.length];
      const slug = g.sensitive ? CAMPAIGNS[1].slug : CAMPAIGNS[0].slug;
      const { data: id, error } = await user.client.rpc("post_dispatch", {
        p_campaign_id: campaignIds[slug],
        p_kind: "argument",
        p_body: g.text,
        p_ai_use: g.ai_use,
      });
      if (error) throw new Error(`${g.id}: ${error.message}`);
      const result = await screenDispatchWith(deps, { body: g.text, aiUse: g.ai_use as "none", campaign: { title: g.campaign_title, category: "technology", isSensitive: g.sensitive } });
      const { data: status, error: applyError } = await admin.rpc("apply_dispatch_screening", { p_dispatch_id: id, p_result: screeningPayload(result) });
      if (applyError) throw applyError;
      tally[g.label] ??= {};
      tally[g.label][status as string] = (tally[g.label][status as string] ?? 0) + 1;
    }
  } finally {
    await admin.from("community_settings").update({ cooldown_seconds: before?.cooldown_seconds ?? 30 }).eq("id", true);
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
  console.log(`\nPosted ${gold.items.length} Dispatches, screened by the fake provider:`);
  for (const [label, counts] of Object.entries(tally)) console.log(`  ${label}: ${Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(", ")}`);
  console.log(`\nCampaigns: ${site}/campaigns/${CAMPAIGNS[0].slug} and ${site}/campaigns/${CAMPAIGNS[1].slug}`);
  console.log(`Authors: abuse01@example.test to abuse05@example.test, password (local test data only): ${PASSWORD}`);
  console.log(`Review queue (as an admin): ${site}/admin/moderation`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
