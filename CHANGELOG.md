# Changelog

## Sprint 2: Campaigns and countdown (1 November 2026). Awaiting review

### Added
- **Migration `20261102000100_campaign_rounds_positions.sql`** (new; earlier migrations untouched):
  - `campaign_rounds`: each round has its own deadline. A round cannot sit outside its Campaign, which the database checks whenever either side changes.
  - `campaign_positions`: one row per Strategist per Campaign, with a before and an after position (for, against or undecided). Works on every format. The before position closes when the Campaign starts. The after position opens at the start. Both lock at close. Positions are private to the Strategist and admins, and cannot be deleted.
  - New columns on `campaigns`: `notes` (admin only), `needs_owner_decision` (blocks scheduling while set), `wave`, `brief` (topic-bank background, not shown) and `current_round`.
  - Every Campaign and round insert, change or removal is written to `audit_log` by trigger, along with who made it.
  - `save_campaign()` saves a Campaign and its rounds in one transaction. It runs with the caller's own rights, so only admins succeed.
  - `campaign_tick()` opens Campaigns, moves rounds on and closes them by server time. Running it twice changes nothing the second time, and each step is logged as `campaign.opened`, `campaign.round_changed` or `campaign.closed`. pg_cron runs it every minute, on the minute. There is no Vercel cron and no Inngest.
  - `server_now()` gives the countdown the database clock.
- **Campaigns list** (`/campaigns`): grouped into Open now, Opening soon and Closed, each with its own empty state, plus loading and error pages. Admins also see "Create a Campaign" and "Manage Campaigns".
- **Campaign page** (`/campaigns/[slug]`):
  - A content note comes first on sensitive topics, followed by the title, category and format.
  - Financial and medical topics carry the "Opinion, not advice" label.
  - Shows the main countdown, the current round with its own countdown, every round's deadline in UK time, and the rules.
  - Has the before/after position control and a "Dispatches open in the next update" note in place of a link.
- **Countdown**:
  - Driven by the server's clock: the page sends the database `now()`, the browser works out the offset once, ticks from it, and re-syncs from `/api/time` when the tab regains focus.
  - Screen readers hear it hourly, then every 10 minutes, every minute and every 10 seconds near the end.
  - Uses fixed-width digits (no layout shift) and refreshes the page when a deadline passes.
- **Admin create and edit** (`/admin/campaigns`, `/new`, `/[id]`):
  - The admin role comes from the JWT claim, and non-admins get "not found".
  - Fields: title, web address, summary, rules, category, format, opens/closes (UK time, handling the clocks changing), up to 5 rounds, sensitive flag with content note, "opinion, not advice", admin notes, and draft or scheduled.
  - Errors are in plain English, stay until dismissed and keep what was typed.
  - Editing a running Campaign keeps it running.
- **`npm run topics:load -- --start YYYY-MM-DD`**:
  - Loads the fifteen launch topics as **drafts only**, in wave order with 7-day windows from your start date (midnight UK time).
  - Prints the target host and waits for you to type "yes". Matches by slug, so it never duplicates or overwrites anything. Each insert is audited.
  - Facts from the topic bank are kept in `brief` and **not shown**. The public summary is a DRAFT placeholder until you refresh it.
  - `rubric_published_at` is left empty, because the schema has no rubric table yet.
- **`npm run campaign:test`**: a local-only test Campaign that opens at the next minute with two 2-minute rounds.
- **Seed**: three `[Sample]` Campaigns (open with 3 rounds, opening soon, closed) for local development only.
- **Tests**:
  - Unit: 35 new (status and round boundaries exactly at start and end, the clocks changing in both directions, a round ending after its Campaign, countdown wording and announcement intervals, form validation, the topics file against the schema limits).
  - RLS: 18 new (only admins write Campaigns and rounds; drafts and their rounds are hidden; users edit only their own position; no after position before the start; no changes after close; scheduler opens, moves rounds and closes idempotently with an audit trail; pg_cron job present; browsers cannot run the scheduler; loading topics twice creates no duplicates).
  - New Playwright test at 375px: an admin creates a Campaign with rounds, a Strategist finds it under Opening soon, sees a countdown within seconds of server time, and records a before position.

### Checked
- **Real-time scheduler**: two test Campaigns ran under the real pg_cron job. The second opened at 10:59:00.007, moved to round 2 at 11:01:00.017 and closed at 11:03:00.016, with each step in the audit log. On the first run, the page did not refresh itself at close, because "Opens in" and "Time left" share one countdown component. That is now fixed (one refresh per deadline), and the second run updated through Open, Round 2 and Closed without a reload.
- **Full suite**: lint and typecheck clean; 78 unit, 61 RLS and 3 Playwright tests pass. No console errors on the Campaign page.
- **Sprint 1 carry-over**: `/profile` opened directly by URL loads fully in Chromium (Playwright). I could not reproduce the stuck "Loading" outside the built-in review browser. A regression check is now in the Playwright test.

