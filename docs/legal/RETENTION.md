# Retention: what is deleted, when, and what is never deleted

Approved periods (owner brief, 7 November 2026). Each job is a `SECURITY DEFINER` function in
`supabase/migrations/20261107000500_retention_jobs.sql`, scheduled with **pg_cron** (not Vercel cron),
callable only by the service role / postgres. Times are **UTC** (pg_cron's clock): 03:17 UTC is 03:17 UK in
winter and 04:17 in summer. A Vitest check (`src/lib/retention.test.ts`) fails if this table and the privacy
policy page disagree, or if a schedule here differs from the migration.

Every run writes **one** `audit_log` entry: action `retention.purged`, details `{ job, count }`. No names,
no addresses, no text.

| Data | Period | Table | Job name | Schedule (UTC) | Exclusions (never deleted while true) |
| --- | --- | --- | --- | --- | --- |
| Sign-ups never confirmed by email | 30 days | `auth.users` (the profile goes with it) | `retention-unconfirmed-signups` | `17 3 * * *` | Confirmed at any time; has a Dispatch; has an open privacy request (by account or email address) |
| Decisions about Dispatches and handles | 12 months | `ai_decisions` (subject types dispatch, handle, display_name, bio) | `retention-ai-decisions` | `19 3 * * *` | Linked to an open flag; about a Dispatch with an open flag or open appeal or still held or pending; belongs to a person with an open privacy request |
| Reports and moderation flags | 12 months after they are resolved | `dispatch_reports`, `moderation_flags` | `retention-reports-flags` | `21 3 * * *` | Still open; on a Dispatch with an open flag, open appeal or still held or pending; belongs to a person with an open privacy request |
| Coach feedback and ratings | 90 days | `ai_decisions` (subject types coach, nudge), `coach_feedback` | `retention-coach-feedback` | `23 3 * * *` | Belongs to a person with an open privacy request |
| Queued and sent emails | 30 days | `email_outbox` | `retention-emails` | `25 3 * * *` | Being sent right now; belongs to a person with an open privacy request |
| Expired passkey challenges | 1 day | `webauthn_challenges` | `retention-webauthn-challenges` | `27 3 * * *` | (none: they are single-use and expire in 5 minutes) |
| Privacy requests and complaints | six years after they are closed | `privacy_requests` | `retention-privacy-requests` | `29 3 * * *` | Not closed (however old) |
| Safety and accountability record | six years | `audit_log` | `retention-audit-log` | `31 3 * * *` | Points at an open privacy request, open flag or open appeal; about or by a person with an open privacy request |

## The audit log exception

`audit_log` is append-only: an update or delete raises `AUDIT_LOG_APPEND_ONLY`. The single, deliberate
exception is `purge_expired_audit_log()`. It sets a flag that holds the current transaction's id; the
append-only trigger lets a **delete** through only when (a) that flag matches the running transaction **and**
(b) the row is older than six years. The function clears the flag straight after the delete, before it writes
its summary row. Nothing exposed to the browser can set the flag. Updates and truncates are never allowed.
The first real rows expire in 2032; the job exists and is tested now with back-dated rows.

## Things to know (owner)

- **Not covered by a job:** `dispatch_appeals` (appeal reasons and decisions), `ai_usage` (per-day counters,
  no text), `dispatch_revisions` and `dispatch_sealed_content` (Dispatch text, which stays in the debate
  record), `invites` and `community_settings`. Appeals contain what a person wrote to us; the approved list
  has no period for them. **Decision needed.**
- Deleting an unconfirmed sign-up runs the account-deletion trigger, which writes one `account.deleted`
  audit entry (reference number only) per person. That is the only extra audit entry a run can make.
- An invite is only ever *reserved* for 24 hours by an unconfirmed sign-up; it is never counted as used until
  the email is confirmed. So purging an unconfirmed account releases nothing that was not already free.
- pg_cron runs in UTC. If you want it to follow UK clock changes, that is a one-line change to the schedules.
