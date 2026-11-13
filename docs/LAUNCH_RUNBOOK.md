# Launch runbook: invite-only soft launch, 1 December 2026

Written 13 November 2026 for the owner. Free plans only (Vercel Hobby, Supabase free, Resend free, Anthropic with a $30 monthly cap). Nothing here needs a paid service. Decisions D1 to D8 are in `docs/SPRINT_7_PLAN.md`; the go or no-go list is `docs/GO_NO_GO.md`; if something goes wrong, `docs/INCIDENT_CHECKLIST.md`.

## The plan in one paragraph
About 100 members, invited in waves of 10 to 20. Each wave only after a clean day. App email is cut to essentials (on by default, global cap 60 a day) so Resend's free quota has headroom for Supabase's own sign-up and reset emails. You take a database dump by hand before every migration and weekly (decision D7). If anything looks wrong you flip a kill switch first and investigate second.

## Owner actions before the first invite wave
Do these in order. Nothing here has been done by Claude. Tick each one and write the date in `docs/CLAUDE_LOG.md`.

1. **Supabase Auth rate limits** (Authentication, Rate Limits). Raise sign-ups and sign-ins from 30 to **150**, and token verifications from 30 to **100**, per 5 minutes. All Auth calls come from Vercel's shared addresses, so the default per-address limits would count the whole membership as one visitor.
2. **First manual dump.** `bash scripts/backup-dump.sh` (Docker running, `DATABASE_URL` in `.env.local`). Check the user and profile counts it prints. Store the three files **encrypted** and off the laptop (an encrypted disk image or a password manager's file store). Never commit or email them. See `docs/BACKUP_RESTORE.md`.
3. **Re-read the free-plan limits** on the Resend, Supabase and Vercel pricing pages (Resend daily and monthly email quota, Supabase database size and pause rules, Vercel Hobby function limits and terms). Write the figures in the log; the numbers in `docs/SPRINT_7_PLAN.md` are from memory.
4. **Add a second admin** (`npm run admin:set -- <email>`, or as `docs/OWNER_DECISIONS.md` item 7 describes) and sign in with it once.
5. **Provider accounts.** Move the Vercel, Supabase, Resend and Anthropic accounts into the company before any commercial use. Until then there are no sponsors and no payments (decision D1).
6. **Campaign 1: `under-16-social-media-ban`** (opens 1 December 2026, 00:00 UTC). Before 1 December: Admin, Campaigns, Edit. Replace the placeholder summary, check the rules, **publish the rubric** ("Publish the rubric", once the rule 7 change is live; it cannot be undone), then set Publish to **"Schedule it"** and save. Nothing is needed at midnight: the scheduler opens it within a minute.
7. **Decide the three flagged Campaigns** (each has an owner decision flag and cannot be scheduled until you clear it): `bank-of-england-rate-decision-november` (is the topic still timely?), `rosebank-after-jackdaw`, and `assisted-dying-or-fix-care-first` (sensitive: it needs the real content note).
8. **Edit the three PLACEHOLDER strings** in `src/lib/judging/notices.ts` before the first Campaign can close (8 December 2026 at the earliest). This is a parked legal item and is not touched by Claude.
9. **Member post test** (needs a second, non-admin account). Account deletion stays OFF and the legal items stay parked.
   1. In a terminal in the project folder: `npm run invite:create -- --email <mailbox> --note "TEST account"` (one use, bound to that address; it writes to hosted and prints the host first). **The sign-up link it prints uses the LOCAL site address, so do not use it as printed:** open `https://thegrandstrategist.com/signup?code=<printed code>` instead. Use a mailbox that is not a plus-variant of your admin address (Signals would flag it).
   2. In a private window sign up with the code, confirm the email, choose a handle.
   3. As admin: Admin, Campaigns, New. Title "TEST: please ignore", address `test-please-ignore`, summary starting "TEST ONLY", open arena, no rounds, not sensitive. Opens: a few minutes ago. **Closes: 31 December 2027.** If the form rejects the far-future close date, **stop and tell the reviewer**. Save as a draft, then (once the rule 7 change is live) Publish the rubric, then set Publish to "Schedule it" and save. Wait a minute: the Campaign reads Open and `/admin/audit` shows `campaign.opened`.
   4. As the test member, **on a phone**: open the TEST Campaign and post one short argument declared "none". Check it appears after screening (these are the post and the visible-result checks, steps 7 and 8 of the test plan, and must be done on a phone).
   5. As the test member, open `/admin`: it must be **refused** (not the console).
   6. As admin, Edit the TEST Campaign, set Publish to "Keep as draft", save. Reload as the test member: the Campaign must no longer be reachable. The test Dispatch and the account stay in the database.
   7. Afterwards check Admin, Health (queues empty, jobs recent, AI calls up by about one); Admin, Signals (nothing new); `/admin/audit` (`campaign.opened`, your edits, no close or judging rows); the Vercel runtime logs (no 5xx).
   8. **Message the reviewer within about 30 minutes of finishing** with what you saw.
   Never leave the TEST Campaign scheduled or open: it is public while live. Never set a near close date: a close queues AI scoring and a peer-voting email.

## Owner actions (setup reference: where each setting lives)
Nothing below has been done by Claude. Tick them off in order; none needs a code change.

**Before any migration or release**
1. Merge order and hosted migrations: apply to hosted in timestamp order with a dry run first (`supabase db push --dry-run --include-all` must list exactly the files you expect). Migrations go first, then the merge, because the new code reads the new columns. Each migration is additive, so the code already live keeps working in between. **Hosted CLI steps are run from the owner's terminal**, after `npx supabase login` and `npx supabase link --project-ref <ref>`, using `--linked` (for example `npx supabase db push --dry-run --include-all --linked`). Claude's shell has no access token and cannot reach hosted, so it cannot run them; paste back the output with any connection string removed.
2. Take a dump immediately before applying (`bash scripts/backup-dump.sh`, see `docs/BACKUP_RESTORE.md`).

**Supabase dashboard (hosted project)**
3. Authentication, Rate Limits (decision made 13 Nov): sign-ups and sign-ins 150 per 5 minutes, token verifications 100 per 5 minutes. Reason: every Auth call comes from Vercel's shared addresses, so the per-address defaults would count the whole membership as one visitor. Check the values saved, and write them in `docs/CLAUDE_LOG.md`.
4. Authentication, Email Templates: Confirm sign up and Reset password saved with the wording in `docs/legal/AUTH_EMAIL_FOOTER.md`. Authentication, URL Configuration: Site URL and redirect URLs are the live address only.
5. Vault secrets present: `email_processor_url`, `email_processor_secret`, `moderation_processor_url`, `moderation_processor_secret`, `judging_processor_url`, `judging_processor_secret` (see `docs/LAUNCH_EMAIL_SETUP.md`). The three secrets are fresh random strings of 40 or more characters, the same values as the Vercel variables `EMAIL_PROCESSOR_SECRET`, `MODERATION_PROCESSOR_SECRET`, `JUDGING_PROCESSOR_SECRET`.
   - **Check (read-only, names only).** In the Supabase SQL Editor run `select name from vault.secrets order by name;`. Expect exactly these six names: `email_processor_secret`, `email_processor_url`, `judging_processor_secret`, `judging_processor_url`, `moderation_processor_secret`, `moderation_processor_url`. Never select the secret values.
   - **Check the three routes with no header.** Each must answer **401**. A **503** means the matching Vercel variable is unset.
     ```bash
     curl -s -o /dev/null -w '%{http_code}\n' -X POST https://thegrandstrategist.com/api/email/process
     curl -s -o /dev/null -w '%{http_code}\n' -X POST https://thegrandstrategist.com/api/moderation/sweep
     curl -s -o /dev/null -w '%{http_code}\n' -X POST https://thegrandstrategist.com/api/judging/process
     ```

**Vercel**
6. Production variables set: `ANTHROPIC_API_KEY`, the three processor secrets, `RESEND_API_KEY`, `EMAIL_FROM` (on `updates.thegrandstrategist.com`), `NEXT_PUBLIC_SITE_URL`, the three Supabase variables. Never paste any of them into chat.
7. Note the Production deployment to promote if you need to roll back (it is shown as a rollback candidate on the Vercel Deployments page). Confirm the project is on Hobby and understand that Hobby is for non-commercial use (decision D1: accepted for the pilot, no sponsors or payments until the company account takes over).

**Anthropic and Resend**
8. Anthropic console: monthly limit $30, notify at $10 (decision D8). Resend: domain verified, and read the free quota (about 100 a day at the time of writing; check the pricing page again before launch).

**Admin**
9. Admin, Settings: `email_essentials_only` is on and the global daily email cap is 60. A second admin account exists. Account deletion stays off.

## Day by day

### T minus 1 day
- Dump: `bash scripts/backup-dump.sh`. Copy the three files off the laptop. Check the printed counts for users and profiles look right.
- Open `/api/health` on the live site: `{"ok":true}`.
- Admin, Health (`/admin/health`): queues empty, every job has run recently, AI calls today near zero.
- Admin, Judging: the judge prompt version reads 2 (or 1 if you chose the fall-back; see "Judge prompt" below).
- Try the three processor addresses without the secret (for example with `curl -X POST` and no header): each must answer 401.
- Do one real sign-up, confirmation, sign-in and password reset with a spare address.
- Announce nothing.

### Launch day (T)
1. Create the first 10 to 20 invites (`npm run invite:create`, or Admin). Prefer binding an invite to an email address where you know it (decision D3b).
2. For the first two hours look every 15 minutes at: Admin, Health; Admin, Signals; `/admin/audit`; the Supabase and Vercel dashboards for errors.
3. Email: if the day's app email is over 80% of the Resend figure, flip emails off (Admin, Settings, switches). They stay queued and send on resume.
4. AI: if calls used pass 80% of the daily cap before evening, tell members judging will be slower. Judging stops at 80% by design and resumes the next UK day.
5. Next wave only after a clean day: no 5xx you cannot explain, queues drained, no unresolved Signals you would act on.

### Invite waves
10 to 20 a wave, about 100 in total. If a Campaign closes with many Dispatches, remember the AI cap: with the default cap of 1,000 calls a day a close of 1,500 Dispatches judges about 800 on day one and the rest on day two (measured in `docs/LOAD_TEST_RESULTS.md`). Either raise the cap in Admin, Settings, or tell members to expect a day's delay.

## Kill switches (no deploy, effective at once, each writes an audit entry with your reason)
Admin, Settings, "Site switches" (database function `set_site_switches`):

| Switch | Effect | Members read |
| --- | --- | --- |
| Posting paused | New Dispatches refused; reading stays open | "Posting is paused for a short while. You can still read everything. Please check back soon." |
| Sign-ups paused | New accounts refused, including direct calls to the sign-up service | "Sign-ups are paused for a short while. Please try again later." |
| Emails paused | Nothing is claimed from the email queue; it waits and sends on resume | (nothing shown) |
| AI off (`ai_enabled`) | Screening falls back as set in Settings (normal Campaigns post unscreened and flagged; sensitive Campaigns are held) | (nothing shown) |

Email essentials and the global cap are a separate form (`set_email_controls`). A banner on the site shows while a switch is on.

## Judge prompt
Version 2 is the default after the real evaluation (see `docs/SPRINT_7_PLAN.md`, W7). v2 adds a list of claims the model cannot check, shown to judges and admins as "Check before relying". It never changes a score. To go back to v1 with no deploy: Admin, Judging, "Judge prompt version", choose 1 and give a reason (database function `set_judge_prompt_version`). The next processor run uses it.

## Rolling back
- **Code**: Vercel dashboard, Deployments, the previous Ready deployment, Promote to Production (Instant Rollback; confirm it is offered on Hobby when you first look). Note the deployment you leave (the "Production deployment to promote" you noted as an owner action, shown as a rollback candidate on the Deployments page).
- **Database**: never rolled back. Every migration is additive; roll forward with a new migration, and flip a kill switch before any risky change.
- **Data lost or damaged**: restore from the latest dump into a scratch project first (`docs/BACKUP_RESTORE.md`).

## Reading the health page, the event log and CSP reports
- `/admin/health` shows queue depths and ages, last run of each scheduled job, AI calls used today. A queue that only grows means its processor is not being called: check the Vault secrets and the Vercel variable of the same name.
- `system_events` is our own log (kept 30 days): counts and short codes, never names, addresses, IPs or text. Admin, Health lists recent rows.
- **CSP reports.** Every page sends a `Content-Security-Policy-Report-Only` header, so nothing is blocked. When a browser sees something a stricter policy would block, it posts a report to `/api/csp-report`, which stores one `system_events` row: kind `csp_report`, code = the directive (for example `img-src`), detail host = the blocked host, or a word such as `inline` or `eval`. No page address, query string or page content is stored. The route is limited (60 a 10 minutes per caller, 600 an hour overall). To read: Admin, Health, "Recent events" (the latest 50, so a busy page can push other events out of view); for a count by directive and host use the Supabase SQL editor `select code, detail->>'host' as host, count(*) from public.system_events where kind = 'csp_report' group by 1, 2 order by 3 desc;`. Expect `inline` for script-src and style-src (Next.js adds inline code; 'unsafe-inline' is in the policy, so those do not report). A host you do not recognise on `script-src` or `connect-src` is worth a look. Plan: after a quiet week with no unexplained hosts, enforce (a later change, not part of this launch).

## Known limits (free plans)
- Resend free is the first thing to break (about 100 emails a day). App email is essentials only and capped at 60 a day.
- Anthropic: $30 a month; about $0.12 a member a month at the assumed use.
- Supabase free: no backups (hence the dumps), the project pauses after about a week without activity (open the site or the dashboard the week before launch), 500 MB database.
- Vercel Hobby is non-commercial (D1).
- Local load tests passed (`docs/LOAD_TEST_RESULTS.md`), but they do not cover Supabase Auth's own limits, Resend, real model calls or browser traffic.
