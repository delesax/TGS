/**
 * npm run env:check
 * Reports which environment variables are set (never their values) and whether
 * Supabase can be reached with them.
 */
import { createClient } from "@supabase/supabase-js";
import { describeTarget, loadEnv } from "./lib/env";

loadEnv();

const VARIABLES: { name: string; requiredNow: boolean; where: string }[] = [
  { name: "NEXT_PUBLIC_SITE_URL", requiredNow: true, where: "Your site address, e.g. http://localhost:3000 locally" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", requiredNow: true, where: "Supabase dashboard > Project Settings > Data API > Project URL" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", requiredNow: true, where: "Supabase dashboard > Project Settings > API Keys > Publishable key" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", requiredNow: true, where: "Supabase dashboard > Project Settings > API Keys > Secret key" },
  { name: "DATABASE_URL", requiredNow: false, where: "Supabase dashboard > Connect > Session pooler (used only by supabase db push)" },
  { name: "ANTHROPIC_API_KEY", requiredNow: false, where: "Not needed until Sprint 4" },
];

let missing = 0;
for (const v of VARIABLES) {
  const set = Boolean(process.env[v.name]);
  if (!set && v.requiredNow) missing++;
  const status = set ? "set" : v.requiredNow ? "MISSING" : "not set (optional for now)";
  console.log(`${v.name.padEnd(32)} ${status}${set ? "" : `  -> ${v.where}`}`);
}

async function main() {
  if (missing > 0) {
    console.log(`\n${missing} required variable(s) missing. Supabase check skipped.`);
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  console.log(`\nSupabase target: ${describeTarget(url)}`);

  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error: authError } = await anon.auth.getSession();
  console.log(`Auth API reachable with publishable key: ${authError ? `no (${authError.message})` : "yes"}`);

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error: dbError } = await admin.from("profiles").select("id", { head: true, count: "exact" });
  if (!dbError) console.log("Database reachable with secret key: yes (schema is applied)");
  else if (dbError.code === "PGRST205") console.log("Database reachable with secret key: yes, but the schema is not applied yet");
  else console.log(`Database reachable with secret key: no (${dbError.message})`);
}

main().catch((e) => {
  console.error("Check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
