/**
 * Create invite codes.
 *
 *   npm run invite:create                         one single-use code
 *   npm run invite:create -- --count 5            five single-use codes
 *   npm run invite:create -- --uses 30 --note "Pilot class" --days 30
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local, so it writes to whichever
 * project that file points at. The target host is printed before anything is written.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { generateInviteCode } from "../src/lib/invite-code";
import { describeTarget, loadEnv, requireVar } from "./lib/env";

loadEnv();

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "1" },
    uses: { type: "string", default: "1" },
    note: { type: "string" },
    days: { type: "string" },
  },
});

const count = Number(values.count);
const maxUses = Number(values.uses);
const days = values.days ? Number(values.days) : null;
if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("--count must be 1 to 100");
if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 500) throw new Error("--uses must be 1 to 500");
if (days !== null && (!Number.isFinite(days) || days <= 0)) throw new Error("--days must be a positive number");

const url = requireVar("NEXT_PUBLIC_SUPABASE_URL");
const admin = createClient(url, requireVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function main() {
  console.log(`Target: ${describeTarget(url)}`);
  const rows = Array.from({ length: count }, () => ({
    code: generateInviteCode(),
    max_uses: maxUses,
    note: values.note ?? null,
    expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
  }));

  const { data, error } = await admin.from("invites").insert(rows).select("code, max_uses, expires_at");
  if (error) {
    console.error(`Could not create invites: ${error.message}`);
    process.exit(1);
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL;
  for (const invite of data) {
    const expiry = invite.expires_at ? `, expires ${new Date(invite.expires_at).toLocaleDateString("en-GB")}` : "";
    console.log(`${invite.code}  (${invite.max_uses} use${invite.max_uses === 1 ? "" : "s"}${expiry})`);
    if (site) console.log(`  Sign-up link: ${site}/signup?code=${invite.code}`);
  }
}

main();
