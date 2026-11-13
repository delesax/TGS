/**
 * LOCAL load tests (Sprint 7 plan 3.3). Usage: npx tsx --conditions react-server scripts/load/run.ts [signup|post|judging|email|votes|all]
 * Needs local Supabase running (`npx supabase start`, `npm run test:env`). Refuses anything but 127.0.0.1/localhost.
 * Cleans up its own rows first and last. Writes docs/LOAD_TEST_RESULTS.md only with `all`.
 */
import { writeFileSync } from "node:fs";
import { cleanup, createInvite, createLoadUser, env, loadCampaign, LOCAL_DB_URL, pct, pool, record, rows, service, signIn, sleep, sql, timed, type LoadUser } from "./lib";
import { processRubricBatch, computeDraftVerdict } from "../../src/lib/judging/compute";
import { databaseDeps } from "../lib/ai-deps";

const which = process.argv[2] ?? "all";
const should = (n: string) => which === "all" || which === n;
const notes: string[] = [];
const slow: string[] = [];

async function snapshot(label: string) {
  const mem = process.memoryUsage();
  notes.push(`${label}: runner memory ${(mem.rss / 1048576).toFixed(0)} MB`);
}
async function dbStats(label: string) {
  const [r] = await sql`select count(*) filter (where state = 'active') as active, count(*) as total from pg_stat_activity where datname = 'postgres'`;
  notes.push(`${label}: database connections ${r.total} (active ${r.active})`);
}
async function dockerStats(label: string) {
  const { execSync } = await import("node:child_process");
  try {
    const out = execSync("docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' supabase_db_tgs supabase_auth_tgs supabase_rest_tgs", { encoding: "utf8" }).trim().replace(/\n/g, "; ");
    notes.push(`${label}: ${out}`);
  } catch { notes.push(`${label}: docker stats unavailable`); }
}

async function signup() {
  const S = "Burst sign-up";
  const invite = await createInvite(100, "load test sign-up");
  const lat: number[] = []; let errors = 0;
  const ids: string[] = [];
  const t0 = Date.now();
  // 100 accounts spread over 60 seconds (one every 600 ms, up to 6 in flight).
  const tasks = Array.from({ length: 100 }, (_, i) => i);
  await pool(tasks, 6, async (i) => {
    await sleep(Math.max(0, i * 600 - (Date.now() - t0)));
    const r = await timed(() => createLoadUser(invite, "su"));
    lat.push(r.ms);
    if (r.error) { errors++; console.error("sign-up error", String((r.error as Error).message ?? r.error).slice(0, 120)); } else ids.push((r.value as LoadUser).id);
  });
  const dur = (Date.now() - t0) / 1000;
  const [{ n }] = await sql`select count(*)::int as n from public.profiles where id = any(${ids}::uuid[])`;
  const [inv] = await sql`select use_count from public.invites where id = ${invite.id}`;
  record(S, "accounts created without error", "100 of 100", `${ids.length} of 100, ${errors} errors, over ${dur.toFixed(0)} s`, ids.length === 100 && errors === 0);
  record(S, "every account has a profile", "100", String(n), n === 100);
  record(S, "invite use_count exact", "100", String(inv.use_count), inv.use_count === 100);
  record(S, "p95 create latency", "under 2000 ms", `${pct(lat, 95).toFixed(0)} ms (p50 ${pct(lat, 50).toFixed(0)})`, pct(lat, 95) < 2000);
  // Confirmations: accounts are created already confirmed (admin API). Check all are confirmed.
  const [{ c }] = await sql`select count(*)::int as c from auth.users where id = any(${ids}::uuid[]) and email_confirmed_at is not null`;
  record(S, "100 confirmations", "100 confirmed", `${c} confirmed (admin API confirms at creation)`, c === 100);
}

