# Changelog

## Sprint 3: Dispatches and discussion (2 November 2026). Awaiting review

Branch `sprint-3`, cut from `main` after pull request #1 (Sprint 2) was merged. **Closed test only.** Automated screening arrives in Sprint 4, so do not use this with real invitees yet.

### Sprint 2 carry-over (separate commits, done first)
- **Invites are now used up on email confirmation, not at sign-up** (`20261103000100`). Signing up *reserves* a place for 24 hours, so two people cannot race for the last one; confirming the email turns the reservation into a use and writes `invite.consumed` to the audit log. An unconfirmed sign-up older than 24 hours releases its place. If that person confirms later and the invite has filled up or been revoked, confirmation is refused with a clear message. Accounts created already confirmed (admin scripts) use the invite at once. Covered by 4 RLS tests.
- **GitHub Actions** moved to `checkout@v6`, `setup-node@v6` and `upload-artifact@v6`, all of which run on Node 24.
- **375px overflow**: a new element-level check names anything that sticks out past the right edge. It confirms the Campaign page buttons fit, and it caught one new overflow this sprint (the "Following @handle" button), which is fixed.
- **Found and fixed: admin-only Campaign columns were readable through the API** (`20261103000110`). `notes`, `brief` (the hidden topic facts), `needs_owner_decision` and `created_by` were never shown on a page, but anyone could read them through the API. Browsers now get only the public columns. Admins read the private ones through `campaign_admin_fields()`, which checks the role claim.

### Added
- **Migrations** (`20261103000200` Dispatches and discussion, `20261103000300` email). Earlier migrations are untouched, and the database still rebuilds from scratch. No DROP or TRUNCATE. Two Sprint 1 Dispatch policies are switched off with `ALTER POLICY` and renamed to say why.
- **Dispatches**:
  - Three kinds: argument, rebuttal and evidence. A rebuttal must answer a Dispatch in the same Campaign. Evidence needs at least one link. An argument carries no links.
  - Each Dispatch records its Campaign, its round, and the author's position from `campaign_positions`. In an Oxford-style Campaign you must be For or Against.
  - Posting goes only through `post_dispatch()`, which checks, by server time:
    - you are signed in and have a handle;
    - the Campaign is open;
    - the current round accepts that kind of Dispatch;
    - you have declared your AI use;
    - the text is within the length limit;
    - you are under the per-round limit and past the cooldown.
  - Browsers can no longer insert, update or delete Dispatches directly.
- **Rounds** now say which kinds they accept (`campaign_rounds.allowed_kinds`, default all three). `save_campaign()` stores it.
- **Edit and withdraw**:
  - You can edit your own Dispatch for 5 minutes. Each earlier version goes to `dispatch_revisions` (only you and admins can read it), and the Dispatch shows "edited".
  - Withdrawing shows "Withdrawn by author." The original is kept in `dispatch_sealed_content` (admins only) for judging and the audit trail.
  - Every create, edit, withdraw, hide and restore is written to `audit_log` by a trigger. Nothing is hard-deleted.
- **AI-use declaration**:
  - Every Dispatch must say none, assisted or generated. There is no default.
  - Each Dispatch shows a label in plain words ("Written without AI", "Written with AI help", "Mostly written by AI") with a one-line explanation and a link to the AI-use page.
  - Stored as the existing `ai_use_declaration` enum. `screenDispatch()` in `src/lib/ai` is the Sprint 4 hook for detecting undeclared AI text. It currently allows everything and records nothing.
- **Source links**:
  - http and https only; `javascript:`, `data:`, other schemes, embedded passwords and spaces are refused.
  - Tracking codes (`utm_*`, `fbclid`, `gclid` and similar) are removed.
  - Each link stores its URL, host and an optional title, up to 5 per Dispatch.
  - Links open in a new tab with `rel="noopener noreferrer nofollow ugc"`, and the website name is always shown. Nothing is fetched from the linked site.
