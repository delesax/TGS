# Changelog

## Sprint 7 Phase B, batch 2b: judge prompt v2, load tests, backups, launch documents, CSP (13 November 2026). Awaiting review

Branch `sprint-7-batch-2b`, cut from `main`. **One new migration, tested on local Supabase only, not applied to hosted.** Nothing was written to hosted. Legal files, `src/lib/legal.ts` and the placeholder strings untouched. Plan: `docs/SPRINT_7_PLAN.md`.

- **W7, judge prompt v2** (decision D5; `prompts/judge-rubric.v2.md`, `20261113000700_judge_prompt_v2.sql`). The model is told it cannot browse or look anything up, must never treat a named study, figure, quote or link as verified, and lists up to three `unverified_claims`. Stored on `ai_rubric_scores.unverified_claims`. Judges and admins see them, with a simple count of links, figures and named studies, as "Check before relying" (never caps or changes a score). A Dispatch's source links are passed to the model as text only. The version is a database setting (`judging_settings.judge_prompt_version`, default 2, switch in Admin, Judging, function `set_judge_prompt_version`) so falling back to v1 needs no deploy. Judges read claims only through `dispatch_unverified_claims(p_campaign_id)` (`ai_rubric_scores` stays admin-only). Real evaluation, run once: all criteria pass (pooled mean error 0.62, within one point 93%, Spearman 0.92), a little less aligned than v1 (0.55, 97%, 0.93). Cost about 16p.
- **W9, load tests** (`scripts/load/`, `npm run load:test`, local Supabase only). Five scenarios, 20 checks, all pass; results in `docs/LOAD_TEST_RESULTS.md`. Finding: with the default daily AI cap of 1,000 a closed Campaign of 1,500 Dispatches is only partly judged on day one (800 scored, the rest wait; none fail).
- **Resend pacing.** Requests to Resend are now at least 200 ms apart (about 5 a second, the free limit is 10) and a 429 is retried once after Resend's Retry-After (capped at 5 s), with the same idempotency key. Unit tests in `src/lib/email/pacing.test.ts`.
- **W13, backups** (`scripts/backup-dump.sh`, `scripts/backup-restore-local.sh`, `docs/BACKUP_RESTORE.md`). The dump covers `auth` and `public` (a dump without `auth.users` is refused), is written to `~/TGS-backups` with mode 600, never prints or stores the database address, and writes a manifest of row counts. A full local restore rehearsal matched every row count and every content fingerprint. Not tested on hosted.
- **W14, documents:** `docs/LAUNCH_RUNBOOK.md` (with the owner's actions), `docs/GO_NO_GO.md`, `docs/INCIDENT_CHECKLIST.md`.
- **CSP, report-only.** `Content-Security-Policy-Report-Only` and `Reporting-Endpoints` headers; a rate-limited public route `/api/csp-report` stores only the directive and the blocked host in `system_events`. Nothing is enforced.
- **Tests:** typecheck and lint clean; see `docs/CLAUDE_LOG.md` for counts.
- **Migration order:** apply `20261113000700` first, then merge. It is additive. The code already live does not read the new column or setting.

## Sprint 7 Phase B, batch 2a: rules and migrations (13 November 2026). Awaiting review

Branch `sprint-7-batch-2a`, cut from `main`. **Four new migrations, tested on local Supabase only, not applied to hosted.** Nothing written to hosted. Legal files and the placeholder strings untouched. Plan and the owner's decisions: `docs/SPRINT_7_PLAN.md` ("Decided 13 Nov").

- **W4, who may vote** (`20261113000300_voter_eligibility.sql`). An account must be at least 48 hours old (`judging_settings.min_voter_account_age_hours`, an admin setting) before its peer votes, steelman confirmations and mind-change picks are accepted, measured from `profiles.created_at` at the moment of the action. Panel judges assigned to the Campaign are exempt (an admin chose them). Steelman confirmations are capped at 3 per person per Campaign (`max_steelman_confirmations`; judges included). In the Verdict, mind-change picks are now weighted like peer votes (`voterWeights`, reputation-weighted and capped) and earn credit only if the position change spans at least `min_position_span_hours` (24) between the recorded before and after. Clear refusal messages for each. **Also fixes a Sprint 5 bug:** `save_judging_settings` had an UPDATE with no WHERE clause, which Supabase's API refuses, so saving the judging settings from the admin page could not have worked; found by the new Playwright check.
- **W5, integrity signals** (`20261113000400_integrity_signals.sql`). Admin-only `admin_integrity_signals()` and the page `/admin/signals`: vote concentration, mutual votes, shared targets, burst voting, sign-up bursts on one invite, accounts sharing one mailbox (no address shown), reciprocal picks and steelman confirmations. Read-only flags for people: nothing changes a score, a weight or an account, and no IP address is used. Flags for a Campaign also appear on its draft Verdict as "For review", which does not block publishing. `judging_inputs()` replaced (same signature) to carry them.
- **W10, invite binding** (`20261113000500_invite_email_binding.sql`). Optional `invites.invited_email`: when set, only that address can sign up with the code (clear message on the form; the database refuses a mismatch). `npm run invite:create -- --email person@example.com`; invites now expire after 14 days unless `--days` or `--no-expiry` says otherwise. Unbound invites behave exactly as before; the sign-up kill switch still applies.
- **W15, email essentials** (`20261113000600_email_essentials.sql`). New settings, shown in Admin, Settings with audit entries: essential emails only (on by default; kept: moderation outcomes, Verdict published, appeal outcomes, judge assigned, voting open) and a global daily cap of 60 app emails. Cut kinds are not queued; queued ones are skipped, not left waiting; at the cap, essential ones wait until after midnight. The audit table is in the plan.
- **D6 wording** set in `src/lib/switches.ts`.
- **Tests:** typecheck and lint clean; unit and RLS tests: see the log for counts; full Playwright run recorded in the log. New RLS suites for eligibility, signals, invite binding, email essentials and a grants test listing every Sprint 7 function (anon can run only the read-only `site_switches`). Test fixtures updated for two deliberate behaviour changes: test users are made three days old, and email-queue tests turn essentials-only off.
- **Migration order:** apply the four migrations first, then merge the code. Behaviour that starts the moment they are applied (and is intended): accounts under 48 hours old cannot vote, confirm or pick; non-essential app email stops being queued.

## Sprint 7 Phase B, batch 1: launch safety (13 November 2026). Awaiting review

Branch `sprint-7-phase-b`, cut from `main`. Plan: `docs/SPRINT_7_PLAN.md`; click-through: `docs/DEMO_SPRINT_7.md`. **Two new migrations, tested on local Supabase only, not applied to hosted.** Nothing was written to hosted. Legal files and the placeholder strings were not touched.

- **W3, open redirect fixed.** `safeNextPath` now refuses any control character (tab, line break, NUL) or backslash and checks the result stays on our own origin; before, `/\t/evil.com` slipped through (and `new URL()` read it as `https://evil.com/`). Tests added.
- **W1, kill switches** (`20261113000100_site_switches.sql`). Admins can pause posting, sign-ups and emails from Admin, Settings, with a required reason and an audit entry; no deploy needed. Posting is refused by a database trigger on `dispatches`, sign-ups by a trigger on `auth.users` (so the Auth API cannot get round the form), emails by the processor (they stay queued). A banner shows under the header while posting or sign-ups are paused. The wording is in one file, `src/lib/switches.ts`. The existing AI switch is unchanged.
- **W2, rate limiter and event log** (`20261113000200_rate_limits_events_health.sql`). Postgres counters (`rate_limits`, subjects are user ids or SHA-256 hashes) wired into sign-in (per IP and per email), sign-up, password-reset request (over the limit it answers exactly as if it had sent), report, follow, reaction and position. Per-IP limits are generous on purpose (a pilot class shares one address); values are in `src/lib/rate-limit-config.ts`. If the limiter itself fails, requests are allowed. Our own `system_events` log (kind, short code, counts only, 30 days) records rate-limit trips and processor failures; a nightly job prunes both tables.
- **W6, health.** Public `GET /api/health` (200 `{"ok":true}` or 503 naming only the failing check). Admin page `/admin/health`: email, AI scoring and moderation queue sizes and ages, AI calls today against the cap, switches, last run of every scheduled job, and recent events.
- **W8, injection tests.** One corpus (`evals/injection/corpus.json`, 13 strings) run through all seven AI calls: the text must stay inside the untrusted block, no block can be closed early, answers that obey the injection are discarded. Small hardening found by the test: a writer can no longer fake our "Context (from TGS, trusted)" header inside a block.
- **W11, HSTS** header (one year, this host only).
- **W12, patch upgrades:** `next` 16.4.3 to 16.4.6, `react` and `react-dom` 19.3.0 to 19.3.1, `eslint-config-next` 16.4.6, `@supabase/supabase-js` 2.118 to 2.119. `npm audit --omit=dev`: 0 vulnerabilities.
- **Tests:** typecheck and lint clean; 610 unit and RLS tests pass (new: switches, limiter, events, health, injection, redirect); full Playwright suite 47 passed (4 new in `tests/e2e/switches-health.spec.ts`).
- **Not in this batch (waiting on owner decisions or later batches):** W4 vote eligibility, W5 integrity signals, W7 judge prompt v2, W9 local load tests, W10 invite binding, W13 backup procedure, W14 runbook and checklists, CSP.
- **For the owner / legal (parked):** the limiter keeps a SHA-256 hash of an IP address and of sign-in and reset email addresses for up to two days. The privacy policy and retention wording are legal-hardening territory and were not changed; please have them reviewed.

## Header: "Sign out" no longer wraps at desktop widths (12 November 2026). Awaiting review

Branch `header-signout-wrap`, cut from `main`. **No migrations, nothing applied to hosted, no new dependency.**

- **Bug:** an admin has seven header links (Home, Campaigns, Leaderboard, Dossier, Admin, Account, Sign out). With the logo they need about 1,040px, but the header was capped at the same 896px as the page, so at every desktop width "Sign out" dropped onto a second row and pushed the search box down.
- **Fix** (`src/components/site-header.tsx`): from the `lg` breakpoint (1024px) the header row and the search row use `max-w-6xl` instead of `max-w-4xl`, the logo no longer wraps or shrinks, and the search box stays 896px wide. Below 1024px nothing changed; at 375px the header measures the same as before (330px tall, logo at 14px, links from 77px).
- **Trade-off:** from 1024px the header is wider than the page content below it, so the logo sits further left than the page text.
- **Known limit:** the admin header needs about 1,040px, so at exactly 1024px "Sign out" still wraps as before. It fits from 1080px.
- **Tests:** `tests/e2e/header.spec.ts` (5 Playwright tests): as an admin at 1080, 1280, 1440 and 1920px all seven links share one row, the search box sits directly below and the header stays under 150px tall; at 375px the logo stays above the links and nothing overflows. Before the fix the first three failed at 1280, 1440 and 1920px (Sign out 58px lower than the other links). Full suite: 30 Playwright, 372 unit tests, typecheck and lint clean.

## Password recovery (12 November 2026). Awaiting review

Branch `forgot-password`, cut from `main`. **No migrations, nothing applied to hosted, no new dependency.** The owner must also add the "Reset password" email template and check the redirect URL in Supabase (steps 12 and 12b of `docs/LAUNCH_EMAIL_SETUP.md`).

- **"Forgot your password?"** link on `/login`; `/forgot-password` takes an email address and calls `resetPasswordForEmail` with a redirect built from `NEXT_PUBLIC_SITE_URL` (`/auth/confirm?next=/reset-password`).
- **No account enumeration.** Every outcome (known address, unknown address, Supabase error including its own rate limit) lands on the same `/forgot-password/sent` page. The sign-up form's distinct rate-limit message is deliberately not used here, because it could reveal that an account exists; failures are logged by code only. The app has no rate limiter of its own (it relies on Supabase's, as sign-up does).
- **`/reset-password`** is reached from the email link through `/auth/confirm`, which now also handles recovery links (token link and code link). It needs the signed-in recovery session **and** a 15-minute httpOnly cookie that only a verified recovery link sets, so an ordinary signed-in session cannot change a password this way. The new password follows the sign-up rules (10 to 72 characters) and is typed twice. On success every session is signed out and the person goes to `/login` with a success message.
- **Expired or reused links** (and a direct visit to `/reset-password`) show a clear message with a link back to `/forgot-password`.
- **Tests**: 5 unit tests (`src/lib/recovery.test.ts`); 6 Playwright tests (`tests/e2e/password-reset.spec.ts`: same message for known and unknown addresses, bad address, emailed link end to end with the password rules and mismatch, old password stops working, link reuse, token link, garbled link, signed-in session cannot use the page; checked at 375px).

