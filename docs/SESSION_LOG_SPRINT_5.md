# Session log: Sprint 5, Judging and Verdict

Date: 11 November 2026. Branch `sprint-5-judging`, cut from `main` at `eec5c7c` (main was fast-forwarded to `origin/main` first; it was 2 commits behind and clean). Built in a separate worktree (`../TGS-sprint5`) so the `TGS` checkout, which is on `launch-email-confirm-template` with uncommitted doc changes, was not touched. `legal-hardening` and `sprint-4-audit-handle` were not touched.

**Not pushed, no PR, not merged. Nothing applied to hosted Supabase. No real AI call was made.**

**Re-checked 12 November:** still local only (`origin/sprint-5-judging` does not exist), no PR, `main` unchanged at `eec5c7c` (this branch is 3 commits ahead, 0 behind). No test or hosted command was re-run for this update, so the results below are from 11 November and the hosted state is not re-verified (nothing of Sprint 5 was ever applied by me).

## What was built

### Data model and row-level security (two migrations)
| Table | What | Who reads |
| --- | --- | --- |
| `judging_settings` | peer window (72 h), judging window (96 h), 5 vote credits, 3x reputation cap, steelman rules, 7-day appeal window, AI wording switch (off) | anyone (published with the rubric) |
| `judge_assignments` | panel per Campaign; `submitted_at` locks | the judge, admins |
| `panel_scores` | per Dispatch per judge: logic, evidence, originality, responsiveness (1-5), comment | the judge; admins only after that judge submits; nobody else |
| `peer_votes` | one per voter per Dispatch | the voter, admins |
| `steelman_flags` | "fairly restates the other side" confirmations | the confirmer, admins |
| `mind_change_picks` | one "this changed my mind" pick per participant per Campaign | the picker, admins |
| `ai_rubric_jobs` | the AI scoring queue | service role only |
| `ai_rubric_scores` | four criteria, rationale, steelman detection, model, provider, prompt version, tokens, admin override with reason | admins |
| `verdicts` | versioned; draft / published / appealed / final (+ superseded, discarded); needs-attention reasons; weights snapshot; component scores; proposed awards; rationale; computed/published/appeal/final times | anyone once published/appealed/final; admins all |
| `verdict_appeals` | one per participant per Verdict, decided with reasons | the appellant, admins |
| `reputation` | derived per Strategist: titles, awards, judged Campaigns, points | anyone |

`awards` gains `verdict_id` and `dispatch_id`. Browsers write nothing directly: every write goes through a security definer function that checks the JWT role claim, server time and the rule, and writes `audit_log`.

### Scoring (documented in `src/lib/judging/blend.ts`, unit tested)
- **Panel**: a judge's score for a Dispatch is the mean of the four criteria, mapped 1→0 and 5→100; a Dispatch's panel score is the mean over submitted judges; a Strategist's is the mean over their Dispatches.
- **AI rubric**: the same, from the latest score per Dispatch (admin overrides applied).
- **Peer**: sum of voter weights on a Strategist's Dispatches, as a share of the top Strategist's (top = 100). Voter weight = 1 + log2(1 + reputation points), capped at 3 × the median weight of that Campaign's voters. Reputation points = 10 per Grand Strategist title + 4 per other award + 1 per judged Campaign taken part in.
- **Mind-change**: a participant's movement is 1 for a full switch (for↔against) and 0.5 to or from undecided. Their pick credits the picked Dispatch's author with that movement; picks from people who did not move count 0. Score = the Strategist's credit as a share of the top Strategist's (top = 100).
- **Blend**: Σ weight × component / 100 with the snapshotted weights, plus the **steelman bonus**: 2.5 per qualifying Dispatch, at most 5 (hard cap in code, whatever the settings). A Dispatch qualifies when the AI detected a steelman (confidence ≥ 0.6) **and** at least 2 people other than the author confirmed it. The final score can therefore reach 105.
- **Tie-breaks**, in order: final score (2 dp), higher panel score, higher AI rubric score, more distinct peer voters, earlier first Dispatch. Still level at the top → "needs attention"; no coin toss.
- **Missing components are never reweighted.** With a weight above 0, any of these marks the draft "needs attention", leaves affected final scores empty and blocks publishing: no submitted panel; some judges not submitted; a Strategist the panel did not score; peer window still open; no peer votes; AI scoring pending, failed or missing; nobody with both a before and after position; no weights version. The admin fixes the gap or recomputes with **override weights and a reason** (stored in the snapshot, shown publicly and audit-logged).
- **Awards**: Grand Strategist = the winner. Best rebuttal = highest-quality rebuttal (panel and AI, weighted by their weights). Best evidence = highest evidence criterion (panel and AI). Most persuasive = most mind-change credit (falls back to weighted peer votes, saying so, if nobody moved). Best newcomer = highest-placed Strategist in their first Campaign, never the winner.

