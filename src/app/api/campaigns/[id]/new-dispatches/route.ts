import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { countNewDispatches } from "@/lib/dispatch-data";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many Dispatches others have posted since `since`. Row-level security applies. Never cached. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/campaigns/[id]/new-dispatches">) {
  const { id } = await params;
  const since = request.nextUrl.searchParams.get("since") ?? "";
  if (!UUID.test(id) || Number.isNaN(Date.parse(since))) {
    return NextResponse.json({ error: "Bad request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const viewer = await getViewer();
    const count = await countNewDispatches(id, new Date(since).toISOString(), viewer?.userId ?? null);
    return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
