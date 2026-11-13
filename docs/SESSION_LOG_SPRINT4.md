# Session log: Sprint 4 (AI moderation, coach and admin)

> **State below is as of 3 to 6 November, at `5e4616e`. For the current state read `docs/SESSION_LOG_SPRINT4_FOLLOWUP.md` (6 November, latest) after `docs/SESSION_LOG_SPRINT4_REVIEW_FIXES.md`.** Later changes: a third migration was added and applied to hosted, and a hardening branch was opened.

Written 6 November 2026 for sharing with Claude. Covers work from 2 to 3 November 2026. State checked on 6 November.

## Where things stand
- **Branch:** `sprint-4`, cut from `main` at `4a573ec` (Sprint 3). Latest commit **`5e4616e`**, pushed to `origin/sprint-4`.
- **Pull request:** [delesax/TGS#3](https://github.com/delesax/TGS/pull/3), **open, not merged**, GitHub reports it can merge cleanly. CI on `5e4616e` is green: lint/typecheck/unit, RLS + Playwright, Vercel Preview Comments passed; Supabase Preview skipped.
- **Hosted Supabase:** both Sprint 4 migrations are **applied** (3 November, at the owner's request, after a reviewed dry run). A second dry run said "Remote database is up to date."
- **Hosted app (Vercel):** still running Sprint 3 code on the new schema. Sprint 3's posting code does not screen, so until Sprint 4 is deployed new Dispatches stay `pending` and are hidden from others. Deploying Sprint 4 (merging PR #3) fixes this.
- **Sprint 5 has not been started.** Nothing is merged or deployed.

## What was built (all in PR #3)
- **AI module** (`src/lib/ai`, server only): `screenHandle`, `screenDispatch`, `nudgeDispatch`, `coachDispatch`. Versioned prompts in `prompts/*.v1.md`; 4 s (screening, nudges) and 20 s (coach) limits with one retry; zod-validated structured output; untrusted text between `<untrusted_text>` delimiters; caps, kill switch, spend log. Models: Haiku (`claude-haiku-5-5`) for screening and nudges, Sonnet (`claude-sonnet-5-5`) for the coach, switchable in Admin → Settings.
- **Fake provider** (`AI_PROVIDER=fake`): deterministic and keyword-driven, used by every test, the seed and CI. The real provider is never chosen under Vitest or CI.
- **Moderation:** `post_dispatch()` inserts as pending; the server screens straight away; `apply_dispatch_screening()` (service role only) applies the result. AI may hold, never delete; "block" is a high-priority hold. pg_cron sweeper (`/api/moderation/sweep`) re-screens anything pending 2+ minutes. Undeclared-AI text is a soft flag only. Fallback when the AI is unavailable: normal Campaigns post marked unscreened; sensitive ones hold. Handles: deny-list first, then the AI; held handles wait for a person.
- **Review queue** `/admin/moderation` (replaces `/admin/reports`, which redirects): release, keep held, remove (sealed), dismiss; reason required; AI overrides recorded; appeals (once; same-admin warning); outcome emails through the Sprint 3 outbox with a new "moderation" preference.
- **Admin console:** home (queue, AI spend, coach usefulness), Users with posting mute, Settings, judging weights (40/25/25/10, versioned, locked once a Campaign opens), audit log with CSV export, allowed Dispatch kinds per round in the Campaign form.
- **Nudge and coach:** private, never stored with the draft; coach asks questions and never writes replacement text (enforced in code); 3 uses per draft, 10 a day; thumbs up/down with optional comment.
- **Account deletion:** tombstone profiles; `profiles` detached from `auth.users`; `dispatches.author_id` and `awards.profile_id` now restrict, so deletion can never cascade into Dispatches; behind `account_deletion_enabled` (**off**); all wording DRAFT.
- **Carry-over:** Dossier paging (50 a page); streamed data export; reply/edit forms and AI help load only when opened (first-visit time to interactive unchanged at 3.07 s).
- **Tooling and docs:** `seed:abuse`, `eval:moderation`, `eval:coach`, `evals/moderation-gold.json` (40), `evals/coach-samples.json` (20), `docs/LAUNCH_EMAIL_SETUP.md`, updated CHANGELOG.md and DEMO.md.
- **Migrations:** `20261104000100_ai_moderation.sql`, `20261104000200_account_deletion.sql`. No table, column or row dropped.

## Test results (fresh local database)
Lint and typecheck clean; unit **137** (35 new); RLS **122** (30 new); Playwright **15** (6 new, 375px, fake AI); `npm run build` succeeds. Same suites green in CI on GitHub.
`eval:moderation` on the fake provider: 15/15 clearly abusive held, 0/15 benign held. **These are the fake provider's numbers, not Haiku's.**

## Owner decisions I defaulted (all changeable without a release)
1. AI unavailable: normal Campaigns post unscreened and flagged; sensitive Campaigns hold.
2. Undeclared-AI text: soft flag for review only.
3. Coach: Sonnet (about 20× Haiku's price; roughly £65 a month at full use vs under £4), never suggests wording.
4. Caps: 3,000 AI calls a day total; 40 nudges+coach per Strategist a day; coach 3 per draft and 10 a day; evaluation budget £5.
5. Privacy policy: DRAFT AI-processing paragraph on `/privacy`; needs legal review before real invitees.
6. Retention of `ai_decisions` and coach feedback: no default given, so nothing is deleted automatically.
7. Appeals with one admin: allowed, with an on-screen warning and an audit note.
8. Account deletion: built, off, DRAFT wording; positions on closed Campaigns kept unlinked.
9. Handle screening scope: handles only (display names and bios can be switched on).

## Wording awaiting owner approval
`/profile/delete`, `/account-deleted`, the deletion confirmation checkbox, the AI paragraph on `/privacy`, and the AI help note in the compose box.

## Problems met and how they were resolved
- **Existing tests assumed immediate visibility.** Sprint 3 RLS tests posted Dispatches and expected them visible. Added `applyScreening()` and `purgeUsers()` helpers; since deleting a user now keeps their Dispatches, tests clear their own Dispatches first.
- **PL/pgSQL name clashes** (`reason`, `resolution`, `comment` as variables vs columns): renamed to `v_reason`, `v_resolution`, `v_comment`.
- **`hold_priority` missing from the column grant** broke the admin queue; added to the grant.
- **375px overflow** on the AI spend table; replaced with a stacked list.
- **Confirmations disappearing** after appeal and admin decisions because revalidation remounted the thread; removed the revalidation (the Close button refreshes).
- **Permission denials:** loading `.env.local` was refused once (the dry run then worked after the owner allowed it); linking the PR to the session's PR panel (`bind_pr`) was refused, so CI was read from GitHub's API instead.
- **GitHub token lacked the `workflow` scope**, so the push was rejected for editing `.github/workflows/ci.yml`. The owner chose to drop that change; `ci.yml` matches `main`. CI still never uses the real API: `npm run test:env` writes `AI_PROVIDER=fake`, Playwright sets it and blanks the key, and CI has no Anthropic key.
- **`gh` is not installed**, so the PR was created by the owner from a pre-filled GitHub page.

## Not done / still open
- **Merge PR #3 and deploy** (owner's call). Until then hosted Dispatches stay pending and hidden.
- **Hosted setup:** `ANTHROPIC_API_KEY`; `MODERATION_PROCESSOR_SECRET` in Vercel; two Vault secrets for the moderation sweeper (`docs/LAUNCH_EMAIL_SETUP.md`, steps 15 and 18). Email setup (Resend, SMTP, custom domain) is still the owner's, per that document. Until the key is added, every hosted Dispatch takes the fallback.
- **Real-model evaluations not run:** `npm run eval:moderation -- --real` (target 100% of clearly abusive held, 10% or fewer benign held) and `npm run eval:coach -- --real` (owner rates 1 to 5; target average 4 or better). Both need the owner's key; the moderation run refuses to start above £5.
- **Real Anthropic provider never run live.** Its request shape comes from the SDK types only; first live use should be watched.
- **Nine owner decisions** above and the DRAFT wording still need answers.
- **Minor known issues:** a decided admin item keeps its confirmation until the page is reloaded; handles cannot be changed after onboarding so "re-screen on change" only applies to the first choice; undeclared-AI detection is a weak signal; moderate `npm audit` advisories in development tooling only.

## Useful commands
```bash
npm run lint && npm run typecheck && npm run test:unit
npm run test:env && npm run test:rls && npm run test:e2e
npm run seed:abuse        # local only
npm run eval:moderation   # fake provider; add -- --real only with a key
npm run eval:coach
```
