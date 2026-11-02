# Sprint 3 demo: Dispatches and discussion

Everything below runs on **local** Supabase (Docker Desktop must be running). Nothing here touches the hosted project. **Closed test only:** there is no automatic screening until Sprint 4.

## Setup (once per session)

```bash
npx supabase start
```

```bash
npx supabase db reset
```

`db reset` rebuilds the local database from the migrations, adds the three `[Sample]` Campaigns and the invite code `LOCAL-DEV-INVITE`, and stores the local email processor's address and dummy secret in Vault.

```bash
npm run test:env
```

Load the 20-Strategist debate (local only, and safe to run twice):

```bash
set -a && . ./.env.test.local && set +a && npm run seed:debate
```

Start the app. If a `next dev` is already running, stop it first (Ctrl+C), because it needs the new settings:

```bash
set -a && . ./.env.test.local && set +a && npx next dev --port 3100
```

Open http://localhost:3100. Emails go to the local inbox at http://127.0.0.1:54324.

**Test Strategists:** `debater01@example.test` to `debater20@example.test` (handles `Test_Amara` to `Test_Tamsin`), password `debate-test-password`. These are local test data only.

## Click-through on your phone-sized screen

Use your browser's device mode at 375px, or open the Network URL that `next dev` prints on your phone if it is on the same Wi-Fi.

1. **Read the debate signed out.** Go to Campaigns, then **[Test data] Should high streets be car-free on Saturdays?**
   - Under **Dispatches** there is "Sign in to post" and the threads, newest first.
   - Each Dispatch shows the author, its position as a word and icon ("For" with a plus, "Against" with a minus, "Undecided" with a question mark) and a solid, dashed or dotted left edge.
   - It also shows the kind (Argument, Rebuttal, Evidence), round, time, sources with the website name, and the AI-use label ("Written without AI", "Written with AI help" or "Mostly written by AI").
   - One Dispatch shows **Withdrawn by author.**
   - Tap an author's handle: their Strategist page shows only the handle, "Strategist since …" and their public Dispatches, with **Sign in to follow**. No display name, expertise or bio while signed out.
   - Search for `blue badge` from the header: Campaigns and Dispatches only. The **Strategists** filter says **Sign in to search for Strategists**.
2. **Threads.** The first thread has a long exchange: replies indent four levels, then continue with "Replying to @…". Use **Hide/Show N replies** to fold branches. At the bottom, **Show more Dispatches** loads the next 20 threads.
3. **Sign in as `debater01@example.test`** and open the debate again.
   - Round 2 accepts rebuttals and evidence only, so the box is for **Evidence** (rebuttals go through **Reply**). Press **Post Dispatch** with nothing filled in: you get "Please check the highlighted answers" and "Say whether you used AI".
   - Write a note and type `javascript:alert(1)` as the link: it is refused. Paste a real link with `?utm_source=x`, choose an AI-use answer, and post. The tracking code is gone from the link.
   - Press **Post Dispatch** again straight away: "You can post again in N seconds", counting down.
4. **Reply, react, edit, withdraw.**
   - On someone else's Dispatch press **Reply**, write a rebuttal and post it; it appears nested.
   - Press **Persuasive**: it fills in and the count goes up. Press again to take it back.
   - On your own new Dispatch, **Edit (N min left)** works for 5 minutes and then the Dispatch shows "edited".
   - **Withdraw** asks you to confirm and then shows "Withdrawn by author." You cannot react to your own Dispatches.
5. **Report.** On another Strategist's Dispatch press **Report**, choose a reason and send it. The form says plainly that there is no automatic screening yet.
6. **New Dispatches without reloading.** Keep the debate open in one window. In a private window, sign in as `debater02@example.test` and post a rebuttal. Switch back to the first window: within 30 seconds, or straight away when the window regains focus, a **"1 new Dispatch. Show"** button appears.
7. **Follow.** Tap an author's handle to open their Strategist page. Signed in, it also shows their display name, expertise tag and bio if they set them. Press **Follow**. Open **Dossier**: your Dispatches are grouped by Campaign with their AI-use labels, the withdrawn one is marked, and **Following** lists the Campaign (followed automatically when you posted) and the Strategist.
8. **Search.** Use the header search box with `blue badge`. Results come from Campaigns, Dispatches and handles, with the matches highlighted. Try the **Dispatches** and **Strategists** filters, then search for `Test_Am` to find a handle (people search works only when signed in).
9. **Email.** Open http://127.0.0.1:54324: the test Strategists received digests such as "3 replies to your Dispatches".
   - Your own reply from step 4 arrives about 10 minutes later. Replies are gathered into one email; the wait is set in `community_settings.reply_digest_minutes`.
   - Open an email and use **Stop these emails**: a page asks you to confirm with one button.
   - **Account → Email settings** shows the three kinds of email, all on by default, and **Stop all emails**.
