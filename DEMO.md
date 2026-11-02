# Sprint 4 demo: AI moderation, coach and admin

Everything below runs on **local** Supabase (Docker Desktop must be running) with the **fake AI provider**: a built-in, keyword-driven stand-in. Nothing here calls the real AI or touches the hosted project.

## Setup (once per session)

```bash
npx supabase start
```

```bash
npx supabase db reset
```

`db reset` rebuilds the local database from the migrations and adds the `[Sample]` Campaigns, the invite code `LOCAL-DEV-INVITE`, and dummy local Vault secrets for the email processor and the moderation sweeper.

```bash
npm run test:env
```

This writes `.env.test.local` for local Supabase, including `AI_PROVIDER=fake`.

Load the gold set as real Dispatches (40, screened by the fake provider) and the Sprint 3 debate. Both are local only and safe to run twice:

```bash
set -a && . ./.env.test.local && set +a && npm run seed:abuse
```

```bash
set -a && . ./.env.test.local && set +a && npm run seed:debate
```

Start the app (stop any running `next dev` first):

```bash
set -a && . ./.env.test.local && set +a && npx next dev --port 3100
```

Open http://localhost:3100. Emails go to the local inbox at http://127.0.0.1:54324.

Make yourself an admin (then sign out and back in):

```bash
set -a && . ./.env.test.local && set +a && npm run admin:set -- --email you@example.com
```

**Test Strategists** (local test data only): `debater01@example.test` … `debater20@example.test`, password `debate-test-password`; and the gold-set authors `abuse01@example.test` … `abuse05@example.test`, password `abuse-seed-password`.

## Click-through at 375px

Use your browser's device mode at 375px wide.

1. **Post an abusive Dispatch and watch it held.** Sign in as `debater01@example.test`, open **[Test data] Should high streets be car-free on Saturdays?**, and post an Evidence or Argument Dispatch (whichever the round allows) containing `You're an idiot and nobody likes you.`
   - The message says it is saved but **a person will check it before others can see it**.
   - Your copy shows **Held.** "A person will check this before others can see it. Only you can see it."
   - In a private window (signed out), the Dispatch is not there.
   - Your Dossier marks it **Held**.
2. **Appeal it.** On your held Dispatch press **Appeal**, give a reason, **Send appeal**. Press **Close**: the card now says you appealed. There is no second Appeal button: one appeal per Dispatch.
3. **Override it as admin.** Sign in as your admin account. The header shows **Admin**.
   - **Admin console** shows the queue count, the AI spend log and coach usefulness.
   - **Moderation**: your Dispatch is near the top, marked **Appeal** and **Held**, with the AI's category (Harassment), confidence, reason, model and prompt version, and the appeal reason. The 15 gold-set abusive Dispatches are there too, threats and doxxing first ("Held, high priority").
   - Choose **Release**, press **Save decision** without a reason: it asks for one. Give a reason and save. The private window now shows the Dispatch.
   - Try **Remove** on a gold-set item: others now see "Removed by a moderator."; the original is kept, not deleted.
   - If you are the admin who kept something held and then decide its appeal, a red warning says so (one admin in the pilot) and the audit log notes it.
4. **Nudge and coach.** As `debater02@example.test`, start writing `@Test_Amara is clearly clueless.` and press **Check my tone**: a private note says it reads as a personal attack. Replace the text with a fair argument and press **Get feedback (3 left)**: clarity, evidence, the strongest opposing point and tone, plus questions. It never rewrites your text. Press **Yes** under "Was this useful?" (and add a comment if you like). The console home shows the usefulness rate.
5. **Mute a user.** As admin, **Users**, find `Test_Bilal` (that is `debater02@example.test`), open **Mute posting**, give a reason and save. Sign in as `debater02@example.test` and open the debate: "Posting is paused for your account" with your reason, and no compose box. Unmute from the same place.
6. **Settings.** As admin, **Settings**: untick **AI features on** and save. Post as any Strategist: the Dispatch appears at once (normal Campaign) and shows up in **Moderation** as "Unscreened: needs a human look". Post in **[Test data] Moderation check: sensitive topic**: it is held instead. Tick **AI features on** again. Each change is in the audit log with before and after values.
7. **Judging weights.** **Judging weights** shows version 1 (40/25/25/10). Change them so they do not add up to 100: the total turns red and saving is refused. Save a valid set: version 2 applies only to Campaigns not yet open; opened Campaigns stay locked to their version.
8. **Audit log.** **Audit log**: filter by action `moderation.` to see every release, removal and dismissal with the reason, or by your handle. **Download as CSV** saves the filtered log.
9. **Account deletion (off by default).** As any Strategist, **Account → Delete my account**: it says deletion is not switched on yet. As admin, **Settings → Accounts**, tick **Let Strategists delete their own account**, save. Back as the Strategist: a DRAFT page offers **Download my data**, explains what is removed and kept, and asks for your handle and password. After deleting, your Dispatches show as by "A deleted Strategist". Untick the setting again afterwards.
10. **Paging.** Your Dossier shows 50 Dispatches a page with **Older Dispatches** and **Newer Dispatches**. **Download my data** still gives one JSON file, now streamed.