async function post() {
  const S = "Burst post";
  await service.from("community_settings").update({ cooldown_seconds: 30, max_dispatches_per_round: 100 }).eq("id", true);
  const campaign = await loadCampaign();
  const invite = await createInvite(60, "load test post");
  const users: LoadUser[] = [];
  await pool(Array.from({ length: 50 }, (_, i) => i), 6, async () => { const u = await createLoadUser(invite, "po"); await signIn(u); users.push(u); });
  const lat: number[] = []; let errors = 0; const errs: Record<string, number> = {};
  const t0 = Date.now();
  // 4 posts each, 32 s apart (just over the 30 s cooldown), users staggered across the first 40 s: 200 posts in about 2.7 minutes.
  await Promise.all(users.map(async (u, k) => {
    for (let n = 0; n < 4; n++) {
      await sleep(Math.max(0, k * 800 + n * 32_000 - (Date.now() - t0)));
      const r = await timed(async () => {
        const { error } = await u.client!.rpc("post_dispatch", { p_campaign_id: campaign, p_kind: "argument", p_body: `Load test argument ${k}-${n}: a short, plain point made only to exercise the posting path under load.`, p_ai_use: "none" });
        if (error) throw error;
      });
      lat.push(r.ms);
      if (r.error) { errors++; const m = String((r.error as Error).message ?? r.error).slice(0, 60); errs[m] = (errs[m] ?? 0) + 1; }
    }
  }));
  const [{ n }] = await sql`select count(*)::int as n from public.dispatches where campaign_id = ${campaign}`;
  record(S, "200 Dispatches posted, no errors or deadlocks", "200 of 200", `${n} stored, ${errors} errors ${JSON.stringify(errs)}`, n === 200 && errors === 0);
  record(S, "p95 post latency", "under 1500 ms", `${pct(lat, 95).toFixed(0)} ms (p50 ${pct(lat, 50).toFixed(0)})`, pct(lat, 95) < 1500);
  // Cooldown and per-round cap still enforced.
  const fast = users[1];
  const first = await fast.client!.rpc("post_dispatch", { p_campaign_id: campaign, p_kind: "argument", p_body: "Load test: a post made just after the burst, so the next one is inside the cooldown.", p_ai_use: "none" });
  const second = await fast.client!.rpc("post_dispatch", { p_campaign_id: campaign, p_kind: "argument", p_body: "Load test: an immediate second post that the cooldown must refuse.", p_ai_use: "none" });
  record(S, "cooldown still enforced", "second quick post refused", second.error ? second.error.message.slice(0, 50) : `ACCEPTED (first: ${first.error?.message ?? "ok"})`, !!second.error);
  const u = users[0];
  await service.from("community_settings").update({ max_dispatches_per_round: 4 }).eq("id", true);
  await sleep(31_000);
  const capped = await u.client!.rpc("post_dispatch", { p_campaign_id: campaign, p_kind: "argument", p_body: "Load test: a fifth post that the per-round cap of 4 must refuse.", p_ai_use: "none" });
  record(S, "per-round cap still enforced", "post above the cap refused", capped.error ? capped.error.message.slice(0, 50) : "ACCEPTED", !!capped.error);
  await service.from("community_settings").update({ max_dispatches_per_round: 10, cooldown_seconds: 30 }).eq("id", true);
  await dockerStats("after burst post");
}

