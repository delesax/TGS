import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { EXPORT_BATCH, exportDispatchBatch, exportHead } from "@/lib/export-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * "Download my data" (UK GDPR right of access). A JSON file of everything we
 * hold about the signed-in Strategist: see src/lib/export-data.ts for what is
 * included and, just as important, what is left out because it is somebody
 * else's data. Dispatches come with their edit history and the original text
 * of any they withdrew or that were hidden or removed.
 * Dispatches are read and written in batches of 500 and streamed, so a long
 * history never has to sit in memory at once. Never cached.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Please sign in first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const me = viewer.userId;
  const admin = createAdminClient();

  let data: Awaited<ReturnType<typeof exportHead>>;
  try {
    data = await exportHead(admin, me, viewer.email);
  } catch (e) {
    console.error("export failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We could not prepare your data. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  await admin.from("audit_log").insert({ actor_id: me, action: "account.exported", target_table: "profiles", target_id: me, details: {} });

  const encoder = new TextEncoder();
  const head = {
    exported_at: new Date().toISOString(),
    about:
      "Your data from The Grand Strategist. Dispatches are public while visible. Everything else here is private to you and the people who run The Grand Strategist. Other people's personal data is left out.",
    ...data,
  };

  // Writes `"key": [ ...rows ]`, one batch of Dispatch ids at a time.
  async function* batches() {
    for (let offset = 0; ; offset += EXPORT_BATCH) {
      const batch = await exportDispatchBatch(admin, me, offset);
      if (!batch.rows.length) return;
      yield batch;
      if (batch.rows.length < EXPORT_BATCH) return;
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(s));
      const json = JSON.stringify(head, null, 2);
      write(json.slice(0, -2)); // drop the closing "\n}" and keep going
      const revisions: unknown[] = [];
      const sealed: unknown[] = [];
      write(',\n  "dispatches": [');
      let first = true;
      try {
        for await (const batch of batches()) {
          for (const d of batch.rows) {
            write(`${first ? "" : ","}\n    ${JSON.stringify(d)}`);
            first = false;
          }
          revisions.push(...batch.revisions);
          sealed.push(...batch.sealed);
        }
        write(`\n  ],\n  "dispatch_edit_history": ${JSON.stringify(revisions)},\n  "withdrawn_hidden_or_removed_original_text": ${JSON.stringify(sealed)}\n}\n`);
      } catch (e) {
        console.error("export stream failed", e instanceof Error ? e.message : e);
        write(`\n  ],\n  "error": "The export stopped early. Please try again."\n}\n`);
      }
      controller.close();
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tgs-my-data-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
