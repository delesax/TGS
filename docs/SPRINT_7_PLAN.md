# Sprint 7 plan: hardening and launch (Phase A: audit and plan)

Branch `sprint-7-hardening`, cut from `origin/main` (`15b14c6`). **This is a read-only audit and a plan. No feature code was written, nothing was applied to hosted, nothing was written to hosted, no load was run, no upgrades were made.** Target: the invite-only soft launch on 1 December 2026, on free plans only.

Parked, not touched here: `legal-hardening` work, `src/lib/legal.ts`, the PLACEHOLDER strings in `src/lib/judging/notices.ts`, account deletion (stays off).

## Phase B progress (updated 13 November)

Batch 1 is built on branch `sprint-7-phase-b`: **W1** kill switches, **W2** rate limiter and event log, **W3** open redirect, **W6** health route and page, **W8** injection corpus, **W11** HSTS (CSP left for later), **W12** patch upgrades. Two migrations (`20261113000100`, `20261113000200`), local only, not applied to hosted. One change from the plan: per-IP limits are generous (sign-in 100 per 10 minutes, sign-up 60 per hour, reset 30 per hour) because a pilot class shares one address; the sharp limits are per email and per user.
**Still to do:** W7 (judge prompt v2, batch 2b), W9, W13, W14, CSP report-only. W4, W5, W10 and W15 are built in batch 2a (see "Decided 13 Nov").

## Decided 13 Nov (owner)

- **D1** Launch on Vercel Hobby. No sponsors or payments until the project moves to the company account.
- **D2** Cut app email to essentials and keep headroom for Supabase's own sign-up and reset emails. Pilot about 100 members; invites in waves of 10 to 20. (Built as W15: `email_essentials_only` on by default and a global daily cap of 60.)
- **D3** Minimum account age 48 hours (an admin setting, `judging_settings.min_voter_account_age_hours`). **D3b** Individual invites may be bound to an email address, optional per invite (`invites.invited_email`).
- **D4** Collusion signals flag humans only: no automatic weight changes.
- **D5** Judge prompt v2 approved (batch 2b).
- **D6** Wording set in `src/lib/switches.ts`: paused posting reads "Posting is paused for a short while. You can still read everything. Please check back soon."; paused sign-ups reads "Sign-ups are paused for a short while. Please try again later."; paused emails needs no member-facing text.
- **D7** Manual database dumps by the owner; no database URL stored anywhere new.
- **D8** Keep the $30 Anthropic cap; the coach limit stays 10.

### Batch 2a (built on branch `sprint-7-batch-2a`, not applied to hosted)

W4 voter eligibility (`20261113000300`), W5 integrity signals and the `/admin/signals` page (`20261113000400`), W10 invite binding (`20261113000500`), W15 email essentials (`20261113000600`). Panel judges are exempt from the account-age rule (an admin chose them); everyone, judges included, is held to the steelman confirmation cap. Email audit (W15), app-queued kinds:

| Kind | Queued by | Recommendation |
| --- | --- | --- |
| `moderation_outcome` | admin or AI decision on your Dispatch | **Keep**: it affects your own content or account |
| `verdict_published` | Verdict published, to participants | **Keep**: the main moment of a Campaign |
| `verdict_appeal_outcome` | appeal decided | **Keep**: security and fairness |
| `judge_assigned` | admin assigns a judge | **Keep**: operational, rare |
| `reply` | someone replies to your Dispatch (digest) | **Cut**: highest volume |
| `campaign_opened`, `campaign_round_changed`, `campaign_closed` | Campaign events, to followers | **Cut**: visible on the site |
| `campaign_closing_soon` | 24 hours before the close | **Cut** |
| `peer_voting_open` | voting opens, to participants | **Keep** (owner decision, 13 Nov: it prompts voting; it was borderline) |

Sign-up confirmation and password reset are sent by Supabase, not queued by the app, and are not affected.

## How this was checked, and what was not

Checked by reading the code and migrations on `origin/main`, running small read-only scripts (a scan of every migration for SECURITY DEFINER functions, a test of `safeNextPath`, `npm audit`, `npm outdated`), and reading the real schema. Function and column names below are quoted from the migrations.