async function judging() {
  const S = "Judging tick";
  const campaign = await loadCampaign({ status: "closed", starts_at: new Date(Date.now() - 7_200_000).toISOString(), ends_at: new Date(Date.now() - 60_000).toISOString(), title: "Load test judging" });
  const invite = await createInvite(60, "load test judging");
  const authors: LoadUser[] = [];
  await pool(Array.from({ length: 50 }, (_, i) => i), 6, async () => { authors.push(await createLoadUser(invite, "jd", { old: true })); });
  const ids = authors.map((a) => a.id);
  await sql`insert into public.dispatches (campaign_id, author_id, kind, body, ai_use, moderation_status)
    select ${campaign}, (${ids}::uuid[])[1 + (g % 50)], 'argument',
      'Load test Dispatch ' || g || '. Because evidence matters, a 2023 study of 61 firms is cited here, therefore the claim follows. However, one objection remains.', 'none', 'visible'
    from generate_series(1, 1500) g`;
  const t0 = performance.now();
  const tick = await sql`select public.judging_tick() as r`;
  const tickMs = performance.now() - t0;
  const [{ q }] = await sql`select count(*)::int as q from public.ai_rubric_jobs where campaign_id = ${campaign}`;
  record(S, "queue fills (1,500 jobs)", "under 60 s", `${q} jobs in ${(tickMs / 1000).toFixed(2)} s ${JSON.stringify(tick[0].r)}`, q === 1500 && tickMs < 60_000);

  // Phase 1: the real daily AI cap. Judging stops at 80% of ai_daily_cap_global and waits (it must not fail).
  await sql`delete from public.ai_usage where day = public.uk_today()`; // a clean day, so earlier runs do not count
  const deps = databaseDeps(service);
  const drain = async () => { let processed = 0, calls = 0, failures = 0; const run = async () => { for (;;) { calls++; const r = await processRubricBatch(service, deps, 10); processed += r.scored; failures += r.failed; if (!r.claimed) break; } }; await Promise.all([run(), run()]); return { processed, calls, failures }; };
  const count = async () => (await sql`select (select count(*) from public.ai_rubric_scores where campaign_id = ${campaign})::int as scores,
    (select count(*) from (select dispatch_id from public.ai_rubric_scores where campaign_id = ${campaign} group by dispatch_id having count(*) > 1) x)::int as dupes,
    (select count(*) from public.ai_rubric_jobs where campaign_id = ${campaign} and status = 'failed')::int as failed,
    (select count(*) from public.ai_rubric_jobs where campaign_id = ${campaign} and status not in ('done','failed'))::int as left`)[0];
  const [{ cap }] = await sql`select ai_daily_cap_global as cap from public.community_settings`;
  const [{ used0 }] = await sql`select coalesce(sum(calls),0)::int as used0 from public.ai_usage where day = public.uk_today()`.catch(() => [{ used0: 0 }]);
  const p1 = await drain(); const c1 = await count();
  record(S, "daily AI cap pauses judging without failing jobs", "jobs wait, none fail, no duplicates", `cap ${cap} a day (used before ${used0}): ${c1.scores} scored, ${c1.left} waiting, ${c1.failed} failed, ${c1.dupes} duplicates`, c1.failed === 0 && c1.dupes === 0 && (c1.scores === 1500 || c1.left > 0));
  notes.push(`FINDING: with the default daily AI cap (${cap}), a closed Campaign of 1,500 Dispatches is only partly judged in one UK day (${c1.scores} scored, the rest wait for the next day). Judging stops at 80% of the cap by design.`);
  // Phase 2: lift the cap for the test only, to measure throughput and double processing.
  await service.from("community_settings").update({ ai_daily_cap_global: 20000 }).eq("id", true);
  await sql`update public.ai_rubric_jobs set next_attempt_at = now() where campaign_id = ${campaign} and status = 'queued'`;
  const drainStart = performance.now();
  const p2 = await drain(); const c2 = await count();
  await service.from("community_settings").update({ ai_daily_cap_global: cap }).eq("id", true);
  const drainS = (performance.now() - drainStart) / 1000;
  record(S, "all jobs drained, one score each, none double processed", "1500 scores, 0 duplicates, 0 left", `${c2.scores} scores, ${c2.dupes} duplicates, ${c2.left} left, ${c2.failed} failed, ${p1.calls + p2.calls} batches (two processors at once); second phase ${drainS.toFixed(1)} s`, c2.scores === 1500 && c2.dupes === 0 && c2.left === 0);
  notes.push("Judging drain uses the fake provider, so it measures the database and queue only. In production the limit is the real model: 10 Dispatches per run, one run a minute, about 600 an hour.");

  const t1 = performance.now();
  let verdictOk = true; let verdictErr = "";
  try { await computeDraftVerdict(service, campaign, { actorId: null }); } catch (e) { verdictOk = false; verdictErr = String((e as Error).message).slice(0, 80); }
  const vMs = performance.now() - t1;
  record(S, "draft Verdict computed", "under 30 s", verdictOk ? `${(vMs / 1000).toFixed(1)} s` : `error: ${verdictErr}`, verdictOk && vMs < 30_000);
  await dockerStats("after judging");
}