10. **Your data.** **Account → Download my data** saves a JSON file with your profile, Dispatches and their history, positions, reactions, follows, reports and email settings. **Deleting your account** explains that it is not switched on yet.
11. **Admin.** Make yourself an admin (below), sign out and back in, then go to **Campaigns → Reports**.
    - The report from step 5 is there. **Hide this Dispatch** with a reason: the public now sees "Hidden by a moderator."
    - **Hidden Dispatches → Restore it** brings the text back. Each step is in the audit log (Supabase Studio at http://127.0.0.1:54323 → `audit_log`).
12. **Sensitive Campaign.** As an admin, create a Campaign marked sensitive with a content note and open it. The Dispatches and the compose box stay folded behind the note until you press **I have read the note. Show the Dispatches**. A financial or medical Campaign shows "Opinion, not advice" on the box and on every Dispatch.
13. **Offline and install.** The service worker runs only in a production build, so try this with `npm run build && npx next start --port 3100` (with the same `set -a …` prefix). Open any page, then turn Wi-Fi off and open another: **You are offline** appears, with "Try again". In Chrome, the footer shows a small **Install the app** button. The icons are placeholders.

To make yourself an admin locally (sign out and back in afterwards):

```bash
set -a && . ./.env.test.local && set +a && npm run admin:set -- --email you@example.com
```

## Throttled load test

```bash
npm run test:env
```

```bash
npx playwright test tests/e2e/performance.spec.ts
```

It loads the debate on Chrome's "Slow 4G" profile with a 4x CPU slowdown and writes the numbers to `test-results/performance.json`. My run:

| | Debate on screen | Buttons work |
| --- | --- | --- |
| First visit, empty cache | 1.48 s | 3.08 s |
| Signed-in Strategist coming back | 1.06 s | 1.09 s |

If port 3100 is busy with your `next dev`, add `E2E_SITE_URL=http://localhost:3200` before `npx playwright test`. Restart `next dev` afterwards, because the test's production build confuses a running dev server.

## Running all the tests

```bash
npm run test:env
```

```bash
npm test
```

`npm test` runs the unit, RLS and Playwright tests against local Supabase only.

## Hosted project: dry run (nothing applied)

The command I ran, which calls the CLI directly and redacts the connection string:

```bash
set -a && . ./.env.local && set +a && ./node_modules/.bin/supabase db push --dry-run --db-url "$DATABASE_URL"
```

Result: the hosted project is up to date to Sprint 2, and these would be applied:

- `20261103000100_invite_consumed_on_confirmation.sql`
- `20261103000110_campaign_private_columns.sql`
- `20261103000200_dispatches_discussion.sql`
- `20261103000300_email_notifications.sql`

There is no DROP or TRUNCATE in them. The only DELETE statements remove a Strategist's own reaction or follow when they take it back, plus the Sprint 2 step in `save_campaign()` that removes rounds an admin deleted. Every new table has row-level security, and a test checks this.

**After you approve the push**, email needs these owner steps on hosted:

1. In Resend, verify the sending domain. Then set `RESEND_API_KEY`, `EMAIL_FROM` (for example `The Grand Strategist <notifications@your-domain>`) and `EMAIL_PROCESSOR_SECRET` (any long random string) in Vercel → Project → Settings → Environment Variables. Do not paste them into chat.
2. In Supabase → SQL Editor, store the processor's address and the same secret in Vault, replacing both placeholders:

```sql
select vault.create_secret('https://YOUR-VERCEL-URL/api/email/process', 'email_processor_url');
```

```sql
select vault.create_secret('THE-SAME-SECRET-AS-VERCEL', 'email_processor_secret');
```

Until both are done, nothing is sent and emails wait safely in `email_outbox`.

## Decisions for you

These are listed in full in CHANGELOG.md, with defaults that can be changed without a release:

- the reaction set;
- the edit window and how withdrawing works;
- length and rate limits;
- the account-deletion wording (not built; proposal in the CHANGELOG);
- the email sender, sending domain and daily cap;
- whether report-and-hide is enough for a closed test;
- ~~whether Strategist profiles may be public~~ (decided 2 November: signed-out visitors see the handle, join date and public Dispatches only; people search needs sign-in).

---

## Sprint 1 reference: hosted project setup

**0. Fix `DATABASE_URL` so migrations can be pushed.**
Supabase dashboard → your TGS project → **Connect** → **Session pooler** → copy the URI and put your database password in it. Replace the `DATABASE_URL=` line in `.env.local` with it. Do not paste it into chat. Then tell me and I will run the dry run again, show you the result and wait for your OK before the real push. Or run it yourself (call the CLI directly, not through `npx`: npx prints the full command, password included):

```bash
set -a && . ./.env.local && set +a && ./node_modules/.bin/supabase db push --dry-run --db-url "$DATABASE_URL"
```

**1. Auth settings.** Dashboard → Authentication → URL Configuration:
- Site URL: `http://localhost:3000` for now (your Vercel URL later)
- Redirect URLs: add `http://localhost:3000/**` and your Vercel URL followed by `/**`

Then Authentication → Providers → Email (or Sign In / Up): set the minimum password length to **10** and keep "Confirm email" **on**.

Optional, so the email link works when opened on a different device: Authentication → Emails → "Confirm signup" template, change the link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`

**2. Create invite codes** (writes to whichever project `.env.local` points at; the script prints the host first):

```bash
npm run invite:create -- --count 3
```

```bash
npm run invite:create -- --uses 30 --note "Pilot class" --days 30
```

Each code comes with a sign-up link such as `http://localhost:3000/signup?code=TGS-XXXX-XXXX-XXXX`.

To make yourself an admin (not needed this sprint):

```bash
npm run admin:set -- --email you@example.com
```

---