- **Threads**:
  - Rebuttals nest under the Dispatch they answer, 4 levels deep. Deeper replies continue at level 4 with a "Replying to @handle" link.
  - Branches fold and unfold; the top two levels start open.
  - Threads load 20 at a time with "Show more". The page never loads the whole Campaign at once.
  - A Dispatch's position is shown by word, icon and border style (solid, dashed or dotted), not colour alone.
- **Live updates**: every 30 seconds while the tab is visible, and whenever you return to it, the page checks for new Dispatches and shows "N new Dispatches. Show". This uses polling, not Supabase Realtime.
- **Compose box**: each state has plain wording and a way forward:
  - Campaign not open yet, or closed;
  - not signed in, or no handle yet;
  - no position recorded, or Undecided in an Oxford-style Campaign;
  - between rounds, or the round accepts rebuttals only;
  - per-round limit reached, or cooling down (with a live count);
  - offline (the text is kept on the device).

  There is also a live character count, and you never lose what you typed.
- **Reactions**:
  - Persuasive, Well sourced and Fair point, one of each per Strategist per Dispatch.
  - Not on your own Dispatch, and not after the Campaign closes. Tapping again takes a reaction back.
  - The set lives in the admin-editable `reaction_types` table. Counts are kept on the Dispatch for display only.
  - A schema test (`reactions-not-judging.test.ts`) fails if any function, view or table other than the reaction code reads reactions, so they can never feed a Verdict.
- **Follow**:
  - You can follow Campaigns and Strategists. Posting in a Campaign follows it automatically.
  - Strategist pages (`/strategists/[handle]`) show recent public Dispatches and a Follow button. Signed-out visitors see only the handle and join date; signed-in Strategists also see the display name, expertise tag and bio.
  - The Dossier lists who and what you follow, privately.
- **Search**:
  - Postgres full text (English) over Campaign titles and summaries and over visible Dispatches; handles are matched by prefix. Withdrawn and hidden Dispatches are excluded.
  - Searching for Strategists is for signed-in Strategists only. Signed-out visitors get Campaigns and Dispatches, never a person, and the Strategists filter asks them to sign in. The handle search index is not readable by them at all, and `search_tgs()` skips that part for them instead of failing.
  - `search_tgs()` runs with the searcher's own rights, so row-level security applies; for example, drafts are found only by admins.
  - A search box in the header, a results page with filters (Everything, Campaigns, Dispatches, Strategists), highlighted matches, paging, and empty, loading, error and 4-second timeout states.
  - Every query uses its GIN index. Each took under 0.2 ms on the seeded debate.
- **Email notifications** (`src/lib/email`):
  - Events: a reply to your Dispatch; a Campaign you follow opens, changes round or closes; a Campaign you posted in or recorded a position on closes within 24 hours.
  - Database triggers and a pg_cron job queue events in `email_outbox`, each with a unique key so it is queued only once.
  - Once a minute, pg_cron calls the protected route `/api/email/process` through pg_net, only when something is due. The route's address and secret are read from Supabase Vault. There is no Vercel cron and no Inngest.
  - Rows are claimed with SKIP LOCKED, a stuck claim is retried after 10 minutes, and failures back off 5, 10, 20, then 40 minutes, giving up after 5 attempts. Each send carries an idempotency key, so a retry is not sent twice.
  - Replies wait 10 minutes and go out together as one digest. Each person gets at most 6 emails a day, the most urgent first; the rest wait.
  - Nothing is sent to an unconfirmed address.
  - Emails go through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set, and to Mailpit locally. If anything is missing, nothing is sent, the reason is logged, and emails wait in the queue.
  - Every email has plain-text and HTML versions with a language set, escaped content and project wording.
  - Every email has an unsubscribe link: one press on a confirmation page, so link checkers cannot unsubscribe people. Mail apps also get the standard one-click unsubscribe header.
  - **Email settings** page (`/profile/email`): three kinds of email, all on by default, plus "Stop all emails".
- **PWA**:
  - A web manifest and placeholder icons (navy and gold, marked PLACEHOLDER in `public/icons/README.md`).
  - A service worker that precaches only the offline page, the manifest and the icons, and caches Next.js build files. It never stores pages, API responses or anything personal (a test checks this).
  - A static offline page.
  - A small "Install the app" button in the footer that appears only when the browser offers installing, and stays away once dismissed. No push notifications.