### AI rubric
- `prompts/judge-rubric.v1.md` (four criteria with anchors, steelman check, injection guard) and `prompts/judge-rationale.v1.md` (wording only; must keep every number and `@{user:…}` token, else the template is kept).
- Provider interface unchanged in shape: the fake provider gains a deterministic rubric stand-in; the real provider calls Sonnet (`claude-sonnet-5-5`, `AI_MODEL_JUDGING` to change) with structured JSON output, adaptive thinking at medium effort, prompt caching and server-side refusal fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) so a sensitive debate does not leave a Dispatch unscored. Model sees only the Dispatch text, its kind, the text it replies to and the Campaign question.
- Queue: `judging_tick()` (pg_cron, every minute) queues every eligible Dispatch of a closed Campaign; `judging_kick()` (pg_cron) calls `/api/judging/process` through pg_net only when there is work, with the shared secret from Vault. Idempotent per Dispatch and prompt version; claims time out after 10 minutes; over the cap / AI off / no key → waits an hour without using an attempt; real failures back off and fail after 5 attempts (draft flags them; admin can re-run).
- Counts toward the existing global daily AI cap; like nudges and coaching it stops at 80% so screening keeps the last 20%.

### Verdict workflow
Close → AI scoring queued, "voting open" emails → peer window (72 h) → draft computed automatically at close + 96 h (only once no AI job is pending), or by an admin any time after the close → admin reviews in `/admin/judging/[campaignId]` (breakdown, attention list, awards, rationale), can edit the rationale, override AI scores, re-run AI scoring, add/remove judges, recompute (optionally with override weights) → publish (refused while it needs attention) → awards issued (upserted per category), reputation recomputed, emails to participants and followers → 7-day appeal window → `final` (by `judging_tick`). An appeal sets the Verdict "appealed"; rejected (all appeals) → back to published (or final if the window has passed); upheld → stays appealed until an admin recomputes and publishes a revised version, which supersedes it and replaces the awards.

### Pages
- Public: `/campaigns/[slug]/verdict` (winner, rationale, awards, breakdown, weights used, AI notice, appeal), `/campaigns/[slug]/vote`, `/leaderboard` (all time and per category). Campaign page links to the Verdict and to voting; "Pick it" link while open. Dossier and public Strategist pages show Titles and Awards; the Dossier links to `/judging` for judges.
- Judges: `/judging`, `/judging/[campaignId]` (1-5 radio groups, save draft, submit-and-lock with confirmation).
- Admin: `/admin/judging` (status board per Campaign, windows and vote credits, weights editor and versions) and `/admin/judging/[campaignId]`.
- 375 px checked in the browser and by Playwright; the breakdown is cards on phones and a table from tablet width.

### Notifications
`judge_assigned`, `peer_voting_open`, `verdict_published`, `verdict_appeal_outcome`, through the existing outbox, caps and unsubscribe links. No new preference: the first three use "Campaign updates", the appeal outcome uses "Moderation decisions". Payloads carry only slug, title and outcome, so the 30-day outbox retention (legal-hardening) loses nothing the app needs.

## Decisions where the brief was silent
1. **Panel scores per Dispatch, not per Strategist.** The Sprint 2/3 model attaches everything (AI rubric, votes, picks, Dispatch-level awards) to Dispatches; a Strategist's panel score is the mean over their Dispatches (quality, not volume). Judges never see or score their own Dispatches; submitting requires every other eligible Dispatch to be scored.
2. **Eligible Dispatch** = visible, not withdrawn, not hidden. **Participant** (votes, appeals) = posted at least one eligible Dispatch. Mind-change picks are also open to people who only recorded a position.
3. **Peer vote = an endorsement** (no 1-5 scale), 5 credits per voter per Campaign. Peer and mind-change are normalised relative to the top Strategist; panel and AI are absolute.
4. **Steelman confirmations come from participants and the Campaign's judges**, during the peer window.
5. **Judging window**: draft due at close + 96 h; peer window 72 h. Both editable in `/admin/judging`.
6. **Weights**: the Campaign keeps the weights version it opened with (Sprint 4 lock). "Edit weights for a recompute" is an override on that one Verdict, with a reason, rather than changing the locked version.
7. **Verdicts are versioned rows**, never edited after publication except their status, so the audit trail and the public page always agree.
8. **Rationale stores `@{user:<id>}` tokens, not handles**, rendered with the current handle or "a former Strategist". Nothing in judging tables or the audit log stores a handle; `assign_judge()` takes a handle but logs the id.
9. **Appeals reuse the Sprint 4 pattern** (one per person, reason, admin decision with reason, `same_admin` recorded, plain-words email) in a parallel `verdict_appeals` table rather than `dispatch_appeals`/`moderation_flags`, which are tied to Dispatches and their moderation states.
10. **Positions for mind-change** are read through `judging_positions()`, which uses the legal branch's `consented_positions` view automatically once it exists, and `campaign_positions` until then.
11. **AI rubric scores are stored in their own table**, not `ai_decisions`, so the legal branch's `purge_ai_decisions()` retention job cannot remove evidence for a published Verdict.
12. **Leaderboard points** = 10 per title, 4 per other award, 1 per judged Campaign; ties by titles, awards, then handle.
13. **No CHANGELOG/DEMO conflicts**: the demo is `docs/DEMO_SPRINT_5.md`, not `DEMO.md` (which legal-hardening rewrites).
14. `npm run eval:judge` is an alias of `eval:judging`, because CLAUDE.md rule 10 names `eval:judge`.

