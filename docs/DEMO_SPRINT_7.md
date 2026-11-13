# Sprint 7 (batch 1) click-through

Local first: `npx supabase start`, `npm run dev`. Sign in as an admin (see `docs/DEMO_SPRINT_5.md` for the seeded users and `npm run admin:set`).

1. **Open redirect fixed.** Visit `/login?next=/%09/evil.example`, sign in: you land on your Dossier, not on another site.
2. **Kill switches.** Admin, Settings, "Site switches". Tick "Pause posting", type a reason, Save. A banner appears under the header on every page. Open a Campaign and try to post as a member: "Posting is paused for a short while", and the text is kept. Untick, give a reason, Save: the banner goes and posting works.
3. **Pause sign-ups.** Tick "Pause sign-ups", Save. Signed out, `/signup` shows the banner and refuses a valid invite with "New accounts are paused for a short while." Untick to resume. Every change is in Admin, Audit log ("site.switches_changed").
4. **Pause emails.** Tick "Pause emails", Save. Emails stay queued (Admin, Health, "Emails waiting"); untick and they go out on the next run.
5. **Health.** Admin, Health: queue sizes and ages, AI calls today against the cap, switches, last run of each scheduled job, recent events. `GET /api/health` returns `{"ok":true}`.
6. **Rate limits.** On `/login`, enter a wrong password for one address 9 times: "Too many sign-in attempts. Please wait a few minutes." The Health page then shows a "rate_limited (sign_in_email)" event. On `/forgot-password` the same confirmation page appears whether or not the address exists, even when limited.
7. **Injection tests.** `npx vitest run src/lib/ai/injection.test.ts`.

Not demonstrated here: nothing in this batch is applied to the hosted database.