**Not checked** (and so marked "unverified" where it matters): anything that needs hosted data or the dashboards (hosted Auth rate limits, current Vercel/Supabase/Resend/Anthropic plan limits, hosted `auth.audit_log_entries`), runtime behaviour of response headers, and any load behaviour. Free-plan limits quoted below are from my own knowledge and must be re-read from each provider's pricing page before launch.

## 1. Top 10 risks, ranked by launch risk

| # | Risk | Severity |
| --- | --- | --- |
| 1 | **No way to pause the site without a deploy.** Only AI has a kill switch (`community_settings.ai_enabled`). Nothing pauses posting, sign-ups or email. | High |
| 2 | **Free email quota.** Resend free is about 100 emails a day and 3,000 a month (verify). Sign-up confirmations, password resets and every notification share it. About 100 members is the ceiling; at 200 the daily cap is hit every day. | High |
| 3 | **Cheap sock-puppet rings can swing a Verdict.** A voter needs only one visible Dispatch in the Campaign, no account age, and gets 5 votes (`cast_peer_vote`). Ring accounts are made with plus-addressed emails and one class invite code. Mind-change picks and steelman confirmations are also ring-able. | High |
| 4 | **The AI judge cannot tell real citations from invented ones, and does not even see the structured `sources` links.** `RubricInput` has only body, kind, Campaign and parent text. Fabricated but plausible evidence scores well. | High |
| 5 | **No backups.** Supabase free has none (CLAUDE.md rule). Migrations rebuild the schema, not the data. One bad statement loses members' Dispatches. | High |
| 6 | **Anthropic cap ($30 a month) is reached at roughly 250 active members** on my cost model (section 3), and the daily call cap (1,000 once legal-hardening's migration is applied, 3,000 now) throttles judging after a big Campaign closes. | Medium |
| 7 | **Open redirect.** `safeNextPath` lets a tab or line break through (`/\t/evil.com`), which browsers and `new URL()` read as `//evil.com`. Confirmed for `/auth/confirm`; likely for the login `next`. | Medium |
| 8 | **Free-plan terms.** Vercel Hobby is non-commercial; Supabase free projects pause after inactivity and have no support or backups. CLAUDE.md says accounts move into the company during Sprint 7. Owner decision, not a code change. | Medium |
| 9 | **No incident evidence.** Vercel free keeps about an hour of runtime logs; the app logs only error codes and persists none of them. After an incident there is nothing to look at. | Medium |
| 10 | **No security headers beyond four basics** (no CSP, no HSTS set by the app) and **no injection tests** for moderation, coach and nudge (only judging has one, `hs-06`). | Medium |

What is already good, so it is not re-done: all 115 SECURITY DEFINER functions set `search_path`; anonymous visitors can run only six read-only functions; every table has RLS with a test that fails if one does not; admin pages and actions check the admin role in the app and again in the database; the service-role key is imported only in `server-only` modules; only three `NEXT_PUBLIC_` variables exist (site URL, Supabase URL, anon key); every AI call (seven calls, six prompts) wraps user text the same safe way; `npm audit --omit=dev` reports 0 vulnerabilities.

## 2. Workstream 1: anti-gaming

### 2.1 What exists today (so we do not rebuild it)
- **Posting limits in the database** (`post_dispatch`, migration `20261103000200`, lines 504 to 512): per-round cap (`community_settings.max_dispatches_per_round`, default 10) and a cooldown (`cooldown_seconds`, default 30). So "the app has no limits of its own" is wrong for posting.
- **AI limits**: `ai_reserve_call()` enforces a global daily cap, a per-Strategist cap (40) and a coach cap (10); judging stops at 80% of the cap.
- **Vote limits**: 5 vote credits per voter per Campaign (`judging_settings.peer_vote_credits`); one vote per Dispatch (primary key `(dispatch_id, voter_id)`); no voting for your own Dispatch.
- **Other**: one report per reporter per Dispatch (`dispatch_reports_once`), one appeal per person, emails capped per user per day (`email_daily_cap`, 6).

### 2.2 Findings

| ID | Finding (file and line) | Severity | Smallest fix that works | Size | Migration | Owner decision |
| --- | --- | --- | --- | --- | --- | --- |
| AG-1 | **Multi-account.** Invites (`public.invites`: `code`, `max_uses` 1 to 500, `use_count`, `expires_at`, `revoked_at`) are not tied to an email (foundation migration, `handle_new_user`). A class code with 30 uses lets one person make 30 accounts; plus-addressing (`name+1@gmail.com`) and dots give unlimited mailboxes from one. Email confirmation is the only other barrier. | High | (a) Guidance: individual invites single-use, class codes short-lived. (b) Detection (AG-10): families of normalised emails and bursts per invite. (c) Optional `invites.invited_email`, checked in `handle_new_user` when set, for the retired-professional invites. | S to M | Yes, small (column and trigger check) | Yes: bind individual invites to an email? |
| AG-2 | **Day-one voting.** `cast_peer_vote` (judging functions migration, line 288) needs only: Campaign closed, voter posted one visible Dispatch in it (`is_campaign_participant`), not their own Dispatch, credits left. No account age, no history, no limit on how many accounts do this. Weight is 1 for a newcomer. | High | Require the voting account to be at least N hours old at vote time (suggest 48), same rule for steelman confirmation and mind-change picks. | S | Yes (function bodies) | Yes: minimum age (48h suggested) |
| AG-3 | **Reputation cap by median.** `voterWeights` (`src/lib/judging/blend.ts:161`) caps each voter at 3 times the median weight of the voters in that Campaign. A flood of weight-1 voters pulls the median to 1 and caps genuine high-reputation voters at 3. Reputation points come only from published Verdicts, so socks always sit at 0. | Low | Leave for now; later compute the median over voters with at least one judged Campaign. | S | No | No (defer) |
| AG-4 | **Reciprocal and ring voting.** Nothing stops A and B voting for each other, or ten accounts voting for one author (5 credits each). The peer score is relative to the top author. | High (ring), Medium (pairs) | Do not auto-penalise. Compute mutual-vote and shared-target signals (AG-10) and add them to the draft Verdict's "needs attention" list so a human decides. | M | Yes (read-only function) | Yes: flag only, or halve weight for mutual pairs? (recommend flag only) |
| AG-5 | **Steelman confirmations have no cap.** `set_steelman_confirmation` (line 353) lets any participant or judge confirm any number of Dispatches. The bonus needs the AI to detect a steelman (confidence 0.6 or more) and two confirmations (`steelman_min_confirmations`), so two socks can lift any AI-detected one. The real run also gave one false steelman (fs-02). | Medium | Cap confirmations per person per Campaign (suggest 3); count only confirmers who pass the AG-2 age rule. | S | Yes (function) | No |
| AG-6 | **Mind-change picks.** `pick_mind_changer` (line 388): one pick per person per Campaign; credit equals how far the picker's position moved (`blend.ts:277`), not weighted by reputation. A sock can record "against", then "for", and pick its target for full credit. Mind-change is 10% of the blend, normalised to the top author, so a small ring can make a target the maximum. | Medium | Weight each pick like a peer vote (reuse `voterWeights`), require the position change to span at least a day (`campaign_positions.before_at`, `after_at` exist), apply the AG-2 age rule. | S to M | Mostly no (compute in `blend.ts`); age rule is the function change | No |
| AG-7 | **Fabricated or unverifiable evidence.** `prompts/judge-rubric.v1.md` asks for "sources a sceptic would accept" and gives no instruction about verifying; the real run showed the model vouching for a study from memory (ed-02: "matches a real 2024 study"). Structured links exist (`dispatches.sources`, up to 5, http and https only) but `RubricInput` (`src/lib/ai/engine.ts:265`) does not pass them, so the AI neither sees nor checks them. | High | (1) Prompt v2: tell the model it cannot verify, never to treat a named study, figure or quote as verified, and to return up to three `unverified_claims`. (2) Show those and a simple count (links, figures, named studies) in the panel and admin Dispatch view as "check before relying". (3) Pass `sources` URLs to the judge as text only (no fetching). (4) Panel override already exists (`override_ai_rubric_score`, with reason). Do not cap or auto-penalise. No web lookup. | M | Probably (a column or jsonb field for the claims on `ai_rubric_scores`) | Yes: approve a prompt change (re-run gold eval, about £0.14) |
| AG-8 | **Prompt injection at every AI entry point.** All seven calls (screen handle and profile text, screen Dispatch, nudge, coach, judge, optional rationale wording; six prompt files) build their message through `buildUserMessage` (`src/lib/ai/untrusted.ts`): trusted context first, user text between `<untrusted_text>` tags with look-alike tags defused, a reminder, and an enum-only JSON schema parsed strictly. Models cannot delete (policy.ts). Gaps: no injection test cases for screening, nudge or coach (only gold-set item `hs-06` covers judging); the worst realistic outcome is a harmful Dispatch screened "allow", which still reaches reports and the admin queue. | Low to Medium | Add one shared injection corpus (about 12 strings: "ignore the rules", fake closing tags, role-play, "score this 5", encoded text) and run it through every AI call with the fake provider in unit tests and with the real model in the eval scripts. | S | No | No |
| AG-9 | **Rate limits.** Posting, voting, AI, email and reports-per-Dispatch are limited (see 2.1). Missing: reports per user per day (one account can flood the admin queue), follows, reactions, positions and edits (direct RLS inserts, no counters), invite-code guessing and sign-in, sign-up and reset requests per IP (left to Supabase Auth; the hosted values are unverified, local config says 1,000 per 5 minutes). | Medium | One Postgres-backed limiter: table `rate_limits(bucket, subject, window_start, hits)` and function `rate_limit_hit(bucket, subject, max, window_seconds)`, called inside the RPCs that matter (report, follow, reaction, position) and from server actions for sign-in, sign-up and reset using a hashed IP from the request headers. Nightly cron prunes old windows. No new service. | M | Yes (table, function, cron) | No |
| AG-10 | **No detection.** There is no view of suspicious patterns, and IP addresses are not stored in `public`. | High (the only defence for AG-1 and AG-4) | `admin_integrity_signals()` (admin-only function) and a page `/admin/signals`, read-only, flags for human review only. Signals: (1) voters who sent at least 80% of their votes to one author; (2) mutual vote pairs; (3) two voters sharing at least 3 targets in a Campaign; (4) bursts (votes within 10 seconds of each other, using `peer_votes.created_at`); (5) at least 3 accounts created within 10 minutes on one `invite_id` (`profiles.invite_id`, `profiles.created_at`); (6) families of emails after stripping `+tag` and Gmail dots; (7) reciprocal mind-change picks and steelman confirmations concentrated on one author. Hosted Supabase also keeps sign-in IPs in `auth.audit_log_entries`; whether that is reachable and how long it is kept is unverified. | M | Yes (read-only function) | No |

## 3. Workstream 2: load and capacity

### 3.1 Ceilings from code and config (free plans; provider limits unverified, re-read before launch)

| Resource | Ceiling | Where it comes from | Note |
| --- | --- | --- | --- |
| Resend (free) | about 100 emails a day, 3,000 a month (verify) | Resend plan; app side `email_daily_cap` 6 a user | **First thing to break.** Auth emails (confirm, reset) share it. |
| Anthropic | $30 a month cap, notify at $10 | Org setting | Section 3.2 |
| App AI calls | 1,000 a day after legal-hardening's migration (3,000 now); judging stops at 80% | `ai_reserve_call`, `community_settings.ai_daily_cap_global` | A big Campaign close can use the whole day. |
| Judging processor | 10 Dispatches a run, one run a minute, at most about 600 an hour | `/api/judging/process` (`maxDuration = 60`), `claim_rubric_batch(10)` | Fine for 500 members spread out, slow after one huge close. |
| Email processor | 100 a run, one run a minute | `claim_email_batch(p_limit default 100)` | Not the limit; Resend is. |
| Moderation sweep | Sweeper retries pending Dispatches each minute; each screening has a 4 second timeout | `TIMEOUT_MS` in `src/lib/ai/config.ts` | Fails open to "pending" or "post unscreened" per settings. |
| Vercel Hobby | non-commercial terms; function duration and invocation limits per plan (verify); `email` and `moderation` routes set no `maxDuration` | Vercel plan; `src/app/api/*/route.ts` | Only judging sets `maxDuration = 60`. |
| Supabase free | 500 MB database, no backups, project pauses after about a week without activity, limited direct connections (verify) | Supabase plan | Data size is not a problem (estimate: under 100 MB for 500 members over a month). |
| pg_cron and pg_net | one job run a minute at best; the kick jobs only call the site when there is work and the Vault secrets exist | migrations; `judging_kick`, `email_kick`, `moderation_kick` | Calls are fire and forget; a failed call is retried next minute. |

### 3.2 Estimates for a 50, 200 and 500 member launch

Assumptions (stated so you can change them): per active member per week, 3 Dispatches, 1 coach use, 10 emails a week in the first month. Per-call cost: screening and nudge about $0.0002 (Haiku 5.5 prices in `src/lib/ai/config.ts`); coach about $0.011; judging $0.0053 a Dispatch (measured: $0.16 for the 30 gold-set items). That is about $0.12 a member a month.

| Members | Dispatches a week | AI calls a week | AI cost a month | Emails a day (steady) | Emails a month | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 50 | 150 | about 500 | about $6 | about 50 (up to about 100 on launch day) | about 1,500 | Fits, tight on launch day |
| 200 | 600 | about 2,000 | about $24 (over the $10 notify line) | about 200 | about 6,000 | **Email quota exceeded daily**; AI near the cap |
| 500 | 1,500 | about 5,000 | about $60 | about 500 | about 15,000 | **Email and AI cap both exceeded**; judging backlog after a close |

Conclusion: on free plans the realistic ceiling is about 100 members unless email is cut to essentials (confirmations, resets, Verdict published) and the coach limit is lowered. That is an owner decision (D2).

### 3.3 Load test plan (LOCAL Supabase only; no new tools)

Use Node scripts under `scripts/load/` run with `tsx` and the `postgres` and `@supabase/supabase-js` packages already in the project (k6 is not installed and not needed). They refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` is local, like `tests/test-env.ts`.

| Scenario | What it does | Pass threshold |
| --- | --- | --- |
| Burst sign-up | 100 accounts in 60 seconds via the Auth admin API with the invite trigger on, then 100 confirmations | no errors; every account has a profile; invite `use_count` exact; p95 under 2 s |
| Burst post | 200 Dispatches in 5 minutes across 50 accounts into one open Campaign (respecting the 30 s cooldown with spread accounts) | no deadlocks; p95 post under 1.5 s; per-round cap and cooldown still enforced |
| Judging tick on a large closed Campaign | seed 1,500 Dispatches in a closed Campaign, run `judging_tick()` and the processor with the fake provider | queue fills in under 60 s; 10 per run drain with no double processing; draft Verdict computed in under 30 s |
| Email backlog | enqueue 5,000 rows, run `claim_email_batch` loop with the Mailpit transport | 100 a run, no duplicates, per-user daily cap respected, no row stuck in `sending` |
| Vote burst | 500 voters casting 5 votes in 60 s on one Campaign | credits never exceeded; no deadlock on the per-voter advisory lock; p95 under 1 s |

Report CPU, memory and slow queries (`pg_stat_statements` locally). Pass or fail is recorded in `docs/` and not run against hosted.

### 3.4 What breaks first, in order
1. Resend daily quota (about 100 a day).
2. Anthropic $30 cap and the daily call cap (judging is throttled at 80%).
3. Judging throughput after one very large Campaign closes (10 a minute).
4. Supabase free pause or limits if the project sits idle before launch.
5. Vercel Hobby non-commercial terms (a policy risk, not a technical one).

## 4. Workstream 3: security review

| ID | Area | Finding (file and line) | Severity | Fix | Size |
| --- | --- | --- | --- | --- | --- |
| SEC-1 | Open redirect | `safeNextPath` (`src/lib/validation.ts:79`) blocks `//` and `/\` but allows tab, CR, LF and NUL (`/\t/evil.com`). Used in `src/app/(auth)/actions.ts:122` (login), `src/app/(auth)/login/page.tsx:18` and `src/app/auth/confirm/route.ts:21`. In `/auth/confirm`, `new URL("/\t/evil.com", origin)` resolves to `https://evil.com/` (tested). For the login path the header contains the tab; browsers strip it (not tested against a real response). | Medium | Reject any control character or backslash anywhere, and after parsing require the origin to equal our own. Add tests. | S |
| SEC-2 | Headers | `next.config.ts` sets only `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. No CSP, no HSTS from the app (Vercel may add HSTS on custom domains; unverified). | Medium | Add `Strict-Transport-Security`; add a `Content-Security-Policy-Report-Only` first, then enforce after a clean week. | S to M |
| SEC-3 | Processor routes | `src/app/api/email/process/route.ts`, `.../moderation/sweep/route.ts`, `.../judging/process/route.ts`: Bearer secret compared with `timingSafeEqual` after a length check (length can leak, negligible with a 40-plus character secret); 401 on wrong or missing header, 503 if the env var is unset. A static secret means no replay protection, but all three are idempotent and bounded per run. No rate limit on failed attempts. | Low | Use long random secrets; rotate before launch; the AG-9 limiter can cover the routes. | S |
| SEC-4 | RLS and definer | All 115 `security definer` functions across the migrations set `search_path` (scripted scan). Anon can execute only `campaign_has_closed`, `leaderboard`, `live_verdict_status`, `peer_window_open`, `search_tgs`, `server_now`. Every table has RLS (`tests/rls/every-table-has-rls.test.ts`, 26 RLS test files). Machine-only functions rely on revoked EXECUTE rather than an in-body role check. | Low | Keep. Add one test that lists every function and its grants so a new function cannot be granted to anon by mistake. | S |
| SEC-5 | Service role and secrets | `createAdminClient` is used in 20 server modules, `src/lib/supabase/admin.ts` imports `server-only`. Only `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public. | Low | Add a CI check that greps the built client bundle for the service-key pattern. | S |
| SEC-6 | Admin authorisation | Pages call `requireAdmin` (24 uses); every admin action starts with an `adminOnly()` or `admin()` check on `viewer.isAdmin` (`app_metadata.role`), and the database functions check `is_admin()` again. | Low | Keep. | none |
| SEC-7 | Server actions and CSRF | Next's built-in same-origin check applies (no `allowedOrigins` override found). Forms validate with zod. | Low | Add a test that posts an action from another origin and expects rejection. | S |
| SEC-8 | XSS and injection | No `dangerouslySetInnerHTML` or markdown renderer in `src`; the search highlighter splits text rather than inserting HTML; email templates escape (`escapeHtml`, `src/lib/email/templates.ts:44`); Dispatch source links are limited to http and https. Link `rel` attributes not checked (unverified). | Low | Confirm `rel="noopener noreferrer nofollow ugc"` on user links. | S |
| SEC-9 | Dependencies | `npm audit --omit=dev`: **0** vulnerabilities. Full audit: 7 moderate, all in the dev lint chain (typescript-eslint and minimatch). Behind latest: `next` 16.4.3 to 16.4.6, `react` and `react-dom` 19.3.0 to 19.3.1, `@anthropic-ai/sdk` 1.4.0 to 1.8.0, `@supabase/supabase-js` 2.118.0 to 2.119.0, `lucide-react`, `postgres`, `vitest`, `tailwindcss`. Report only; no upgrades made. | Low | Patch-level upgrades of `next`, `react` and `@supabase/supabase-js` after a full test run, before launch. | S |
| SEC-10 | Logging | Server code logs error codes (`error.code`), not content. A few places log `error.message` from providers (`src/lib/email/index.ts:95`, `transactional.ts:28`, the processor routes) which could carry an address or provider detail. No secret was found logged. Vercel free keeps about an hour of runtime logs. | Low to Medium | Persist our own `system_events` rows (below) and trim provider messages. | M |
| SEC-11 | Auth flows | Sessions are Supabase SSR cookies. Password reset (merged on 13 November) uses a short-lived recovery cookie. Sign-in and sign-up rate limits depend on hosted Supabase Auth settings (unverified); no CAPTCHA. | Medium | Set hosted Auth rate limits explicitly; optional free Cloudflare Turnstile on sign-up and reset (defer unless abuse appears). | S |

## 5. Workstream 4: launch readiness (design only)

### 5.1 Kill switches (no deploy needed)
Add to `community_settings` (the existing admin-editable row, already behind the admin Settings page and the audit trigger):
- `posting_paused boolean` (checked in `post_dispatch`, which already refuses muted accounts); shows "Posting is paused for a short while" and leaves reading open.
- `signups_paused boolean` (checked in `handle_new_user`, so direct Auth API calls are blocked too, with a clear message on the sign-up form).
- `emails_paused boolean` (checked by `claim_email_batch` and the email route; emails stay queued and are sent on resume).
- AI: already `ai_enabled` (and `ai_fallback_normal`, `ai_fallback_sensitive`).
Each toggle writes an audit entry with a reason. A banner on the site shows when any is on. Needs one migration.

### 5.2 Health and status
`GET /api/health` returns 200 `{ok:true}` or 503 with only the failing check names (database reachable, `server_now()`); no details to the public. The admin console gets a Health card (admin-only) from one function: queue depths and ages (`email_outbox` queued, `ai_rubric_jobs` queued, moderation `pending` count), last run time of each cron job, AI calls used today against the cap.

### 5.3 Persist our own log
Table `system_events(created_at, kind, code, detail)` for: processor run summaries (counts only), AI failures (code), rate-limit trips, kill-switch changes, auth failures per hashed IP. Pruned at 30 days by the existing retention-job pattern. Admin read page. This replaces the missing log history.

### 5.4 Backup and restore reality (Supabase free)
- **Exists**: the migrations rebuild the schema from nothing (`supabase db reset` locally proves it); the seed script is for development only.
- **Does not exist**: backups, point-in-time recovery, and any copy of member data. Account deletion is off, so nothing is purged yet, but one bad statement is permanent.
- **Proposal (free)**: the owner runs a manual `supabase db dump --data-only` (and the schema) weekly and before every migration, stored off-machine; document the restore steps and rehearse one restore locally before 1 December. A scheduled GitHub Action dump needs the database URL stored as a repository secret; that is a security trade-off for the owner (D7).

### 5.5 Vercel rollback
Promote the previous production deployment from the Vercel dashboard (Deployments, the previous READY deployment, "Instant Rollback"/promote; confirm Hobby allows it). Database migrations are not rolled back: policy is roll forward, keep every migration additive, and put a kill switch (5.1) ahead of any risky change.

### 5.6 Go/no-go checklist for 1 December (all must be yes)
- All Sprint 7 High items done (kill switches, vote eligibility, limiter, detection page, open redirect).
- Hosted migrations applied and a clean dry run (`supabase db push --dry-run --include-all` lists nothing); legal-hardening's six migrations applied and verified.
- Vault secrets set for email, moderation and judging; the three processor secrets rotated to fresh 40-plus character values; one processor call returns 401 without the secret.
- Resend domain verified; the Confirm sign up and Reset password templates saved; redirect URLs checked; a real sign-up, confirmation and password reset tested on the live site.
- Anthropic key in Vercel Production; cap $30 and notify $10 set; `ai_daily_cap_global` reviewed.
- A dump taken and one restore rehearsed locally.
- Health route returns 200; admin Health card shows empty queues.
- Admin account works; a second admin exists (OWNER_DECISIONS item 7).
- Local load tests passed against the thresholds in 3.3.
- Owner has decided D1 to D8 below.

### 5.7 Launch-day runbook (outline)
1. T-1 day: take a dump; confirm health, queues empty, Vault secrets present; announce nothing.
2. T-0: send the first batch of invites (a small batch first: 10 to 20); watch Admin Health and the integrity page every 15 minutes for the first two hours.
3. Watch email use against the Resend daily figure; if over 80%, pause emails (5.1) until midnight.
4. Watch AI use against the daily cap; if over 80% before evening, tell members judging will be slower.
5. Next waves only after a clean day.

### 5.8 Incident checklist (outline)
1. Stop the harm: flip the relevant kill switch (5.1); do not delete evidence.
2. Record the time and what you saw; read `system_events` and the audit log (`/admin/audit`).
3. If a deployment caused it: Vercel rollback (5.5). If data was changed wrongly: stop writes, then restore from the latest dump to a scratch project to inspect before touching live data.
4. If personal data may be affected: this is a legal step, not a code step; contact the owner and follow the legal runbooks (parked, out of scope here).
5. After: write the incident into `docs/CLAUDE_LOG.md`, add a test for it.

## 6. Proposed work items, ordered by launch risk

| # | Item | Fixes | Size | Migration | Owner decision | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | Kill switches (posting, sign-ups, emails) with admin toggles, banner and audit | Risk 1 | M | Yes | No | **Do before launch** |
| W2 | Rate limiter table and function, wired into report, follow, reaction, position, sign-in, sign-up and reset; plus `system_events` and prune job | Risks 9, AG-9 | M | Yes | No | Before launch |
| W3 | Fix `safeNextPath` (open redirect) with tests | Risk 7 | S | No | No | Before launch |
| W4 | Vote, confirmation and pick eligibility: minimum account age; cap on steelman confirmations; weight mind-change picks like votes | Risk 3 | M | Yes | D3: minimum age | Before launch |
| W5 | Integrity signals function and `/admin/signals` page (read-only) | Risk 3 | M | Yes | D4: flag only vs penalty | Before launch |
| W6 | Health route and admin Health card | Risk 9 | S | No | No | Before launch |
| W7 | AI judge v2: "unverified claims", pass `sources` to the judge, panel flag; re-run the gold eval | Risk 4 | M | Probably | D5: approve prompt change | Before launch if D5 yes; otherwise ship flag from deterministic counts only |
| W8 | Injection corpus across all seven AI calls (fake in unit tests, real in the eval scripts) | AG-8 | S | No | No | Before launch |
| W9 | Local load test scripts and a recorded result | Section 3 | M | No | No | Before launch |
| W10 | Invite hardening: optional `invites.invited_email`, expiry defaults, email-family signal | AG-1 | S to M | Yes | D3b | Before launch if D3b yes |
| W11 | HSTS and CSP report-only | SEC-2 | S | No | No | HSTS before launch; **defer CSP enforcement** |
| W12 | Patch upgrades (`next`, `react`, `@supabase/supabase-js`) after a full test run | SEC-9 | S | No | No | Before launch |
| W13 | Backup procedure and restore rehearsal (docs and one script) | Risk 5 | S | No | D7 | Before launch |
| W14 | Runbook, go/no-go and incident documents in `docs/` | Section 5 | S | No | No | Before launch |

**Recommend deferring past launch:** CSP enforcement (report-only first), Turnstile CAPTCHA, changing the median reputation cap (AG-3), automatic penalties for suspected collusion, any web lookup of citations, scheduled off-site backups (until a safe secret store exists).

## 7. Questions for the owner (decisions needed)

- **D1. Vercel Hobby is non-commercial.** Launch on Hobby anyway, or move the project into the company's account first? (A paid plan is outside the "free only" rule, so this is your call.)
- **D2. Email volume.** Accept a pilot of about 100 members on Resend free, or cut notifications to essentials (confirmations, resets, Verdict published) and lower `email_daily_cap` so 200 fits? 
- **D3. Minimum account age** before an account's votes, confirmations and picks count (suggest 48 hours). **D3b.** Bind individual invites to an email address?
- **D4. Collusion signals:** show to humans only (recommended), or also halve the weight of mutual vote pairs?
- **D5. Approve a judge prompt change (v2)** that tells the model it cannot verify sources and returns "unverified claims", with a re-run of the gold set (about £0.14).
- **D6. Kill-switch wording** for paused sign-ups and posting (what members should read).
- **D7. Backups:** accept a manual weekly dump by you (and before each migration), or allow a scheduled dump with the database URL held as a GitHub secret?
- **D8. Anthropic cap:** accept slower judging on big Campaigns, or lower the coach limits so the $30 cap lasts?

## 8. Not verified (please treat as open)
- Hosted Supabase Auth rate limits and whether CAPTCHA is on.
- Current free-plan limits for Vercel, Supabase and Resend (quoted from memory), including Vercel function duration and whether Hobby allows Instant Rollback.
- Whether Vercel adds HSTS on the custom domain.
- That the login `next` tab case produces a redirect in a real response (only the `/auth/confirm` case was run).
- Hosted `auth.audit_log_entries` retention and access, for IP-based signals.
- pg_net throughput under bursts, and any behaviour under load (no load was run).
- Whether any hosted Campaign is closed (the first judging tick would queue jobs and emails).
- That every user-content link carries `rel` hardening.
