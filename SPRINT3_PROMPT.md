# Sprint 3 — Dispatches and discussion

Build Sprint 3 only: Dispatches and discussion. Do not start Sprint 4 (AI moderation, coach, admin).

Read first, in this order: CLAUDE.md, docs/PLAN.md, docs/UX_LESSONS.md, CHANGELOG.md, DEMO.md, SPRINT2_PROMPT.md. Follow every rule in CLAUDE.md. Use the project vocabulary in all UI copy, code and docs: Campaign, Strategist, Dispatch, Verdict, Dossier.

## Context

- Sprint 1 (accounts, invites, Dossier) and Sprint 2 (Campaigns, rounds, positions, countdown, pg_cron scheduler, topic loader) are built, tested and **approved**. Pull request #1 (`sprint-2` into `main`) is open and CI is green. Start by checking whether it has been merged. If it has, branch `sprint-3` from `main`. If not, branch from `sprint-2` and say so in the CHANGELOG.
- The Sprint 1 schema already has a `dispatches` table, `audit_log`, `ai_decisions` and `profiles`. Inspect the real columns, policies and tests before changing anything, and extend rather than duplicate. Write new migrations with later timestamps. Never edit an applied migration.
- Hosted Supabase and Vercel are live. **Do not apply any migration to hosted.** Run `supabase db push --dry-run` only, and stop so the owner can review the SQL. Use `./node_modules/.bin/supabase`, never `npx supabase`, and never print or read `.env.local`.
- Only server time exists (rule 5). Whether a Campaign accepts Dispatches is decided in the database by `server_now()` and the current round, never by the browser.
- This is still a closed test. Real invitees do not arrive until Sprint 4 adds automated screening, so nothing in this sprint may be used with real invitees yet.

## Build

### 1. Dispatch model
- Types: **argument**, **rebuttal**, **evidence**. A rebuttal must target another Dispatch in the same Campaign. An evidence Dispatch must carry at least one source link. An argument has neither.
- Every Dispatch belongs to a Campaign, a round and the author's chosen **position** (Sprint 2 `campaign_positions`). Check the position matches the Campaign and the format.
- Posting is allowed only while the Campaign is open, in a round that accepts the type, and for a Strategist who has finished onboarding. Enforce it in a security-definer function `post_dispatch()` that RLS also respects. The table must not accept direct client inserts.
- Limits live in an admin-editable settings table, not constants: argument 1,500 characters, rebuttal 1,000, evidence note 600, maximum 10 Dispatches per Strategist per round, a short cooldown between posts. Defaults are a recommendation; list them in the CHANGELOG.
- Edit and withdraw: the author may edit within 5 minutes. After that, no edits. Edits are kept in history and shown as "edited". "Withdraw" hides the body behind "Withdrawn by author" but **keeps the content** for judging and the audit trail. No hard delete anywhere (CLAUDE.md rule 6).
- Every create, edit, withdraw and hide writes to `audit_log`.

### 2. AI-use declaration (rule 9)
- Required on every Dispatch: **none**, **assisted** or **generated**, no default, chosen explicitly.
- Shown publicly on each Dispatch as a small label with a plain-language explanation. Store it as an enum and expose it for later analysis. Detection of undeclared pasted AI output is Sprint 4; leave a clear hook, do not build it.

### 3. Source links
- `http` and `https` only; reject `javascript:`, `data:` and similar, and strip tracking parameters. Store URL, normalised host and an optional title. Maximum 5 per Dispatch.
- Render with `rel="noopener noreferrer nofollow ugc"`, `target="_blank"` and the domain visible. Do not fetch or preview remote pages server-side in this sprint.

### 4. Threaded discussion
- Show a Campaign's Dispatches as threads: rebuttals nest under their target, to a depth of 4, beyond which replies continue flat under the last level with a "replying to" label.
- Mobile first at 375px: collapse and expand branches, "show more" pagination (20 per page, never load everything), position shown by label and shape, not colour alone.
- New Dispatches appear without a reload: refetch on tab focus (as in Sprint 2) and a "N new Dispatches" pill. Use Supabase Realtime only if it stays simple; otherwise poll gently.
- Compose box states: closed Campaign, wrong round, not signed in, rate-limited, offline. Each has plain wording and a recovery action.

### 5. Reactions
- A small fixed set, one reaction per Strategist per type per Dispatch, none on your own Dispatch, none after the Campaign closes. Default set: **Persuasive**, **Well sourced**, **Fair point**. Do not add "Changed my mind". Mind-change movement is measured in Sprint 5 through position shifts, not through reactions.
- Reaction counts are information for the Strategist and must never decide a Verdict. Add a code comment and a test that the schema exposes no path from reactions to judging weights.

### 6. Follow
- A Strategist can follow a **Campaign** and a **Strategist**. Following a Campaign starts automatically when you post in it. A "Following" list is on the Dossier.