Emails: http://127.0.0.1:54324 shows "Your Dispatch is waiting for a check" and "Your appeal was upheld" for the author (the processor runs once a minute while `next dev` is up on port 3100). **Account → Email settings** has the new "moderation decisions" switch.

## Evaluations

```bash
npm run eval:moderation
```

```bash
npm run eval:coach
```

Both use the fake provider and write reports to `evals/out/`. My run of `eval:moderation` (fake provider):

| | Result | Target |
| --- | --- | --- |
| Clearly abusive held | **100%** (15 of 15) | 100% |
| Benign held by mistake | **0%** (0 of 15) | 10% or less |
| Borderline | 0 held, 10 visible | either is fine |
| Prompt-injection attempts | all 4 handled as labelled | |

**These are not Haiku's numbers.** The fake provider is a keyword list, so they show the pipeline works end to end, not how good the real model is. With your key in `.env.local`, run the real evaluations yourself (I will not):

```bash
npm run eval:moderation -- --real
```

```bash
npm run eval:coach -- --real
```

The real moderation run checks its worst-case cost first and refuses to start above £5 (it should cost a few pence). Then rate each row of `evals/out/coach-real-*.csv` from 1 to 5; the sprint is done when the average is 4 or better.

## Running all the tests

```bash
npm run test:env
```

```bash
npm test
```

My run on a freshly reset database: lint and typecheck clean; unit **137** passed; RLS **122** passed; Playwright **15** passed (all at 375px, fake provider).

## Throttled load (carry-over)

| | Debate on screen | Buttons work | Downloaded |
| --- | --- | --- | --- |
| First visit, empty cache | 1.48 s | 3.07 s (Sprint 3: 3.08 s) | 278 KB |
| Signed-in Strategist coming back | 0.96 s | 1.03 s | 35 KB |

The reply and edit forms and the AI help now load only when opened, but the first-visit number did not move: what is left is React and Next.js's own code. A rewrite would be needed to go further; not started.

## Hosted project: dry run (not yet run; nothing applied)

I could not run the dry run: it needs `DATABASE_URL` from `.env.local`, and loading that file was refused by this session's permissions. Nothing has been sent to the hosted project. Please run it yourself (it calls the CLI directly, so the connection string is not printed):

```bash
set -a && . ./.env.local && set +a && ./node_modules/.bin/supabase db push --dry-run --db-url "$DATABASE_URL"
```

Expected result: hosted is up to date to `20261103000300`, and exactly these two would be applied:

- `20261104000100_ai_moderation.sql`
- `20261104000200_account_deletion.sql`

What to look for when reviewing the SQL: no table, column or row is dropped. Replaced in place: the `ai_decisions.subject_type` and `email_outbox.kind` CHECK constraints (widened), `email_recipients()` (one more column), the `dispatches.author_id` and `awards.profile_id` foreign keys (cascade → restrict), and the `profiles.id` → `auth.users` foreign key (removed; a trigger now anonymises instead of cascading). Two policies change with `ALTER POLICY`. The only DELETE statements remove a deleted account's own personal rows (passkeys, reactions, follows, email settings, queued emails, coach ratings, positions), plus a profile with nothing depending on it. Every new table has row-level security, and a test checks this.

**After you approve the push**, the moderation sweeper on hosted needs `MODERATION_PROCESSOR_SECRET` in Vercel and two Vault secrets (`docs/LAUNCH_EMAIL_SETUP.md`, steps 15 and 18). Until then a Dispatch whose screening is interrupted stays "Checking…" for its author and hidden from others.

## Decisions for you

All nine are listed with the defaults I built in CHANGELOG.md ("Defaults chosen for the owner decisions"). In short:

1. Fallback when the AI is unavailable: post unscreened and flagged; sensitive Campaigns hold.
2. Undeclared-AI flag: soft flag for review only.
3. Coach: Sonnet (about 20× Haiku's price; switch in Settings), never suggests wording.
4. Caps: 3,000 AI calls a day; 40 nudges and coach calls per Strategist a day; coach 3 per draft and 10 a day; evaluations £5.
5. Privacy policy: DRAFT AI paragraph on `/privacy`; needs a lawyer's eye before real invitees.
6. Retention of AI decisions and coach feedback: kept until you decide (no default was given).
7. Appeals with one admin: allowed, with a warning and an audit note.
8. Account deletion: built, off, all wording DRAFT; positions on closed Campaigns kept unlinked.
9. Screening scope: handles only; display names and bios can be switched on.

Email set-up for launch is a separate owner checklist: `docs/LAUNCH_EMAIL_SETUP.md`.
