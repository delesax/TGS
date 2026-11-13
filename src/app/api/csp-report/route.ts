import { NextResponse } from "next/server";
import { parseCspReports } from "@/lib/csp";
import { logEvent } from "@/lib/events";
import { hashSubject, ipSubject, withinLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024;

/**
 * Receives Content-Security-Policy violation reports (the policy is report-only). Public, so it is limited
 * per caller and overall. Stores only the directive and the blocked host in system_events (kept 30 days):
 * never a page address, query string or page content. Always answers 204 so a browser never retries.
 */
export async function POST(request: Request) {
  const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    if (!(await withinLimit("csp_ip", await ipSubject()))) return done();
    if (!(await withinLimit("csp_all", hashSubject("csp-all")))) return done();
    const text = await request.text();
    if (text.length > MAX_BYTES) return done();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return done();
    }
    for (const r of parseCspReports(payload)) await logEvent("csp_report", r.directive, { host: r.host });
  } catch (e) {
    console.error("csp-report failed", e instanceof Error ? e.message.slice(0, 120) : "unknown");
  }
  return done();
}
