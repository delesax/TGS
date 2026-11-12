/**
 * End-to-end judging seed, for LOCAL development only.
 *
 *   npm run test:env && set -a && . ./.env.test.local && set +a && npm run seed:judging
 *
 * Creates a test Campaign with 12 test users (10 Strategists and 2 judges),
 * before and after positions, Dispatches, then closes it and runs the real
 * judging flow: judges save and submit panel scores, participants cast peer
 * votes, confirm steelmen and pick the Dispatch that changed their mind, the AI
 * rubric scores every Dispatch with the FAKE provider (never the real API), and
 * a draft Verdict is computed. It stops at the draft: publish it from
 * /admin/judging.
 *
 * Concurrent-safe and idempotent: a database advisory lock lets only one run
 * at a time (a second run waits for the first, then finds its work done), and
 * every step uses fixed emails, handles and a fixed slug with upserts, so
 * repeated runs never duplicate anything. If an earlier run stopped part-way,
 * its half-made test Campaign is removed and the seed starts again. To start
 * completely afresh, reset the local database.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { computeDraftVerdict, processRubricBatch } from "../src/lib/judging/compute";
import { assertLocal } from "./lib/debate-seed";
import { databaseDeps } from "./lib/ai-deps";
import { describeTarget, loadEnv, requireVar } from "./lib/env";

loadEnv();

export const SLUG = "test-judging-high-street-tax";
const PASSWORD = "judging-test-password";
const INVITE = "TEST-JUDGING-SEED";
const NAMES = ["Ada", "Bryn", "Cerys", "Dev", "Esme", "Femi", "Gwen", "Hari", "Iona", "Jem"];
const JUDGES = ["Judge_Kay", "Judge_Lior"];
const email = (handle: string) => `${handle.toLowerCase()}@judging.example.test`;
const handles = [...NAMES.map((n) => `Jt_${n}`), ...JUDGES];

const BODIES: { kind: "argument" | "rebuttal" | "evidence"; author: number; parent?: number; body: string }[] = [
  { kind: "argument", author: 0, body: "A tax on out-of-town retail parks should fund high street renewal because those parks pay lower rates per visitor while drawing trade from town centres. According to the 2023 Valuation Office data, rateable values per square metre are far lower out of town. Therefore a levy corrects a distortion rather than punishing success." },
  { kind: "argument", author: 1, body: "We should not tax retail parks. Many shoppers, especially older and disabled people, rely on free parking and level access that the high street lacks. A tax would raise prices for the people with least choice." },
  { kind: "evidence", author: 2, body: "Evidence: footfall figures from the British Retail Consortium show high street footfall still below 2019 levels, while retail parks have recovered faster. For example, the 2024 annual report put the gap at several percentage points." },
  { kind: "rebuttal", author: 3, parent: 1, body: "To be fair to the other side, the strongest argument against the levy is exactly yours: retail parks serve people who find the high street hard to reach. I accept that. But the levy can fund blue-badge parking and step-free access in town, which answers your concern directly, because the money goes into the access you say is missing." },
  { kind: "rebuttal", author: 4, parent: 0, body: "That assumes the levy money reaches the high street. However, ring-fenced local taxes are often absorbed into general budgets. What would stop that here?" },
  { kind: "argument", author: 5, body: "The high street is dying because of online shopping, not retail parks. Taxing parks targets the wrong competitor." },
  { kind: "evidence", author: 6, body: "Evidence: the ONS reports online sales at roughly a quarter of all retail sales in 2024, up from under a fifth in 2019. That supports the point that online, not retail parks, is the main pressure." },
  { kind: "rebuttal", author: 7, parent: 5, body: "You argue online is the real threat, and the ONS figures back you. Restating your view to check I have it right: taxing parks misses the main cause. Fair. But online and parks both pull spending away, and only one can be taxed locally. A levy on parks is a partial fix the council can actually make." },
  { kind: "argument", author: 8, body: "Councils should cut business rates on the high street instead of adding a new tax. Lower costs let independents survive, and a cut is simpler to deliver than a new levy." },
  { kind: "rebuttal", author: 9, parent: 8, body: "Cutting rates costs money that councils do not have. Where does the shortfall come from? That is why the levy was proposed in the first place." },
  { kind: "argument", author: 3, body: "Whatever we choose, it should be piloted in two towns first, with footfall measured before and after, so the decision rests on evidence rather than guesswork." },
];

// Before and after positions: 4 people move, so mind-change has data.
const BEFORE = ["for", "against", "undecided", "for", "against", "against", "undecided", "for", "against", "undecided"] as const;
const AFTER = ["for", "for", "for", "for", "against", "undecided", "against", "for", "for", "undecided"] as const;
// Who each Strategist picks as the Dispatch that changed their mind (index into BODIES).
const PICKS: Record<number, number> = { 1: 3, 2: 0, 5: 7, 8: 3, 6: 2 };

async function ensureUsers(admin: SupabaseClient): Promise<Map<string, string>> {
  await admin.from("invites").upsert({ code: INVITE, note: "seed:judging test users (local only)", max_uses: 40 }, { onConflict: "code", ignoreDuplicates: true });
  const existing = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) existing.set(u.email, u.id);
    if (data.users.length < 200) break;
  }
  const ids = new Map<string, string>();
  for (const handle of handles) {
    let id = existing.get(email(handle));
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email: email(handle),
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { invite_code: INVITE, age_confirmed: true, terms_accepted: true, public_acknowledged: true },
      });
      if (error) throw error;
      id = data.user.id;
    }
    const { error } = await admin.from("profiles").update({ handle, handle_set_at: new Date().toISOString(), bio: "Test user created by seed:judging." }).eq("id", id);
    if (error) throw error;
    // After the legal-hardening merge, positions need consent. Ignored if the column does not exist yet.
    await admin.from("profiles").update({ positions_consent_at: new Date().toISOString(), positions_consent_version: "seed" }).eq("id", id);
    ids.set(handle, id);
  }
  return ids;
}

async function signedIn(url: string, anonKey: string, handle: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: email(handle), password: PASSWORD });
  if (error) throw error;
  return client;
}

const must = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function main() {
  const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
  console.log(`Target: ${describeTarget(url)}`);
  assertLocal(url);
  const anonKey = requireVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const admin = createClient(url, requireVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const sql = postgres(requireVar("DATABASE_URL"), { max: 1, onnotice: () => {} });

  try {
    // One run at a time: a second run waits here, then sees the work is done.
    await sql`select pg_advisory_lock(hashtext('tgs.seed_judging'))`;

    const { data: found } = await admin.from("campaigns").select("id").eq("slug", SLUG).maybeSingle();
    if (found) {
      const { data: verdict } = await admin.from("verdicts").select("id, version, status, needs_attention").eq("campaign_id", found.id).order("version", { ascending: false }).limit(1).maybeSingle();
      if (verdict) {
        console.log(`Already seeded: Verdict version ${verdict.version} is ${verdict.status}${verdict.needs_attention ? " (needs attention)" : ""}. Nothing written.`);
        console.log(`Review it at /admin/judging/${found.id}`);
        return;
      }
      // An earlier run stopped part-way (it holds the lock, so it is not still running).
      // Remove only this script's own half-made test Campaign and start again.
      console.log("Found a half-finished earlier run: removing its test Campaign and starting again…");
      must(await admin.from("dispatches").delete().eq("campaign_id", found.id), "clean up Dispatches");
      must(await admin.from("campaigns").delete().eq("id", found.id), "clean up Campaign");
    }

    console.log("Creating 12 test users (10 Strategists, 2 judges)…");
    const ids = await ensureUsers(admin);
    const strategists = NAMES.map((n) => ids.get(`Jt_${n}`)!);

    console.log("Creating the Campaign (scheduled), and recording before positions…");
    const now = Date.now();
    const campaign = must(
      await admin
        .from("campaigns")
        .insert({
          slug: SLUG,
          title: "[Test data] Should out-of-town retail parks pay a levy to fund high streets?",
          summary: "TEST DATA created by npm run seed:judging for local development of judging and the Verdict.",
          rules: "Be civil. Argue the point, not the person. (Test data.)",
          category: "financial_services",
          format: "open_arena",
          status: "scheduled",
          starts_at: new Date(now + 3_600_000).toISOString(),
          ends_at: new Date(now + 7_200_000).toISOString(),
          opinion_not_advice: true,
        })
        .select("id")
        .single(),
      "create Campaign",
    ) as { id: string };
    const campaignId = campaign.id;
    for (let i = 0; i < strategists.length; i++) {
      must(await admin.from("campaign_positions").insert({ campaign_id: campaignId, user_id: strategists[i], before_position: BEFORE[i] }), "before position");
    }

    console.log("Opening it, posting 11 Dispatches and recording after positions…");
    must(await admin.from("campaigns").update({ status: "open", starts_at: new Date(Date.now() - 120_000).toISOString(), ends_at: new Date(Date.now() + 3_600_000).toISOString() }).eq("id", campaignId), "open");
    const dispatchIds: string[] = [];
    let clock = Date.now() - 110_000;
    for (const b of BODIES) {
      clock += 5_000;
      const row = must(
        await admin
          .from("dispatches")
          .insert({
            campaign_id: campaignId,
            author_id: strategists[b.author],
            kind: b.kind,
            parent_id: b.parent === undefined ? null : dispatchIds[b.parent],
            body: b.body,
            ai_use: "none",
            position: AFTER[b.author],
            moderation_status: "visible",
            ...(b.kind === "evidence" ? { sources: [{ url: "https://example.org/tgs-test/judging-evidence", host: "example.org", title: "Example source (test data)" }], source_urls: ["https://example.org/tgs-test/judging-evidence"] } : {}),
            created_at: new Date(clock).toISOString(),
          })
          .select("id")
          .single(),
        "Dispatch",
      ) as { id: string };
      dispatchIds.push(row.id);
    }
    for (let i = 0; i < strategists.length; i++) {
      must(await admin.from("campaign_positions").update({ after_position: AFTER[i] }).eq("campaign_id", campaignId).eq("user_id", strategists[i]), "after position");
    }
    const clients = await Promise.all(NAMES.map((n) => signedIn(url, anonKey, `Jt_${n}`)));
    for (const [picker, target] of Object.entries(PICKS)) {
      must(await clients[Number(picker)].rpc("pick_mind_changer", { p_dispatch_id: dispatchIds[target] }), "mind-change pick");
    }

    console.log("Closing it (now)…");
    must(await admin.from("campaigns").update({ status: "closed", ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", campaignId), "close");

    console.log("Peer votes and steelman confirmations (as the participants)…");
    const authorOf = (i: number) => BODIES[i].author;
    for (let voter = 0; voter < strategists.length; voter++) {
      // Each voter backs up to three Dispatches by others, spread deterministically.
      const choices = [0, 3, 7, 2, 6, 4].map((x) => (x + voter) % BODIES.length).filter((t) => authorOf(t) !== voter);
      for (const target of [...new Set(choices)].slice(0, 3)) must(await clients[voter].rpc("cast_peer_vote", { p_dispatch_id: dispatchIds[target] }), "vote");
    }
    for (const [target, confirmers] of [
      [3, [0, 1, 2]],
      [7, [5, 6]],
    ] as const) {
      for (const c of confirmers) must(await clients[c].rpc("set_steelman_confirmation", { p_dispatch_id: dispatchIds[target], p_confirmed: true }), "steelman");
    }

    console.log("Assigning 2 judges; they score every Dispatch and submit…");
    for (const handle of JUDGES) must(await admin.from("judge_assignments").upsert({ campaign_id: campaignId, judge_id: ids.get(handle)! }, { onConflict: "campaign_id,judge_id", ignoreDuplicates: true }), "assign");
    for (const [j, handle] of JUDGES.entries()) {
      const judge = await signedIn(url, anonKey, handle);
      const scores = dispatchIds.map((id, i) => {
        // A deterministic spread: the steelmen and the evidence do best.
        const base = [4, 2, 4, 5, 3, 2, 4, 5, 3, 3, 3][i];
        const n = (k: number) => Math.max(1, Math.min(5, base + ((i + j + k) % 3 === 0 ? -1 : 0)));
        return { dispatch_id: id, logic: n(0), evidence: n(1), originality: n(2), responsiveness: n(3), comment: "Test score from seed:judging." };
      });
      must(await judge.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: scores.slice(0, 5), p_submit: false }), "panel draft");
      must(await judge.rpc("save_panel_scores", { p_campaign_id: campaignId, p_scores: scores.slice(5), p_submit: true }), "panel submit");
    }

    console.log("AI rubric (fake provider, through the same queue and caps as the app)…");
    must(await admin.rpc("judging_tick"), "tick");
    const deps = databaseDeps(admin);
    for (let pass = 0; pass < 5; pass++) {
      const r = await processRubricBatch(admin, deps, 50);
      if (!r.claimed) break;
      console.log(`  scored ${r.scored}, waiting ${r.waiting}, retrying ${r.retrying}, failed ${r.failed}`);
    }

    console.log("Moving the close back past the peer voting window, so the draft is complete…");
    const { data: s } = await admin.from("judging_settings").select("peer_window_hours").single();
    const shift = ((s?.peer_window_hours as number) ?? 72) * 3_600_000 + 3_600_000;
    must(
      await admin
        .from("campaigns")
        .update({ starts_at: new Date(Date.now() - shift - 600_000).toISOString(), ends_at: new Date(Date.now() - shift).toISOString() })
        .eq("id", campaignId),
      "shift times",
    );

    console.log("Computing the draft Verdict…");
    const { verdictId, result } = await computeDraftVerdict(admin, campaignId, { actorId: null });
    const name = new Map([...ids].map(([h, id]) => [id, h]));
    console.log(`\nDraft Verdict ${verdictId}`);
    console.log(result.winner_id ? `Grand Strategist (draft): @${name.get(result.winner_id)}` : "No winner yet.");
    for (const st of result.strategists.slice(0, 5)) console.log(`  ${st.rank ?? "-"}. @${name.get(st.user_id)}  final ${st.final ?? "-"}  (panel ${st.components.panel}, peer ${st.components.peer}, AI ${st.components.ai_rubric}, mind ${st.components.mind_change}, steelman +${st.steelman_bonus})`);
    if (result.attention.length) console.log(`Needs attention: ${result.attention.map((a) => a.detail).join(" ")}`);
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
    console.log(`\nReview and publish: ${site}/admin/judging/${campaignId}`);
    console.log(`Test users: ${handles.map((h) => `@${h}`).join(", ")} (emails like ${email(handles[0])}; local password: ${PASSWORD}).`);
  } finally {
    await sql`select pg_advisory_unlock(hashtext('tgs.seed_judging'))`.catch(() => {});
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
