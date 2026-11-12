# Claude log

A running log for Claude sessions on TGS. **Read this at the start of every session, and add an entry at the end of every session** (newest first). Keep each entry short: the detail lives in the linked session log, CHANGELOG and DEMO files.

Each entry: date, branch and latest commit, what was done, what is applied to hosted, what is open, and where the detail is. Never record secrets, `.env.local` values or users' personal data here.

## Current state (update every session)

| Branch | State | Latest commit | Hosted |
| --- | --- | --- | --- |
| `main` | Sprints 1–4 merged, launch email docs | `eec5c7c` | Sprint 4 migrations applied |
| `sprint-5-judging` | Built and committed locally, not pushed, no PR; session log refreshed 12 Nov (trial merges redone) | see `git log` | Nothing applied |
| `legal-hardening` | Built and **pushed 12 Nov**, no PR yet (owns legal pages, account deletion, DEMO.md); six migrations written, not applied | see `git log origin/legal-hardening` | Nothing applied |
| `sprint-4-audit-handle` | Separate work | — | — |
| `launch-email-confirm-template` | Step 12a already merged into `main`; `TGS/` still holds uncommitted doc edits (Resend `updates` subdomain) | `9dffdd0` | — |

Worktrees: `TGS/` (original checkout), `TGS-legal/` (legal-hardening), `TGS-sprint5/` (sprint-5-judging). They share one local Supabase database.

## Open for the owner

- Sprint 5: ratify the 30 DRAFT labels in `evals/judging/gold-set.json`.
- Sprint 5: edit the three PLACEHOLDER strings in `src/lib/judging/notices.ts`.
- Sprint 5: add Vault secrets `judging_processor_url`, `judging_processor_secret` and the Vercel variable `JUDGING_PROCESSOR_SECRET` (optional: `AI_MODEL_JUDGING`).
- Sprint 5: once `ANTHROPIC_API_KEY` exists, run `npm run eval:judging -- --real`.
- Sprint 5: approve push and PR; apply `20261111000100_judging_schema.sql` and `20261111000200_judging_functions.sql` to hosted only after the dry run lists exactly those two.
- Sprint 5 and legal-hardening both add `docs/CLAUDE_LOG.md`: expect an add/add conflict (and in `CHANGELOG.md` and `tests/rls/every-table-has-rls.test.ts`) when the second one merges; keep both sides.
- Decide whether account deletion also removes a deleted user's peer votes and mind-change picks (legal-hardening owns that function).

## Entries

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
