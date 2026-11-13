# Load test results (local only)

Run on 2026-11-13 against local Supabase on this laptop (Docker). Hosted was never touched. Script: `scripts/load/run.ts`; plan: `docs/SPRINT_7_PLAN.md` section 3.3.

| Scenario | Check | Threshold | Result | Pass |
| --- | --- | --- | --- | --- |
| Burst sign-up | accounts created without error | 100 of 100 | 100 of 100, 0 errors, over 59 s | PASS |
| Burst sign-up | every account has a profile | 100 | 100 | PASS |
| Burst sign-up | invite use_count exact | 100 | 100 | PASS |
| Burst sign-up | p95 create latency | under 2000 ms | 87 ms (p50 75) | PASS |
| Burst sign-up | 100 confirmations | 100 confirmed | 100 confirmed (admin API confirms at creation) | PASS |
| Burst post | 200 Dispatches posted, no errors or deadlocks | 200 of 200 | 200 stored, 0 errors {} | PASS |
| Burst post | p95 post latency | under 1500 ms | 31 ms (p50 25) | PASS |
| Burst post | cooldown still enforced | second quick post refused | COOLDOWN: wait 30 seconds | PASS |
| Burst post | per-round cap still enforced | post above the cap refused | ROUND_LIMIT: you have posted 4 Dispatches in this  | PASS |
| Judging tick | queue fills (1,500 jobs) | under 60 s | 1500 jobs in 0.03 s {"emails":50,"queued":1500,"finalised":0} | PASS |
| Judging tick | daily AI cap pauses judging without failing jobs | jobs wait, none fail, no duplicates | cap 1000 a day (used before 0): 800 scored, 700 waiting, 0 failed, 0 duplicates | PASS |
| Judging tick | all jobs drained, one score each, none double processed | 1500 scores, 0 duplicates, 0 left | 1500 scores, 0 duplicates, 0 left, 0 failed, 224 batches (two processors at once); second phase 1.9 s | PASS |
| Judging tick | draft Verdict computed | under 30 s | 0.1 s | PASS |
| Email backlog | 5,000 rows processed 100 a run | no run over 100 claimed | 52 runs, 5050 claims, 600 sent in 8 s | PASS |
| Email backlog | no row stuck in sending | 0 | 0 | PASS |
| Email backlog | per-user daily cap respected | no user above 6 | 0 users above 6; 600 sent for 100 users | PASS |
| Email backlog | no duplicate sends | each row sent once | 600 sent rows (a digest shares one message id; max rows per message 1) | PASS |
| Vote burst | credits never exceeded | 0 voters over 5 | 0 over; 2500 votes stored (credits 5); extra votes refused as expected | PASS |
| Vote burst | no deadlocks or unexpected errors | 0 unexpected | 0 errors {} | PASS |
| Vote burst | p95 vote latency | under 1000 ms | 14 ms (p50 12), 2500 votes in 17 s | PASS |

## CPU, memory and connections

- after burst post: supabase_db_tgs 3.01% 353MiB / 7.749GiB; supabase_auth_tgs 0.00% 24.98MiB / 7.749GiB; supabase_rest_tgs 0.12% 147.3MiB / 7.749GiB
- FINDING: with the default daily AI cap (1000), a closed Campaign of 1,500 Dispatches is only partly judged in one UK day (800 scored, the rest wait for the next day). Judging stops at 80% of the cap by design.
- Judging drain uses the fake provider, so it measures the database and queue only. In production the limit is the real model: 10 Dispatches per run, one run a minute, about 600 an hour.
- after judging: supabase_db_tgs 1.00% 378.3MiB / 7.749GiB; supabase_auth_tgs 0.00% 26.14MiB / 7.749GiB; supabase_rest_tgs 0.19% 148.8MiB / 7.749GiB
- after email: supabase_db_tgs 1.22% 384MiB / 7.749GiB; supabase_auth_tgs 0.00% 25.83MiB / 7.749GiB; supabase_rest_tgs 0.14% 148.4MiB / 7.749GiB
- after votes: supabase_db_tgs 1.29% 399.4MiB / 7.749GiB; supabase_auth_tgs 0.04% 26.68MiB / 7.749GiB; supabase_rest_tgs 0.99% 146.3MiB / 7.749GiB
- end: runner memory 297 MB
- end: database connections 30 (active 1)

## What this does not cover

- Local Docker on one laptop, not Supabase's free-plan compute (shared CPU, smaller limits). Treat latencies as a floor, not a forecast.
- Accounts are created through the Auth admin API, so Supabase Auth's per-IP rate limits (the real sign-up ceiling) and real confirmation emails are not exercised. See the owner action on Auth limits in `docs/LAUNCH_RUNBOOK.md`.
- The email run uses local Mailpit, so Resend's 10 a second limit and quota are not exercised (pacing and 429 retry are unit tested in `src/lib/email/pacing.test.ts`).
- Judging uses the fake provider: real model latency, cost and the $30 cap are not exercised.
- No browser load: pages, the Vercel function limits and the site's own rate limiter under concurrent web traffic were not tested.

## Slowest queries (pg_stat_statements, by total time)

- WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_p | calls 2505 | mean 0.48 ms | max 3.0 ms
- INSERT INTO "users" ("aud", "banned_until", "confirmation_sent_at", "confirmation_token",  | calls 800 | mean 0.79 ms | max 22.0 ms
- WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_p | calls 1500 | mean 0.22 ms | max 1.7 ms
- WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_p | calls 2200 | mean 0.13 ms | max 9.4 ms
- WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_p | calls 201 | mean 1.07 ms | max 7.9 ms
