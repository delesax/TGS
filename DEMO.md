# Legal hardening demo

Everything below runs on **local** Supabase (Docker Desktop must be running). The fake AI provider is used; nothing calls the real AI, Resend or the hosted project. Emails land in the local inbox at http://127.0.0.1:54324.

## Setup (once per session)

```bash
npx supabase start
```

```bash
npx supabase db reset
```

`db reset` rebuilds the local database from all migrations, including the six new ones. It erases local data only.

```bash
npm run test:env
```

Start the app (stop any running `next dev` first):

```bash
set -a && . ./.env.test.local && set +a && npx next dev --port 3100
```

Make yourself an admin (then sign out and in again):

```bash
set -a && . ./.env.test.local && set +a && npm run admin:set -- --email you@example.com
```

## Click-through at 375px

1. **Footer and draft banner.** Open http://localhost:3100/privacy. Under the title: "Version 2026-11-a, in force from [to be added]." Above the text: the DRAFT banner ("this page is complete but has not yet had its final legal review"). At the bottom: The Grand Strategist Limited, "Registered in England and Wales, company number [to be added]", registered office, contact, and links to Terms, Privacy, How we use AI, Accessibility, Contact us about your data. Every `[to be added]` is a fact you still owe (list: `docs/LEGAL_WORDING.md`).
2. **The pages.** Read /privacy (tables stack on the phone), /terms, /ai-use, /accessibility. No sideways scrolling.
3. **Three sign-up boxes.** Sign out, open /signup with the invite `LOCAL-DEV-INVITE`. Press Create account with nothing ticked: three separate errors. Tick them one at a time. The second box reads "I understand that my Dispatches are public, and that if I delete my account they stay in the debate record without my name."
4. **A position is optional.** Sign in, open a Campaign. Post a Dispatch without recording a position: it works. On an open Oxford-style Campaign (create one in Admin → Campaigns, set to start now; the pension-age sample is Oxford but opens in two days) the box asks "Which side does your Dispatch argue?".
5. **First-position notice.** Choose For/Against/Undecided under Your position. A notice and a required box appear. Press Record without ticking: an error. Tick and record. The Dispatches you post carry **no** side from your private position.
6. **Withdraw.** Account page → "Your Campaign positions" → "Stop recording my positions". Your open positions are deleted and the consent cleared. "Clear my position" on a Campaign removes just that one.
7. **Contact us about your data.** Footer link. Send a complaint without choosing a type (error), then properly. The success message appears and an acknowledgement email arrives in the local inbox (with the company footer and no stop link). Signed in, the email is filled in and locked.
8. **Admin → Privacy requests.** Open the request: the due date, status, outcome note. Change the status; the audit log (Admin → Audit log) shows the request id only, never the message.
9. **Deletion, both states.** Account → "Delete my account": the "not switched on yet" page. In Admin → Settings → Accounts switch deletion on, reload: the three steps with the exact wording. Switch it off again afterwards.
10. **Download my data.** Account → Download my data: consents with versions, the invite code, passkey names, decisions about your Dispatches and handle, your privacy requests. No reports other people made about you.
11. **By-hand deletion (dry run).** In a terminal:

```bash
set -a && . ./.env.test.local && set +a && npm run account:delete -- --email someone@example.test
```

   It prints what would go and what would stay. Add `--confirm` only for a throwaway local account.
12. **Retention.** `docs/legal/RETENTION.md` lists the eight jobs. `tests/rls/retention.test.ts` runs each with back-dated rows.
13. **Launch topics (dry run, local).** `npm run topics:load -- --start 2026-12-01 --concurrent` lists the three wave-1 Campaigns sharing one start and end. Type `no` at the prompt.

## Not shown, because it is not applied or not decided

Hosted is untouched. The hosted draft-Campaign update script has **not** been run with `--confirm`.
