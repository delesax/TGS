import { NextResponse } from "next/server";
import { getServerNow } from "@/lib/campaign-data";

export const dynamic = "force-dynamic";

/** The server's clock, so the countdown can re-sync when a tab comes back into focus. */
export async function GET() {
  return NextResponse.json({ now: await getServerNow() }, { headers: { "Cache-Control": "no-store" } });
}
