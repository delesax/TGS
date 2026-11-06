import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sweepPending } from "@/lib/moderation";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function authorised(request: NextRequest, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Re-screens Dispatches left pending for 2 minutes or more, so a crash never
 * strands one. Called once a minute by pg_cron (through pg_net) only when
 * something is stuck, with the shared secret from Supabase Vault.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.MODERATION_PROCESSOR_SECRET;
  if (!secret) {
    console.error("Moderation sweep called but MODERATION_PROCESSOR_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore });
  }
  if (!authorised(request, secret)) return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: noStore });
  try {
    return NextResponse.json(await sweepPending(), { headers: noStore });
  } catch (e) {
    console.error("Moderation sweep failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: noStore });
  }
}
