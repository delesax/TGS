/**
 * The approved retention periods, in one place. The privacy policy page reads
 * them from here, and a test (src/lib/retention.test.ts) checks that
 * docs/legal/RETENTION.md says the same, so the policy and the jobs cannot
 * drift apart. Each `job` is a pg_cron job built in
 * supabase/migrations/20261107000500_retention_jobs.sql.
 */
export type RetentionJob = {
  job: string;
  /** Plain label used in the policy table. */
  data: string;
  /** The period as the policy page says it. */
  period: string;
  /** Database table(s) the job deletes from. */
  table: string;
  /** False for housekeeping that the policy page does not list. */
  inPolicy?: boolean;
};

export const RETENTION_JOBS: RetentionJob[] = [
  { job: "retention-unconfirmed-signups", data: "Sign-ups never confirmed by email", period: "30 days", table: "auth.users (cascades to profiles)" },
  { job: "retention-ai-decisions", data: "Decisions about Dispatches and handles", period: "12 months", table: "ai_decisions" },
  { job: "retention-reports-flags", data: "Reports and moderation flags", period: "12 months after they are resolved", table: "dispatch_reports, moderation_flags" },
  { job: "retention-coach-feedback", data: "Coach feedback and ratings", period: "90 days", table: "coach_feedback" },
  { job: "retention-emails", data: "Queued and sent emails", period: "30 days", table: "email_outbox" },
  { job: "retention-webauthn-challenges", data: "Expired passkey challenges", period: "1 day", table: "webauthn_challenges", inPolicy: false },
  { job: "retention-privacy-requests", data: "Privacy requests and complaints", period: "six years after they are closed", table: "privacy_requests" },
  { job: "retention-audit-log", data: "Safety and accountability record", period: "six years", table: "audit_log" },
];

export const SIX_YEARS_PENDING = "six years";
