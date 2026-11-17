# Sprint 7 (batch 1) click-through

Local first: `npx supabase start`, `npm run dev`. Sign in as an admin (see `docs/DEMO_SPRINT_5.md` for the seeded users and `npm run admin:set`).

1. **Open redirect fixed.** Visit `/login?next=/%09/evil.example`, sign in: you land on your Dossier, not on another site.
2. **Kill switches.** Admin, Settings, "Site switches". Tick "Pause posting", type a reason, Save. A banner appears under the header on every page. Open a Campaign and try to post as a member: "Posting is paused for a short while", and the text is kept. Untick, give a reason, Save: the banner goes and posting works.
3. **Pause sign-ups.** Tick "Pause sign-ups", Save. Signed out, `/signup` shows the banner and refuses a valid invite with "Sign-ups are paused for a short while." Untick to resume. Every change is in Admin, Audit log ("site.switches_changed").
4. **Pause emails.** Tick "Pause emails", Save. Emails stay queued (Admin, Health, "Emails waiting"); untick and they go out on the next run.
5. **Health.** Admin, Health: queue sizes and ages, AI calls today against the cap, switches, last run of each scheduled job, recent events. `GET /api/health` returns `{"ok":true}`.
6. **Rate limits.** On `/login`, enter a wrong password for one address 9 times: "Too many sign-in attempts. Please wait a few minutes." The Health page then shows a "rate_limited (sign_in_email)" event. On `/forgot-password` the same confirmation page appears whether or not the address exists, even when limited.
7. **Injection tests.** `npx vitest run src/lib/ai/injection.test.ts`.

Not demonstrated here: nothing in this batch is applied to the hosted database.

## Batch 2a click-through (rules and migrations)

1. **Account age.** Sign up a new test account, take part in a Campaign that has closed and try to vote: "Accounts must be at least 48 hours old before their votes, confirmations and picks count." A test user three days old can vote. Admin, Judging, "Account age before votes..." changes the number (0 switches the rule off). A panel judge is exempt.
2. **Steelman cap.** As a participant confirm three steelmen in one Campaign; the fourth says "You can confirm at most 3 steelmen in one Campaign."
3. **Signals.** Admin, Signals lists patterns (for example two accounts that voted for each other). It only reads; nothing changes. A Campaign's draft Verdict shows "For review: N integrity signals..." without blocking publishing.
4. **Bound invite.** `npm run invite:create -- --email person@example.com` (local first). On `/signup`, any other address gets "This code doesn't match this email. Use the address the invite was sent to." (the same message as for a mistyped, used, expired or revoked code); the right one works.
5. **Email essentials.** Admin, Settings, "App email": tick or untick "Essential emails only", set the daily cap, give a reason. Admin, Audit log shows `site.email_controls_changed`. With the setting on, a reply produces no email; only moderation outcomes, Verdict published, appeal outcomes, judge assignments and voting-open notices do.

## Invites and "ask to join" (local Supabase)

1. `npx supabase db reset`, `npm run test:env`, then `npm run dev` (or the Playwright server) and sign in as an admin (`npm run admin:set -- <email>`).
2. Open `/join` (signed out), ask with an email address. Ask again, and with an existing member's address: the answer is the same each time, and no email is sent.
3. Admin, Invites: the request is listed with the email budget above it. Tick it, press "Approve and email". Open Mailpit (`http://127.0.0.1:54324`): the invitation has a link to `/signup?code=...`.
4. Use the link with a different address: "This code doesn't match this email. Use the address the invite was sent to.". Use the right address (any capitals): "Check your email". Use the link again: refused.
5. Paste addresses into the box and press "Approve without emailing": the links show once. Reload: they are gone and the row reads "Link shown to you, not emailed". Try Revoke and Re-issue on a row.
6. Set `invite_daily_email_limit` to 1 (SQL) and approve three at once: the screen says how many go out now and how many wait for the next days; the queue rows carry later send times.
