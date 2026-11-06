import "server-only";
import { createClient } from "@/lib/supabase/server";

// Reads for the admin console, through the admin's own client: row-level
// security admits them by the JWT role claim, and pages check it first too.

export type QueueReason = "held_high" | "held" | "appeal" | "report" | "unscreened" | "undeclared_ai";

const SEVERITY: Record<QueueReason, number> = { held_high: 5, appeal: 4, held: 3, report: 2, unscreened: 1, undeclared_ai: 0 };

export const REASON_LABELS: Record<QueueReason, string> = {
  held_high: "Held, high priority",
  held: "Held",
  appeal: "Appeal",
  report: "Reported",
  unscreened: "Unscreened: needs a human look",
  undeclared_ai: "Possible undeclared AI text",
};

type DispatchRow = {
  id: string;
  body: string;
  kind: string;
  ai_use: string;
  moderation_status: "pending" | "visible" | "held" | "removed";
  screening: string;
  hold_priority: string | null;
  created_at: string;
  parent_id: string | null;
  hidden_at: string | null;
  withdrawn_at: string | null;
  author_id: string;
  campaign: { slug: string; title: string; is_sensitive: boolean } | null;
  author: { handle: string | null } | null;
};

export type QueueItem = {
  dispatch: DispatchRow;
  /** The original words when the public row shows a placeholder. */
  sealedBody: string | null;
  reasons: QueueReason[];
  newest: string;
  severity: number;
  decision: { id: string; outcome: string; category: string | null; confidence: number | null; reason: string; model: string; prompt_version: string; overridden_at: string | null } | null;
  reports: { reason: string; details: string | null; created_at: string; reporter: string | null }[];
  appeal: { id: string; reason: string; created_at: string; original_actor: string | null } | null;
  flags: { id: string; kind: string; details: Record<string, unknown>; created_at: string }[];
  parent: { id: string; body: string; handle: string | null } | null;
  replies: { id: string; body: string; handle: string | null }[];
};

export type HandleItem = { flagId: string; kind: "held_handle" | "unscreened_handle"; handle: string; reason: string | null; created_at: string; current: string | null };

const DISPATCH_FIELDS =
  "id, body, kind, ai_use, moderation_status, screening, hold_priority, created_at, parent_id, hidden_at, withdrawn_at, author_id, campaign:campaigns(slug, title, is_sensitive), author:profiles!dispatches_author_id_fkey(handle)";

