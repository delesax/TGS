# Claude log

A running log for Claude sessions on TGS. **Read this at the start of every session, and add an entry at the end of every session** (newest first). Keep each entry short: the detail lives in the linked session log, CHANGELOG and DEMO files.

Each entry: date, branch and latest commit, what was done, what is applied to hosted, what is open, and where the detail is. Never record secrets, `.env.local` values or users' personal data here.

## Current state (update every session)

| Branch | State | Latest commit | Hosted |
| --- | --- | --- | --- |
| `main` | Sprints 1–4 merged, launch email docs | `eec5c7c` | Sprint 4 migrations applied |
| `sprint-5-judging` | **Pushed 12 Nov**, no PR. `public_acknowledged` fix for legal-hardening's sign-up trigger is in | see `git log origin/sprint-5-judging` | Nothing applied |
| `legal-hardening` | Built and **pushed 12 Nov**, no PR yet (owns legal pages, account deletion, DEMO.md); six migrations written, not applied | see `git log origin/legal-hardening` | Nothing applied |
| `sprint-4-audit-handle` | On origin, no PR; one migration `20261104000500_audit_no_handle.sql` (stops new handle writes in `decide_held_handle`; old rows untouched) | `bc88132` | Nothing applied |
| `launch-email-confirm-template` | Doc edits (Resend `updates` subdomain, 20i, DMARC optional) committed and **pushed 12 Nov**; owner to open PR | `968fdaf` | — |

Worktrees: `TGS/` (original checkout), `TGS-legal/` (legal-hardening), `TGS-sprint5/` (sprint-5-judging). They share one local Supabase database.

## Open for the owner

- Sprint 5: ratify the 30 DRAFT labels in `evals/judging/gold-set.json`.
- Sprint 5: edit the three PLACEHOLDER strings in `src/lib/judging/notices.ts`.
- Sprint 5: add Vault secrets `judging_processor_url`, `judging_processor_secret` and the Vercel variable `JUDGING_PROCESSOR_SECRET` (optional: `AI_MODEL_JUDGING`).
- Sprint 5: once `ANTHROPIC_API_KEY` exists, run `npm run eval:judging -- --real`.
- Open PRs (owner): `launch-email-confirm-template` (https://github.com/delesax/TGS/compare/main...launch-email-confirm-template) and, when ready, `sprint-5-judging`.
- Hosted migrations: apply in timestamp order (audit-handle, then legal-hardening, then Sprint 5) to avoid `--include-all`.
- Sprint 5: apply `20261111000100_judging_schema.sql` and `20261111000200_judging_functions.sql` to hosted only after the dry run lists exactly those two.
- Sprint 5 and legal-hardening both add `docs/CLAUDE_LOG.md`: expect an add/add conflict (and in `CHANGELOG.md` and `tests/rls/every-table-has-rls.test.ts`) when the second one merges; keep both sides.
- Decide whether account deletion also removes a deleted user's peer votes and mind-change picks (legal-hardening owns that function).

## Entries

### 2026-11-12 — Key check and gold-set review sheet

- `.env.local` is gitignored (`.gitignore:34 .env*`) and untracked in `TGS/`, `TGS-sprint5/` and `TGS-legal/`. `TGS-sprint5/.env.local` is now a symlink to `../TGS/.env.local` (no copy). The owner's `.env.local` has one well-formed `ANTHROPIC_API_KEY` line (checked without reading the value out).
- Because of the symlink, scripts in `TGS-sprint5/` load hosted values unless `.env.test.local` is sourced first; seeds refuse hosted (`assertLocal`), Playwright refuses non-local.
- `npm run eval:judging -- --real` refuses with no key ("--real needs ANTHROPIC_API_KEY. Nothing was sent.", exit 1). Not run with the key yet: waiting for the owner's go.
- Gold-set review sheet written to the owner's Desktop (outside the repo); `gold-set.json` unchanged.
- Owner said run the real eval: all 30 calls failed with 401 `invalid x-api-key`, nothing scored, spend £0. Cause: the `ANTHROPIC_API_KEY` in `TGS/.env.local` is not a Console API key (its type label is `usr`, 124 characters, ends in `=`; real keys start `sk-ant-api03-`, about 108 characters). Owner to replace it, then re-run. Also found: the eval exits 0 when every call fails, and its £ cap compares a USD figure (stops at about $5).

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
