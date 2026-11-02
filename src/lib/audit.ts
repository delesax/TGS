import "server-only";
import { createClient } from "@/lib/supabase/server";

// Audit log filters, shared by the viewer and the CSV export.

export type AuditFilters = { actor: string; action: string; from: string; to: string };

export type AuditRow = { id: number; created_at: string; actor_id: string | null; action: string; target_table: string | null; target_id: string | null; details: Record<string, unknown> };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function readAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string).trim() : "");
  return {
    actor: one("actor").replace(/^@/, "").slice(0, 20),
    action: one("action").toLowerCase().replace(/[^a-z_.]/g, "").slice(0, 60),
    from: DAY.test(one("from")) ? one("from") : "",
    to: DAY.test(one("to")) ? one("to") : "",
  };
}

/** Newest first. `actor` is a handle, "system" for scheduled jobs, or blank for everyone. */
export async function queryAudit(f: AuditFilters, limit: number, offset = 0): Promise<{ rows: AuditRow[]; handles: Map<string, string>; unknownActor: boolean }> {
  const db = await createClient();
  let actorId: string | null | undefined;
  if (f.actor && f.actor.toLowerCase() !== "system") {
    const { data } = await db.from("profiles").select("id").ilike("handle", f.actor.replace(/_/g, "\\_")).maybeSingle<{ id: string }>();
    if (!data) return { rows: [], handles: new Map(), unknownActor: true };
    actorId = data.id;
  } else if (f.actor) {
    actorId = null;
  }
  let q = db.from("audit_log").select("id, created_at, actor_id, action, target_table, target_id, details").order("id", { ascending: false }).range(offset, offset + limit - 1);
  if (actorId === null) q = q.is("actor_id", null);
  else if (actorId) q = q.eq("actor_id", actorId);
  if (f.action) q = q.like("action", `${f.action}%`);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
  if (f.to) q = q.lt("created_at", new Date(Date.parse(`${f.to}T00:00:00Z`) + 86_400_000).toISOString());
  const { data, error } = await q;
  if (error) throw new Error("Could not read the audit log");
  const rows = (data as AuditRow[]) ?? [];
  const ids = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => Boolean(x)))];
  const { data: people } = ids.length ? await db.from("profiles").select("id, handle").in("id", ids) : { data: [] };
  return { rows, handles: new Map(((people as { id: string; handle: string | null }[]) ?? []).map((p) => [p.id, p.handle ?? "a deleted Strategist"])), unknownActor: false };
}

/** One CSV cell: quoted, with formulas defused so spreadsheets do not run them. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
