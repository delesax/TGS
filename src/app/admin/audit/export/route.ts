import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { csvCell, queryAudit, readAuditFilters } from "@/lib/audit";

export const dynamic = "force-dynamic";

const BATCH = 1000;
const MAX_ROWS = 50_000;

/** The filtered audit log as CSV, read in batches and streamed. Admins only. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  // Non-admins get the same "not found" as the pages.
  if (!viewer?.isAdmin) return new NextResponse("Page not found", { status: 404 });
  const filters = readAuditFilters(Object.fromEntries(request.nextUrl.searchParams));
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("id,created_at,actor,action,target_table,target_id,details\r\n"));
      try {
        for (let offset = 0; offset < MAX_ROWS; offset += BATCH) {
          const { rows, handles } = await queryAudit(filters, BATCH, offset);
          for (const r of rows) {
            const actor = r.actor_id ? `@${handles.get(r.actor_id) ?? r.actor_id}` : "system";
            controller.enqueue(encoder.encode([r.id, r.created_at, actor, r.action, r.target_table, r.target_id, r.details].map(csvCell).join(",") + "\r\n"));
          }
          if (rows.length < BATCH) break;
        }
      } catch (e) {
        console.error("Audit export failed", e instanceof Error ? e.message : e);
        controller.enqueue(encoder.encode(`${csvCell("export stopped early: please try again")}\r\n`));
      }
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tgs-audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
