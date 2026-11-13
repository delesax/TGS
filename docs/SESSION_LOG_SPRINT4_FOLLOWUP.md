# Session log: Sprint 4 follow-up (verify, apply, hardening, owner docs, audit handle)

For sharing with Claude. Latest of three logs: read `SESSION_LOG_SPRINT4.md`, then `SESSION_LOG_SPRINT4_REVIEW_FIXES.md`, then this. Written 6 November 2026 after re-checking git, GitHub and hosted.

## State now (checked 6 November, after both merges)
- **PR #3 is merged** (`closed`, `merged: true`) and **PR #4 is merged** into `main`. `origin/main` is at **`cbc3d7a`** ("Merge pull request #4 from delesax/sprint-4-hardening"). Both were merged by the owner; I never had a merge credential.
- **Hosted Supabase has all migrations through `20261104000400`.** Verified read-only: the recorded migrations include `000100`, `000200`, `000300` and `000400`; `profiles_block_tombstone_handle` contains the "cannot be restored" rule; the trigger `profiles_no_handle_on_tombstone` exists. A dry run said "Remote database is up to date."
- **`000400` was NOT applied by me.** It was already on hosted when I ran the dry run. **What the repo and GitHub show (7 November):**
  - The repo applies nothing to hosted: the only workflow (`ci.yml`) starts a *local* Supabase; `build` is plain `next build`; `db:push` is a manual script; there is no `vercel.json`, `.vercel`, branching config or `[remotes]` block in `supabase/config.toml`.
  - **The Supabase GitHub app runs a check on every push to `main`, and it did not on pull requests.** On PR heads its check is "skipped: Creating a new preview branch per PR is disabled". On each merge commit pushed to `main` it ran and succeeded in about 5 seconds, with a details link to the hosted project (`jsbgactqutgoacogsoct`): `6181e8a` (PR #1, 2 Nov 07:44:08), `4a573ec` (PR #2, 2 Nov 11:25:52) and `cbc3d7a` (PR #4, 6 Nov 11:56:30). The output is empty, so GitHub does not say what it did.
  - Consistent with that: the hosted database had Sprint 3's migrations (`20261103000100` to `000300`) by the start of Sprint 4, after PR #2 was merged, and `000400` appeared right after the 6 November merge. Migrations I applied by hand (`000100`, `000200`, `000300`) were already recorded, so only `000400` was new.
  - PR #4 and PR #3 merged within two seconds of each other (11:56:01 and 11:56:03, both by the owner); `main` has one merge commit, `cbc3d7a`.
  - **Conclusion: very likely the Supabase GitHub integration deploys migrations to production when `main` changes.** This is circumstantial: GitHub cannot show the integration's settings. **To confirm (owner):** Supabase dashboard -> the project -> Integrations (or Project Settings) -> GitHub, and look for a production-deploy / automatic-deploy option for the production branch; and Logs -> Postgres around 2026-11-06 11:56 UTC for the DDL. If it is on, merging the audit-handle branch will apply `000500` automatically.
- **Hosted app (Vercel):** deployment is handled by a different Claude session; I did not check or touch it.
- **Branch `sprint-4-hardening`** is merged, head `64e4278`; CI on PR #4 was green (lint/typecheck/unit, RLS + Playwright, Vercel; Supabase Preview skipped).

- **Branch `sprint-4-audit-handle`** (7 November, from `main` at `cbc3d7a`), head **`bc88132`**, pushed. Migration `20261104000500_audit_no_handle.sql`: `decide_held_handle()` no longer writes the handle into `audit_log.details` (only `flag_id` and `reason`; the diff against the old function is that one line). 5 new RLS tests, which fail against the old function. **Not applied to hosted, not merged, no PR yet** (owner creates it). Local: lint, typecheck clean; unit 141; RLS 167; Playwright 16; build OK. A hosted dry run lists exactly `20261104000500_audit_no_handle.sql`. **Do not merge it until the auto-deploy setting above is checked.**
- **A second handle leak, not fixed:** onboarding (`src/app/onboarding/actions.ts`) writes `{ handle }` into `audit_log` as `profile.handle_set` for every handle chosen. Entries from both paths that already exist cannot be changed. I did not count the existing hosted rows (a read-only query was blocked, and the task was dry-run only). To count them: `select action, count(*) from public.audit_log where details ? 'handle' group by action;` in the Supabase SQL editor.

## What was done this session
- **Phase A (verify):** fresh local database; lint, typecheck clean; unit 141; RLS 155; Playwright 15; build OK. DEMO.md followed step by step at 375px with the fake AI provider (a throwaway script, deleted): all 10 steps PASS, plus the outcome emails, with no console errors and no sideways scroll.
- **Phase B (hosted):** dry run listed exactly the one migration; first apply attempt failed to connect ("Socket is closed", nothing applied); second attempt applied it.
- **Phase C (merge):** not done by me (no credential). The owner merged PR #3 and PR #4 afterwards.
- **Phase D (hardening branch):**
  - `20261104000400_tombstone_hardening.sql`: `deleted_at` can never be cleared once set, for every role including the service role and direct SQL. `anonymise_profile()` and account deletion still work. 7 new RLS tests.
  - `/admin/moderation`: a decision now refreshes the list at once while a sticky "Just decided" log keeps the confirmation; the form resets so a kept-held item can be decided again. New Playwright check at 375px.
  - `npm audit`: no non-breaking fixes exist, nothing changed; 8 moderate advisories remain (one chain: `minimatch` via `eslint-config-next` -> `typescript-eslint`), dev tooling only. The only fix is `--force` (breaking).
  - Local results on the branch: lint, typecheck clean; unit 141; RLS 162; Playwright 16; build OK.
- **Phase E (owner docs, separate commit):** `docs/DRAFT_WORDING.md` and `docs/OWNER_DECISIONS.md`.

## Problems met
- **GitHub API rate limit** (unauthenticated, 60 an hour): my own polling used it up, so the formal CI read waited about an hour. Do not poll in a tight loop; use one read.
- **Leftover local server:** my `pkill` missed the `next-server` child, which blocked Playwright on port 3100; killed by PID. Port 3100 is also held by Docker's own forwarder; that one is fine.
- **Hosted connection** dropped once on apply; the retry worked.
- **Permission classifier** earlier refused loading `.env.local` once and `bind_pr` once; the owner allowed the former. Nothing was worked around.

## Still open
1. Check the Vercel deployment of Sprint 4 (other session). Until it is live, hosted may still show Sprint 3 behaviour.
2. **Owner: confirm the Supabase GitHub integration setting** (see the findings above). If merges to `main` auto-apply migrations, review-before-apply no longer happens for anything merged.
2b. Decide about the audit log and handles: merge the `sprint-4-audit-handle` PR (after 2), and whether to also stop the onboarding `profile.handle_set` entry (a code change, not a migration).
3. Hosted setup: `ANTHROPIC_API_KEY`, `MODERATION_PROCESSOR_SECRET` in Vercel, two moderation Vault secrets (`docs/LAUNCH_EMAIL_SETUP.md`, steps 15 and 18). Until the key is added every hosted Dispatch takes the fallback.
4. Real-model evaluations not run (`npm run eval:moderation -- --real`, `npm run eval:coach -- --real`); the fake provider's numbers are not Haiku's.
5. The nine owner decisions and the DRAFT wording (`docs/OWNER_DECISIONS.md`, `docs/DRAFT_WORDING.md`).

## Files
The three `docs/SESSION_LOG_SPRINT4*.md` files are untracked (not committed, not in any PR).
