# Launch audit, 17 November 2026 (soft launch 1 Dec; Campaign 1 closes 8 Dec; first Verdict about 12 Dec)

Built from the repo on `main` (`8dce90c`), the unmerged branches, the worktrees and a fresh run of every quality gate on cc's own local stack. Nothing was run against hosted Supabase or Vercel. Anything about hosted is "unverified" unless the owner has reported it (and then it is marked owner-reported). Legal wording and "[to be added]" values are out of scope and untouched. Owners: **cc** = Claude Code can do it; **Dele** = only Dele can; **Decision** = Dele must decide first. Size: S under 1 hour, M a few hours, L a day or more.

## 1. Branches and the merge order

| Branch | What it holds | Stacked on | Needs |
| --- | --- | --- | --- |
| `docs/launch-audit-2026-11-17` (this branch) | This audit, refreshed log and runbooks, brand README, stale-comment fixes. Includes the four docs-only branches below | `main` | merge first |
| `docs-launch-decisions-16-nov`, `log-ai-cap-2000`, `log-vat-topic-loaded`, `docs-launch-hygiene` | Docs only (16 Nov decisions, AI cap 2,000, VAT topic loaded, runbook note) | `main` (11 behind) | **already merged into this branch; delete after it merges** |
| `docs-w7-eval-notes` | W7 eval notes plus a small code change (`src/lib/judging/eval-report.ts`, tested; `scripts/eval-judging.ts`) | `main` (11 behind) | rebase (log conflict, keep both), then merge; independent |
| `invites-admin-lite` | Admin invites small version: new migration `20261116000200_admin_invites.sql`, admin screen, tests | the merged `invites-join-requests` (9 behind `main`) | rebase; hosted migration before merge. Owned by the other session |
| `feat/verdict-winning-case` | Winner's summary backend and admin, prompt v2, stricter validator, eval script; migration `20261116000100_verdict_winner_summary.sql` | `main` (11 behind) | **rename the migration (version clash, see 2)**, rebase, hosted migration, then merge |
| `feat/verdict-winning-case-public` | Public "The winning case" section, two Verdict fixes | the **old** tip of `feat/verdict-winning-case` | rebase onto the new tip after it lands; merge last |
| `ui/font-picker-backup-pre-rebase`, `ui/header-logo`, `fix-main-factemail`, `fix-legal-ui-merge` | Local leftovers (merged or superseded) | – | local branches removed in this pass where verified |

Recommended merge order: (1) this branch; (2) `docs-w7-eval-notes`; (3) hosted migrations in version order, then (4) `invites-admin-lite`; (5) `feat/verdict-winning-case`; (6) `feat/verdict-winning-case-public`. Every code branch conflicts with `main` only in `docs/CLAUDE_LOG.md` (keep both sides).

## 2. Database

Migrations on `main` after the last one the log says is applied to hosted (`20261113000800_rubric_publish.sql`, owner-reported 13 Nov):

