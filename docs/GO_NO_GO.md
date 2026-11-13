# Go or no-go for 1 December 2026

Every line must be YES on the day, or you decide knowingly to launch without it. "Status" is what was true on 13 November 2026 when this was written; update it as you go. "Who" says whether Claude can check it (C) or only you can (O).

| # | Check | How to verify | Who | Status on 13 Nov |
| --- | --- | --- | --- | --- |
| 1 | All Sprint 7 High items are built and merged: kill switches, vote eligibility, rate limiter, integrity signals page, open-redirect fix | Batch 1, 2a, 2b branches merged; `docs/CLAUDE_LOG.md` | O merges | **Done:** batches 1, 2a and 2b and rule 7 are all merged to `main` (PRs #27, #29, #31 and the rule 7 commit via #34) |
| 2 | Hosted has every migration, and a dry run lists nothing more | `supabase db push --dry-run --include-all` prints nothing to apply | O | Hosted is through `20261113000800` (rubric publish), applied by the owner from their own terminal on 13 Nov. The owner reported a fresh dry run said up to date; Claude has not seen it and has no CLI access to hosted. Re-run before the next apply. |
| 3 | Legal-hardening's six migrations applied and verified | Dry run in step 2 shows none missing | O | Applied (earlier session) |
| 4 | Vault secrets for email, moderation and judging set; the three processor secrets are fresh, 40 or more characters; each processor route answers 401 without its secret | Supabase SQL: `select name from vault.secrets` (names only); `curl -X POST` each route with no header | O | Not verified by Claude |
| 5 | Resend domain verified; Confirm sign up and Reset password templates saved; redirect URLs correct; a real sign-up, confirmation and reset tested on the live site | Dashboard; do the journey with a spare address | O | Not verified by Claude |
| 6 | Supabase Auth rate limits raised: sign-ups and sign-ins 30 to 150, token verifications 30 to 100, per 5 minutes | Dashboard, Authentication, Rate Limits | O | **Decided, not yet done** |
| 7 | Anthropic key in Vercel Production; monthly limit $30, notify $10; `ai_daily_cap_global` reviewed (default 1,000) | Anthropic console; Admin, Settings | O | Key set earlier; limits not verified by Claude |
| 8 | A dump taken, off the laptop, and one restore rehearsed | `bash scripts/backup-dump.sh`; `docs/BACKUP_RESTORE.md` | O dumps, C rehearsed locally | Local rehearsal done (see `docs/BACKUP_RESTORE.md`). **No hosted dump has been taken by Claude.** |
| 9 | `/api/health` returns 200; Admin, Health shows empty queues and recent job runs | Open both | O | Not verified on hosted after the latest deploy |
| 10 | Admin account works; a second admin exists | Sign in with both | O | Not verified by Claude |
| 11 | Local load tests passed against the plan's thresholds | `docs/LOAD_TEST_RESULTS.md` | C | **Done: all checks pass locally** (with the caveats in that file) |
| 12 | Owner decisions D1 to D8 taken | `docs/SPRINT_7_PLAN.md`, "Decided 13 Nov" | O | Done |
| 13 | Judge prompt version chosen (2 by default; 1 is the fall-back, Admin, Judging) | Admin, Judging | O | Real evaluation passed for v2; v2 is slightly less aligned than v1 (see plan, W7), so look at the numbers before confirming |
| 14 | Email essentials on and the global cap set | Admin, Settings | O | Default on, cap 60 once `20261113000600` is live (it is) |
| 15 | Launch topics are real: content note and summaries written, Bank of England decision resolved, no `DRAFT` text left on a Campaign that opens | Admin, Campaigns | O | **Open.** All 15 topics are drafts; the first opens 1 December 2026 |
| 16 | Legal pages reviewed and the draft banner decision taken | `docs/legal/`, `src/lib/legal.ts` | O | Parked by the owner; account deletion stays off |
| 17 | Supabase project is active (not paused) in the week before launch | Dashboard; open the site | O | n/a until the week before |
| 18 | You know the rollback: the previous Production deployment is noted | Vercel, Deployments | O | Do on release day |
| 19 | Kill-switch wording seen on screen: posting paused and sign-ups paused messages read well | Flip each on and off once on the live site, with a reason | O | Wording set (D6); not tested on hosted |
| 20 | CSP is report-only and the report route answers 204 | `curl -i` the home page header; POST a sample to `/api/csp-report` | C, O on live | Built in batch 2b (local tests pass) |
| 21 | Campaign 1 (`under-16-social-media-ban`) has its real summary, its rules checked, its rubric **published** (rule 7) and is scheduled before 1 December | Admin, Campaigns; the public Campaign page shows "How this Campaign is judged" | O | **Open.** Rule 7 is live (merged, migration applied), so "Publish the rubric" exists. Campaign 1 still needs its real summary, its rules checked, its rubric published and scheduling. All 15 Campaigns are drafts (as the owner reported; Claude has not seen it). |
| 22 | Member post test done on a phone with a second non-admin account; `/admin` refused for that account; TEST Campaign back to draft | `docs/LAUNCH_RUNBOOK.md`, step 9 | O | **Open** |

## Owner actions before the first invite wave
The ordered list, with the click-by-click steps for the member post test, is in `docs/LAUNCH_RUNBOOK.md` ("Owner actions before the first invite wave"): raise the Auth limits (30 to 150 and 30 to 100 per 5 minutes), take and encrypt the first dump, re-read the free-plan limits, add a second admin, move provider accounts into the company before commercial use, prepare and schedule Campaign 1 (summary, rules, publish the rubric, "Schedule it"), decide the three flagged Campaigns, edit the three PLACEHOLDER strings in `src/lib/judging/notices.ts` before the first Campaign can close (8 December at the earliest; a parked legal item), and run the member post test. Account deletion stays off.

## Decision on the day
- Any line you cannot make YES: write down why you accept it. Lines 2, 4, 5, 6, 9 and 15 are the ones that would stop real people signing up or seeing the right thing, so treat them as hard stops.
- If you launch with a NO, add it to `docs/CLAUDE_LOG.md` under "Open for the owner".
