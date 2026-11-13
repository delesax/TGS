import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import "./helpers"; // loads and checks the LOCAL test environment

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
afterAll(() => sql.end());

describe("schema guard", () => {
  it("has row-level security enabled on every table in the public schema", async () => {
    const rows = await sql<{ tablename: string; rowsecurity: boolean }[]>`
      select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`;
    expect(rows.map((r) => r.tablename)).toEqual(
      expect.arrayContaining(["profiles", "invites", "campaigns", "dispatches", "awards", "audit_log", "ai_decisions", "passkeys", "campaign_rounds", "campaign_positions", "community_settings", "dispatch_revisions", "dispatch_sealed_content", "dispatch_reports", "reaction_types", "dispatch_reactions", "campaign_follows", "strategist_follows", "notification_preferences", "email_outbox", "moderation_flags", "dispatch_appeals", "ai_usage", "coach_feedback", "judging_weights", "anonymous_positions", "judging_settings", "judge_assignments", "panel_scores", "peer_votes", "steelman_flags", "mind_change_picks", "ai_rubric_jobs", "ai_rubric_scores", "verdicts", "verdict_appeals", "reputation", "privacy_requests", "rate_limits", "system_events"]),
    );
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([]);
  });

  it("has no policy that lets anonymous visitors write anything", async () => {
    const policies = await sql<{ tablename: string; cmd: string }[]>`
      select tablename, cmd from pg_policies
      where schemaname = 'public'
        and ('anon' = any(roles) or 'public' = any(roles))
        and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')`;
    expect(policies).toEqual([]);
  });
});