## Sprint 5: Judging and Verdict (11 November 2026). Awaiting review

Branch `sprint-5-judging`, cut from `main` at `eec5c7c`. **Not applied to hosted**: two new migrations, tested on local Supabase only. **No real AI call was made**: every test, the seed and the evaluation ran on the fake provider. Full details, decisions and the owner checklist: `docs/SESSION_LOG_SPRINT_5.md`; click-through: `docs/DEMO_SPRINT_5.md`.

- **Migrations** `20261111000100_judging_schema.sql` and `20261111000200_judging_functions.sql`. New tables (all with row-level security): `judging_settings`, `judge_assignments`, `panel_scores`, `peer_votes`, `steelman_flags`, `mind_change_picks`, `ai_rubric_jobs`, `ai_rubric_scores`, `verdicts`, `verdict_appeals`, `reputation`. `awards` gains `verdict_id` and `dispatch_id`. Two CHECK constraints widened (`ai_usage.feature`, `email_outbox.kind`); `ai_reserve_call()` recreated with the two judging features. Nothing dropped.
- **Panel**: admins assign judges by handle; judges see only assigned, closed Campaigns, score each Dispatch 1-5 on logic, evidence, originality and responsiveness, save drafts, and submit, which locks the scores for every role. Nobody, admins included, reads a judge's scores before they submit.
- **Peer votes**: participants only, never their own Dispatch, one per Dispatch, 5 vote credits, from the close for 72 hours. Weighted 1 + log2(1 + reputation points), capped at 3x the median voter.
- **AI rubric** (Sonnet, `prompts/judge-rubric.v1.md`): four criteria plus a steelman check, queued and run by `/api/judging/process` (pg_cron + pg_net + shared secret), idempotent per Dispatch and prompt version, counted against the global daily AI cap (stops at 80%, like nudges), admin override with a reason.
- **Steelman bonus** up to +5: AI-detected and confirmed by at least two other people; never self-awarded. **Mind-change**: "this changed my mind" picks credited only from people whose before/after position moved.
- **Blend**: every part normalised to 0-100, weights snapshotted into the Verdict, documented tie-breaks; a missing part is never reweighted: the draft is marked "needs attention" and cannot be published until an admin fixes it or overrides the weights with a reason.
- **Verdict workflow**: draft computed automatically at close + 96 hours (or by an admin), templated rationale (optional AI wording, off by default, marked AI-assisted), admin review, recompute, publish (Grand Strategist, four awards, reputation, leaderboard, emails), 7-day appeal window, final. Versioned: a recompute discards, a revised Verdict supersedes. Every compute, edit, publish, appeal and decision is audit-logged by user id, never handle.
- **Pages**: `/campaigns/[slug]/verdict`, `/campaigns/[slug]/vote`, `/judging`, `/judging/[campaignId]`, `/leaderboard`, `/admin/judging` (status board, settings, weights) and `/admin/judging/[campaignId]`; titles and awards on Dossiers.
- **Emails**: judge assigned, voting open, Verdict published, appeal outcome (existing outbox and preferences).
- **Gold set** `evals/judging/gold-set.json` (30 synthetic Dispatches, DRAFT labels) and `npm run eval:judging` (also `eval:judge`), with `--real` for the model.
- **Seed** `npm run seed:judging`: 12 users, a closed Campaign, panel, votes, picks, fake AI scores and a draft Verdict; one run at a time, repeat runs write nothing.
- **Tests**: unit, RLS and Playwright suites green; see the session log for counts.

## Legal hardening and launch decisions (7 November 2026). Awaiting review