- **Reporting and hiding**:
  - "Report" on every Dispatch, with a reason and optional details. Testers are told plainly that there is no automatic screening yet.
  - An admin queue (`/admin/reports`) where admins hide a Dispatch with a reason (kept in the audit log) or dismiss the reports.
  - A "Hidden Dispatches" list with Restore. Hidden content is sealed, never deleted.
- **Safety and legal**:
  - Sensitive Campaigns show their content note again before the compose box and the Dispatches, which stay folded until you choose to continue.
  - Financial and medical Campaigns show "Opinion, not advice" on the compose box and on every Dispatch.
  - **Download my data** (Account page) gives a JSON file of your profile, Dispatches with edit history, the original text of anything withdrawn or hidden, positions, reactions, follows, reports and email settings. Each export is audited.
  - **Delete my account** is proposed only (see the owner decisions below). The Account page says it is not switched on yet and how to ask for deletion by hand.
- **Dossier**: your Dispatches grouped by Campaign, with AI-use labels and withdrawn or hidden items marked; plus your Following list. The award and title placeholders stay.
- **Settings table**: `community_settings` (one row, admins edit, changes audited) holds the limits listed under Defaults below.
- **`npm run seed:debate`** (local only):
  - Refuses anything that is not local Supabase.
  - Creates 20 test Strategists (`debater01…20@example.test`, handles `Test_Amara…Test_Tamsin`) in a `[Test data]` Campaign with two rounds.
  - Adds 25 threads and 46 rebuttals (one exchange runs past depth 4), 165 reactions, varied AI use, example.org sources, and one withdrawn Dispatch.
  - Running it again changes nothing.
- **Tests**:
  - **Unit**: 24 new, 102 in total. They cover validation, limits, link cleaning, threading, edit and cooldown windows, error wording, email planning (digest, daily cap, preferences, retries), email templates and transport selection, and search highlighting.
  - **RLS**: 31 new, 92 in total.
    - Dispatches only through the functions, with every posting rule enforced.
    - No editing someone else's Dispatch; edit history and sealed content kept private.
    - Hidden and withdrawn content not exposed; moderator notes hidden.
    - Reports, reactions, follows and settings.
    - Search visibility, including that anonymous search never returns a person.
    - Anonymous visitors can read a profile's handle and join date only, never the display name, expertise tag, bio or search index.
    - Email preferences and outbox closed to browsers; each email trigger fires exactly once.
    - Every new table has RLS.
  - **Playwright**: 6 new, 9 in total, all at 375px.
    - The full post, reply, react, follow and search journey with the email arriving in Mailpit and the unsubscribe link working, then the same Strategist's page and a people search seen signed out.
    - The sensitive-Campaign gate.
    - No sideways scrolling on the Campaigns, Campaign, Dossier, Strategist, search and sign-in pages.
    - The offline page, and that no pages are cached.
    - Two throttled performance runs.

### Defaults awaiting your decision (all changeable without a release)
| Setting | Default | Where |
| --- | --- | --- |
| Reactions | Persuasive, Well sourced, Fair point | `reaction_types` |
| Edit window | 5 minutes | `community_settings.edit_window_seconds` |
| Withdraw | Allowed until the Campaign closes; original kept for judging | `withdraw_dispatch()` |
| Length limits | Argument 1,500, rebuttal 1,000, evidence note 600 characters | `community_settings` |
| Per round | 10 Dispatches per Strategist | `community_settings.max_dispatches_per_round` |
| Cooldown | 30 seconds between posts | `community_settings.cooldown_seconds` |
| Email daily cap | 6 emails per person per 24 hours | `community_settings.email_daily_cap` |
| Reply digest | Replies wait 10 minutes and go out together | `community_settings.reply_digest_minutes` |

