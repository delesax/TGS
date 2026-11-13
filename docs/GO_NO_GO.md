# Go or no-go for 1 December 2026

Every line must be YES on the day, or you decide knowingly to launch without it. "Status" is what was true on 13 November 2026 when this was written; update it as you go. "Who" says whether Claude can check it (C) or only you can (O).

| # | Check | How to verify | Who | Status on 13 Nov |
| --- | --- | --- | --- | --- |
| 1 | All Sprint 7 High items are built and merged: kill switches, vote eligibility, rate limiter, integrity signals page, open-redirect fix | Batch 1, 2a, 2b branches merged; `docs/CLAUDE_LOG.md` | O merges | Batch 1 and 2a merged; **batch 2b on its branch, not merged** |
| 2 | Hosted has every migration, and a dry run lists nothing more | `supabase db push --dry-run --include-all` prints nothing to apply | O | Hosted is through `20261113000600`. **`20261113000700` (judge prompt v2) is not applied.** |
| 3 | Legal-hardening's six migrations applied and verified | Dry run in step 2 shows none missing | O | Applied (earlier session) |
| 4 | Vault secrets for email, moderation and judging set; the three processor secrets are fresh, 40 or more characters; each processor route answers 401 without its secret | Supabase SQL: `select name from vault.secrets` (names only); `curl -X POST` each route with no header | O | Not verified by Claude |
| 5 | Resend domain verified; Confirm sign up and Reset password templates saved; redirect URLs correct; a real sign-up, confirmation and reset tested on the live site | Dashboard; do the journey with a spare address | O | Not verified by Claude |
| 6 | Supabase Auth rate limits raised: sign-ups and sign-ins 150, verifications 100, per 5 minutes | Dashboard, Authentication, Rate Limits | O | **Decided, not yet done** |
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

## Decision on the day
- Any line you cannot make YES: write down why you accept it. Lines 2, 4, 5, 6, 9 and 15 are the ones that would stop real people signing up or seeing the right thing, so treat them as hard stops.
- If you launch with a NO, add it to `docs/CLAUDE_LOG.md` under "Open for the owner".