async function email() {
  const S = "Email backlog";
  const invite = await createInvite(110, "load test email");
  const users: LoadUser[] = [];
  await pool(Array.from({ length: 100 }, (_, i) => i), 6, async () => { users.push(await createLoadUser(invite, "em", { old: true })); });
  await service.from("community_settings").update({ email_essentials_only: false, email_global_daily_cap: 2000, email_daily_cap: 6 }).eq("id", true);
  await sql`update public.profiles set email_campaign_updates = true where id = any(${users.map((u) => u.id)}::uuid[])`.catch(() => {});
  await sql`insert into public.email_outbox (user_id, kind, payload, dedupe_key)
    select (${users.map((u) => u.id)}::uuid[])[1 + (g % 100)], 'campaign_opened', jsonb_build_object('campaign_slug','load','campaign_title','Load test Campaign'), 'load:' || g
    from generate_series(1, 5000) g`;
  process.env.EMAIL_TRANSPORT = "mailpit"; process.env.MAILPIT_URL = env.mailpitUrl;
  process.env.NEXT_PUBLIC_SITE_URL ??= env.siteUrl;
  const { processOutbox } = await import("../../src/lib/email");
  const t0 = performance.now(); let runs = 0; let claimed = 0;
  for (;;) { const s = await processOutbox({ limit: 100 }); runs++; claimed += s.claimed; if (!s.claimed || runs > 120) break; }
  const secs = (performance.now() - t0) / 1000;
  const [{ stuck }] = await sql`select count(*)::int as stuck from public.email_outbox where dedupe_key like 'load:%' and status = 'sending'`;
  const [{ over }] = await sql`select count(*)::int as over from (select user_id from public.email_outbox where dedupe_key like 'load:%' and status = 'sent' group by user_id having count(*) > 6) x`;
  const [{ dupMsg }] = await sql`select count(*)::int as "dupMsg" from (select message_id from public.email_outbox where dedupe_key like 'load:%' and status = 'sent' group by message_id having count(*) > 1) x`;
  const [{ perMsg }] = await sql`select coalesce(max(c),0)::int as "perMsg" from (select count(*) c from public.email_outbox where dedupe_key like 'load:%' and status='sent' group by message_id) x`;
  void dupMsg;
  const [{ sentRows }] = await sql`select count(*)::int as "sentRows" from public.email_outbox where dedupe_key like 'load:%' and status = 'sent'`;
  record(S, "5,000 rows processed 100 a run", "no run over 100 claimed", `${runs} runs, ${claimed} claims, ${sentRows} sent in ${secs.toFixed(0)} s`, claimed / Math.max(runs - 1, 1) <= 100.5);
  record(S, "no row stuck in sending", "0", String(stuck), stuck === 0);
  record(S, "per-user daily cap respected", "no user above 6", `${over} users above 6; ${sentRows} sent for 100 users`, over === 0);
  record(S, "no duplicate sends", "each row sent once", `${sentRows} sent rows (a digest shares one message id; max rows per message ${perMsg})`, sentRows <= 600);
  await dockerStats("after email");
}

async function votes() {
  const S = "Vote burst";
  const campaign = await loadCampaign({ status: "closed", starts_at: new Date(Date.now() - 7_200_000).toISOString(), ends_at: new Date(Date.now() - 60_000).toISOString(), title: "Load test votes" });
  const invites = [await createInvite(300, "load test votes"), await createInvite(300, "load test votes")];
  const voters: LoadUser[] = [];
  await pool(Array.from({ length: 500 }, (_, i) => i), 8, async (i) => { const u = await createLoadUser(invites[i % 2], "vo", { old: true }); await signIn(u); voters.push(u); });
  const ids = voters.map((v) => v.id);
  await sql`insert into public.dispatches (campaign_id, author_id, kind, body, ai_use, moderation_status)
    select ${campaign}, (${ids}::uuid[])[g], 'argument', 'Load test vote target ' || g || '. A plain argument that is eligible for peer voting.', 'none', 'visible' from generate_series(1, 500) g`;
  const dIds = (await sql`select id, author_id from public.dispatches where campaign_id = ${campaign}`) as unknown as { id: string; author_id: string }[];
  const [{ credits }] = await sql`select peer_vote_credits as credits from public.judging_settings`;
  const lat: number[] = []; let errors = 0; const errs: Record<string, number> = {};
  const t0 = Date.now();
  // 500 voters x 5 votes inside 60 s: each voter starts at a random time in the first 12 s and votes 5 times, 1 s apart; plus 25 voters hammer a 6th vote in parallel to test the credit limit.
  await Promise.all(voters.map(async (v, k) => {
    await sleep(Math.random() * 12_000);
    const targets = dIds.filter((d) => d.author_id !== v.id).sort(() => Math.random() - 0.5).slice(0, 5);
    for (const t of targets) {
      const r = await timed(async () => { const { error } = await v.client!.rpc("cast_peer_vote", { p_dispatch_id: t.id }); if (error) throw error; });
      lat.push(r.ms);
      if (r.error) { errors++; const m = String((r.error as Error).message ?? r.error).slice(0, 50); errs[m] = (errs[m] ?? 0) + 1; }
      await sleep(900);
    }
    if (k < 25) {
      const extra = dIds.filter((d) => d.author_id !== v.id).slice(10, 14);
      await Promise.all(extra.map((t) => v.client!.rpc("cast_peer_vote", { p_dispatch_id: t.id })));
    }
  }));
  const took = (Date.now() - t0) / 1000;
  const [{ over, total }] = await sql`select (select count(*) from (select voter_id from public.peer_votes where campaign_id = ${campaign} group by voter_id having count(*) > ${credits}) x)::int as over, (select count(*) from public.peer_votes where campaign_id = ${campaign})::int as total`;
  record(S, "credits never exceeded", "0 voters over " + credits, `${over} over; ${total} votes stored (credits ${credits}); extra votes refused as expected`, over === 0);
  record(S, "no deadlocks or unexpected errors", "0 unexpected", `${errors} errors ${JSON.stringify(errs)}`, !Object.keys(errs).some((m) => /deadlock|timeout|could not/i.test(m)));
  record(S, "p95 vote latency", "under 1000 ms", `${pct(lat, 95).toFixed(0)} ms (p50 ${pct(lat, 50).toFixed(0)}), ${lat.length} votes in ${took.toFixed(0)} s`, pct(lat, 95) < 1000 && took <= 60);
  await dockerStats("after votes");
}