Branch `legal-hardening`, cut from `origin/main` at `eec5c7c`. **Six migrations written, none applied to hosted** (list below). Branch `sprint-4-audit-handle` is **not merged**, so its migration `20261104000500` is not in this branch (it matters for one sentence on the delete page; see the session log). Built from `docs/LEGAL_HARDENING_BRIEF.md`; the internal write-up is `docs/SESSION_LOG_LEGAL_HARDENING.md`. Not legal advice: a solicitor still reviews it. Self-service deletion stays OFF and the DRAFT banners stay.

### Migrations (written, not applied to hosted)
`20261107000100_signup_consents`, `20261107000200_positions_consent`, `20261107000300_anonymise_text_copies`, `20261107000400_privacy_requests`, `20261107000500_retention_jobs`, `20261107000600_launch_decisions`.

### Added
- **One place for legal facts** (`src/lib/legal.ts`): company name, number, registered office, ICO number, mailboxes, versions, `reviewed` flag. Empty values show a highlighted `[to be added]`. The DRAFT banner now says "this page is complete but has not yet had its final legal review". A Vitest gate fails if `reviewed` is switched on while any fact is missing or any page shows a placeholder. The footer shows the company block and links to Terms, Privacy, How we use AI, Accessibility and Contact us about your data.
- **Three sign-up boxes** (18 or over; Dispatches are public and stay without your name; terms and privacy), each required, each with its own error, checked again on the server and in the database trigger, which now stores the terms and privacy versions and when the public-record acknowledgement was given.
- **Private positions need explicit consent.** Recording a position is optional and asks for consent the first time. Posting a Dispatch no longer needs a position, and a private position is **no longer copied onto a Dispatch** (it used to be, which made it public). In an Oxford-style Campaign the author chooses For or Against when posting. Clear a position; "Stop recording my positions" on the Account page deletes open positions, unlinks closed ones, clears the consent and audits it. The mind-change measure reads only `consented_positions`.
- **Legal pages rewritten** with the brief's wording: privacy policy, terms, How we use AI, a new accessibility statement, the delete-my-account pages, the compose-box AI note. The cookie table comes from a real audit.
- **Deletion removes every copy of the handle** it can: `anonymise_profile()` now scrubs award rationales, decision reasons, flags, appeal and report text, and other people's queued reply emails. One shared `deleteAccount()` serves both the page and the by-hand script `npm run account:delete -- --email X [--confirm]` (dry run by default).
- **Privacy requests and complaints:** a form at `/privacy/contact` (nine request types, honeypot, 5 a day per address, acknowledgement email at once, alert to the privacy mailbox), a closed table with a one-month clock, and `/admin/privacy-requests` (due dates highlighted, status and outcome note, audited by request id only).
- **Retention jobs** (pg_cron, daily, off the hour): never-confirmed sign-ups 30 days, AI decisions 12 months, reports and flags 12 months after resolved, coach feedback 90 days, emails 30 days, passkey challenges 1 day, privacy requests six years after closed, audit record six years through one deliberate, tested exception to the append-only rule. Each writes one `retention.purged` audit entry (count only) and never deletes anything linked to an open flag, appeal or privacy request.
- **"Download my data" is complete** (consents and versions, invite code, passkey names, decisions about your Dispatches and handle, coach records, privacy requests...) and leaves out other people's data (reports about you, reviewer identities, who follows you, moderation flags).
- **Emails:** every template says who sent it, why, carries the company block, and optional ones have a working stop link. A footer for the Supabase-sent emails is in `docs/legal/AUTH_EMAIL_FOOTER.md` (you paste it in the dashboard).
- **Internal legal records** in `docs/legal/`: data map, processors, DPIA, LIA, Online Safety Act record, cookies, retention, two runbooks and a breach log.
- **Launch decisions:** AI global daily cap 3,000 to 1,000 (migration plus audit entry); Bank of England, Rosebank and assisted-dying topics updated in the topics file; `npm run topics:load -- --concurrent`; a one-off dry-run-by-default script for the hosted DRAFT Campaigns; content notes may now be 1,000 characters; `docs/OWNER_DECISIONS.md` and `docs/LEGAL_WORDING.md`.

### Fixed along the way
- Search showed "By @null" for a deleted author; the admin queue showed "@a deleted Strategist". Both now say "a deleted Strategist".
- The handle was written into the append-only audit log when chosen (`profile.handle_set`). It no longer is.

### Tests
Unit 174, RLS 238, Playwright 29, all passing on a freshly reset local database; typecheck and lint clean. `eval:moderation` and `eval:coach` (fake provider) run: 100% recall, 0% false holds. New tests cover the gate, consent trigger, privacy requests, retention (with back-dated rows and exclusions), the audit exception, the export, the delete script, the draft-topic script, email footers and stop links, and the pages at 375px.

## Audit log: no handles (7 November 2026). Awaiting review

Branch `sprint-4-audit-handle`, cut from `main` at `cbc3d7a`. **Not applied to hosted.**
- **Migration `20261104000500_audit_no_handle.sql`.** `decide_held_handle()` used to write the Strategist's handle into `audit_log.details`. The audit log can never be edited or erased, so that handle would outlive an account deletion. The entry now holds only `flag_id` and `reason` (the Strategist is already identified by `target_id`). Nothing else in the function changed. 5 new RLS tests; they fail against the old function.
- **Not fixed here (found while checking):** onboarding (`src/app/onboarding/actions.ts`) still writes `{ handle }` into `audit_log` as `profile.handle_set`, and entries already written by either path cannot be changed. See the pull request text.

## Sprint 4 hardening (6 November 2026). Awaiting review

Branch `sprint-4-hardening`, cut from the `sprint-4` head `4ba8692` because PR #3 had not been merged when it was started. Merge PR #3 first; this branch's own pull request then shows only the changes below. **Not applied to hosted.**

- **Tombstones are permanent** (`20261104000400_tombstone_hardening.sql`). The trigger that already stopped a deleted account getting a handle now also refuses to clear `deleted_at` once set, for every role, including the service role and direct SQL. `anonymise_profile()` and `before_auth_user_deleted()` are unaffected (7 new RLS tests cover both, including deleting a sign-in).
- **Moderation queue confirmations.** After a decision, the queue refreshes at once: the decided item leaves the list and the count drops, while a "Just decided" log above the list keeps each confirmation (it survives the refresh, can be dismissed, and is sticky so it stays in view on a phone). An item that stays in the queue after "Keep held" can be decided again straight away. A new Playwright check at 375px covers it, including that the page is never reloaded.
- **`npm audit`.** No non-breaking fixes exist, so nothing changed. Eight moderate advisories remain, all one chain (`minimatch` denial of service, reached through `eslint-config-next` → `typescript-eslint`). Development tooling only, not shipped. The only fix is `--force`, which downgrades `eslint-config-next`: not applied.
- **Owner docs** (separate commit): `docs/DRAFT_WORDING.md` (all DRAFT copy, verbatim) and `docs/OWNER_DECISIONS.md` (the nine Sprint 4 and four launch-topic decisions, their defaults and how to change them).

## Sprint 4: AI moderation, coach and admin (2 November 2026). Awaiting review

Branch `sprint-4`, cut from `main` at `4a573ec` (Sprint 3 merged). **Both migrations were applied to hosted on 3 November** at the owner's request, after a dry run that listed exactly those two (see DEMO.md). A second dry run confirms hosted is up to date. **No real AI call was made** by anything in this sprint: every test, the seed and the evaluations below ran on the built-in fake provider. The owner supplies `ANTHROPIC_API_KEY` later; until then hosted Dispatches follow the fallback rule below.

