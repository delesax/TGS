import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { processOutbox } from "@/lib/email";
import { logEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function authorised(request: NextRequest): boolean {
  const secret = process.env.EMAIL_PROCESSOR_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Sends queued emails. Called once a minute by pg_cron (through pg_net) when
 * something is due, with the shared secret from Supabase Vault. Safe to call
 * twice at once: rows are claimed with SKIP LOCKED.
 */
export async function POST(request: NextRequest) {
  if (!process.env.EMAIL_PROCESSOR_SECRET) {
    console.error("Email processor called but EMAIL_PROCESSOR_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore });
  }
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: noStore });
  try {
    const summary = await processOutbox();
    return NextResponse.json(summary, { status: summary.error ? 503 : 200, headers: noStore });
  } catch (e) {
    console.error("Email processor failed", e instanceof Error ? e.message : e);
    await logEvent("processor_failed", "email");
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: noStore });
  }
}