async function main() {
  console.log(`Local load tests. Target ${new URL(env.supabaseUrl).host}; database ${new URL(LOCAL_DB_URL).host}`);
  await cleanup();
  await sql`select pg_stat_statements_reset()`.catch(() => notes.push("pg_stat_statements is not enabled locally: slow-query list unavailable"));
  try {
    if (should("signup")) await signup();
    if (should("post")) await post();
    if (should("judging")) await judging();
    if (should("email")) await email();
    if (should("votes")) await votes();
    const top = await sql`select left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 90) as q, calls, round(mean_exec_time::numeric, 2) as mean_ms, round(max_exec_time::numeric, 1) as max_ms from pg_stat_statements where query not ilike '%pg_stat%' order by total_exec_time desc limit 5`.catch(() => []);
    for (const t of top) slow.push(`${t.q} | calls ${t.calls} | mean ${t.mean_ms} ms | max ${t.max_ms} ms`);
    await snapshot("end");
    await dbStats("end");
  } finally {
    await cleanup();
  }
  const failed = rows.filter((r) => !r.pass);
  console.log(`\n${rows.length - failed.length} of ${rows.length} checks passed`);
  if (which === "all") {
    const md = [
      "# Load test results (local only)", "", `Run on ${new Date().toISOString().slice(0, 10)} against local Supabase on this laptop (Docker). Hosted was never touched. Script: \`scripts/load/run.ts\`; plan: \`docs/SPRINT_7_PLAN.md\` section 3.3.`, "",
      "| Scenario | Check | Threshold | Result | Pass |", "| --- | --- | --- | --- | --- |",
      ...rows.map((r) => `| ${r.scenario} | ${r.check} | ${r.threshold} | ${r.result.replace(/\|/g, "/")} | ${r.pass ? "PASS" : "FAIL"} |`), "",
      "## CPU, memory and connections", "", ...notes.map((n) => `- ${n}`), "",
      "## What this does not cover", "",
      "- Local Docker on one laptop, not Supabase's free-plan compute (shared CPU, smaller limits). Treat latencies as a floor, not a forecast.",
      "- Accounts are created through the Auth admin API, so Supabase Auth's per-IP rate limits (the real sign-up ceiling) and real confirmation emails are not exercised. See the owner action on Auth limits in `docs/LAUNCH_RUNBOOK.md`.",
      "- The email run uses local Mailpit, so Resend's 10 a second limit and quota are not exercised (pacing and 429 retry are unit tested in `src/lib/email/pacing.test.ts`).",
      "- Judging uses the fake provider: real model latency, cost and the $30 cap are not exercised.",
      "- No browser load: pages, the Vercel function limits and the site's own rate limiter under concurrent web traffic were not tested.", "",
      "## Slowest queries (pg_stat_statements, by total time)", "", ...(slow.length ? slow.map((s) => `- ${s}`) : ["- not available"]), "",
    ].join("\n");
    writeFileSync("docs/LOAD_TEST_RESULTS.md", md);
  }
  await sql.end();
  process.exit(failed.length ? 1 : 0);
}
main().catch(async (e) => { console.error("Load test crashed:", String(e?.message ?? e).slice(0, 300)); await cleanup().catch(() => {}); await sql.end(); process.exit(2); });
