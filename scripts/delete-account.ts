/**
 * Delete an account by hand while self-service deletion is switched off.
 *
 *   npm run account:delete -- --email person@example.com            (dry run: shows what would happen)
 *   npm run account:delete -- --email person@example.com --confirm  (does it)
 *
 * It uses the same code as the "Delete my account" page (src/lib/account-deletion.ts).
 * Check the person's identity first: docs/legal/RUNBOOK_PRIVACY_REQUESTS.md.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { describeTarget, loadEnv, requireVar } from "./lib/env";
import { runDeleteAccount } from "./lib/delete-account-cli";

loadEnv();

const { values } = parseArgs({ options: { email: { type: "string" }, confirm: { type: "boolean", default: false } } });
if (!values.email) {
  console.error("Usage: npm run account:delete -- --email person@example.com [--confirm]");
  process.exit(1);
}

const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
const admin = createClient(url, requireVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
console.log(`Target: ${describeTarget(url)}`);

runDeleteAccount({ admin, email: values.email, confirm: values.confirm, log: console.log })
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