### Decisions for the owner
- **Bank of England, 5 November**: loads as a draft flagged "owner decision needed". The database refuses to schedule it until that flag is cleared. Pick the next MPC date or replace the topic.
- **Assisted dying**: loads as sensitive with the content note "DRAFT: content note to be written by the owner". No real note or support wording has been written.
- **"Closed, moderated debate"**: loads as Open arena, with the intended setting recorded in the admin notes.
- **Topic facts**: hidden until you refresh them. To publish, edit the summary on the Campaign's edit page.

### Not done / known issues
- Launch topics have **not** been loaded to the hosted project, and this migration has **not** been pushed. Both wait for your OK (dry run first, as for Sprint 1).
- Clearing `needs_owner_decision` has no admin screen yet (Sprint 4 console). For now, editing the topic in the form and asking me to clear the flag is the route.
- The scheduler runs on the minute. A Campaign set to open at 9:00:30 opens at 9:01:00, while the page shows it open from 9:00:30. The admin form only accepts whole minutes, so this only affects Campaigns created by scripts.
- Rounds may leave gaps, and the page then shows no current round between them.

## Sprint 1: Foundation, accounts and Dossier (1 November 2026). Approved

### Added
- **Project**: Next.js 16 (App Router, TypeScript strict), Tailwind 4 with shadcn/ui-style components, ESLint, Vitest, Playwright. GitHub Actions CI runs lint, typecheck and unit tests, then builds the database from the migrations in local Supabase and runs the RLS and Playwright tests.
- **Database schema** (`supabase/migrations`, rebuilds from scratch): `profiles`, `invites`, `campaigns`, `dispatches`, `awards`, `audit_log`, plus `ai_decisions`, `passkeys` and `webauthn_challenges`. Row-level security is on for every table. Column privileges stop people from setting their own handle, moderation status or AI decisions. `audit_log` is append-only, even for the service role. Admin rights come only from the JWT `app_metadata.role` claim.
- **Invite-only sign-up**: email and password, invite code, 18+ and terms confirmation. A database trigger enforces the invite, so calling the Auth API directly cannot get round it. Email confirmation link → choose handle → Dossier.
- **Passkeys**: add one from the Account page, then use "Sign in with a passkey" on the sign-in page. WebAuthn is verified on the server (SimpleWebAuthn); credentials are written only by the server.
- **Handle screening**: `src/lib/ai` (the single AI module) with a deny-list stub for impersonation and hate terms, including look-alike characters such as `Adm1n`. Every decision is stored in `ai_decisions` with model, prompt version, output and a plain reason.
- **Pages**: Home, Sign in, Create account, Check your email, Choose your handle, Account (profile, passkeys, "Back to home"), empty Dossier, Campaigns placeholder, and draft Privacy, Terms and AI-use pages clearly marked DRAFT. Includes loading, error and not-found pages.
- **Design system**: 18px base text, Atkinson Hyperlegible font, high-contrast colours, 48px minimum tap targets, visible focus ring, skip link, and a persistent header (Home, Campaigns, Dossier, Account). Errors appear inline and stay until dismissed, and forms keep what you typed.
- **Email links**: `/auth/confirm` accepts links whose `&` were HTML-escaped to `&amp;` by the email template.
- **Scripts**: `npm run env:check` (names only, never values), `npm run invite:create`, `npm run admin:set`, `npm run test:env`.
- **Tests**: 43 unit tests, 43 RLS tests (each checked by weakening a policy and watching the tests fail), and 2 Playwright tests at 375px: sign-up with an invite code through to the empty Dossier, and adding a passkey then signing in with it.

### Changed
- `.env.local`: changed the separator from `KEY:value` to `KEY=value` (with permission) so Next.js can read it. Values unchanged.

### Not done / known issues
- Hosted project: migrations applied after a reviewed dry run, Auth settings configured, and a real sign-up confirmed end to end. Site URL is `http://localhost:3000` until a Vercel URL is chosen.
- The free Supabase email service sends only a few emails an hour. Custom SMTP through Resend is planned for Sprint 3.
- No data export or delete-account yet (CLAUDE.md rule 11). Proposed for a later sprint.
- An invite is used up at sign-up even if the person never confirms their email.
- `npm audit` reports moderate advisories in the ESLint toolchain only (development, not shipped).
- `/Users/deleolaoye/Project/TGS/.env.local` (outside the repo) still uses the old `KEY:value` format and is not used by the app.
