# Claude log

A running log for Claude sessions on TGS. **Read this at the start of every session, and add an entry at the end of every session** (newest first). Keep each entry short: the detail lives in the linked session log, CHANGELOG and DEMO files.

Each entry: date, branch and latest commit, what was done, what is applied to hosted, what is open, and where the detail is. Never record secrets, `.env.local` values or users' personal data here.

## Current state (update every session)

| Branch | State | Latest commit | Hosted |
| --- | --- | --- | --- |
| `main` | Sprints 1–4 and **Sprint 5 merged (PRs #6 to #8, 12 Nov), ratified gold set and logs merged (PR #10)**, launch email docs | see `git log origin/main` | All migrations applied to hosted (Sprint 4, Sprint 5, legal-hardening and audit-handle, through `20261113000800`, 13 Nov) |
| `sprint-7-batch-2b` | **Merged to `main` as PR #31 (13 Nov).** W7 judge prompt v2, W9 load tests, W13 backups, W14 documents, CSP report-only, Resend pacing | see `git log origin/main` | `20261113000700` applied to hosted on the owner's go (13 Nov) |
| `rule7-rubric-publish` | **Merged to `main` (with the log entry, PR #34, 13 Nov).** Rule 7: publish the rubric, scheduling requires it, rubric shown on the Campaign page | see `git log origin/main` | `20261113000800` applied to hosted by the owner from their own terminal (13 Nov) |
| `launch-owner-actions` | **Merged to `main` as PR #33 (13 Nov).** Owner actions before the first invite wave in the runbook and go/no-go | see `git log origin/main` | n/a |
| `main` also has legal-hardening | **Merged to `main` as PR #22 (13 Nov); its six migrations were applied to hosted on 13 Nov** (`20261107000100` to `000600`). The `legal-hardening` and `merge-legal-hardening` branches were deleted | see `git log origin/main` | Applied |
| Launch setup (owner-reported 13 Nov; Claude did not see these) | Reset password and Confirm sign up templates and redirect URLs done. Judging Vault secrets and `JUDGING_PROCESSOR_SECRET` done, all six Vault secrets exist. Auth rate limits raised (owner to confirm exact values). First hosted dump taken and encrypted by the owner. Member post test complete | n/a | n/a |

Checkouts: only `TGS/` (the `TGS-sprint5/` and `TGS-legal/` worktrees were removed on 13 Nov). Local Supabase is shared by whatever runs from `TGS/`.

## Open for the owner

- **Remaining owner actions before the first invite wave** (batches 1, 2a, 2b and rule 7 are merged and applied; the Auth limits, dump, templates, Vault secrets and member post test are reported done, see Current state): the rest of `docs/LAUNCH_RUNBOOK.md` (Vercel variables, Anthropic and Resend limits, re-read the free-plan limits, second admin, move provider accounts into the company) and the rest of `docs/GO_NO_GO.md`. Confirm the exact Auth rate limit values so this log can record them (raised, owner to confirm; target 150/150/100 per 5 minutes).
- **Campaign 1: publish and schedule.** Read `docs/campaigns/under-16-social-media-ban.md`, run its four SQL Editor queries, choose the title (or drop the summary's last line), confirm the close date, check the summary's facts on gov.uk, eSafety and the BMJ, then follow its click order: save as draft, confirm the weights version, publish the rubric (cannot be undone), then schedule for 1 December 2026. Scheduling a draft is refused until its rubric is published.
- **The other 14 Campaigns need real summaries and rules** (all 15 are drafts, as the owner reported from the SQL Editor; not seen by Claude). Each needs its rubric published before it can be scheduled.
- **The three flagged Campaigns** each carry an owner decision flag and cannot be scheduled until you clear it: `bank-of-england-rate-decision-november` (still timely?), `rosebank-after-jackdaw`, and `assisted-dying-or-fix-care-first` (sensitive: needs the real content note).
- **Decide the judge prompt version:** v2 is the default but is slightly less aligned than v1 in the real evaluation (`docs/SPRINT_7_PLAN.md`, W7); look at the numbers before leaving it. v1 is one setting away (Admin, Judging).
- **Hosted CLI steps run from your terminal, not Claude's.** Claude's shell has no Supabase access token (`supabase link` fails with `AccessTokenRequiredError`). Run `npx supabase login` and `npx supabase link --project-ref <ref>`, then dry runs and applies with `--linked`, and paste back the output with any connection string removed. Hosted migrations: none pending as far as Claude knows (`20261113000800` applied by the owner on 13 Nov; Claude did not see the dry-run output).
- **PLACEHOLDER strings:** edit the three in `src/lib/judging/notices.ts` before the first Campaign can close (parked legal item; Claude does not touch it).
- **Decide the AI cap:** the default of 1,000 calls a day only judges about 800 Dispatches of a big Campaign on day one (measured). Raise `ai_daily_cap_global` for judging days, or accept a day's wait.
- **Legal (parked):** the rate limiter keeps a SHA-256 hash of IP and email addresses for up to two days; the privacy and retention wording needs a review.
- **Legal facts still to add:** fill the bracketed facts listed in `docs/SESSION_LOG_LEGAL_HARDENING.md` (the pages still show "[to be added]" for company number, registered office, ICO number and effective date); `LEGAL.reviewed` stays false until the solicitor signs off. Existing members have no positions consent until they give it.
- **Account deletion stays OFF.** Decide whether it also removes a deleted user's peer votes and mind-change picks (legal-hardening owns that function).

## Entries

### 2026-11-13 — Current state and Open for the owner brought up to date (branch `claude-log-state-refresh`)

- Docs only. Per the owner: the Reset password and Confirm sign up templates and redirect URLs, the judging Vault secrets and `JUDGING_PROCESSOR_SECRET` (all six Vault secrets exist), the first encrypted hosted dump and the member post test are done; Auth rate limits are raised (owner to confirm the exact values). None of this was seen by Claude. Batches 1, 2a, 2b and rule 7 are merged and applied (PRs #27, #29, #31 and #34; `docs-launch-refresh` is PR #37).
- Removed from Open for the owner because the owner has done them: the Vault secrets and judging item, the Reset password item, and the dump and Auth limit steps inside the owner-actions item. Kept: Campaign 1 publish and schedule, the 14 other Campaigns' summaries and rules, the three flagged Campaigns, the PLACEHOLDER strings, the AI cap decision, the v2 versus v1 judge prompt decision, the legal items and account deletion staying off.
- Not changed here: `docs/GO_NO_GO.md` row 22 (member post test) and rows 4, 6 and 8 still say Open or not verified; update them when you confirm. No hosted command run, legal files and PLACEHOLDER strings untouched, nothing merged.

### 2026-11-13 — Campaign 1 brief for owner approval (PR #38)

- Docs only: `docs/campaigns/under-16-social-media-ban.md` (merged as PR #38). It holds the owner's proposed summary verbatim, a plain-text rules draft (1,071 characters, only mechanics that exist in the app), a field-by-field checklist for the Admin Campaign edit form, and the click order (save as draft, confirm weights, Publish the rubric, Schedule it, check `/admin/audit`). Nothing was entered, saved, published or scheduled.
- **Read from the repo only.** Claude had no hosted access (no Supabase token in its shell; `.env.local` not read), so these are NOT verified and the file gives read-only SQL Editor queries for each: whether Campaign 1 has `rubric_published_at` set (the owner's 13 Nov check said all 15 are drafts with it null, not seen by Claude), the latest `judging_weights` version and its weights (version 1 is seeded 40/25/25/10), the live Dispatch limits (code defaults 1,500, 1,000 and 600 characters, 30 seconds between posts, 5 minutes to edit), and the TEST Campaign's rules and summary.
- **Format:** `rules` is optional plain text up to 10,000 characters, shown under "Rules" with line breaks kept and no Markdown; Campaign 1 is Open arena, Technology, not sensitive; form times are UK time.
- **Mismatches for the owner:** the loaded title ("...go ahead as planned?") differs from the summary's closing question; no close date was given (the loader's draft closes 8 December 2026, to confirm); the topic bank mentions age assurance and AI companions where the summary mentions livestreaming and stranger contact.
- **Facts to check before publishing** (gov.uk, eSafety, BMJ): Australia's law taking effect on 10 December 2025, livestreaming and stranger contact, regulations laid in December, the bereaved-parents and child-safety-charity attributions, the eSafety 52.4% to 42.1% figures and the BMJ "over 85%" figure (accounts held versus use are not like for like). Only the 15 June date and the spring 2027 start are in the repo, via one law-firm article.
- Nothing applied to hosted, no settings changed, legal files and PLACEHOLDER strings untouched.

### 2026-11-13 — Launch documents refreshed (branch `docs-launch-refresh`)

- Docs only. `docs/GO_NO_GO.md` rows 1, 2 and 21 now say batches 1, 2a, 2b and rule 7 are merged, hosted is through `20261113000800` (applied by the owner from their own terminal), and rule 7 is live with Campaign 1 still needing its summary, rules, published rubric and scheduling. Every owner-only row is unchanged.
- `docs/LAUNCH_RUNBOOK.md`: the member post test says the invite script prints a LOCAL sign-up link, so use `https://thegrandstrategist.com/signup?code=<printed code>`; hosted CLI steps run from the owner's terminal (`npx supabase login`, `npx supabase link --project-ref <ref>`, `--linked`); the Vault check (`select name from vault.secrets order by name;`, six names) and the three processor curls (401 with no header, 503 means the variable is unset); noting the Production deployment to promote as an owner action.
- "Open for the owner" rewritten as a short current list. Removed as resolved or superseded, with the entry that shows it: D1 to D8 answers (entry "Sprint 7 Phase B, batch 2a": decisions recorded in `docs/SPRINT_7_PLAN.md`); "Phase B waiting on answers" and the batch 2a to-do (the batch 2a and 2b entries: both built, merged and applied); `privacyEmail` and `contactEmail` ("Contact addresses set", 12 Nov); the Desktop PR descriptions and the old apply-order warnings ("Open list tidied", 12 Nov, and the 13 Nov legal-hardening applied entry); the add/add conflict warning ("Pushes and integration trial", 12 Nov, kept both sides, and the PRs have since merged).
- Nothing run against hosted, no supabase command, no env file read, legal files and PLACEHOLDER strings untouched, nothing merged.

### 2026-11-13 — Rule 7 migration applied to hosted by the owner (branch `rule7-rubric-publish`)

- **`20261113000800_rubric_publish.sql` was applied to hosted by the owner from their own terminal.** Reported by the owner: the CLI dry run listed exactly that one file, and a fresh dry run said the remote database is up to date. I did not see either output.
- **Why not from Claude's shell:** the Supabase CLI was not linked or logged in on this machine (my shell had no access token, `supabase link` failed with `AccessTokenRequiredError` three times, even after the owner ran `supabase login`). Hosted CLI steps are therefore run from the owner's terminal with `--linked`. Nothing was written to hosted from my side.
- **Catalog verification** (function overloads, SECURITY DEFINER/INVOKER, search_path, anon and authenticated execute, `RUBRIC_NOT_PUBLISHED` in `save_campaign`, Campaign counts by status, `rubric_published_at`) was run by the owner in the Supabase dashboard SQL Editor. I did not run it and have not seen the results.
- **What I did check:** before the apply, the branch was rebased onto `origin/main` (batch 2b merged), CHANGELOG and `tests/rls/sprint7-grants.test.ts` conflicts resolved keeping both sides, migration unchanged, then typecheck and lint clean, 354 unit, 361 RLS, 55 Playwright passing, force-with-lease push. After the apply, `/api/health`, `/`, `/login`, `/signup`, `/campaigns` and `/leaderboard` on the live site all returned 200 with no error markers in the body.
- Nothing merged. The rule 7 PR is for the owner to merge. No settings changed, no rubric published, nothing scheduled.
- **Afterwards (owner):** PR #34 (this entry plus the rule 7 commit) and PR #35 (Current state and Open for the owner refresh) were merged to `main` on 13 Nov. `main` is at `0ab55a6`. Nothing pending on hosted as far as Claude knows.

### 2026-11-13 — Batch 2b migration applied; rule 7 branch; owner actions; branch clean-up

- **Owner "go" for `20261113000700_judge_prompt_v2.sql`.** Before it: the code already cut claims to three, but a non-string entry would have failed the whole parse, so the schema now drops non-strings and the processor caps at three again before storing (code only, with a 4-claim and a mixed-types test; pushed to `sprint-7-batch-2b`). A dry run with `--include-all` listed exactly that one file; applied with `supabase db push --include-all`; a fresh dry run says "Remote database is up to date". Verified read-only on hosted: `ai_rubric_scores.unverified_claims` (jsonb, nullable) and `judging_settings.judge_prompt_version` (smallint, not null, value 2) exist; one overload each of `store_rubric_score(uuid, jsonb)`, `dispatch_unverified_claims(uuid)` and `set_judge_prompt_version(smallint, text)`, all SECURITY DEFINER with `search_path=""`; anon cannot execute any; authenticated can execute the second and third but not `store_rubric_score`; service_role can execute `store_rubric_score`. Live site: `/api/health`, `/`, `/login`, `/signup`, `/campaigns`, `/leaderboard` all 200 with no error markers. No settings changed. The batch 2b PR is for the owner to merge.
- **Rule 7 (branch `rule7-rubric-publish`, off `main`, separate PR).** Found: the rubric was not stored per Campaign; its pieces are the four criteria in `prompts/judge-rubric.v1.md`, the blend weights in `judging_weights` (pinned to a Campaign when it opened) and `judging_settings.steelman_bonus_max`; `campaigns.rubric_published_at` was only ever written as null by `topics:load`. Built `publish_campaign_rubric(uuid)` (admin only, sets the time once, pins the current weights version, audit `campaign.rubric_published`), a "Publish the rubric" button on the admin edit page, a guard in `save_campaign` (change into "scheduled" refused with `RUBRIC_NOT_PUBLISHED` until published; already scheduled, open or closed Campaigns untouched; no backfill) with a plain message in the admin form, and a public "How this Campaign is judged" section. Tests: new RLS suite, updated e2e journey. 330 unit, 351 RLS and 51 Playwright pass; typecheck and lint clean. Migration `20261113000800_rubric_publish.sql` is local only, NOT applied; its full SQL was sent to the owner's reviewer. Expect a CHANGELOG conflict with batch 2b when the second merges (keep both entries).
- **Owner actions** before the first invite wave are in `docs/LAUNCH_RUNBOOK.md` and `docs/GO_NO_GO.md` (branch `launch-owner-actions`, stacked on batch 2b): Auth limits 30 to 150 and 30 to 100 per 5 minutes, first encrypted dump, re-read free-plan limits, second admin, move provider accounts into the company, Campaign 1 preparation (summary, rules, publish rubric, schedule), the three flagged Campaigns, the three PLACEHOLDER strings (parked legal item), and the member post test (phone, `/admin` refused for the test member, far-future close date, set back to draft, message the reviewer within about 30 minutes).
- **Branches deleted** after confirming each was fully contained in `origin/main` (local and `origin`, one command at a time): `sprint-7-batch-2a` and `claude-log-batch2a-applied`.
- Nothing merged. Account deletion stays off; legal files and placeholders untouched. Local Supabase was reset several times; reset before the next test run.

### 2026-11-13 — Sprint 7 Phase B, batch 2b (branch `sprint-7-batch-2b`)

- **W7 judge prompt v2** (D5): `prompts/judge-rubric.v2.md` (v1 untouched), `unverified_claims` (up to three) stored on `ai_rubric_scores`, shown as "Check before relying" with a count of links, figures and named studies, source links passed to the model as text only; never changes a score. Prompt version is the database setting `judging_settings.judge_prompt_version` (default 2), switch in Admin, Judging; `JUDGE_PROMPT_VERSION` is only a fall-back if the column is missing. Judges read claims only through `dispatch_unverified_claims(uuid)`. Migration `20261113000700_judge_prompt_v2.sql`, local only. Real eval run once: PASS on all criteria (pooled error 0.62, within one 93%, Spearman 0.92) but a little less aligned than v1 (0.55, 97%, 0.93); about 16p.
- **W9**: `scripts/load/` (`npm run load:test`), five scenarios, 20 of 20 checks pass locally (`docs/LOAD_TEST_RESULTS.md`). Finding: the default AI cap (1,000 a day, judging stops at 80%) judged 800 of a 1,500-Dispatch close on day one; the rest wait, none fail. Resend requests are now paced to about 5 a second with one safe retry on 429 (`src/lib/email/pacing.ts`).
- **W13**: `scripts/backup-dump.sh` (hosted by default, `--local` for rehearsals; reads `DATABASE_URL` from `.env.local` without printing it; writes `~/TGS-backups`, mode 600) and `scripts/backup-restore-local.sh`. Local dump, reset and restore: all 61 table counts match, fingerprints identical, a restored account signs in. Not tested on hosted; no hosted dump was taken. `docs/BACKUP_RESTORE.md` lists what is not covered (Vault secrets, Auth dashboard settings, sessions, hosted restore).
- **W14**: `docs/LAUNCH_RUNBOOK.md` (with Owner actions), `docs/GO_NO_GO.md`, `docs/INCIDENT_CHECKLIST.md`. **CSP**: report-only header plus `/api/csp-report` (rate limited, stores directive and blocked host only).
- Results: typecheck and lint clean; 353 unit and 352 RLS tests pass; Playwright 55 of 55 (the new CSP flood test had a counting mistake of mine, fixed and rerun).
- Local Supabase was reset several times and holds load-test or restore data from the last rehearsal; reset before the next test run. Nothing applied to or written to hosted. Legal files and placeholders untouched.
- Found on the way: `audit_log` refuses TRUNCATE, so a restore must clear tables with triggers off.

### 2026-11-13 — Sprint 7 batch 2a applied to hosted

- **PR #29 (`sprint-7-batch-2a`) was merged before its migrations were applied**, the opposite of the agreed order. Between the merge and the apply, the live admin judging page, the peer-vote page and `/admin/signals` would have errored and the new settings forms could not save; sign-up, posting and the existing pages were not affected (the sign-up form falls back to the old invite check). No peer voting was open in the pilot.
- On the owner's "go": confirmed `main` has PR #29 and `32a719c`; a dry run with `--include-all` listed exactly `20261113000300`, `000400`, `000500` and `000600`; hosted before: the email outbox was empty and there were 15 Campaigns. `supabase db push --include-all` applied all four with no error (output filtered, no connection string printed).
- Verified read-only on hosted: `judging_settings` defaults 48 hours, 3 confirmations and 24 hours; `invites.invited_email` exists with `invites_invited_email_check` using `lower(btrim(...))`; `community_settings` reads essentials-only true, five essential kinds including `peer_voting_open`, global daily cap 60 (per-person cap still 6), and all three switches off. All 13 functions from the four migrations are SECURITY DEFINER with `search_path` set; anon can execute none of them; signed-in users can execute `admin_integrity_signals`, `set_email_controls`, `cast_peer_vote`, `set_steelman_confirmation`, `pick_mind_changer` and the eight-argument `save_judging_settings`; the old five-argument version is gone (one overload, 8 arguments). `handle_new_user` contains `INVITE_EMAIL_MISMATCH` and keeps the reserved-count and public-record checks; the triggers on `auth.users` (`auth_users_refuse_when_paused`, `on_auth_user_created`, `on_auth_user_confirmed`, `before_auth_user_deleted`) are all enabled. A fresh dry run says the remote database is up to date.
- Email processor: the outbox was empty before and after (about a minute after the apply, `email-kick` had run every minute and succeeded), so nothing was queued or skipped. Live site (public): `/api/health` 200 `{"ok":true}`; `/`, `/login`, `/signup`, `/campaigns`, `/leaderboard` return 200 with no error markers and no banner.
- No setting was changed. Not checked: the admin pages on the live site (they need an admin sign-in). `sprint-7-batch-2a` is merged but not deleted. Every migration on `main` is now applied to hosted.

### 2026-11-13 — Sprint 7 Phase B, batch 2a (branch `sprint-7-batch-2a`)

- Recorded the owner's decisions D1 to D8 in `docs/SPRINT_7_PLAN.md` ("Decided 13 Nov"). Built W4 (`20261113000300_voter_eligibility.sql`: 48-hour account age as a setting, panel judges exempt, steelman cap 3, mind-change picks weighted like votes and needing a 24-hour position span), W5 (`20261113000400_integrity_signals.sql` and `/admin/signals`: seven read-only signals, flags only, also shown on the draft Verdict as non-blocking "For review"), W10 (`20261113000500_invite_email_binding.sql`: optional `invites.invited_email`; `invite:create --email`, 14-day default expiry) and W15 (`20261113000600_email_essentials.sql`: essential emails only on by default, global daily cap 60, admin form with audit entry). D6 wording set in `src/lib/switches.ts`.
- Compatibility proof: current `main` (`936ac95`) run against the new schema: unit and RLS 604 of 610 pass, Playwright 45 of 47 pass. The failures are exactly the two intended behaviour changes: fixtures that vote with brand-new accounts (the 48-hour rule) and fixtures that expect non-essential emails to be queued. Everything else, including the batch 1 tests, passes against the new schema.
- Results on the branch: typecheck and lint clean; 670 unit and RLS tests pass; 51 Playwright pass. New RLS suites: eligibility, integrity signals, invite binding, email essentials, and a grants test (anon can execute only the read-only `site_switches`; every SECURITY DEFINER function sets `search_path`).
- Found and fixed on the way: Sprint 5's `save_judging_settings` had an UPDATE with no WHERE clause, which Supabase's API refuses, so saving judging settings from Admin could not have worked; two admin forms shared the element id `reason` on one page (an accessibility bug). Two test fixtures updated for the new rules (test users made three days old; email-queue tests switch essentials off).
- Nothing applied to hosted, nothing written to hosted, legal files and placeholders untouched. Local Supabase was reset (`db reset`) to run the tests. A temporary worktree of `main` used for the proof was removed.
- Follow-up after the owner's SQL review (same branch): `peer_voting_open` added to the default `email_essential_kinds` (five essential kinds now); `invites.invited_email` check now `= lower(btrim(invited_email))`; `enqueue_email` keeps its original `p_send_after ... default now()`. Diffs of `judging_inputs`, `enqueue_email`, `claim_email_batch` and `handle_new_user` against their latest earlier definitions were reviewed: only additive changes plus the owner decisions. Tests: 672 unit and RLS, 51 Playwright; a new test covers a cut kind skipped with the reason `global_daily_cap`, and invite addresses with spaces are refused.
- Report-only finding: the app has no browser Supabase client, so every Auth call (sign-in, sign-up, reset, `/auth/confirm` verification, `getUser` in `src/proxy.ts`) runs from Vercel server code and Supabase sees Vercel's IP, not the member's. Supabase's per-IP Auth limits (documented defaults: 30 sign-ups/sign-ins and 30 verifications per 5 minutes, 150 token refreshes per 5 minutes) would apply to the shared Vercel addresses; check Authentication, Rate Limits in the dashboard. Nothing changed for this.
- Pushed as a branch for the owner to PR; nothing merged.

### 2026-11-13 — Sprint 7 batch 1 applied to hosted

- Batch 1 merged as PR #27. On the owner's "go": a dry run with `--include-all` listed exactly `20261113000100_site_switches.sql` and `20261113000200_rate_limits_events_health.sql`; both applied (output filtered, no connection string printed).
- Verified read-only: `rate_limits` and `system_events` exist with RLS on; the nine new functions exist, all SECURITY DEFINER with `search_path` set; anon cannot execute `set_site_switches` or `rate_limit_hit` and can execute only `site_switches`; both triggers (`dispatches_refuse_when_paused`, `auth_users_refuse_when_paused`) are enabled; cron job `housekeeping-limits-events` (03:41 UTC) is active; all three switches read off; a fresh dry run says the remote database is up to date.
- Live site: `/api/health` returns 200 `{"ok":true}`; `/`, `/login`, `/signup`, `/campaigns`, `/leaderboard` and `/privacy/contact` return 200 with no error markers and no pause banner; the HSTS header (`max-age=31536000`) shows the new deploy is live.
- State: every migration on `main` is applied to hosted. Not checked: the admin Settings switches form and `/admin/health` on the live site (they need an admin sign-in).

### 2026-11-13 — Sprint 7 Phase B, batch 1 (branch `sprint-7-phase-b`)

- Built the decision-free items from `docs/SPRINT_7_PLAN.md`: W3 `safeNextPath` open redirect fixed; W1 kill switches (posting, sign-ups, emails) with admin form, banner, audit entry and database triggers (`20261113000100_site_switches.sql`); W2 Postgres rate limiter wired into sign-in, sign-up, reset request, report, follow, reaction and position, plus a `system_events` log and nightly prune (`20261113000200_rate_limits_events_health.sql`); W6 `/api/health` and `/admin/health`; W8 injection corpus tested through all seven AI calls (also hardened `defuse` so a writer cannot fake the trusted-context header); W11 HSTS; W12 patch upgrades (`next` 16.4.6, `react` 19.3.1, `@supabase/supabase-js` 2.119).
- Not built (waiting on owner decisions or later batches): W4 (D3), W5 (D4), W7 (D5), W9, W10 (D3b), W13 (D7), W14, CSP.
- Local only: reset the local Supabase database (`db reset`) to get all migrations in order; nothing applied to hosted, nothing written to hosted. Legal files and placeholders untouched.
- Results: typecheck and lint clean; 610 unit and RLS tests pass; full Playwright 47 passed; `npm audit --omit=dev` 0 vulnerabilities.
- Found on the way: Supabase blocks an UPDATE with no WHERE clause (fixed in the switches function); per-IP limits had to be generous because a pilot class shares one address, and the Playwright suite signs in many times from one IP (limits are in `src/lib/rate-limit-config.ts`).
- Pushed as a branch for the owner to PR; nothing merged.

### 2026-11-13 — audit-handle migration applied to hosted

- Merged to `main` as PR #25 (via `merge-audit-handle`); both audit-handle branches deleted. On the owner's "go": a dry run with `--include-all` listed exactly `20261104000500_audit_no_handle.sql`, then it was applied from `TGS/` on `main` (output filtered; no connection string printed).
- Verified read-only: `decide_held_handle` on hosted now writes only `reason` and `flag_id` into the audit entry (the `handle` write is gone); it is still SECURITY DEFINER with `search_path` set; EXECUTE is not granted to anon and is granted to authenticated; a fresh dry run says the remote database is up to date. No existing audit rows were changed.
- State: every migration on `main` is applied to hosted. Origin has only `main`. Removed the stale `sprint-4-audit-handle` row and the "migrations still to apply" item.
- Still open: judging Vault secrets and `JUDGING_PROCESSOR_SECRET`, the three PLACEHOLDER strings in `src/lib/judging/notices.ts`, the Supabase Reset password template and redirect URL, the remaining legal facts, and Sprint 7 Phase B (waiting on D1 to D8).

### 2026-11-13 — audit-handle merged into a branch (not main)

- On the owner's "merge audit-handle": merged `origin/sprint-4-audit-handle` into a new branch `merge-audit-handle` cut from current `main`, for the owner to merge by PR. Nothing pushed to `main`, nothing applied to hosted.
- Checked before merging: `decide_held_handle` has only one earlier definition (`20261104000100`), and the new migration's body differs from it only in the audit insert (`reason` and `flag_id` kept, `handle` removed), so no later change is reverted. Only conflict: `CHANGELOG.md` (kept both). Main's onboarding already stopped writing the handle (legal-hardening).
- Typecheck and lint clean; 214 unit tests under `src` pass. The new RLS test `tests/rls/audit-no-handle.test.ts` was not run (needs the local database reset with this migration; no database command was run).
- To apply later: the migration is older than the newest applied one, so use `supabase db push --include-all` after a dry run that lists exactly `20261104000500_audit_no_handle.sql`.

### 2026-11-13 — Sprint 7 Phase A merged

- Owner merged PR #23 (`sprint-7-hardening`): `docs/SPRINT_7_PLAN.md` and its log entries are on `main`. Deleted the branch locally and on origin on the owner's instruction after confirming it was contained in `origin/main`. Removed its "Current state" row.
- Origin now has only `main` and `sprint-4-audit-handle`. Phase B (the 14 work items) has not started: it waits for the owner's answers to D1 to D8 in the plan. Hosted unchanged: Sprint 5 and legal-hardening migrations applied; audit-handle not applied (needs `--include-all`).

### 2026-11-13 — Legal branches and checkout removed

- On the owner's instruction deleted `legal-hardening` and `merge-legal-hardening` on origin (both contained in `origin/main`), and locally. Removed the `TGS-legal/` checkout after confirming no tracked changes, no untracked files and no commits missing from `origin/main`; only ignored files (including `node_modules`, `.next`, test results, `evals/out/`, `.env.test.local`) went with it. `TGS/.env.local` is untouched.
- Origin now has `main`, `sprint-4-audit-handle` and `sprint-7-hardening`. Fixed the stale worktrees line and the legal row in "Current state".

### 2026-11-13 — legal-hardening migrations applied to hosted

- On the owner's "go": dry run first listed exactly `20261107000100` to `20261107000600`; then `supabase db push --include-all` applied them (run from `TGS/` on `main`, with output filtered so no connection string was printed).
- Verified read-only: `privacy_requests` exists with RLS on; the `consented_positions` view exists; the five new `profiles` columns exist; the four new functions exist; all eight `retention-*` cron jobs are in `cron.job` (03:17 to 03:31 UTC, active); `ai_daily_cap_global` is now 1,000 (changed by `20261107000600`); a fresh dry run says the remote database is up to date.
- Live site (`https://thegrandstrategist.com`): `/privacy/contact`, `/privacy`, `/terms`, `/signup`, `/login` and `/leaderboard` return 200 with no error markers; the contact address `contact@thegrandstrategist.com` shows; four "[to be added]" placeholders remain for the other legal facts.
- First retention run is the next 03:xx UTC; only expired passkey challenges are expected to be deleted (hosted data not queried beforehand). Existing members have null consents, so their positions do not count for mind-change until they consent.
- Still pending on hosted: audit-handle migration only (needs `--include-all`), the Vault secrets for judging, and the Supabase password-reset template.

### 2026-11-13 — Log state refreshed

- Current state table brought up to date: legal-hardening is merged (PR #22) but its migrations are not applied to hosted (the live code is ahead of its database); `sprint-7-hardening` row added (Phase A plan only). Open list wording for legal hardening changed from "after the merge PR" to "apply the six migrations".
- Reminder of the one urgent item: until those six migrations are applied, positions consent, Download my data, the privacy contact form and the admin privacy queue error on the live site.

### 2026-11-13 — Sprint 7 Phase A: audit and plan (branch `sprint-7-hardening`)

- Read-only audit and plan, no feature code. Wrote `docs/SPRINT_7_PLAN.md`: top 10 risks, findings tables for anti-gaming, load and capacity, security and launch readiness, 14 ordered work items (size, migration, owner decision), 8 questions for the owner (D1 to D8) and a list of what could not be verified. Branch is pushed; no PR opened. Nothing applied to hosted, nothing written to hosted, no load run, no upgrades. Legal files and placeholders untouched.
- Real findings worth remembering: only the AI has a kill switch; voting needs only one posted Dispatch (no account age); mind-change picks and steelman confirmations are unweighted or uncapped; the AI judge never receives `dispatches.sources`; `safeNextPath` lets tab and line-break characters through (confirmed open redirect in `/auth/confirm`); no CSP; 115 SECURITY DEFINER functions all set `search_path`; `npm audit --omit=dev` shows 0 vulnerabilities. The claim that the app has no rate limits of its own is partly wrong: posting has a cooldown and per-round cap, AI has per-user and global caps, votes have credits.
- Capacity: on free plans Resend (about 100 a day, to verify) and the $30 Anthropic cap limit the pilot to roughly 100 members unless email is cut to essentials.

### 2026-11-13 — legal-hardening merged into a branch (not main)

- On the owner's "merge legal-hardening": merged `origin/legal-hardening` into a new branch `merge-legal-hardening` cut from current `main`, for the owner to merge by PR. Nothing was pushed to `main`; nothing applied to hosted.
- Conflicts (as predicted): `CHANGELOG.md` and `tests/rls/every-table-has-rls.test.ts` (kept both; the RLS list is the union of both sets of table names, including `privacy_requests` and the judging tables) and this log (kept `main`'s version, and added legal-hardening's three entries; its older table and open list were dropped as stale).
- Warning for the owner: merging to `main` deploys the code on Vercel, but the six legal-hardening migrations are not on hosted. Until they are applied, the new pages that read them (positions consent, Download my data, privacy contact, admin privacy queue) will error; sign-up keeps working. Applying the migrations first instead breaks sign-up and positions on the old code. Do both within minutes.
- Local database and Playwright were not run on the merged tree (the local database would need a reset with the merged migrations).

### 2026-11-13 — Log housekeeping

- Marked the three earlier "this log branch is pushed" lines as merged and deleted (PRs #18, #19 and #20 are merged; their branches are gone). Nothing else changed: origin has only `main`, `legal-hardening` and `sprint-4-audit-handle`, and hosted has the Sprint 5 migrations only.
- Convention from here: a log entry may say its own branch is pushed only until that PR merges; later entries should not repeat it, so lines do not go stale after the merge.

### 2026-11-13 — Old sprint branches deleted, sprint5 checkout removed

- On the owner's instruction deleted on origin `launch-email-confirm-template`, `sprint-1`, `sprint-2`, `sprint-3`, `sprint-4`, `sprint-4-hardening` and `sprint-5-judging`, each after checking it was contained in `origin/main`; the local copies too. Origin now has only `main`, `legal-hardening` and `sprint-4-audit-handle`.
- Removed the `TGS-sprint5/` checkout (it had no tracked changes and nothing unmerged; only ignored files, including `node_modules`, `.env.test.local` and the local eval reports in `evals/out/`, were lost; its `.env.local` was a symlink so `TGS/.env.local` is untouched). The real eval results are in this log and in `docs/SESSION_LOG_SPRINT_5.md`; the reports can be regenerated with `npm run eval:judging -- --real` (about £0.14).
- Removed the stale "Current state" rows for the two deleted branches and fixed the worktrees line and the `legal-hardening` row (origin matches local).
- Log branch `claude-log-cleanup-sprint5`: merged by the owner and deleted.

### 2026-11-13 — Merged branches deleted

- On the owner's instruction deleted `claude-log-admin-account`, `header-signout-wrap` and `claude-log-pr17`, locally and on origin, each after checking it was contained in `origin/main`. Earlier entries that said they were waiting for deletion are marked superseded.
- Only `legal-hardening` and `sprint-4-audit-handle` remain as branches on origin besides `main`. `main` is `4eeee3d`, clean and in sync. Hosted unchanged: Sprint 5 migrations applied, nothing else.
- Correction: after the deletion I told the owner the log needed no update, which was wrong because two entries still described those branches as undeleted.
- Log branch `claude-log-branches-deleted`: merged by the owner and deleted.

### 2026-11-13 — Header fix merged

- Owner merged PR #17 (`header-signout-wrap`): the admin header now keeps "Sign out" on one row from 1080px up; 375px unchanged. Fast-forwarded local `main`; removed the header branch row from "Current state".
- (Superseded: those branches were deleted the same day, see the newest entry.) Open work: `legal-hardening` and `sprint-4-audit-handle`. Hosted unchanged: Sprint 5 migrations applied; the other two sets not applied.
- Log branch `claude-log-pr17`: merged by the owner and deleted.

### 2026-11-12 — Branch housekeeping

- (Superseded: `claude-log-admin-account` was deleted later, see the newest entry.) Open work branches besides `legal-hardening` and `sprint-4-audit-handle`.
- State: `main` is `62bb48b`, clean and in sync. Hosted: Sprint 5 migrations applied; audit-handle and legal-hardening migrations not applied (need `--include-all`).

### 2026-11-12 — Header "Sign out" wrap (branch `header-signout-wrap`)

- Reproduced first: as an admin at 1280, 1440 and 1920px "Sign out" sat on a second row (the header was capped at 896px). Fixed in `src/components/site-header.tsx` by widening the header to `max-w-6xl` from 1024px and keeping the logo on one line; below 1024px nothing changed (375px header measured the same before and after: 330px tall).
- New `tests/e2e/header.spec.ts` (5 tests, 1080/1280/1440/1920 plus 375). Typecheck, lint, 372 unit and 30 Playwright pass. Pushed as a branch, PR for the owner to open; not merged. No migrations, nothing applied to hosted.
- Known: at exactly 1024px an admin's header still wraps (needs about 1,040px). The header is now wider than the page content from 1024px.

### 2026-11-12 — Owner admin account created on hosted

- The owner ran `npm run invite:create` from `TGS/` against hosted (target printed as hosted): one single-use invite, 7-day expiry, note "Founder account". The first attempt failed only because it was run from the parent folder (no `package.json`). The script's printed sign-up link used localhost because `NEXT_PUBLIC_SITE_URL` in `.env.local` is local; the live link is `https://thegrandstrategist.com/signup?code=...`.
- The owner signed up, confirmed email and was granted the admin role by SQL in the Supabase SQL Editor; a screenshot shows the Admin link in the header on the admin console. The invite is used up. Claude ran no hosted commands for this.
- Cosmetic: at desktop width "Sign out" wraps to a second header row and pushes the search box down. Not fixed; offered.
- Open items unchanged: Vault secrets and `JUDGING_PROCESSOR_SECRET` for judging, the three PLACEHOLDER strings in `src/lib/judging/notices.ts`, the Reset password template and redirect URL, the unmerged audit-handle and legal-hardening PRs (legal-hardening now has the contact address set).

### 2026-11-12 — Log branch status

- No branches remain except `claude-log-pr13` (this log update, PR for the owner to open and merge). `main` is `c0c1da9` and in sync.
- Mistake to remember: an earlier command mixed a remote branch delete into a larger chain and was blocked; deletes are now done only when the owner asks, as a single command after checking the branch is contained in `origin/main`.

### 2026-11-12 — Password recovery merged

- Owner merged PR #13 (`forgot-password`). Fast-forwarded local `main`. The `forgot-password` branch was deleted locally and on origin on the owner's instruction after a check that it was contained in `origin/main`. The live site only gets a working reset email once the owner pastes the Reset password template and checks the redirect URL (open list).

### 2026-11-12 — Password recovery flow (branch `forgot-password`)

- Built from `main`: "Forgot your password?" link on `/login`, `/forgot-password` (calls `resetPasswordForEmail`, redirect `NEXT_PUBLIC_SITE_URL` + `/auth/confirm?next=/reset-password`), the same `/forgot-password/sent` page for every outcome (no enumeration; Supabase errors incl. its rate limit are logged, not shown), `/reset-password` (sign-up password rules, typed twice, signs out everywhere, then `/login?reset=success`), and a clear message for expired or reused links.
- `/auth/confirm` now handles recovery links (token link and code link) and sets a 15-minute httpOnly cookie; `/reset-password` needs both that cookie and a session, so an ordinary signed-in session cannot use it.
- No migrations, no new dependency, nothing applied to hosted. The app has no rate limiter of its own; it relies on Supabase's.
- Tests: typecheck and lint clean; 372 unit tests pass (5 new); full Playwright suite 25 passed (6 new in `tests/e2e/password-reset.spec.ts`).
- Docs: `docs/LAUNCH_EMAIL_SETUP.md` gains step 12b (Reset password template, redirect URL note) and a checklist item. CHANGELOG entry added.
- Mistake: a status command printed the local Supabase's public demo keys (local only, not hosted).

### 2026-11-12 — Legal-hardening review, privacy contact, admin and invites (read-only)

- Printed the six legal-hardening migrations and `20261104000500` in order with summaries to `~/Desktop/legal-hardening-migrations-review.md` (outside the repo, 1,092 lines). Nothing applied or queried on hosted.
- Eight retention cron jobs (03:17 to 03:31 UTC daily): unconfirmed sign-ups 30 days (`auth.users`), `ai_decisions` 12 months, resolved reports and flags 12 months, coach feedback 90 days, emails 30 days, passkey challenges 1 day after expiry, privacy requests 6 years after closing, audit log 6 years. All skip rows tied to open flags, appeals or privacy requests, except passkey challenges.
- First-run deletes (estimate from project age, hosted not queried): only expired passkey challenges. On apply: `20261107000600` updates the existing settings row (AI cap to 1,000, with an audit entry); existing members get null consents, so Sprint 5's `judging_positions()` (reads `consented_positions`) counts none of their positions until they consent.
- Against a database with Sprint 5 tables: no object collisions found statically, but applying legal-hardening after Sprint 5 has never been run (the trial did it the other way round); `--include-all` needed. `anonymise_profile` still leaves Sprint 5 private rows.
- Privacy contact: `LEGAL.privacyEmail` and `contactEmail` in `src/lib/legal.ts` (legal-hardening branch only), default empty string.
- Admin and invites: admin = `app_metadata.role = 'admin'` (only that value); the invites table has `code`, `max_uses` (default 1), expiry, revoke and no email column; only admins and the service role can insert; no in-app invite UI; unconfirmed sign-ups hold a place for 24 hours.
- This log change is on `claude-log-cleanup` (PR not yet merged).

### 2026-11-12 — Log branch cleanup

- PR #11 (`claude-log-processor-routes`) was merged. Fast-forwarded local `main` to `origin/main`, deleted that branch locally and on origin, and removed its stale line from "Open for the owner".
- State: `main` has everything through PR #11; nothing is pending except the owner items in the open list. Hosted: Sprint 5 migrations applied; audit-handle and legal-hardening migrations not applied (need `--include-all`).

### 2026-11-12 — Open list tidied

- Removed from "Open for the owner": the database-password item (owner says rotated 12 Nov), the open-PR line for the already merged `launch-email-confirm-template`, and the merged-PR wording in the PR-descriptions line. The Anthropic key item was already gone.
- Corrected one stale line: Sprint 5's migrations are already on hosted, so audit-handle and legal-hardening now need `supabase db push --include-all` (the old advice to apply in timestamp order no longer avoids it). `~/Desktop/pr-descriptions.md` still has the old apply order; the log is right.
- Re-answered the processor routes table (unchanged; recorded in the entry below).

### 2026-11-12 — Wrap-up branch, hosted connection check, processor routes

- Pushed local `main`'s four extra commits as `origin/sprint5-wrapup` (same SHA as local `main`; diff against `origin/main` is exactly 5 files: both logs, `gold-set.json`, `CHANGES.md`, `scripts/eval-judging.ts`). `origin/main` untouched. Local `main` was not reset because `gold-set-ratified` was not merged on GitHub and one commit existed only locally.
- Hosted dry runs: three failed to parse `DATABASE_URL` (unencoded reserved characters in its password, found with yes/no checks only); after the owner updated `.env.local` it connected and said the remote database is up to date. Nothing pending. The password is read only from `TGS/.env.local` (the Sprint 5 worktree's `.env.local` is a symlink to it).
- Processor routes (all POST, `Authorization: Bearer <secret>`, constant-time compare; wrong or missing header 401, env var unset 503, failure 500): `/api/email/process` (`EMAIL_PROCESSOR_SECRET`; Vault `email_processor_url`/`email_processor_secret`; `email_kick()`), `/api/moderation/sweep` (`MODERATION_PROCESSOR_SECRET`; Vault `moderation_processor_url`/`moderation_processor_secret`; `moderation_kick()`), `/api/judging/process` (`JUDGING_PROCESSOR_SECRET`; Vault `judging_processor_url`/`judging_processor_secret`; `judging_kick()`). Each Vault secret must equal the matching Vercel variable.
- Owner merged PR #10 (`sprint5-wrapup`). Cleanup done: confirmed all four commits are in `origin/main`, `git diff origin/main main` was empty, reset local `main` to `origin/main` (`4084d4a`), and deleted `gold-set-ratified`, `claude-log-hosted-sprint5` and `sprint5-wrapup` on origin (and the two local ones; there was no local `sprint5-wrapup`). Pushed `claude-log-processor-routes` (this log update) as a branch for the owner to PR: https://github.com/delesax/TGS/compare/main...claude-log-processor-routes . Not pushed to `main`.

### 2026-11-12 — Log branches merged into main

- Merged `claude-log-hosted-sprint5` (fast-forward) and `gold-set-ratified` into local `main`. The latter is not log-only: it also brings the ratified `evals/judging/gold-set.json`, `evals/judging/CHANGES.md` and the small `scripts/eval-judging.ts` wording fix. Resolved the `docs/CLAUDE_LOG.md` conflict by keeping both sides. Not pushed until the owner says so. Also refreshed the stale status lines in `docs/SESSION_LOG_SPRINT_5.md` (it still said not pushed, not merged, nothing applied to hosted).

### 2026-11-12 — Sprint 5 migrations applied to hosted

- On the owner's "go", ran `supabase db push` from `TGS/` on `main` (`7a439cd`) against hosted. The dry run beforehand listed exactly `20261111000100_judging_schema.sql` and `20261111000200_judging_functions.sql`; both applied.
- Verified read-only: all 11 new tables have RLS on; `judging-tick` and `judging-kick` are in `cron.job` (every minute, active; there are two jobs, not three); `judging_settings` has its one default row; a fresh dry run says the remote database is up to date.
- Live site: `https://thegrandstrategist.com/leaderboard` returns 200 with the "No Verdicts yet" empty state and no error markers. The latest production deploy (`7a439cd`, READY) had Sprint 5 code live before the migration, so the judging pages were erroring until now.
- Not checked: whether any hosted Campaign is closed (the first tick would queue scoring jobs and peer-voting emails), and whether the Vault secrets exist (reads of hosted data were denied earlier).
- Mistake: a `grep` let through the CLI's echo of the hosted connection string, so the database password appeared once in session output. Rotate it (see open list). Anthropic key is in Vercel Production per the owner; that item is removed from the open list.
- `gold-set-ratified` was pushed but not yet on `main` at this point; it is merged afterwards (entry above).

### 2026-11-12 — Gold set ratified, real eval re-run

- Applied the owner's eight accepted changes to `evals/judging/gold-set.json` and nothing else (list in `evals/judging/CHANGES.md`): fs-02 steelman off; responsiveness 2 to 1 on six items; ed-02 evidence 4 and its year removed; hs-02, ed-04, en-06, te-05 one point down on the named criteria. Status ratified, `ratified_by` owner, `ratified_on` 2026-11-12, version `2026-11-12-ratified-1`. Note added that all items are synthetic and statistics are illustrative. Reasons reworded to match; no new facts.
- Only code change: the eval report no longer says "labels not yet ratified" once the status is `ratified`.
- Typecheck and lint clean; judging unit tests 35 pass. Fake eval fails as expected (keyword stand-in).
- Real eval, once, 30 of 30 scored, about £0.14 ($0.16): **PASS**. logic 0.57 MAE / 100% within ±1 / ρ 0.88; evidence 0.60 / 90% / 0.95; originality 0.50 / 100% / 0.94; responsiveness 0.53 / 97% / 0.92; pooled 0.55 / 97% / 0.93. Injection item hs-06 all 1s.
- Steelman: all 4 labelled found; **1 false positive: fs-02** (the owner removed its steelman label; the AI still marks it as one).
- Gaps of 2 or more (AI below label): fs-05, en-05, hs-02 evidence (3 vs 5); ed-05 responsiveness (3 vs 5).
- No label, threshold or prompt was changed to reach the result.

### 2026-11-12 — Log PR merged

- Owner merged PR #7 (log-only commits from `sprint-5-judging`). `main` now matches the branch. Replaced the stale `main` hash in "Current state" with a pointer to `git log`.
- Unchanged then: Sprint 5 migrations not applied to hosted; `launch-email-confirm-template`, `sprint-4-audit-handle`, `legal-hardening` unmerged; gold-set labels not ratified.

### 2026-11-12 — Sprint 5 merged

- Owner merged PR #6 (`sprint-5-judging`) into `main` (`dacaa0f`). Merged `origin/main` into the local branch; no conflicts. Nothing applied to hosted.
- Hosted gap: Sprint 5 code is now live-deployable while its two migrations are not applied. Per the deploy-order review, only the new judging pages (`/judging`, `/leaderboard`, vote, Verdict, admin judging) break; existing pages keep working. Apply audit-handle and legal-hardening migrations first if those are being applied, then the two Sprint 5 files, after a dry run.
- Still unmerged: `launch-email-confirm-template`, `sprint-4-audit-handle`, `legal-hardening`. Expect CLAUDE_LOG/CHANGELOG/RLS-list conflicts when legal-hardening merges (keep both).

### 2026-11-12 — Rubric questions, deploy-order review, PR descriptions

- Read-only review, nothing merged, pushed or applied. Wrote `~/Desktop/pr-descriptions.md` (four PR texts, outside the repo).
- Rubric: no special rule for first-post Arguments or Evidence Dispatches; only the general scale applies. The prompt does not check that sources are real (the AI judges plausibility from memory, no lookup).
- Real eval gaps: AI scores about a point below the draft labels, mostly evidence and originality; steelman missed on fs-02.
- Deploy order: legal-hardening migrations before its code break live main (sign-up needs `public_acknowledged`; positions insert needs consent; eight retention cron jobs start). Code before migrations breaks export, privacy contact, positions card and the admin privacy page. Sprint 5 migrations are additive and safe to apply first; its code before them breaks only the new judging pages. Inferred from the diffs, not run.
- Found: audit-handle fixes only `decide_held_handle`; main's `src/app/onboarding/actions.ts` still writes `details: { handle }` to `audit_log`. legal-hardening fixes it.
- Fixed stale lines in "Current state" (eval status; legal-hardening local is one commit ahead of origin).

### 2026-11-12 — Real judging eval run (Sonnet 5.5)

- Owner replaced the key; ran `npm run eval:judging -- --real` once from `TGS-sprint5/`: 30 of 30 scored, no rejected calls, estimated spend £0.14 ($0.16).
- **PASS** on every criterion against the DRAFT gold set (not yet ratified): logic 0.63 MAE / 97% within ±1 / ρ 0.85; evidence 0.63 / 87% / 0.95; originality 0.60 / 93% / 0.90; responsiveness 0.57 / 97% / 0.92; pooled 0.61 / 93% / 0.93. Steelman 4 of 5 found, 0 false positives; injection item hs-06 scored all 1s.
- Pattern: the AI scores a little lower than the labels, most on evidence-kind Dispatches and strong rebuttals (largest gaps fs-05, en-05, hs-02, ed-02, ed-05). Missed steelman: fs-02.
- Report is `evals/out/judging-real-2026-11-12.md` (gitignored). The result only counts once the owner ratifies the labels.

### 2026-11-12 — Pushed eval fixes, model switched

- Pushed `sprint-5-judging` to `c4e4e5d` (key check log, real-eval log, eval fixes). Origin matches local. No PR, no merges, nothing applied to hosted.
- The session model was switched to Sonnet 5.5 by the owner (`/model`). Commit trailers now say Sonnet 5.5.
- Still open: a valid Console API key, then the real eval run. Everything else is in the entry below and the Open list.

### 2026-11-12 — Key check and gold-set review sheet

- `.env.local` is gitignored (`.gitignore:34 .env*`) and untracked in `TGS/`, `TGS-sprint5/` and `TGS-legal/`. `TGS-sprint5/.env.local` is now a symlink to `../TGS/.env.local` (no copy). The owner's `.env.local` has one well-formed `ANTHROPIC_API_KEY` line (checked without reading the value out).
- Because of the symlink, scripts in `TGS-sprint5/` load hosted values unless `.env.test.local` is sourced first; seeds refuse hosted (`assertLocal`), Playwright refuses non-local.
- `npm run eval:judging -- --real` refuses with no key ("--real needs ANTHROPIC_API_KEY. Nothing was sent.", exit 1). Not run with the key yet: waiting for the owner's go.
- Gold-set review sheet written to the owner's Desktop (outside the repo); `gold-set.json` unchanged.
- Owner said run the real eval: all 30 calls failed with 401 `invalid x-api-key`, nothing scored, spend £0. Cause: the `ANTHROPIC_API_KEY` in `TGS/.env.local` is not a Console API key (its type label is `usr`, 124 characters, ends in `=`; real keys start `sk-ant-api03-`, about 108 characters). Owner to replace it, then re-run. Also found: the eval exits 0 when every call fails, and its £ cap compares a USD figure (stops at about $5).
- Fixed in `scripts/eval-judging.ts` (owner's go): stops at once on a rejected key (401/403) and names the error with any key masked; exits 1 and reports INCOMPLETE if any item is unscored (report still written); costs shown as £ and $, converted at 1.2 USD per GBP (below market, so the £ figure errs high), cap still £5. Worst-case estimate is about £2.15 ($2.58), not £1 as first stated. Earlier 1:1 treatment was deliberate and documented, not a bug. Tested: fake (exit 0), no key (exit 1), rejected key (1 call, exit 1). Typecheck, lint, unit 176 pass. `eval-coach.ts` and `eval-moderation.ts` on `main` still use the 1:1 treatment and exit 0 on failures; not changed.

### 2026-11-12 — Pushes and integration trial

- Committed and pushed `launch-email-confirm-template` (`968fdaf`, doc edits only). Pushed `sprint-5-judging` (no PR). Origin heads: `legal-hardening` `cdf83d0` (local has one more, unpushed, log-only commit `93c11b0`), `sprint-4-audit-handle` `bc88132`.
- Throwaway `integration-trial` from `main`: merged audit-handle (clean), legal-hardening (`CHANGELOG.md`), Sprint 5 (`CHANGELOG.md`, `docs/CLAUDE_LOG.md` add/add, `tests/rls/every-table-has-rls.test.ts`); all kept both. All 22 migrations reset cleanly; typecheck, lint, build clean; unit 209, RLS 272 pass. `seed:judging` failed (`public_acknowledged` missing); with that one line patched it seeded, the second run wrote nothing, and `judging_positions()` read `consented_positions` (10 of 10; 9 when one consent was withdrawn). Playwright not run. Trial worktree and branch deleted.
- Local Supabase now holds the merged schema and the seeded judging Campaign; run `npx supabase db reset` in a worktree before using it.
- Nothing applied to hosted. No merges.
- Follow-up the same day: added `public_acknowledged: true` to the seed and both Sprint 5 Playwright specs; seed and the two specs (3 tests) pass against the merged schema and on this branch alone; local DB reset back to this branch with the seed. Pushed.

### 2026-11-12 — Contact addresses set

- Set `privacyEmail` and `contactEmail` in `src/lib/legal.ts` to the owner's contact address (owner's instruction). Pages and the footer now show the address as a mailto link instead of "[to be added]", and the privacy-request alert email will be sent to it. Every other legal fact is still empty and `LEGAL.reviewed` is still false.
- Typecheck and lint clean; unit tests in `src/lib` pass (174). The Playwright suite was not run for this change.
- Pushed to `origin/legal-hardening` only. No PR, no merge, nothing applied to hosted.

### 2026-11-07 to 12 — Hosted invites, admin role, launch email docs (operations)

- Hosted: two QA invites were created (the first was held by an unconfirmed sign-up; the second allows 5 uses, 1 used). The owner's own account was given the admin role on hosted (audit row written). No migrations applied by me. Codes and addresses are deliberately not recorded here.
- Finding: Supabase confirmed an email even though `/auth/confirm` redirected to `confirm_failed`; likely the default `code` link opened on another device. Fix is the Confirm sign up template (step 12a, now on `main`); the hosted dashboard setting is still the owner's.
- Detail and the owner's to-do list: `docs/SESSION_LOG_INVITE_QA.md` (untracked, in the `TGS/` checkout).

### 2026-11-12 — Legal hardening pushed

- **Branch:** `legal-hardening` from `origin/main`, worktree `TGS-legal/`, code and docs complete at `ccb2822`; later commits are log-only (see `git log origin/legal-hardening`), pushed to `origin/legal-hardening`. No PR opened, nothing merged. `sprint-4-audit-handle` is on `origin` but still unmerged; `sprint-5-judging` is not on `origin`.
- **Built** (by a separate session, per the owner's brief in `docs/LEGAL_HARDENING_BRIEF.md`): central `LEGAL` facts and DRAFT gate, three sign-up consents, explicit consent for private positions, rewritten privacy, terms, AI-use and deletion pages, accessibility statement, email footers, privacy-request form, record and admin queue, `account:delete` script, retention jobs, fuller data export, legal records and runbooks in `docs/legal/`, launch decisions (AI cap 1,000, topic changes, `--concurrent`).
- **Results (reported by that session, not re-run here):** typecheck and lint clean; unit 174, RLS 238, Playwright 29 pass.
- **Hosted:** nothing applied. Migrations written: `20261107000100_signup_consents`, `…0200_positions_consent`, `…0300_anonymise_text_copies`, `…0400_privacy_requests`, `…0500_retention_jobs`, `…0600_launch_decisions`. The one-off draft-Campaign update script was not run with `--confirm`.
- **Note:** `sprint-4-audit-handle` is still not merged into `main`, which matters for one sentence on the deletion page.
- **Detail:** `docs/SESSION_LOG_LEGAL_HARDENING.md`, `CHANGELOG.md`, `DEMO.md`.

### 2026-11-11 — Sprint 5: judging and the Verdict

- **Branch:** `sprint-5-judging` from `main` `eec5c7c`, in worktree `TGS-sprint5/`. Commits `2aef6ad` (sprint), `31d057d` (session log), plus this log. Not pushed, no PR, nothing merged.
- **Built:** judging schema and RLS (11 new tables), panel scoring with drafts and lock, reputation-weighted peer votes (cap 3× median), AI rubric via provider interface (fake + Sonnet) with pg_cron + pg_net processor route, steelman bonus, mind-change picks, blending with tie-breaks and "needs attention" instead of silent reweighting, draft → review → publish → appeal workflow with audit trail (user ids only), public Verdict page, leaderboard, Dossier titles and awards, admin `/admin/judging`, four judging emails, gold set (DRAFT) and `npm run eval:judging`, `npm run seed:judging`.
- **Results (local, fake AI):** typecheck, lint, build clean; unit 176, RLS 191, Playwright 17 pass; Verdict page 1.55s and leaderboard 1.51s on throttled phone. Eval on the fake provider fails overall, as expected; `--real` not run (no key).
- **Hosted:** nothing applied. No new dependencies.
- **Overlaps:** trial merge with `legal-hardening` conflicts in `CHANGELOG.md` and `tests/rls/every-table-has-rls.test.ts` (keep both); with `sprint-4-audit-handle` only `CHANGELOG.md`.
- **Also:** local Supabase was reset and holds the seeded test Campaign; `/Users/deleolaoye/Project/TGS/.claude/launch.json` was added for local preview (not in the repo, safe to delete).
- **Detail:** `docs/SESSION_LOG_SPRINT_5.md`, `docs/DEMO_SPRINT_5.md`, `CHANGELOG.md`.

### Before 2026-11-11 (from git history)

- Sprints 1–4 merged to `main` (latest sprint PR: `delesax/TGS#4`, Sprint 4 hardening). Sprint 4 migrations applied to hosted.
- `eec5c7c`: email launch guide, sender and Confirm sign up template (`docs/LAUNCH_EMAIL_SETUP.md`).
- Owner docs: `docs/DRAFT_WORDING.md`, `docs/OWNER_DECISIONS.md`.
