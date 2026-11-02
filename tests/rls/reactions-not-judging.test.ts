import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import "./helpers"; // loads and checks the LOCAL test environment

// Reaction counts are information for Strategists. They must never decide a
// Verdict (Sprint 3 rule). This guard fails if any database object other than
// the reaction machinery itself reads reactions, so judging (Sprint 5) cannot
// quietly start using them.

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
afterAll(() => sql.end());

const ALLOWED_FUNCTIONS = ["refresh_reaction_counts", "toggle_reaction"];
const REACTION_PATTERN = /dispatch_reactions|reaction_counts|reaction_types/;

describe("reactions never feed judging", () => {
  it("are read by no function except the reaction machinery", async () => {
    const functions = await sql<{ proname: string; src: string }[]>`
      select p.proname, p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'`;
    const readers = functions.filter((f) => REACTION_PATTERN.test(f.src)).map((f) => f.proname).sort();
    expect(readers).toEqual(ALLOWED_FUNCTIONS);
    // And nothing named like judging, scoring, weights, awards or Verdicts touches them.
    expect(readers.filter((name) => /judg|score|weight|award|verdict|vote|rank/.test(name))).toEqual([]);
  });

  it("are read by no view and referenced by no other table", async () => {
    const views = await sql<{ viewname: string }[]>`
      select viewname from pg_views where schemaname = 'public'
        and (definition ~ 'dispatch_reactions' or definition ~ 'reaction_counts')`;
    expect(views).toEqual([]);

    const references = await sql<{ table: string }[]>`
      select conrelid::regclass::text as table from pg_constraint
      where contype = 'f' and confrelid in ('public.dispatch_reactions'::regclass, 'public.reaction_types'::regclass)`;
    expect(references.map((r) => r.table)).toEqual(["dispatch_reactions"]);
  });
});
