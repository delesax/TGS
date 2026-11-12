# Sprint 5 demo: Judging and the Verdict

Everything below runs on **local** Supabase (Docker Desktop running) with the **fake AI provider**. Nothing here calls the real AI or touches the hosted project. (This is a separate file from `DEMO.md`, which the legal-hardening branch rewrites, so the two branches merge cleanly.)

## Setup

```bash
npx supabase start
```

```bash
npx supabase db reset
```

```bash
npm run test:env
```

The reset applies the two Sprint 5 migrations and stores dummy local Vault secrets for the judging processor (`judging_processor_url`, `judging_processor_secret`). `test:env` writes `.env.test.local` with `AI_PROVIDER=fake` and `JUDGING_PROCESSOR_SECRET`.

Seed a judged Campaign (12 test users, closed, panel submitted, votes, picks, fake AI scores, a draft Verdict):

```bash
set -a && . ./.env.test.local && set +a && npm run seed:judging
```

It prints the draft's ranking and the admin link. Running it again writes nothing. Give one of the seeded users the admin role (local only):

```bash
set -a && . ./.env.test.local && set +a && npm run admin:set -- --email jt_jem@judging.example.test
```

Start the app on port 3100 (the port the local Vault secret points pg_cron at):

```bash
set -a && . ./.env.test.local && set +a && npx next dev -p 3100
```

Seeded users all share the local password `judging-test-password`: Strategists `jt_ada@judging.example.test` … `jt_jem@…`, judges `judge_kay@…` and `judge_lior@…`.

## Click-through

1. **Admin status board.** Sign in as `jt_jem@judging.example.test`, open **Admin → Judging**. The seeded Campaign shows "Draft: ready to publish", with panel 2/2 submitted, 11 AI scores, 30 votes from 10 voters, 5 picks. Below: windows and vote credits, and the weights versions.
2. **Review the draft.** Open the Campaign. See the status, the panel (both judges submitted and locked), the draft's weights, the ranking (cards on a phone, a table on wider screens), proposed awards and the rationale, with every Strategist shown by current handle. Each AI score shows its model, prompt version and reason, with **Override this score** and **Re-run AI scoring**.
3. **Needs attention.** Tick **Override the weights**, set mind-change to 0 and panel to 50, leave the reason empty, and recompute: refused. Add a reason and recompute: the new draft records "Set by an admin for this Verdict: …". Recompute again without the override to return to the Campaign's own weights. (To see a blocked draft, use a Campaign where nobody recorded positions, as the Playwright test does: the draft lists "Nobody recorded both a before and an after position" and has no Publish button.)
4. **Edit and publish.** Open **Edit the rationale**, change a sentence, save. Tick the confirmation and **Publish the Verdict**. The confirmation stays until you reload.
5. **Public Verdict.** Open the Campaign page: "Read the Verdict". The Verdict page shows the Grand Strategist, the rationale, the four awards, the breakdown, the weights used, the AI notice (a PLACEHOLDER for the owner) and the appeal section.
6. **Leaderboard and Dossiers.** **Leaderboard** in the header: all time and per category. Open the winner's page: Titles and Awards now list this Campaign.
7. **Appeal.** Sign out, sign in as `jt_bryn@judging.example.test`, open the Verdict and appeal with a reason. The page now says it is under appeal. Back as the admin, decide it: **Reject** (back to Published) or **Uphold** (it stays under appeal until you recompute and publish a revised version, which supersedes it). The appellant's email is in the local outbox (Mailpit once the email processor runs).
8. **Audit trail.** **Admin → Audit log**: `verdict.computed`, `verdict.rationale_edited` (before and after), `verdict.published`, `verdict.appealed`, `verdict.appeal_decided`, `panel.saved`, `panel.submitted`, `judging.judge_assigned`, `ai_rubric.scored`. User ids only, never handles.

## Judging a live Campaign by hand

1. As the admin, **Admin → Judging → (an open Campaign)**: assign a judge by handle. They are emailed.
2. As a Strategist on the open Campaign page, under the position card: **Pick it** opens the vote page, where you can pick the Dispatch that changed your mind (not your own).
3. When the Campaign closes, participants get a "Voting is open" email and the Campaign page shows **Vote on the Dispatches** for 72 hours: 5 votes each, plus "It fairly restates the other side".
4. The judge opens **Your judging** (also linked from their Dossier), scores every Dispatch 1-5 on four criteria, saves a draft, then ticks the box and submits. Scores are locked.
5. pg_cron (`judging-tick`, `judging-kick`) queues AI scoring and calls `/api/judging/process` with the local secret; with the fake provider the scores arrive within a minute or two while the dev server runs on port 3100. At close + 96 hours the draft is computed automatically; an admin can compute it any time after the close.

## Evaluation

```bash
npm run eval:judging
```

Runs the 30-item DRAFT gold set through the fake provider and writes `evals/out/judging-fake-<date>.md`. It exercises the whole harness; the numbers say nothing about the real model. With `ANTHROPIC_API_KEY` set, `npm run eval:judging -- --real` runs Sonnet (worst-case estimate about £2.15 ($2.58), capped at £5; it stops at once if the key is rejected and exits with an error if any item is not scored).
