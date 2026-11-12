# Claude log

A running log for Claude sessions on TGS. **Read this at the start of every session, and add an entry at the end of every session** (newest first). Keep each entry short: the detail lives in the linked session log, CHANGELOG and DEMO files.

Each entry: date, branch and latest commit, what was done, what is applied to hosted, what is open, and where the detail is. Never record secrets, `.env.local` values or users' personal data here.

## Current state (update every session)

| Branch | State | Latest commit | Hosted |
| --- | --- | --- | --- |
| `main` | Sprints 1–4 merged, launch email docs | `eec5c7c` | Sprint 4 migrations applied |
| `sprint-5-judging` | Built and committed locally, not pushed, no PR | see `git log` | Nothing applied |
| `legal-hardening` | Built, committed and **pushed 12 Nov** (19 commits ahead of `origin/main` after this log commit); no PR yet | see `git log` | Nothing applied (6 migrations `20261107000100`–`000600` written, dry run in the session log) |
| `sprint-4-audit-handle` | Separate work | — | — |
| `launch-email-confirm-template` | Step 12a is merged into `main`; `TGS/` still holds UNCOMMITTED doc edits (Resend `updates` subdomain, 20i, DMARC optional, `.co.uk` still to do) | `9dffdd0` | — |

Worktrees: `TGS/` (original checkout), `TGS-legal/` (legal-hardening), `TGS-sprint5/` (sprint-5-judging). They share one local Supabase database.

## Open for the owner

- Sprint 5: ratify the 30 DRAFT labels in `evals/judging/gold-set.json`.
- Sprint 5: edit the three PLACEHOLDER strings in `src/lib/judging/notices.ts`.
- Sprint 5: add Vault secrets `judging_processor_url`, `judging_processor_secret` and the Vercel variable `JUDGING_PROCESSOR_SECRET` (optional: `AI_MODEL_JUDGING`).
- Sprint 5: once `ANTHROPIC_API_KEY` exists, run `npm run eval:judging -- --real`.
- Sprint 5: approve push and PR; apply `20261111000100_judging_schema.sql` and `20261111000200_judging_functions.sql` to hosted only after the dry run lists exactly those two.
- Decide whether account deletion also removes a deleted user's peer votes and mind-change picks (legal-hardening owns that function).

- Legal hardening: open the PR (owner, on GitHub), then fill the bracketed facts listed in `docs/SESSION_LOG_LEGAL_HARDENING.md`, and apply the six migrations to hosted only after review and a dry run. `LEGAL.reviewed` stays false until the solicitor signs off. Account deletion stays OFF.
- Housekeeping: update both logs at the end of every session without being asked (owner, 12 Nov: "I should not remind you again").
- This file was created on `legal-hardening` from the `sprint-5-judging` copy: expect an add/add conflict in `docs/CLAUDE_LOG.md` when both merge (keep both entries).

## Entries

### 2026-11-07 to 12 — Hosted invites, admin role, launch email docs (operations)

- Hosted: two QA invites were created (the first was held by an unconfirmed sign-up; the second allows 5 uses, 1 used). The owner's own account was given the admin role on hosted (audit row written). No migrations applied by me. Codes and addresses are deliberately not recorded here.
- Finding: Supabase confirmed an email even though `/auth/confirm` redirected to `confirm_failed`; likely the default `code` link opened on another device. Fix is the Confirm sign up template (step 12a, now on `main`); the hosted dashboard setting is still the owner's.
- Detail and the owner's to-do list: `docs/SESSION_LOG_INVITE_QA.md` (untracked, in the `TGS/` checkout).

### 2026-11-12 — Legal hardening pushed

- **Branch:** `legal-hardening` from `origin/main`, worktree `TGS-legal/`, head `1051a70`-plus-this-commit (log updates; `eb66c6b` added this log), pushed to `origin/legal-hardening`. No PR opened, nothing merged. `sprint-4-audit-handle` is on `origin` but still unmerged; `sprint-5-judging` is not on `origin`.
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