## Migrations written (not applied to hosted)
- `supabase/migrations/20261111000100_judging_schema.sql`
- `supabase/migrations/20261111000200_judging_functions.sql`

Both apply cleanly from scratch after all earlier migrations (`npx supabase db reset`, local). They sort after `legal-hardening`'s `20261107…` and `sprint-4-audit-handle`'s `20261104000500`. Three pg_cron jobs are added: `judging-tick` and `judging-kick` (every minute). **No deletion or retention job** is added or switched on (the only delete is `refresh_reputation()` rebuilding its own derived table).

## New secrets and settings (names only)
- **Vault** (hosted, owner action): `judging_processor_url` (e.g. `https://<site>/api/judging/process`) and `judging_processor_secret`.
- **Vercel env**: `JUDGING_PROCESSOR_SECRET` (same value as the Vault secret). Optional: `AI_MODEL_JUDGING`.
- Already known, still missing: `ANTHROPIC_API_KEY`. Until it is set, AI jobs wait (an hour at a time) and drafts flag "AI scoring pending"; an admin can still compute a draft and publish with an AI weight of 0 and a reason.

## Files that overlap other branches
With `legal-hardening` (now pushed to `origin`, no PR yet): `CHANGELOG.md` (new entry at the top), `package.json` (three scripts), `src/app/admin/admin-nav.tsx` (one label), `src/app/campaigns/[slug]/page.tsx` (closed card links; "Pick it" moved away from the position-form lines legal changes), `src/app/campaigns/[slug]/dispatch-section.tsx` (one sentence), `src/lib/email/templates.ts` (kinds, preferences, `render` exported), `tests/rls/every-table-has-rls.test.ts` (table list), and since 12 November `docs/CLAUDE_LOG.md` (both branches add that file). A trial merge result is at the end of this log.
With `sprint-4-audit-handle`: `CHANGELOG.md` only.
After legal-hardening merges, someone should also decide whether `anonymise_profile()` should remove a deleted account's peer votes, steelman confirmations and mind-change picks (they currently stay, linked to the tombstone id; they are private).

