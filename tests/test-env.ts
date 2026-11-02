import { config } from "dotenv";

/**
 * Loads .env.test.local (written by scripts/local-test-env.sh) and refuses to
 * run against anything but a local Supabase, so tests can never create or
 * delete users in the hosted project.
 */
export function loadTestEnv() {
  config({ path: ".env.test.local", override: true, quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const host = url ? new URL(url).hostname : "";
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(
      "Tests need LOCAL Supabase. Run `npx supabase start` then `npm run test:env` to write .env.test.local. " +
        `Refusing to run against: ${host || "(not set)"}`,
    );
  }
  return {
    // E2E_SITE_URL lets the Playwright server use another port when 3100 is busy
    // (for example while a demo dev server is running there).
    siteUrl: process.env.E2E_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL!,
    supabaseUrl: url,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    mailpitUrl: process.env.MAILPIT_URL ?? "http://127.0.0.1:54324",
    emailSecret: process.env.EMAIL_PROCESSOR_SECRET ?? "local-email-processor-secret",
  };
}