### Review fixes (migration `20261104000300`, added after the first review)
The two earlier Sprint 4 migrations were already applied to hosted, so these are a third, new migration.
- **Settings columns hidden from browsers.** The AI and account-deletion columns of `community_settings` can no longer be read by signed-out visitors or signed-in Strategists (including admins' own browser sessions). Every earlier column stays readable. Admins read the whole row through `admin_community_settings()` (role checked inside); the server uses the service role. The Settings page, the console home, the delete-account page and the AI-help check were changed to read this way.
- **Tombstones can never get a handle again.** A trigger refuses a handle on any profile with `deleted_at` set, even for the service role. `getViewer()` treats such an account as signed out, and `chooseHandle` refuses it (and its update also requires `deleted_at is null`).
- **`anonymise_profile()` also deletes** the account's coach and nudge records.
- **Nudges and coaching stop at 80% of the daily AI cap**, so they cannot use up the calls screening needs (whole-number arithmetic, no rounding). Screening keeps the full cap.
- **`judging_weights`:** everything is public except `created_by`.
- **`queue_moderation_email()` comment corrected:** its dedupe key ends in a timestamp, so it does not dedupe; `apply_dispatch_screening()` is what stops repeated screening results queuing twice. (Comment only; behaviour unchanged.)
- Tests: 33 new RLS tests and 4 new unit tests. Unit 141, RLS 155, Playwright 15 all pass on a freshly reset database.

### Account deletion: the design (written before building it)
- **Anonymise, never delete Dispatches.** The profile row becomes a *tombstone*: handle, display name, expertise, bio and mute details are cleared and `deleted_at` is set. It keeps its id, so Dispatches and awards still point at it and show as by "a deleted Strategist".
- **Detached from `auth.users`.** `profiles` used to cascade from `auth.users`, so deleting a user in the Supabase dashboard would have deleted their Dispatches (the Sprint 3 risk). The cascade is replaced by a trigger that runs *before* any auth user is deleted, however it happens: it anonymises the profile, and removes the row only when no Dispatch or award depends on it.
- **No cascade into Dispatches, ever.** `dispatches.author_id` and `awards.profile_id` now *restrict*: deleting a profile that has Dispatches fails (an RLS test proves it).
- **Removed outright:** email address and sign-in (the auth user), passkeys, reactions, follows both ways, email settings and queued emails, coach ratings, and positions on Campaigns still open or scheduled.
- **Kept, linked to nobody:** positions on closed Campaigns move to `anonymous_positions` (owner decision 8). The audit log keeps the account's id as a record of who acted (no personal data).
- **Self-service flow** (`/profile/delete`): download your data first, a plain summary of what goes and what stays, type your handle, re-enter your password, tick to confirm. Audit-logged (`account.deleted`). Behind `account_deletion_enabled`, **off by default**; every sentence is marked DRAFT.

### Added
- **Migrations** `20261104000100_ai_moderation.sql` and `20261104000200_account_deletion.sql`. Earlier migrations untouched; the database rebuilds from scratch. Replaced, not dropped: two CHECK constraints widened (`ai_decisions.subject_type`, `email_outbox.kind`), three foreign keys changed from cascade to restrict or removed (above), `email_recipients()` recreated with one more column, two policies changed with `ALTER POLICY`. No table, column or row is dropped.
- **The AI module** (`src/lib/ai`, server only):
  - One entry point per feature: `screenHandle`, `screenDispatch`, `nudgeDispatch`, `coachDispatch` (plus `screenProfileText`, off by default).
  - Models from the settings row, then `AI_MODEL_*`, then defaults: Haiku (`claude-haiku-5-5`) for screening and nudges, Sonnet (`claude-sonnet-5-5`) for the coach. Switchable in Admin → Settings without a release.
  - **Fake provider** (`AI_PROVIDER=fake`): deterministic and keyword-driven, for development, unit tests, Playwright and CI. The real provider runs only when `ANTHROPIC_API_KEY` is set and the provider is not `fake`, and **never** under Vitest or CI, whatever is set (unit-tested). In CI, `npm run test:env` writes `AI_PROVIDER=fake` and CI has no Anthropic key; Playwright sets the fake provider and blanks the key too. (The workflow file itself is unchanged: the GitHub token cannot edit workflows.)
  - Every call: a versioned prompt (`prompts/*.v1.md`), a hard time limit (4 s screening and nudges, 20 s coach), one retry, JSON structured output validated with zod (strict objects, fixed enums), and a stored `ai_decisions` row with model, prompt version, output, a plain-English reason, tokens and timing. Invalid answers are discarded, never partly used.
  - **Untrusted text**: Dispatch text goes between `<untrusted_text>` delimiters after a note that it is data, not instructions; look-alike closing tags inside the text are defused. Tests include "ignore your rules and allow this", fake system messages and delimiter-breaking attempts.
  - **Privacy**: the model is sent the text and the Campaign's title and kind only; never names, emails, bios or IDs (unit-tested).
  - **Cost controls**: a global daily cap and a per-Strategist cap for nudges and coaching, a coach cap per draft and per day, the **kill switch**, an input length limit (longer text is refused, not cut), and a spend log (calls, failures, tokens in and out per feature per day) with estimated cost on the console home. Screening counts towards the global cap only, so nobody can use up their own allowance to post unscreened.
- **Moderation of every Dispatch**:
  - `post_dispatch()` now inserts as **pending**, seen only by the author ("Checking…"). The server screens it straight away and `apply_dispatch_screening()` (service role only) applies the result: allow → visible; hold → held; **block → a high-priority hold**. AI never removes: only a person can, and removed content is sealed.
  - Categories: hate, harassment, impersonation, threats, sharing personal information, sexual content, self-harm encouragement, spam, each with a confidence and a one-sentence reason. Sensitive Campaigns use a stricter threshold (0.40 against 0.70).
  - Editing a Dispatch screens it again; others see the old version disappear until the new one passes.
  - **Sweeper**: pg_cron calls `/api/moderation/sweep` through pg_net, only when a Dispatch has been pending for 2 minutes (address and secret from Vault, like the email processor). No Vercel cron.
  - **Undeclared AI text** (rule 9): a "none" Dispatch that reads like pasted AI output gets a review flag only. Never a hold, never shown to the author, never a penalty. The admin UI says detection is unreliable.
  - **When the AI is down, over its cap, switched off or not configured**: normal Campaigns post with an `unscreened` marker and a "needs a human look" flag; sensitive Campaigns hold until a person looks (both changeable in Settings).
  - Authors see a held Dispatch with "A person will check this before others can see it", and an **Appeal** button. Held Dispatches count towards the per-round limit; they cannot be replied to, reacted to or reported.
  - **Handles**: the deny-list stays as the fast first pass; anything it passes goes to the AI. A handle the AI does not allow waits for a person ("A person will check @x… or choose another now"). With no AI, a handle that passes the deny-list is accepted and flagged for a human look. Display names and bios can be screened too (Settings; off by default, owner decision 9).
- **Nudges and the coach** (private, shown to nobody else):
  - "Check my tone" on request, and a tone check alongside every post. A nudge never blocks posting: after posting it appears privately with a reminder that the Dispatch can still be edited for a few minutes. At most one per submit.
  - "Get feedback": clarity, evidence, steelman and tone, plus questions. **It never writes replacement text**: the prompt forbids it and a check discards any answer that offers a rewrite or quotes a long passage that is not the writer's own. 3 uses per draft, 10 a day.
  - Stored: the feedback (in `ai_decisions`) and a thumbs up or down with an optional comment (`coach_feedback`). **Never the draft.** The usefulness rate is on the console home.
- **One review queue** (`/admin/moderation`, replacing `/admin/reports`, which now redirects): held Dispatches, appeals, reports, unscreened items, possible undeclared AI text and held handles, most severe and newest first. Each shows the text (the sealed original when removed), the Dispatch it replies to and up to three replies, the AI's category, confidence, reason, model and prompt version, who reported it and why, and the appeal.
  - Actions: **release**, **keep held**, **remove** (sealed, "Removed by a moderator.", replies stay in their thread), **dismiss**. Every action needs a reason, writes `audit_log`, fills the `ai_decisions` override columns when the person decides differently from the AI, closes reports and flags, decides any open appeal, and emails the author in plain words.
  - **Appeals**: once per held, hidden or removed Dispatch, with a reason. The queue warns when the admin deciding the appeal also made the original decision, and the audit entry records it (`same_admin_as_original`).
  - **Email** for held, released, kept held, removed and appeal outcomes, through the Sprint 3 outbox with a new **moderation** preference (on by default) and its own unsubscribe link. Never the moderator's private reason.
- **Admin console** (`/admin`), all sections at 375px, role checked on the server, "Page not found" for everyone else (Playwright checks every page and the CSV export):
  - **Console home**: queue counts, AI spend for 14 days, coach usefulness.
  - **Campaigns**: each round's allowed Dispatch kinds are now in the form (at least one per round).
  - **Users**: handle, joined date, Dispatches, reports against, held or removed count, and **Mute posting** (reason required, reversible, audited, shown to the Strategist on Campaign pages). No bans or admin deletions.
  - **Settings**: every `community_settings` limit, email caps, reactions, the AI kill switch, fallback rules, caps, thresholds, model choices and the account-deletion switch. Every change is audited with before and after values (reactions now too).
  - **Judging weights** (rule 7): defaults 40/25/25/10, must add to 100, versioned (insert-only), audited. A Campaign takes the current version when it opens and can never change it afterwards. Only the editor is built; Sprint 5 reads `campaigns.judging_weights_version`.
  - **Audit log**: filter by who (handle or "system"), action prefix and dates; paged; **CSV export** (streamed, formulas defused).
- **Carry-over**: the Dossier pages through all your Dispatches (50 a page); `/profile/export` streams Dispatches in batches of 500 and now includes appeals and coach ratings. Reply and edit forms, and the AI help, load only when opened.
- **Privacy page**: a DRAFT section saying Dispatch text is processed by Anthropic to moderate and coach (owner decision 5).
- **`npm run seed:abuse`** (local only, same host check as `seed:debate`; idempotent): posts the 40 gold-set Dispatches through `post_dispatch()` as five test Strategists in two `[Test data]` Campaigns (one sensitive), screened by the fake provider.
- **Evaluations**: `evals/moderation-gold.json` (40 labelled: 15 clearly abusive, 10 borderline, 15 benign including sensitive topics; 4 prompt-injection attempts; fictional names only) and `evals/coach-samples.json` (20 drafts). `npm run eval:moderation` and `npm run eval:coach` use the fake provider unless run with `-- --real` and a key; the real run refuses to start if its worst-case estimate passes £5 and stops if spending does. Reports go to `evals/out/` (not committed).
- **`docs/LAUNCH_EMAIL_SETUP.md`**: numbered owner steps for Resend, Supabase custom SMTP, the Vercel variables, the custom domain, the Vault secrets (email and moderation) and a test checklist.

### Cost flag: Sonnet for the coach
CLAUDE.md names Sonnet for coaching; docs/PLAN.md names Haiku only. Sonnet 5.5 costs **about 20 times** Haiku 5.5 per token ($2 / $10 against $0.10 / $0.50 per million in and out). A coach call is roughly 1,500 tokens in and 600 out: about **$0.009 on Sonnet** against $0.0005 on Haiku. At 100 Strategists using all 3 daily coach calls, that is about $2.70 a day (roughly £65 a month) on Sonnet, or under £4 a month on Haiku. To switch, enter `claude-haiku-5-5` as the coach model in Admin → Settings. Screening and nudges are on Haiku and cost pennies a day at pilot size.

### Defaults chosen for the owner decisions (all changeable without a release)
| # | Decision | Default built | Where to change |
| --- | --- | --- | --- |
| 1 | Fallback when the AI is unavailable | Normal Campaigns: post, marked unscreened, flagged for a human look. Sensitive Campaigns: hold until a person looks | Settings → AI |
| 2 | Undeclared-AI-text flag | Soft flag for review only, on | Settings → AI |
| 3 | Coach model; may it suggest wording? | Sonnet (`claude-sonnet-5-5`); **never** suggests wording (enforced in code) | Settings → AI (model); wording rule is code |
| 4 | Cost caps | 3,000 calls a day for everyone; 40 nudges and coach calls per Strategist a day; coach 3 per draft and 10 a day; evaluation budget £5 | Settings → AI; `CAP_GBP` in the eval scripts |
| 5 | Privacy policy wording on AI processing | DRAFT paragraph on `/privacy`, marked for legal review | `src/app/privacy/page.tsx` |
| 6 | Retention of `ai_decisions` and coach feedback | No default was stated, so the most conservative option: **nothing is deleted automatically** until you decide (deleted accounts' handle and name decisions are scrubbed) | needs a decision, then a small job |
| 7 | Appeals with one admin | Allowed, with a warning on screen and `same_admin_as_original` in the audit log | — |
| 8 | Account deletion | Built, **off**; all wording DRAFT; positions on closed Campaigns kept unlinked | Settings → Accounts |
| 9 | Handle screening scope | Handles only; display names and bios can be switched on | Settings → AI |

Thresholds also default to 0.70 (normal) and 0.40 (sensitive), and the AI input limit to 6,000 characters.

### Checked
- **Lint and typecheck clean. Unit 137 (35 new), RLS 122 (30 new), Playwright 15 (6 new) all pass** on a freshly reset local database. `npm run build` succeeds (Playwright builds before it runs).
  - Unit: provider choice (never real under Vitest or CI), model resolution, prompt loading, delimiter defusing, outcome thresholds, holds and allows, injection resistance, invalid and extra-field JSON discarded after one retry, timeouts, provider errors, kill switch and caps without calling the provider, input limit, privacy of what is sent, undeclared-AI flag, nudge and coach rules and caps, rewrite detection, handle deny-list first, the gold set, and the moderation email wording.
  - RLS: pending, held and removed never visible to others; screening and the sweeper's claim service-role only; idempotent screening; edit re-screens; held Dispatches cannot be replied to, reacted to or reported, and count towards the limit; fallback both ways and by setting; kill switch and caps; undeclared-AI flag only; `ai_decisions`, flags and usage admin-only; only admins moderate, and never without a reason; override columns, audit and email on release; remove seals; dismiss; appeals once only, author-only, same-admin marked; mute admin-only, enforced, private, reversible; coach feedback private with no draft column; judging weights sum, admin-only, insert-only and locked once open; deletion service-only, anonymises, keeps Dispatches, archives closed positions, refuses a profile delete that would touch Dispatches, off by default; every new table has RLS.
  - Playwright at 375px with the fake provider: post → held → appeal → admin release with audit trail; nudge and coach with a rating; mute; deletion off then on; admin pages hidden from non-admins; the sweeper's secret and re-screening. No sideways scrolling on every new page.
- **Moderation evaluation (fake provider only)**: recall on clearly abusive 100% (15 of 15), false holds on benign 0% (0 of 15), borderline 0 held and 10 visible, all four injection attempts handled as labelled. **These are the fake provider's numbers, not Haiku's**: the real `eval:moderation -- --real` needs your key and was not run.
- **Coach evaluation**: the table for your 1-to-5 ratings is produced by `npm run eval:coach`; the "average 4 or better" test needs the real model and your ratings.
- **Throttled performance** (Slow 4G, 4× CPU, 20-Strategist debate): first visit LCP 1.48 s, buttons work from **3.07 s** (Sprint 3: 3.08 s), 278 KB; returning Strategist LCP 0.96 s, interactive 1.03 s. Moving the reply/edit forms and AI help out of the first load did not move the number: what remains is React and Next.js's own runtime (about 150 KB compressed), which only a rewrite would change. Not started, as asked.

### Not done / known issues
- **Migrations applied to hosted (3 November).** Still to do on hosted: `MODERATION_PROCESSOR_SECRET` in Vercel and the two moderation Vault secrets (`docs/LAUNCH_EMAIL_SETUP.md`, steps 15 and 18).
- **Hosted has no AI until you add `ANTHROPIC_API_KEY`** (and leave `AI_PROVIDER` empty). Until then every Dispatch takes the fallback: visible and flagged in normal Campaigns, held in sensitive ones.
- The real-model evaluations (`eval:moderation -- --real`, `eval:coach -- --real`) have not been run; the "100% held" and "coach rated 4/5" done-criteria need them.
- ~~A decided item stays in the queue with its confirmation until the page is reloaded.~~ Fixed in the hardening branch (see below).
- `/profile/export` streams Dispatches, but edit history and sealed text for them are gathered before the end of the file; fine at pilot size.
- Handles cannot be changed after onboarding, so "screen again when a handle changes" applies only to choosing one.
- Undeclared-AI detection is a weak signal by design; expect both misses and false flags.
- `npm audit` still reports moderate advisories in development tooling only.

## Sprint 3: Dispatches and discussion (2 November 2026). Approved, merged (pull request #2)

Branch `sprint-3`, cut from `main` after pull request #1 (Sprint 2) was merged. **Closed test only.** Automated screening arrives in Sprint 4, so do not use this with real invitees yet.

### Sprint 2 carry-over (separate commits, done first)
- **Invites are now used up on email confirmation, not at sign-up** (`20261103000100`). Signing up *reserves* a place for 24 hours, so two people cannot race for the last one; confirming the email turns the reservation into a use and writes `invite.consumed` to the audit log. An unconfirmed sign-up older than 24 hours releases its place. If that person confirms later and the invite has filled up or been revoked, confirmation is refused with a clear message. Accounts created already confirmed (admin scripts) use the invite at once. Covered by 4 RLS tests.
- **GitHub Actions** moved to `checkout@v6`, `setup-node@v6` and `upload-artifact@v6`, all of which run on Node 24.
- **375px overflow**: a new element-level check names anything that sticks out past the right edge. It confirms the Campaign page buttons fit, and it caught one new overflow this sprint (the "Following @handle" button), which is fixed.
- **Found and fixed: admin-only Campaign columns were readable through the API** (`20261103000110`). `notes`, `brief` (the hidden topic facts), `needs_owner_decision` and `created_by` were never shown on a page, but anyone could read them through the API. Browsers now get only the public columns. Admins read the private ones through `campaign_admin_fields()`, which checks the role claim.

### Added
- **Migrations** (`20261103000200` Dispatches and discussion, `20261103000300` email). Earlier migrations are untouched, and the database still rebuilds from scratch. No DROP or TRUNCATE. Two Sprint 1 Dispatch policies are switched off with `ALTER POLICY` and renamed to say why.
- **Dispatches**:
  - Three kinds: argument, rebuttal and evidence. A rebuttal must answer a Dispatch in the same Campaign. Evidence needs at least one link. An argument carries no links.
  - Each Dispatch records its Campaign, its round, and the author's position from `campaign_positions`. In an Oxford-style Campaign you must be For or Against.
  - Posting goes only through `post_dispatch()`, which checks, by server time:
    - you are signed in and have a handle;
    - the Campaign is open;
    - the current round accepts that kind of Dispatch;
    - you have declared your AI use;
    - the text is within the length limit;
    - you are under the per-round limit and past the cooldown.
  - Browsers can no longer insert, update or delete Dispatches directly.
- **Rounds** now say which kinds they accept (`campaign_rounds.allowed_kinds`, default all three). `save_campaign()` stores it.
- **Edit and withdraw**:
  - You can edit your own Dispatch for 5 minutes. Each earlier version goes to `dispatch_revisions` (only you and admins can read it), and the Dispatch shows "edited".
  - Withdrawing shows "Withdrawn by author." The original is kept in `dispatch_sealed_content` (admins only) for judging and the audit trail.
  - Every create, edit, withdraw, hide and restore is written to `audit_log` by a trigger. Nothing is hard-deleted.
- **AI-use declaration**:
  - Every Dispatch must say none, assisted or generated. There is no default.
  - Each Dispatch shows a label in plain words ("Written without AI", "Written with AI help", "Mostly written by AI") with a one-line explanation and a link to the AI-use page.
  - Stored as the existing `ai_use_declaration` enum. `screenDispatch()` in `src/lib/ai` is the Sprint 4 hook for detecting undeclared AI text. It currently allows everything and records nothing.
- **Source links**:
  - http and https only; `javascript:`, `data:`, other schemes, embedded passwords and spaces are refused.
  - Tracking codes (`utm_*`, `fbclid`, `gclid` and similar) are removed.
  - Each link stores its URL, host and an optional title, up to 5 per Dispatch.
  - Links open in a new tab with `rel="noopener noreferrer nofollow ugc"`, and the website name is always shown. Nothing is fetched from the linked site.
- **Threads**:
  - Rebuttals nest under the Dispatch they answer, 4 levels deep. Deeper replies continue at level 4 with a "Replying to @handle" link.
  - Branches fold and unfold; the top two levels start open.
  - Threads load 20 at a time with "Show more". The page never loads the whole Campaign at once.
  - A Dispatch's position is shown by word, icon and border style (solid, dashed or dotted), not colour alone.
- **Live updates**: every 30 seconds while the tab is visible, and whenever you return to it, the page checks for new Dispatches and shows "N new Dispatches. Show". This uses polling, not Supabase Realtime.
- **Compose box**: each state has plain wording and a way forward:
  - Campaign not open yet, or closed;
  - not signed in, or no handle yet;
  - no position recorded, or Undecided in an Oxford-style Campaign;
  - between rounds, or the round accepts rebuttals only;
  - per-round limit reached, or cooling down (with a live count);
  - offline (the text is kept on the device).

  There is also a live character count, and you never lose what you typed.
- **Reactions**:
  - Persuasive, Well sourced and Fair point, one of each per Strategist per Dispatch.
  - Not on your own Dispatch, and not after the Campaign closes. Tapping again takes a reaction back.
  - The set lives in the admin-editable `reaction_types` table. Counts are kept on the Dispatch for display only.
  - A schema test (`reactions-not-judging.test.ts`) fails if any function, view or table other than the reaction code reads reactions, so they can never feed a Verdict.
- **Follow**:
  - You can follow Campaigns and Strategists. Posting in a Campaign follows it automatically.
  - Strategist pages (`/strategists/[handle]`) show recent public Dispatches and a Follow button. Signed-out visitors see only the handle and join date; signed-in Strategists also see the display name, expertise tag and bio.
  - The Dossier lists who and what you follow, privately.
- **Search**:
  - Postgres full text (English) over Campaign titles and summaries and over visible Dispatches; handles are matched by prefix. Withdrawn and hidden Dispatches are excluded.
  - Searching for Strategists is for signed-in Strategists only. Signed-out visitors get Campaigns and Dispatches, never a person, and the Strategists filter asks them to sign in. The handle search index is not readable by them at all, and `search_tgs()` skips that part for them instead of failing.
  - `search_tgs()` runs with the searcher's own rights, so row-level security applies; for example, drafts are found only by admins.
  - A search box in the header, a results page with filters (Everything, Campaigns, Dispatches, Strategists), highlighted matches, paging, and empty, loading, error and 4-second timeout states.
  - Every query uses its GIN index. Each took under 0.2 ms on the seeded debate.
- **Email notifications** (`src/lib/email`):
  - Events: a reply to your Dispatch; a Campaign you follow opens, changes round or closes; a Campaign you posted in or recorded a position on closes within 24 hours.
  - Database triggers and a pg_cron job queue events in `email_outbox`, each with a unique key so it is queued only once.
  - Once a minute, pg_cron calls the protected route `/api/email/process` through pg_net, only when something is due. The route's address and secret are read from Supabase Vault. There is no Vercel cron and no Inngest.
  - Rows are claimed with SKIP LOCKED, a stuck claim is retried after 10 minutes, and failures back off 5, 10, 20, then 40 minutes, giving up after 5 attempts. Each send carries an idempotency key, so a retry is not sent twice.
  - Replies wait 10 minutes and go out together as one digest. Each person gets at most 6 emails a day, the most urgent first; the rest wait.
  - Nothing is sent to an unconfirmed address.
  - Emails go through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set, and to Mailpit locally. If anything is missing, nothing is sent, the reason is logged, and emails wait in the queue.
  - Every email has plain-text and HTML versions with a language set, escaped content and project wording.
  - Every email has an unsubscribe link: one press on a confirmation page, so link checkers cannot unsubscribe people. Mail apps also get the standard one-click unsubscribe header.
  - **Email settings** page (`/profile/email`): three kinds of email, all on by default, plus "Stop all emails".
- **PWA**:
  - A web manifest and placeholder icons (navy and gold, marked PLACEHOLDER in `public/icons/README.md`).
  - A service worker that precaches only the offline page, the manifest and the icons, and caches Next.js build files. It never stores pages, API responses or anything personal (a test checks this).
  - A static offline page.
  - A small "Install the app" button in the footer that appears only when the browser offers installing, and stays away once dismissed. No push notifications.
- **Reporting and hiding**:
  - "Report" on every Dispatch, with a reason and optional details. Testers are told plainly that there is no automatic screening yet.
  - An admin queue (`/admin/reports`) where admins hide a Dispatch with a reason (kept in the audit log) or dismiss the reports.
  - A "Hidden Dispatches" list with Restore. Hidden content is sealed, never deleted.
- **Safety and legal**:
  - Sensitive Campaigns show their content note again before the compose box and the Dispatches, which stay folded until you choose to continue.
  - Financial and medical Campaigns show "Opinion, not advice" on the compose box and on every Dispatch.
  - **Download my data** (Account page) gives a JSON file of your profile, Dispatches with edit history, the original text of anything withdrawn or hidden, positions, reactions, follows, reports and email settings. Each export is audited.
  - **Delete my account** is proposed only (see the owner decisions below). The Account page says it is not switched on yet and how to ask for deletion by hand.
- **Dossier**: your Dispatches grouped by Campaign, with AI-use labels and withdrawn or hidden items marked; plus your Following list. The award and title placeholders stay.
- **Settings table**: `community_settings` (one row, admins edit, changes audited) holds the limits listed under Defaults below.
- **`npm run seed:debate`** (local only):
  - Refuses anything that is not local Supabase.
  - Creates 20 test Strategists (`debater01…20@example.test`, handles `Test_Amara…Test_Tamsin`) in a `[Test data]` Campaign with two rounds.
  - Adds 25 threads and 46 rebuttals (one exchange runs past depth 4), 165 reactions, varied AI use, example.org sources, and one withdrawn Dispatch.
  - Running it again changes nothing.
- **Tests**:
  - **Unit**: 24 new, 102 in total. They cover validation, limits, link cleaning, threading, edit and cooldown windows, error wording, email planning (digest, daily cap, preferences, retries), email templates and transport selection, and search highlighting.
  - **RLS**: 31 new, 92 in total.
    - Dispatches only through the functions, with every posting rule enforced.
    - No editing someone else's Dispatch; edit history and sealed content kept private.
    - Hidden and withdrawn content not exposed; moderator notes hidden.
    - Reports, reactions, follows and settings.
    - Search visibility, including that anonymous search never returns a person.
    - Anonymous visitors can read a profile's handle and join date only, never the display name, expertise tag, bio or search index.
    - Email preferences and outbox closed to browsers; each email trigger fires exactly once.
    - Every new table has RLS.
  - **Playwright**: 6 new, 9 in total, all at 375px.
    - The full post, reply, react, follow and search journey with the email arriving in Mailpit and the unsubscribe link working, then the same Strategist's page and a people search seen signed out.
    - The sensitive-Campaign gate.
    - No sideways scrolling on the Campaigns, Campaign, Dossier, Strategist, search and sign-in pages.
    - The offline page, and that no pages are cached.
    - Two throttled performance runs.

### Defaults awaiting your decision (all changeable without a release)
| Setting | Default | Where |
| --- | --- | --- |
| Reactions | Persuasive, Well sourced, Fair point | `reaction_types` |
| Edit window | 5 minutes | `community_settings.edit_window_seconds` |
| Withdraw | Allowed until the Campaign closes; original kept for judging | `withdraw_dispatch()` |
| Length limits | Argument 1,500, rebuttal 1,000, evidence note 600 characters | `community_settings` |
| Per round | 10 Dispatches per Strategist | `community_settings.max_dispatches_per_round` |
| Cooldown | 30 seconds between posts | `community_settings.cooldown_seconds` |
| Email daily cap | 6 emails per person per 24 hours | `community_settings.email_daily_cap` |
| Reply digest | Replies wait 10 minutes and go out together | `community_settings.reply_digest_minutes` |

### Checked
- **Full suite**: lint and typecheck clean; 102 unit, 92 RLS and 9 Playwright tests pass (re-run 2 November after the profile-privacy change).
- **Performance** (`tests/e2e/performance.spec.ts`; the 20-Strategist debate on Chrome's "Slow 4G" profile with 4x CPU slowdown, results in `test-results/performance.json`):

  | | HTML received | Debate on screen (LCP) | Page loaded (DCL) | Buttons work | Downloaded |
  | --- | --- | --- | --- | --- | --- |
  | First visit, not signed in, empty cache | 0.74 s | **1.48 s** | 1.34 s | 3.08 s | 275 KB |
  | Signed-in Strategist coming back | 0.79 s | **1.06 s** | 0.80 s | **1.09 s** | 35 KB |

  The debate is readable in under 2 seconds in both cases. On a first visit the buttons work from 3.1 seconds, because React's own JavaScript (about 70 KB) takes that long at Slow 4G speeds. Moving the form-checking library out of the browser bundle saved 32 KB. The test asserts LCP and DCL under 2 s on the first visit, and LCP and interactivity under 2 s on a return visit.
- **Measurement notes**: Chrome adds the simulated delay while the HTML downloads, so "HTML received" is reported rather than time to first byte. The service worker is switched off during measurement, because it would fetch pages outside the throttle.
- **Hosted dry run**: the four new migrations, and only those, would be applied. Nothing was pushed.

### Decisions for the owner
1. **Reaction set**: see Defaults. "Changed my mind" is deliberately absent.
2. **Edit window and withdraw**: 5 minutes; withdrawing is allowed while the Campaign is open, not after. A withdrawn Dispatch's replies stay visible under the placeholder.
3. **Length and rate limits**: see Defaults.
4. **Account deletion (UK GDPR)**: **not built**. My proposal:
   - Deleting an account removes the email address, sign-in, passkeys, display name, bio, positions, reactions, follows and email settings.
   - It replaces the handle with "deleted Strategist" and keeps the Dispatches, shown as by "a deleted Strategist", because Verdicts and the audit trail depend on them.
   - It needs your wording for the confirmation screen and the privacy policy.
   - **Risk today**: `dispatches.author_id` cascades from `auth.users`, so deleting a user in the Supabase dashboard would hard-delete their Dispatches. Please don't delete users there until this is built; the fix belongs in the deletion migration.
5. **Email**: sender name and address, the sending domain (verify it in Resend; an owner action) and the daily cap (6 suggested).
6. **Is report-and-hide enough for a closed test before Sprint 4?** I suggest yes, for the owner's own testers only, with an admin checking `/admin/reports` daily. Not for real invitees.
7. **Decided (owner, 2 November): public Strategist profiles are minimal.** Visitors who are not signed in can read a Strategist's handle and join date only, plus their public Dispatches. Display name, expertise tag and bio stay visible to signed-in Strategists only, and searching for people needs sign-in. Made by editing `20261103000200` (not yet applied anywhere) rather than adding a migration.

### Not done / known issues
- **Nothing is applied to the hosted project.** The dry run is reported in DEMO.md. Pushing the migrations and the email set-up (Vercel variables and two Vault secrets) wait for your OK.
- Email does not send on hosted until you set `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_PROCESSOR_SECRET` in Vercel and store the processor's address and secret in Vault. Until then emails queue safely.
- Admins cannot yet set a round's allowed kinds in the Campaign form (default: all three); the debate seed sets them. The Sprint 4 console is the place for it.
- The first visit on Slow 4G is readable in 1.5 s but its buttons work only from 3.1 s (see Checked).
- Detection of undeclared AI text, AI screening and holding are Sprint 4 (`screenDispatch()` is the hook).
- A Strategist with more than 200 Dispatches sees the latest 200 in their Dossier; paging comes later.
- `/profile/export` loads everything at once, which is fine at pilot size.
- **Local dev server note**: running `npm run build` (which Playwright does) in the same folder as a running `next dev` makes the dev server reload pages in a loop ("HMR hash mismatch"). Restart `next dev` after running the tests, or run Playwright with `E2E_SITE_URL=http://localhost:3200` and restart afterwards.

## Sprint 2: Campaigns and countdown (1 November 2026). Approved, merged (pull request #1)

### Added
- **Migration `20261102000100_campaign_rounds_positions.sql`** (new; earlier migrations untouched):
  - `campaign_rounds`: each round has its own deadline. A round cannot sit outside its Campaign, which the database checks whenever either side changes.
  - `campaign_positions`: one row per Strategist per Campaign, with a before and an after position (for, against or undecided). Works on every format. The before position closes when the Campaign starts. The after position opens at the start. Both lock at close. Positions are private to the Strategist and admins, and cannot be deleted.
  - New columns on `campaigns`: `notes` (admin only), `needs_owner_decision` (blocks scheduling while set), `wave`, `brief` (topic-bank background, not shown) and `current_round`.
  - Every Campaign and round insert, change or removal is written to `audit_log` by trigger, along with who made it.
  - `save_campaign()` saves a Campaign and its rounds in one transaction. It runs with the caller's own rights, so only admins succeed.
  - `campaign_tick()` opens Campaigns, moves rounds on and closes them by server time. Running it twice changes nothing the second time, and each step is logged as `campaign.opened`, `campaign.round_changed` or `campaign.closed`. pg_cron runs it every minute, on the minute. There is no Vercel cron and no Inngest.
  - `server_now()` gives the countdown the database clock.
- **Campaigns list** (`/campaigns`): grouped into Open now, Opening soon and Closed, each with its own empty state, plus loading and error pages. Admins also see "Create a Campaign" and "Manage Campaigns".
- **Campaign page** (`/campaigns/[slug]`):
  - A content note comes first on sensitive topics, followed by the title, category and format.
  - Financial and medical topics carry the "Opinion, not advice" label.
  - Shows the main countdown, the current round with its own countdown, every round's deadline in UK time, and the rules.
  - Has the before/after position control and a "Dispatches open in the next update" note in place of a link.
- **Countdown**:
  - Driven by the server's clock: the page sends the database `now()`, the browser works out the offset once, ticks from it, and re-syncs from `/api/time` when the tab regains focus.
  - Screen readers hear it hourly, then every 10 minutes, every minute and every 10 seconds near the end.
  - Uses fixed-width digits (no layout shift) and refreshes the page when a deadline passes.
- **Admin create and edit** (`/admin/campaigns`, `/new`, `/[id]`):
  - The admin role comes from the JWT claim, and non-admins get "not found".
  - Fields: title, web address, summary, rules, category, format, opens/closes (UK time, handling the clocks changing), up to 5 rounds, sensitive flag with content note, "opinion, not advice", admin notes, and draft or scheduled.
  - Errors are in plain English, stay until dismissed and keep what was typed.
  - Editing a running Campaign keeps it running.
- **`npm run topics:load -- --start YYYY-MM-DD`**:
  - Loads the fifteen launch topics as **drafts only**, in wave order with 7-day windows from your start date (midnight UK time).
  - Prints the target host and waits for you to type "yes". Matches by slug, so it never duplicates or overwrites anything. Each insert is audited.
  - Facts from the topic bank are kept in `brief` and **not shown**. The public summary is a DRAFT placeholder until you refresh it.
  - `rubric_published_at` is left empty, because the schema has no rubric table yet.
- **`npm run campaign:test`**: a local-only test Campaign that opens at the next minute with two 2-minute rounds.
- **Seed**: three `[Sample]` Campaigns (open with 3 rounds, opening soon, closed) for local development only.
- **Tests**:
  - Unit: 35 new (status and round boundaries exactly at start and end, the clocks changing in both directions, a round ending after its Campaign, countdown wording and announcement intervals, form validation, the topics file against the schema limits).
  - RLS: 18 new (only admins write Campaigns and rounds; drafts and their rounds are hidden; users edit only their own position; no after position before the start; no changes after close; scheduler opens, moves rounds and closes idempotently with an audit trail; pg_cron job present; browsers cannot run the scheduler; loading topics twice creates no duplicates).
  - New Playwright test at 375px: an admin creates a Campaign with rounds, a Strategist finds it under Opening soon, sees a countdown within seconds of server time, and records a before position.

### Checked
- **Real-time scheduler**: two test Campaigns ran under the real pg_cron job. The second opened at 10:59:00.007, moved to round 2 at 11:01:00.017 and closed at 11:03:00.016, with each step in the audit log. On the first run, the page did not refresh itself at close, because "Opens in" and "Time left" share one countdown component. That is now fixed (one refresh per deadline), and the second run updated through Open, Round 2 and Closed without a reload.
- **Full suite**: lint and typecheck clean; 78 unit, 61 RLS and 3 Playwright tests pass. No console errors on the Campaign page.
- **Sprint 1 carry-over**: `/profile` opened directly by URL loads fully in Chromium (Playwright). I could not reproduce the stuck "Loading" outside the built-in review browser. A regression check is now in the Playwright test.

### Decisions for the owner
- **Bank of England, 5 November**: loads as a draft flagged "owner decision needed". The database refuses to schedule it until that flag is cleared. Pick the next MPC date or replace the topic.
- **Assisted dying**: loads as sensitive with the content note "DRAFT: content note to be written by the owner". No real note or support wording has been written.
- **"Closed, moderated debate"**: loads as Open arena, with the intended setting recorded in the admin notes.
- **Topic facts**: hidden until you refresh them. To publish, edit the summary on the Campaign's edit page.

### Not done / known issues
- Launch topics have **not** been loaded to the hosted project, and this migration has **not** been pushed. Both wait for your OK (dry run first, as for Sprint 1).
- Clearing `needs_owner_decision` has no admin screen yet (Sprint 4 console). For now, editing the topic in the form and asking me to clear the flag is the route.
- The scheduler runs on the minute. A Campaign set to open at 9:00:30 opens at 9:01:00, while the page shows it open from 9:00:30. The admin form only accepts whole minutes, so this only affects Campaigns created by scripts.
- Rounds may leave gaps, and the page then shows no current round between them.

## Sprint 1: Foundation, accounts and Dossier (1 November 2026). Approved

### Added
- **Project**: Next.js 16 (App Router, TypeScript strict), Tailwind 4 with shadcn/ui-style components, ESLint, Vitest, Playwright. GitHub Actions CI runs lint, typecheck and unit tests, then builds the database from the migrations in local Supabase and runs the RLS and Playwright tests.
- **Database schema** (`supabase/migrations`, rebuilds from scratch): `profiles`, `invites`, `campaigns`, `dispatches`, `awards`, `audit_log`, plus `ai_decisions`, `passkeys` and `webauthn_challenges`. Row-level security is on for every table. Column privileges stop people from setting their own handle, moderation status or AI decisions. `audit_log` is append-only, even for the service role. Admin rights come only from the JWT `app_metadata.role` claim.
- **Invite-only sign-up**: email and password, invite code, 18+ and terms confirmation. A database trigger enforces the invite, so calling the Auth API directly cannot get round it. Email confirmation link → choose handle → Dossier.
- **Passkeys**: add one from the Account page, then use "Sign in with a passkey" on the sign-in page. WebAuthn is verified on the server (SimpleWebAuthn); credentials are written only by the server.
- **Handle screening**: `src/lib/ai` (the single AI module) with a deny-list stub for impersonation and hate terms, including look-alike characters such as `Adm1n`. Every decision is stored in `ai_decisions` with model, prompt version, output and a plain reason.
- **Pages**: Home, Sign in, Create account, Check your email, Choose your handle, Account (profile, passkeys, "Back to home"), empty Dossier, Campaigns placeholder, and draft Privacy, Terms and AI-use pages clearly marked DRAFT. Includes loading, error and not-found pages.
- **Design system**: 18px base text, Atkinson Hyperlegible font, high-contrast colours, 48px minimum tap targets, visible focus ring, skip link, and a persistent header (Home, Campaigns, Dossier, Account). Errors appear inline and stay until dismissed, and forms keep what you typed.
- **Email links**: `/auth/confirm` accepts links whose `&` were HTML-escaped to `&amp;` by the email template.
- **Scripts**: `npm run env:check` (names only, never values), `npm run invite:create`, `npm run admin:set`, `npm run test:env`.
- **Tests**: 43 unit tests, 43 RLS tests (each checked by weakening a policy and watching the tests fail), and 2 Playwright tests at 375px: sign-up with an invite code through to the empty Dossier, and adding a passkey then signing in with it.

### Changed
- `.env.local`: changed the separator from `KEY:value` to `KEY=value` (with permission) so Next.js can read it. Values unchanged.

### Not done / known issues
- Hosted project: migrations applied after a reviewed dry run, Auth settings configured, and a real sign-up confirmed end to end. Site URL is `http://localhost:3000` until a Vercel URL is chosen.
- The free Supabase email service sends only a few emails an hour. Custom SMTP through Resend is planned for Sprint 3.
- No data export or delete-account yet (CLAUDE.md rule 11). Proposed for a later sprint.
- An invite is used up at sign-up even if the person never confirms their email.
- `npm audit` reports moderate advisories in the ESLint toolchain only (development, not shipped).
- `/Users/deleolaoye/Project/TGS/.env.local` (outside the repo) still uses the old `KEY:value` format and is not used by the app.
