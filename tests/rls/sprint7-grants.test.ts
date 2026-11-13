import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import "./helpers"; // loads and checks the LOCAL test environment

// Sprint 7: every function added by the Sprint 7 migrations, with who may run it.
// LOCAL Supabase only.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
afterAll(() => sql.end());

// name -> who can execute it from the browser roles: "none", "admin" (authenticated; the body checks is_admin()),
// "everyone" (anon too, a read-only helper), or "signed-in" (authenticated; the body checks the caller).
const FUNCTIONS: Record<string, "none" | "admin" | "everyone" | "signed-in"> = {
  // 20261113000100 site switches
  site_switches: "everyone",
  set_site_switches: "admin",
  refuse_dispatch_when_paused: "none",
  refuse_signup_when_paused: "none",
  // 20261113000200 rate limits, events, health
  rate_limit_hit: "none",
  log_system_event: "none",
  admin_recent_events: "admin",
  prune_limits_and_events: "none",
  admin_health: "admin",
  // 20261113000300 voter eligibility
  voter_account_old_enough: "none",
  cast_peer_vote: "signed-in",
  set_steelman_confirmation: "signed-in",
  pick_mind_changer: "signed-in",
  save_judging_settings: "admin",
  // 20261113000400 integrity signals
  integrity_signals: "none",
  admin_integrity_signals: "admin",
  judging_inputs: "none",
  // 20261113000500 invite binding
  invite_check: "none",
  handle_new_user: "none",
  // 20261113000700 judge prompt v2
  store_rubric_score: "none",
  dispatch_unverified_claims: "signed-in",
  set_judge_prompt_version: "admin",
  // 20261113000600 email essentials
  enqueue_email: "none",
  claim_email_batch: "none",
  set_email_controls: "admin",
};

describe("Sprint 7 functions: grants", () => {
  it("lists every function the Sprint 7 migrations create or replace", async () => {
    const rows = await sql<{ proname: string }[]>`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any(${Object.keys(FUNCTIONS)})`;
    expect(new Set(rows.map((r) => r.proname))).toEqual(new Set(Object.keys(FUNCTIONS)));
  });

  it.each(Object.entries(FUNCTIONS))("%s: %s", async (name, who) => {
    const rows = await sql<{ anon: boolean; authenticated: boolean; service_role: boolean; definer: boolean; has_path: boolean; args: string }[]>`
      select has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('service_role', p.oid, 'execute') as service_role,
             p.prosecdef as definer,
             coalesce(p.proconfig::text like '%search_path%', false) as has_path,
             pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = ${name}`;
    expect(rows.length, name).toBeGreaterThan(0);
    for (const r of rows) {
      // Anonymous visitors can run nothing, except the one read-only helper that is meant to be public.
      expect(r.anon, `${name}(${r.args}) anon`).toBe(who === "everyone");
      expect(r.authenticated, `${name}(${r.args}) authenticated`).toBe(who === "admin" || who === "signed-in" || who === "everyone");
      // Every SECURITY DEFINER function fixes its search_path.
      if (r.definer) expect(r.has_path, `${name} search_path`).toBe(true);
    }
  });

  it("no SECURITY DEFINER function in the public schema is missing a search_path", async () => {
    const rows = await sql<{ proname: string }[]>`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and coalesce(p.proconfig::text like '%search_path%', false) = false`;
    expect(rows).toEqual([]);
  });
});