| File | State |
| --- | --- |
| `20261116000100_join_requests_invites.sql` (on `main`, PR #66) | **Not known to be applied to hosted.** Its header says "migration first, then the code", but the code is already merged and deployed. If it is not applied, `/admin/invites` and the "ask to join" form will error on live. Dele: check and apply (commands in section 9) |
| `20261116000200_admin_invites.sql` (branch `invites-admin-lite`) | Not on `main`; apply before that branch merges |
| `20261116000100_verdict_winner_summary.sql` (branch `feat/verdict-winning-case`) | **Version clash:** it has the same version number (`20261116000100`) as the join-requests migration on `main`. The Supabase CLI keys migrations by that prefix, so a push would fail on a duplicate. Rename it to a later version (suggested `20261117000100_verdict_winner_summary.sql`) before applying; cc will do it on the owner's go (S) |

Apply order: `20261116000100_join_requests_invites`, then `20261116000200_admin_invites` (if that branch merges), then the renamed verdict migration. Always a dry run first from Dele's terminal: `npx supabase db push --dry-run --include-all --linked`.

Needed from hosted but not covered by a migration: Vault secrets (names below), the judge prompt version set to 1 (Admin, Judging: the database default is 2), Campaign 2's format changed from Oxford-style to Open arena, Auth rate limits and email templates (owner-reported done), pg_cron jobs exist only if the migrations were applied.

## 3. Launch configuration outside the repo (names only; none verified by cc)

| Item | What the code needs | Status |
| --- | --- | --- |
| Vercel Production env | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_PROCESSOR_SECRET`, `MODERATION_PROCESSOR_SECRET`, `JUDGING_PROCESSOR_SECRET`, `ANTHROPIC_API_KEY`. `EMAIL_TRANSPORT` must be unset or not `mailpit`; `AI_PROVIDER` must not be `fake`. Optional `AI_MODEL_SCREENING`, `AI_MODEL_NUDGE`, `AI_MODEL_COACH`, `AI_MODEL_JUDGING`. `DATABASE_URL` is for local scripts only | Unverified. `ANTHROPIC_API_KEY` was owner-reported set earlier |
| Vault secrets (SQL: `select name from vault.secrets order by name;`) | `email_processor_url`, `email_processor_secret`, `moderation_processor_url`, `moderation_processor_secret`, `judging_processor_url`, `judging_processor_secret` | Owner-reported all six exist (13 Nov) |
| pg_cron jobs | `campaign-tick`, `email-kick`, `email-closing-soon`, `judging-tick`, `judging-kick`, `moderation-sweep`, `join-requests-purge` and the `retention-*` and `housekeeping-limits-events` jobs | Created by migrations; presence on hosted unverified (check `select jobname, active from cron.job`) |
| Resend / email | Domain verified; Supabase sign-up and reset templates saved; redirect URLs; app email cut to essentials (cap 60 a day) | Templates and redirects owner-reported done; Resend domain unverified |
| Supabase Auth rate limits | 150 sign-ups and sign-ins, 100 token verifications per 5 minutes | Owner-reported done, with a screenshot (13 Nov) |
| Anthropic | Key in Vercel; monthly limit $30, notify $10; `ai_daily_cap_global` 2,000 | Cap 2,000 owner-reported 16 Nov; limits unverified |
| Domains | `thegrandstrategist.com` live; `.co.uk` redirect | Production serves the site; redirect unverified |
| Invites | Admin, Invites (once its migration is applied) or `npm run invite:create` (prints a LOCAL link: send the live `/signup?code=` form) | Unverified |

## 4. Campaign 1 and the slots

`under-16-social-media-ban` is published and scheduled (owner-reported 15 Nov from screenshots): rubric published 13:57 UTC with weights version 2 (panel 40, peer 25, AI rubric 25, mind-change 10), rules 1,398 characters, summary 1,340 characters, opens 1 Dec 2026 00:00 UTC, closes 8 Dec 00:00 UTC. The 14 other Campaigns are drafts (the VAT topic was loaded as a draft on 15 Nov). Open: Campaign 2 (`in-person-exams-ai-cheating`) must be changed to Open arena in Admin before scheduling; the three flagged Campaigns (`bank-of-england-rate-decision-november`, `rosebank-after-jackdaw`, `assisted-dying-or-fix-care-first`) cannot be scheduled until their owner-decision flags are cleared; `test-please-ignore` must stay a draft. None of this was read from hosted by cc. The repo holds the topic bank (`supabase/data/launch-topics.json`, 16 topics) and `docs/campaigns/`.

## 5. Quality gates on `main` (17 Nov, cc's own stack `tgs-ui`, ports 55xxx)

| Gate | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run test:unit` | 26 files, 385 tests pass |
| `npm run test:rls` (freshly reset local database) | 36 files, 382 tests pass |
| `npx playwright test` | 147 pass |
| `npm audit` | 17 findings (11 high, 6 moderate), **all in dev tooling** (vitest, vite, eslint config, picomatch/minimatch chain). `npm audit --omit=dev`: **0 vulnerabilities** |
| WCAG text contrast (own script, 5,912 text nodes, 88 page states: 11 pages x light and dark x default and Large text x 375 and 1280px) | 0 failures. Gradient backgrounds are not evaluated by the script |
| Link crawl (60 public pages, logged out) | 0 broken links |

Lighthouse (production build, local; mobile = default emulation, desktop = desktop preset; accessibility included contrast for light, and a dark-mode forced run for home and verdict):

| Page | Form factor | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- |
| Home | mobile | 89 (95 on the dark rerun) | 100 | 100 | 100 |
| Home | desktop | 100 | 100 | 100 | 100 |
| Campaign | mobile | 100 | 100 | 100 | **91** |
| Campaign | desktop | 100 | 100 | 100 | **91** |
| Verdict | mobile | 100 | 100 | 100 | 91 |
| Verdict | desktop | 99 | 100 | 100 | 100 |

SEO 91 is one audit: campaign and verdict pages have no meta description. Home mobile performance varies between 89 and 96 between runs on a cold build.

## 6. Operational readiness

| Area | State |
| --- | --- |
| Error monitoring | **No Sentry, PostHog or Inngest in the app** (`package.json`), although CLAUDE.md lists them. Errors are visible in Vercel logs, Admin, Health (queues and job runs), the event log and CSP reports (report-only). Decision needed: accept that for the pilot, or add Sentry (free tier; a new library) |
| Backups | `scripts/backup-dump.sh` and `docs/BACKUP_RESTORE.md`; local restore rehearsed; first hosted dump taken and encrypted by the owner (owner-reported 13 Nov). Free plan has no automatic backups: take one before launch and before the first Verdict |
| Rate limits | App rate limiter and kill switches (posting, sign-ups, email, AI) in Admin, Settings; Supabase Auth limits raised (owner-reported) |
| AI judging fallback | If the API fails, scoring jobs wait and retry hourly and nothing is published automatically; AI off falls back as set in Settings; cap 2,000 a day, judging stops at 80% (see `docs/FIRST_VERDICT_RUNBOOK.md`) |
| First Verdict runbook | **Was missing; added in this pass** as `docs/FIRST_VERDICT_RUNBOOK.md` (from the code and demo; not rehearsed on hosted) |
| Winning-case summary approval | Admin drafts on demand, edits, picks the best Dispatch, confirms and approves; only then can it be public. Code is on `feat/verdict-winning-case`, not on `main`; needs its migration |

## 7. Product loose ends (found, not fixed; no product changes in this pass)

| Item | Size |
| --- | --- |
| Campaign and Verdict pages have no meta description (SEO 91) | S |
| Privacy page lists the cache name `tgs-shell-v1`; the service worker cache is now `tgs-shell-v3` (legal page: owner) | S, Dele |
| Local seed data shows "[Sample]" and "[Test data]" titles (local only; hosted has the real topics) | none |
| Legal pages carry the DRAFT banner and "[to be added]" values (out of scope) | Dele |
| No error-monitoring service (see section 6) | M if wanted |
| No dark-mode or light-mode toggle: the theme follows the browser (decided, left as is) | none |
| Home mobile Lighthouse performance varies 89 to 96 | S to investigate |

## 8. Item table

| Item | Owner | Blocks 1 Dec? | Next step |
| --- | --- | --- | --- |
| Hosted has `20261116000100_join_requests_invites` | Dele | **Yes, if not applied** (live admin invites and join form fail) | Run the dry run; apply if listed (commands in section 9) |
| Verdict migration version clash with `20261116000100` | cc (after Dele's go) | No for 1 Dec (the feature is for about 12 Dec), yes for merging that branch | Rename to `20261117000100_verdict_winner_summary.sql`, update references, rerun suites |
| Judge prompt version set to 1 on hosted | Dele | **Yes** (before 8 Dec) | Admin, Judging, "Judge prompt version" 1, with a reason |
| Campaign 2 format to Open arena | Dele | No (before it is scheduled) | Admin, Campaigns |
| Vercel env names present and correct, `EMAIL_TRANSPORT` and `AI_PROVIDER` not test values | Dele | **Yes** | Check against section 3 |
| Resend domain verified; one real sign-up, confirmation and reset on the live site | Dele | **Yes** | `docs/LAUNCH_RUNBOOK.md` owner actions |
| Invites for wave 1 created and sent | Dele | **Yes** | Admin, Invites (after the migration) or `invite:create` with the live link |
| Anthropic limits ($30, notify $10) confirmed | Dele | Yes (spend risk) | Anthropic console |
| Fresh hosted dump before launch and before the first Verdict | Dele | Yes | `bash scripts/backup-dump.sh` |
| Second admin account; `/admin` refused for members | Dele | Yes | Runbook owner actions (member test owner-reported done) |
| Merge order and rebases (section 1) | cc then Dele | No | cc rebases; Dele merges in order |
| Error monitoring decision | Decision | No | Accept Vercel logs plus Admin Health, or approve Sentry |
| Meta description on Campaign and Verdict pages | cc | No | Small change after this pass |
| First-Verdict runbook rehearsal | Dele with cc | No (needed by 12 Dec) | Walk it on a local seeded Campaign, then read it again on 8 Dec |

## 9. Commands for Dele (from your own terminal; cc has no hosted access)

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push --dry-run --include-all --linked
```

The dry run must list only migrations you expect (today: `20261116000100_join_requests_invites.sql` if it is not yet applied). Apply with `npx supabase db push --include-all --linked`. Paste back the output with any connection string removed.

Read-only checks in the Supabase SQL Editor:

```sql
select version from supabase_migrations.schema_migrations order by version desc limit 5;
select name from vault.secrets order by name;
select jobname, active from cron.job order by jobname;
select judge_prompt_version from public.judging_settings;
```

Expect the newest version to be `20261116000100` after the join-requests migration, six Vault names, every job above present and active, and a judge prompt version of 1 once you have set it.

## 10. Housekeeping done in this pass (local branches only; the shared repo's local refs)

Removed 41 local branches after checking each was an ancestor of `origin/main` (content is on `main`), plus the local `ui/logo-exploration` (its tip equals the tag `archive/ui-logo-exploration`): `auth-limits-recorded`, `campaign1-prep`, `campaign1-rules-owner-text`, `campaign1-rules-update`, `campaign1-scheduled`, `clamp-final-score`, `claude-log-campaign1-brief`, `claude-log-merged-prs`, `claude-log-open-items`, `claude-log-pr-46`, `claude-log-prs-41-42`, `claude-log-row-15`, `claude-log-rule7-applied`, `claude-log-state-refresh`, `docs-correct-cap-claims`, `docs-launch-refresh`, `docs-vat-sources-pick-wording`, `fix-email-overflow-375`, `fix-legal-ui-merge`, `fix-main-factemail`, `fix-rls-topic-count`, `go-no-go-owner-done`, `go-no-go-row-15`, `invites-join-requests`, `invites-join-requests-build`, `launch-owner-actions`, `log-owner-reports-15-nov`, `main`, `notices-wording`, `rubric-wording`, `rule7-rubric-publish`, `sprint-7-batch-2b`, `test-check-before-relying-v1`, `topic-bank-vat-private-schools`, `ui/brand-reskin`, `ui/font-picker`, `ui/header-logo`, `ui/header-the-lockup`, `ui/mobile-nav`, `ui/polish`, `ui/logo-exploration`.

Kept, with the reason: `docs-launch-decisions-16-nov` (checked out in the shared `TGS/` checkout), `invites-admin-lite` and `TGS-invites/` (the other session's worktree), `feat/verdict-winning-case` and `TGS-summary/` (cc's worktree for unmerged work), `docs-w7-eval-notes`, `log-vat-topic-loaded` (the local copies are older, pre-rebase versions of branches that exist on origin), `docs-launch-hygiene`, `log-ai-cap-2000` (merged into this branch, delete after it merges), `ui/font-picker-backup-pre-rebase` (a local-only backup of the Display dialog work before its rebase; the work is on `main` but its commits are not patch-identical, so it is kept until Dele agrees to delete it). Remote branches that are merged into `main` were not deleted in this pass.