export async function getModerationQueue(): Promise<{ items: QueueItem[]; handles: HandleItem[] }> {
  const db = await createClient();
  const [held, reports, appeals, flags] = await Promise.all([
    db.from("dispatches").select("id, held_at, hold_priority").eq("moderation_status", "held").order("held_at", { ascending: false }).limit(200),
    db.from("dispatch_reports").select("dispatch_id, reason, details, created_at, reporter:profiles!dispatch_reports_reporter_id_fkey(handle)").eq("status", "open").limit(500),
    db.from("dispatch_appeals").select("id, dispatch_id, reason, created_at, original_actor").eq("status", "open").limit(200),
    db.from("moderation_flags").select("id, kind, dispatch_id, user_id, details, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(300),
  ]);
  for (const r of [held, reports, appeals, flags]) if (r.error) throw new Error("Could not load the moderation queue");

  const byId = new Map<string, { reasons: Set<QueueReason>; newest: string }>();
  const add = (id: string, reason: QueueReason, at: string) => {
    const entry = byId.get(id) ?? { reasons: new Set<QueueReason>(), newest: at };
    entry.reasons.add(reason);
    if (at > entry.newest) entry.newest = at;
    byId.set(id, entry);
  };
  for (const h of (held.data as { id: string; held_at: string; hold_priority: string | null }[]) ?? []) add(h.id, h.hold_priority === "high" ? "held_high" : "held", h.held_at);
  for (const r of (reports.data as unknown as { dispatch_id: string; created_at: string }[]) ?? []) add(r.dispatch_id, "report", r.created_at);
  for (const a of (appeals.data as { dispatch_id: string; created_at: string }[]) ?? []) add(a.dispatch_id, "appeal", a.created_at);
  const handleFlags: HandleItem[] = [];
  const handleUsers: string[] = [];
  for (const f of (flags.data as { id: string; kind: string; dispatch_id: string | null; user_id: string | null; details: Record<string, unknown>; created_at: string }[]) ?? []) {
    if (f.dispatch_id && (f.kind === "unscreened" || f.kind === "undeclared_ai")) add(f.dispatch_id, f.kind, f.created_at);
    if (f.kind === "held_handle" || f.kind === "unscreened_handle") {
      handleFlags.push({ flagId: f.id, kind: f.kind, handle: String(f.details.handle ?? ""), reason: (f.details.reason as string) ?? null, created_at: f.created_at, current: f.user_id });
      if (f.user_id) handleUsers.push(f.user_id);
    }
  }

  const ids = [...byId.keys()];
  if (handleUsers.length) {
    const { data } = await db.from("profiles").select("id, handle").in("id", handleUsers);
    const current = new Map(((data as { id: string; handle: string | null }[]) ?? []).map((p) => [p.id, p.handle]));
    for (const h of handleFlags) h.current = h.current ? (current.get(h.current) ?? null) : null;
  }
  if (!ids.length) return { items: [], handles: handleFlags };

  const [{ data: dispatches }, { data: decisions }, { data: sealed }, { data: replies }] = await Promise.all([
    db.from("dispatches").select(DISPATCH_FIELDS).in("id", ids),
    db
      .from("ai_decisions")
      .select("id, subject_id, outcome, category, confidence, reason, model, prompt_version, overridden_at, created_at")
      .eq("subject_type", "dispatch")
      .in("subject_id", ids)
      .order("created_at", { ascending: false }),
    db.from("dispatch_sealed_content").select("dispatch_id, body, sealed_at").in("dispatch_id", ids).is("released_at", null).order("sealed_at", { ascending: false }),
    db.from("dispatches").select("id, parent_id, body, author:profiles!dispatches_author_id_fkey(handle)").in("parent_id", ids).order("created_at").limit(300),
  ]);
  const rows = (dispatches as unknown as DispatchRow[]) ?? [];
  const parentIds = [...new Set(rows.map((d) => d.parent_id).filter((x): x is string => Boolean(x)))];
  const { data: parents } = parentIds.length
    ? await db.from("dispatches").select("id, body, author:profiles!dispatches_author_id_fkey(handle)").in("id", parentIds)
    : { data: [] };
  const parentMap = new Map(((parents as unknown as { id: string; body: string; author: { handle: string | null } | null }[]) ?? []).map((p) => [p.id, p]));

  const items = rows.map((d): QueueItem => {
    const entry = byId.get(d.id)!;
    const reasons = [...entry.reasons].sort((a, b) => SEVERITY[b] - SEVERITY[a]);
    const decision = ((decisions as (NonNullable<QueueItem["decision"]> & { subject_id: string })[]) ?? []).find((x) => x.subject_id === d.id) ?? null;
    const parent = d.parent_id ? parentMap.get(d.parent_id) : null;
    return {
      dispatch: d,
      sealedBody: ((sealed as { dispatch_id: string; body: string }[]) ?? []).find((s) => s.dispatch_id === d.id)?.body ?? null,
      reasons,
      newest: entry.newest,
      severity: SEVERITY[reasons[0]],
      decision: decision ? { ...decision, confidence: decision.confidence === null ? null : Number(decision.confidence) } : null,
      reports: ((reports.data as unknown as { dispatch_id: string; reason: string; details: string | null; created_at: string; reporter: { handle: string | null } | null }[]) ?? [])
        .filter((r) => r.dispatch_id === d.id)
        .map((r) => ({ reason: r.reason, details: r.details, created_at: r.created_at, reporter: r.reporter?.handle ?? null })),
      appeal: ((appeals.data as { id: string; dispatch_id: string; reason: string; created_at: string; original_actor: string | null }[]) ?? []).find((a) => a.dispatch_id === d.id) ?? null,
      flags: ((flags.data as { id: string; kind: string; dispatch_id: string | null; details: Record<string, unknown>; created_at: string }[]) ?? []).filter((f) => f.dispatch_id === d.id),
      parent: parent ? { id: parent.id, body: parent.body, handle: parent.author?.handle ?? null } : null,
      replies: ((replies as unknown as { id: string; parent_id: string; body: string; author: { handle: string | null } | null }[]) ?? [])
        .filter((r) => r.parent_id === d.id)
        .slice(0, 3)
        .map((r) => ({ id: r.id, body: r.body, handle: r.author?.handle ?? null })),
    };
  });
  // Most severe first, then newest.
  items.sort((a, b) => b.severity - a.severity || b.newest.localeCompare(a.newest));
  return { items, handles: handleFlags };
}

export type UsageRow = { day: string; feature: string; calls: number; failures: number; input_tokens: number; output_tokens: number };

/** Spend log: calls and tokens per feature per day, for the last 14 days. */
export async function getAiUsage(): Promise<UsageRow[]> {
  const db = await createClient();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db.from("ai_usage").select("day, feature, calls, failures, input_tokens, output_tokens").gte("day", since).limit(5000);
  if (error) throw new Error("Could not load AI usage");
  const totals = new Map<string, UsageRow>();
  for (const r of (data as UsageRow[]) ?? []) {
    const key = `${r.day}|${r.feature}`;
    const t = totals.get(key) ?? { day: r.day, feature: r.feature, calls: 0, failures: 0, input_tokens: 0, output_tokens: 0 };
    t.calls += r.calls;
    t.failures += r.failures;
    t.input_tokens += Number(r.input_tokens);
    t.output_tokens += Number(r.output_tokens);
    totals.set(key, t);
  }
  return [...totals.values()].sort((a, b) => b.day.localeCompare(a.day) || a.feature.localeCompare(b.feature));
}

/** How useful Strategists found the coach. */
export async function getCoachUsefulness(): Promise<{ rated: number; helpful: number; unrated: number; comments: { comment: string; helpful: boolean; rated_at: string }[] }> {
  const db = await createClient();
  const [{ count: helpful }, { count: notHelpful }, { count: unrated }, { data: comments }] = await Promise.all([
    db.from("coach_feedback").select("ai_decision_id", { count: "exact", head: true }).eq("helpful", true),
    db.from("coach_feedback").select("ai_decision_id", { count: "exact", head: true }).eq("helpful", false),
    db.from("coach_feedback").select("ai_decision_id", { count: "exact", head: true }).is("helpful", null),
    db.from("coach_feedback").select("comment, helpful, rated_at").not("comment", "is", null).order("rated_at", { ascending: false }).limit(10),
  ]);
  return {
    rated: (helpful ?? 0) + (notHelpful ?? 0),
    helpful: helpful ?? 0,
    unrated: unrated ?? 0,
    comments: (comments as { comment: string; helpful: boolean; rated_at: string }[]) ?? [],
  };
}
