import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { processJudging } from "@/lib/judging/processor";

export const dynamic = "force-dynamic";
// AI rubric calls can take a while; ten per run.
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

function authorised(request: NextRequest, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scores due Dispatches with the AI rubric and computes draft Verdicts that
 * are due. Called once a minute by pg_cron (through pg_net) only when there is
 * work, with the shared secret from Supabase Vault (judging_processor_secret).
 * Idempotent and safe to retry.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.JUDGING_PROCESSOR_SECRET;
  if (!secret) {
    console.error("Judging processor called but JUDGING_PROCESSOR_SECRET is not set");
    return NextResponse.json({ error: "Not configured" }, { status: 503, headers: noStore });
  }
  if (!authorised(request, secret)) return NextResponse.json({ error: "Unauthorised" }, { status: 401, headers: noStore });
  try {
    return NextResponse.json(await processJudging(), { headers: noStore });
  } catch (e) {
    console.error("Judging processor failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: noStore });
  }
}
