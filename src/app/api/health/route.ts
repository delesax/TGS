import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Public liveness check for a status monitor or a quick look: 200 {"ok":true}
 * when the site can reach its database, 503 {"ok":false,"failing":[...]}
 * otherwise. Names only the failing check: no details, counts or versions.
 */
export async function GET() {
  const failing: string[] = [];
  try {
    const { error } = await createAdminClient().rpc("server_now");
    if (error) failing.push("database");
  } catch {
    failing.push("database");
  }
  const ok = failing.length === 0;
  return NextResponse.json(ok ? { ok } : { ok, failing }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
