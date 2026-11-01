/**
 * Give (or remove) the admin role claim for an existing account.
 *
 *   npm run admin:set -- --email you@example.com
 *   npm run admin:set -- --email you@example.com --remove
 *
 * The role lives in app_metadata, which only the service role can change, and
 * reaches the database through the JWT (public.is_admin()). The person must sign
 * out and in again for it to take effect.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { describeTarget, loadEnv, requireVar } from "./lib/env";

loadEnv();

const { values } = parseArgs({ options: { email: { type: "string" }, remove: { type: "boolean", default: false } } });
if (!values.email) {
  console.error("Usage: npm run admin:set -- --email you@example.com [--remove]");
  process.exit(1);
}

const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
const admin = createClient(url, requireVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function main() {
  console.log(`Target: ${describeTarget(url)}`);
  const email = values.email!.toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) {
      const role = values.remove ? null : "admin";
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { ...user.app_metadata, role },
      });
      if (updateError) throw updateError;
      await admin.from("audit_log").insert({
        actor_id: null,
        action: values.remove ? "admin.role_removed" : "admin.role_granted",
        target_table: "auth.users",
        target_id: user.id,
        details: { via: "scripts/make-admin.ts" },
      });
      console.log(values.remove ? "Admin role removed." : "Admin role granted. Sign out and in again to use it.");
      return;
    }
    if (data.users.length < 200) break;
    page++;
  }
  console.error("No account with that email address.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