## Tests and evaluation (all local, fake AI)
- **Typecheck and lint**: clean.
- **Unit** (Vitest): 176 passed (35 new: blending, weight snapshot and override, tie-breaks, missing components, steelman cap and self-award, reputation cap, mind-change, awards, rationale tokens, metrics, AI rubric and wording validation, judging emails).
- **RLS** (Vitest, local Supabase): 191 passed (29 new in `tests/rls/judging.test.ts`: judges, participants, outsiders, admins; nobody reads a judge's draft before lock, admins included; locked scores unchangeable even by the service role; no self-votes, steelmen or picks; outsiders cannot read unpublished Verdicts; publish/appeal/supersede/final; idempotent AI scores; no handles in the audit log). The every-table guard now covers the 11 new tables; the reactions-never-feed-judging guard still passes.
- **Playwright** (production build, 375 px): 17 passed in the full run, including the new judging journey (judge scores and submits, participant votes, admin draft needs attention → override with reason → publish, visitor reads, participant appeals). The new `verdict-performance.spec.ts` (run separately after): Slow 4G + 4x CPU first visit, Verdict page LCP 1.55 s / DOMContentLoaded 1.42 s, leaderboard LCP 1.51 s / 1.38 s (budget 2 s; full `load` 2.8 s and 2.7 s, as on the existing Campaign-page test).
- **Build**: `next build` succeeds (run by Playwright).
- **Seed**: `npm run seed:judging` produced a clean draft (winner with a steelman bonus, all four components); a second run and two simultaneous runs wrote nothing. An earlier run, before a bug fix, showed the retry path and the "AI pending" attention correctly.
- **Eval** (`npm run eval:judging`, fake provider, harness check only):

| criterion | MAE | within ±1 | Spearman | pass |
| --- | --- | --- | --- | --- |
| logic | 1.20 | 57% | 0.19 | no |
| evidence | 0.80 | 80% | 0.84 | yes |
| originality | 0.63 | 90% | 0.60 | no |
| responsiveness | 0.93 | 77% | 0.82 | no |
| pooled | 0.89 | 76% | 0.70 | no |

Overall FAIL, as expected for a keyword stand-in; steelman 4 of 5 found, 0 false positives. These numbers say nothing about Sonnet. `--real` was **not** run (no key).

## What I could not do
- Run the real-model evaluation (`--real`): no `ANTHROPIC_API_KEY`. The gold-set labels are DRAFT and need your ratification first anyway.
- Apply the migrations to hosted, or set the Vault secrets and Vercel env var (your actions; I was told not to).
- Inngest: the brief asked for the existing pg_cron + pg_net processor pattern, so no Inngest workflow was added.
- Legal-sensitive wording: the AI notice on Verdicts, the AI-assisted rationale note and the appeal notice are PLACEHOLDER constants in `src/lib/judging/notices.ts`.

## Dependencies
None added.

## Owner checklist
1. Ratify or correct the 30 labels in `evals/judging/gold-set.json` (it is marked DRAFT).
2. Review the defaults: peer window 72 h, draft at 96 h, 5 votes, 3x voter cap, steelman +2.5 per Dispatch (max 5) needing 2 confirmations, 7-day appeals, AI wording off.
3. Edit the three PLACEHOLDER strings in `src/lib/judging/notices.ts` (or hand them to the legal-hardening work).
4. When ready: add `ANTHROPIC_API_KEY` to Vercel, then run `npm run eval:judging -- --real` locally with the key (worst case about £1, capped at £5). Pass bar per criterion: ≥ 80% within ±1 and Spearman ≥ 0.7.
5. Before applying to hosted: `supabase db push --dry-run` should list exactly the two Sprint 5 migrations (after whatever is merged first). Then add the Vault secrets `judging_processor_url` and `judging_processor_secret`, and `JUDGING_PROCESSOR_SECRET` in Vercel.
6. Decide whether deleted accounts' private votes, steelman confirmations and picks should be removed by `anonymise_profile()` (legal-hardening owns that function).
7. Review and open the PR for `sprint-5-judging` when you are ready (not opened).

## Commit and merge check (updated 12 November)
- Work commit: `2aef6ad` "Sprint 5: judging and the Verdict" on `sprint-5-judging`. Two later commits change only logs (`31d057d` this log, then the running `docs/CLAUDE_LOG.md`), and this update adds one more log-only commit. All local; **nothing is pushed**. Run `git log origin/main..HEAD` for the exact head: it is not quoted here because each log update would make it stale.
- Trial merges (`git merge-tree`, nothing changed on any branch), redone on 12 November against the current `origin` heads:
  - with `origin/legal-hardening` (pushed, 19 commits ahead of `main`; code and docs complete at `ccb2822`, later commits log-only): **three** conflicts, all "keep both sides": `CHANGELOG.md` (each branch adds an entry at the top), `tests/rls/every-table-has-rls.test.ts` (each appends tables to the same list) and, new since 11 November, `docs/CLAUDE_LOG.md` (both branches add that file; merge the two "Current state" tables and keep every entry). `package.json`, `admin-nav.tsx`, the Campaign page, `dispatch-section.tsx` and `templates.ts` still merge automatically.
  - with `origin/sprint-4-audit-handle` (`bc88132`, still not merged into `main`): one conflict in `CHANGELOG.md` (keep both entries).
- Migration order if all merge: `20261104000500` (audit handle) < `20261107000100` to `20261107000600` (legal-hardening, six migrations) < `20261111000100` and `20261111000200` (Sprint 5). Sprint 5's two sort last, so they apply cleanly after the others. The hosted dry run should list exactly the migrations that have not been applied yet; check it again after whatever merges first.
- After merging legal-hardening, re-run `npm run test:rls` and the seed: legal adds positions consent (the seed already sets `positions_consent_at` when the column exists) and drops the position requirement for posting.
- Local database: the local Supabase (shared by all worktrees) was reset with these migrations and holds the seeded test Campaign. `npx supabase db reset` from any branch rebuilds it for that branch.
