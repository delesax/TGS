# Sprint 2 demo: Campaigns and countdown

Everything below runs on **local** Supabase (Docker Desktop must be running). Nothing here touches the hosted project.

## Setup (once per session)

```bash
npx supabase start
```

```bash
npx supabase db reset
```

`db reset` rebuilds the local database from the migrations and adds the three `[Sample]` Campaigns and the invite code `LOCAL-DEV-INVITE`.

```bash
npm run test:env && set -a && . ./.env.test.local && set +a && npx next dev --port 3100
```

Open http://localhost:3100. Sign-up emails go to http://127.0.0.1:54324.

To make yourself an admin locally, sign up first, then run this in a second terminal (sign out and back in afterwards):

```bash
set -a && . ./.env.test.local && set +a && npm run admin:set -- --email you@example.com
```

## Click-through

1. **Campaigns** in the header. There are three sections: **Open now** ("[Sample] Should the four-day week…"), **Opening soon** ("…state pension age…") and **Closed** ("…phones in schools…"). Each sample Campaign shows when it closes or opens, in UK time.
2. Open the **four-day week** sample:
   - The big countdown ticks every second, and under it is **Round 1 of 3: Opening arguments** with its own countdown.
   - Scroll down for **Rounds and deadlines** (round 1 marked "(now)"), the **Rules**, and "Dispatches open in the next update".
3. **Your position** on the open Campaign: it says you did not record a before position, and offers **Where do you stand now?** Pick one and press **Record my position**. A green message confirms it. Reload: your choice is still selected.
4. Open the **pension age** sample (Opening soon):
   - It shows "Opens in" with a countdown and the **Opinion, not advice** label.
   - Record a **before** position. Pressing the button without choosing gives a message that stays on screen.
5. Open the **phones in schools** sample (Closed): "This Campaign has closed", and positions are final.
6. **Countdown and focus**: switch to another tab for a minute and come back. The countdown re-syncs with the server rather than trusting your computer's clock.
7. **As an admin**, Campaigns shows **Create a Campaign** and **Manage Campaigns**.
   - Press **Create a Campaign**. Type a title (the web address fills itself in) and press **Save Campaign** without a summary. Expect "Please check the highlighted answers", the reason next to the field, and your title still there.
   - Fill in the rest: category, format, Opens and Closes (UK time), two rounds, and tick **Sensitive topic** without a content note. Expect "A sensitive Campaign needs a content note".
   - Add a note, choose **Schedule it** and save. You land on **Edit Campaign** with "Saved. The change has been recorded in the audit log."
   - Press **View page**. The content note comes first, before the title.
8. As a non-admin, go to http://localhost:3100/admin/campaigns: you get "Page not found".

## Watch a Campaign open, change round and close (about 5 minutes)

In a second terminal:

```bash
set -a && . ./.env.test.local && set +a && npm run campaign:test
```

It prints a page link. The Campaign opens at the next whole minute and runs two 2-minute rounds. Leave the page open:

- At the opening minute the countdown reaches zero, the page refreshes itself and shows **Open now** with Round 1's countdown.
- Two minutes later it moves to Round 2.
- Two minutes after that it shows **This Campaign has closed**.

Each step is written to the audit log as `campaign.opened`, `campaign.round_changed` and `campaign.closed` (Supabase Studio at http://127.0.0.1:54323 → Table editor → audit_log).

Options: `-- --in 3 --round 5` opens in 3 minutes with 5-minute rounds. The script refuses to run against the hosted project.

## Launch topics (local first)

```bash
set -a && . ./.env.test.local && set +a && npm run topics:load -- --start 2026-12-01
```

- The script prints the target (it should say **local Supabase**), lists the 15 topics in wave order with their start dates, and waits for you to type `yes`.
- All 15 are **drafts**: as an admin, open **Manage Campaigns** to see them. The Bank of England topic shows "Owner decision needed".
- Run it again: "Created 0 drafts. Skipped 15 that already existed."
- To load them to the **hosted** project later, run `npm run topics:load -- --start <date>` without the `set -a …` part. It will say **hosted Supabase** before asking. Please don't do this until we've agreed the date and pushed the migration.

## Running the tests

```bash
npm run test:env
```

```bash
npm test
```

`npm test` runs the unit, RLS and Playwright tests against local Supabase only.

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

