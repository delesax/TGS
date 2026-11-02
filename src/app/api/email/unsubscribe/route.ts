import { NextResponse, type NextRequest } from "next/server";
import { parseUnsubscribe, unsubscribe } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";

/** One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header. */
export async function POST(request: NextRequest) {
  const parsed = parseUnsubscribe(request.nextUrl.searchParams.get("token"), request.nextUrl.searchParams.get("kind"));
  if (!parsed) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const ok = await unsubscribe(parsed.token, parsed.kind);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
