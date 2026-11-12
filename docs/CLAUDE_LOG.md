# Claude log

A running log for Claude sessions on TGS. **Read this at the start of every session, and add an entry at the end of every session** (newest first). Keep each entry short: the detail lives in the linked session log, CHANGELOG and DEMO files.

Each entry: date, branch and latest commit, what was done, what is applied to hosted, what is open, and where the detail is. Never record secrets, `.env.local` values or users' personal data here.

## Current state (update every session)

| Branch | State | Latest commit | Hosted |
| --- | --- | --- | --- |
| `main` | Sprints 1–4 and **Sprint 5 merged (PRs #6 to #8, 12 Nov), ratified gold set and logs merged (PR #10)**, launch email docs | see `git log origin/main` | Sprint 4 migrations applied; **Sprint 5 migrations applied 12 Nov** (`20261111000100`, `20261111000200`) |
| `sprint-5-judging` | **Fully merged to `main` (PR #6 code, PR #7 log).** Nothing left on the branch | see `git log` | Migrations applied to hosted (see `main`) |
| `legal-hardening` | Built and **pushed 12 Nov** (local is 1 log commit ahead of origin), no PR yet (owns legal pages, account deletion, DEMO.md); six migrations written, not applied | see `git log origin/legal-hardening` | Nothing applied |
| `sprint-4-audit-handle` | On origin, no PR; one migration `20261104000500_audit_no_handle.sql` (stops new handle writes in `decide_held_handle`; old rows untouched; main's onboarding still writes the handle, fixed only by legal-hardening) | `bc88132` | Nothing applied |
| `launch-email-confirm-template` | Doc edits (Resend `updates` subdomain, 20i, DMARC optional) committed and **pushed 12 Nov**; owner to open PR | `968fdaf` | — |

Worktrees: `TGS/` (original checkout), `TGS-legal/` (legal-hardening), `TGS-sprint5/` (sprint-5-judging). They share one local Supabase database.

## Open for the owner

- Open and merge the PR for `claude-log-processor-routes` (log-only), then tell Claude "merged" so it can reset local `main` and delete that branch.
- Sprint 5: edit the three PLACEHOLDER strings in `src/lib/judging/notices.ts`.
- Sprint 5: add Vault secrets `judging_processor_url`, `judging_processor_secret` and the Vercel variable `JUDGING_PROCESSOR_SECRET` (optional: `AI_MODEL_JUDGING`).
- PR descriptions for all four branches are in `~/Desktop/pr-descriptions.md` (outside the repo). Apply legal-hardening migrations and deploy its code within minutes of each other: migrations first breaks sign-up and positions on live main; code first breaks export, privacy contact and positions.
- Open PRs (owner): `launch-email-confirm-template` (https://github.com/delesax/TGS/compare/main...launch-email-confirm-template) (`sprint-5-judging` is already merged as PR #6).
- Hosted migrations: apply in timestamp order (audit-handle, then legal-hardening, then Sprint 5) to avoid `--include-all`.
- Sprint 5 on hosted: judging only does anything once a Campaign closes. Add the Vault secrets above so the AI scoring kick can run (without them the work waits).
- Confirm the old hosted database password is revoked: it was printed once into a Claude session's output on 12 Nov (a filter let the CLI's echo of the connection string through). `DATABASE_URL` in `TGS/.env.local` was updated afterwards and the dry run connects, so a new password is in use; this is not checked beyond that.
- Sprint 5 and legal-hardening both add `docs/CLAUDE_LOG.md`: expect an add/add conflict (and in `CHANGELOG.md` and `tests/rls/every-table-has-rls.test.ts`) when the second one merges; keep both sides.
- Decide whether account deletion also removes a deleted user's peer votes and mind-change picks (legal-hardening owns that function).

## Entries

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