### Checked
- **Full suite**: lint and typecheck clean; 102 unit, 92 RLS and 9 Playwright tests pass (re-run 2 November after the profile-privacy change).
- **Performance** (`tests/e2e/performance.spec.ts`; the 20-Strategist debate on Chrome's "Slow 4G" profile with 4x CPU slowdown, results in `test-results/performance.json`):

  | | HTML received | Debate on screen (LCP) | Page loaded (DCL) | Buttons work | Downloaded |
  | --- | --- | --- | --- | --- | --- |
  | First visit, not signed in, empty cache | 0.74 s | **1.48 s** | 1.34 s | 3.08 s | 275 KB |
  | Signed-in Strategist coming back | 0.79 s | **1.06 s** | 0.80 s | **1.09 s** | 35 KB |

  The debate is readable in under 2 seconds in both cases. On a first visit the buttons work from 3.1 seconds, because React's own JavaScript (about 70 KB) takes that long at Slow 4G speeds. Moving the form-checking library out of the browser bundle saved 32 KB. The test asserts LCP and DCL under 2 s on the first visit, and LCP and interactivity under 2 s on a return visit.
- **Measurement notes**: Chrome adds the simulated delay while the HTML downloads, so "HTML received" is reported rather than time to first byte. The service worker is switched off during measurement, because it would fetch pages outside the throttle.
- **Hosted dry run**: the four new migrations, and only those, would be applied. Nothing was pushed.

### Decisions for the owner
1. **Reaction set**: see Defaults. "Changed my mind" is deliberately absent.
2. **Edit window and withdraw**: 5 minutes; withdrawing is allowed while the Campaign is open, not after. A withdrawn Dispatch's replies stay visible under the placeholder.
3. **Length and rate limits**: see Defaults.
4. **Account deletion (UK GDPR)**: **not built**. My proposal:
   - Deleting an account removes the email address, sign-in, passkeys, display name, bio, positions, reactions, follows and email settings.
   - It replaces the handle with "deleted Strategist" and keeps the Dispatches, shown as by "a deleted Strategist", because Verdicts and the audit trail depend on them.
   - It needs your wording for the confirmation screen and the privacy policy.
   - **Risk today**: `dispatches.author_id` cascades from `auth.users`, so deleting a user in the Supabase dashboard would hard-delete their Dispatches. Please don't delete users there until this is built; the fix belongs in the deletion migration.
5. **Email**: sender name and address, the sending domain (verify it in Resend; an owner action) and the daily cap (6 suggested).
6. **Is report-and-hide enough for a closed test before Sprint 4?** I suggest yes, for the owner's own testers only, with an admin checking `/admin/reports` daily. Not for real invitees.
7. **Decided (owner, 2 November): public Strategist profiles are minimal.** Visitors who are not signed in can read a Strategist's handle and join date only, plus their public Dispatches. Display name, expertise tag and bio stay visible to signed-in Strategists only, and searching for people needs sign-in. Made by editing `20261103000200` (not yet applied anywhere) rather than adding a migration.

### Not done / known issues
- **Nothing is applied to the hosted project.** The dry run is reported in DEMO.md. Pushing the migrations and the email set-up (Vercel variables and two Vault secrets) wait for your OK.
- Email does not send on hosted until you set `RESEND_API_KEY`, `EMAIL_FROM` and `EMAIL_PROCESSOR_SECRET` in Vercel and store the processor's address and secret in Vault. Until then emails queue safely.
- Admins cannot yet set a round's allowed kinds in the Campaign form (default: all three); the debate seed sets them. The Sprint 4 console is the place for it.
- The first visit on Slow 4G is readable in 1.5 s but its buttons work only from 3.1 s (see Checked).
- Detection of undeclared AI text, AI screening and holding are Sprint 4 (`screenDispatch()` is the hook).
- A Strategist with more than 200 Dispatches sees the latest 200 in their Dossier; paging comes later.
- `/profile/export` loads everything at once, which is fine at pilot size.
- **Local dev server note**: running `npm run build` (which Playwright does) in the same folder as a running `next dev` makes the dev server reload pages in a loop ("HMR hash mismatch"). Restart `next dev` after running the tests, or run Playwright with `E2E_SITE_URL=http://localhost:3200` and restart afterwards.

## Sprint 2: Campaigns and countdown (1 November 2026). Approved, merged (pull request #1)

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