### 7. Search
- Postgres full-text search (English configuration) over Campaign titles and summaries, visible Dispatch text, and Strategist handles. Results respect RLS and the same visibility as the pages themselves. Withdrawn and hidden Dispatches are excluded.
- A search box in the header, a results page with type filters, empty and loading states, and a query timeout. Add the required indexes and check the query plans.

### 8. Email notifications
- Use Resend through one server-side module `src/lib/email`. Locally, send to Mailpit instead; choose the transport by environment. No keys in the repo. Add them to `.env.example`.
- Events: someone replies to your Dispatch; a Campaign you follow opens, changes round or closes; a Campaign you are in closes in 24 hours.
- Queue events in a table and send from a processor run by pg_cron and a protected route. Do not use Vercel cron or Inngest. Sending must be idempotent and retry-safe, and capped per user per day with replies batched into a digest.
- A preferences page (per event type, all on by default for transactional events), a one-click unsubscribe link in every email, and no email to an address that has not confirmed.
- Plain-text and HTML versions, accessible markup, vocabulary-correct wording. The Resend sender domain is an owner action; build it so a missing domain fails safely and logs.

### 9. PWA
- A web manifest, icons (placeholder artwork is fine, flagged), a service worker that precaches the shell and serves an offline page, and an install prompt that is not intrusive.
- Never cache authenticated HTML, API responses or anything user-specific. No push notifications in this sprint.

### 10. Basic reporting and hiding (needed before any real invitee)
- A "Report" action on every Dispatch with a reason. An admin queue to **hide** a Dispatch (hidden, never deleted, audit-logged, restorable). Automated screening and AI holding remain Sprint 4. Say this clearly in the UI copy for the owner's testers.

### 11. Safety and legal surfaces (rules 11, 13)
- Sensitive Campaigns show their content note before the compose box and before reading Dispatches. Financial and medical Campaigns show the "opinion, not advice" label on the compose box and on each Dispatch.
- Export my data: a JSON export of the Strategist's own profile, Dispatches, reactions and follows, built now. Delete my account: propose an approach, then build it exactly as the owner decides (see decisions below).

### 12. Dossier
- Populate the Dossier with the Strategist's Dispatches (grouped by Campaign), their AI-use labels, and withdrawn items shown as withdrawn. No awards yet; keep the placeholders from Sprint 1.

### 13. Seed and test tooling
- `npm run seed:debate` (local only, with the same host check as `topics:load`): creates 20 test Strategists and a threaded debate across two rounds, with rebuttals, evidence, reactions and varied AI-use. Idempotent and clearly marked as test data. It must refuse to run against hosted.
- Tests: Vitest for validation, limits, link sanitising, threading and rate limits; RLS tests for every new table (read, insert via function only, no cross-user edit, hidden and withdrawn visibility, search visibility); Playwright at 375px for post, reply, react, follow, search and the offline page.
- Performance: a script or Playwright test that loads the Campaign page with the 20-user debate under Slow 4G and mid-range mobile CPU throttling and asserts the page is usable in **under 2 seconds**. Report the measured numbers. Add a no-horizontal-overflow assertion on Campaigns, Campaign, Dossier, search and sign-in pages at 375px.

## Carry-over from Sprint 2

Do these first, small and separate commits:
1. **Invite consumed too early.** An invite is spent at sign-up even if the email is never confirmed. Propose the fix (consume on confirmation, or release after a timeout) and implement it with a test.
2. Bump the GitHub Actions versions that warn about Node 20, and keep CI green.
3. Verify the Campaign page buttons no longer overflow at 375px with the new overflow assertion.

## Decisions reserved for the owner

Do not guess on these (rule 15). Build the recommended default, make it easy to change, and list each as an open question in the CHANGELOG:
1. The reaction set (default above).
2. The edit window and the withdraw behaviour (defaults above).
3. Length and rate limits (defaults above).
4. **Account deletion.** Recommend anonymising the Strategist's handle and profile while keeping Dispatches, with the content retained as "deleted Strategist", because Verdicts and audit trails depend on them. Do not implement the destructive part until the owner confirms the wording, which touches UK GDPR.
5. Email sender name, sending domain and the daily cap.
6. Whether reporting and hiding is enough for a closed test before Sprint 4.

## Done when

Twenty test Strategists hold a threaded debate in a Campaign on their phones: they post arguments, rebuttals and evidence with AI-use declarations and source links, react, follow, search and receive email notifications, and the Campaign page loads in under 2 seconds on a throttled mobile profile.

## When finished

- Typecheck, lint, unit, RLS and Playwright all clean, and CI green on the pull request.
- Update CHANGELOG.md and write a new DEMO.md with click-through steps, including the 20-user seed, the throttled-load result, and the open owner decisions.
- Run `supabase db push --dry-run` against hosted, report the output, and **stop**. Do not apply it, do not merge, do not start Sprint 4. The owner reviews the migration and signs off first.
