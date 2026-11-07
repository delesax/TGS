import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTopicRows, type TopicFile, type TopicRow } from "./launch-topics";

/**
 * One-off: bring DRAFT Campaigns that are already on the hosted project in line
 * with the 7 November 2026 launch-topic decisions (Part 9 a to c).
 * `npm run topics:load` only inserts new slugs, so it cannot do this.
 *
 * Safety, in layers:
 *   1. only the slugs in UPDATE_SLUGS are looked at;
 *   2. only a Campaign whose status is `draft` is ever changed (checked when
 *      planning, and again in the UPDATE itself);
 *   3. the schedule (starts_at, ends_at), status, wave and slug are never written;
 *   4. dry run unless the caller passes confirm.
 */
export const UPDATE_SLUGS = ["bank-of-england-rate-decision-november", "rosebank-after-jackdaw", "assisted-dying-or-fix-care-first"] as const;

/** The only columns this script may write. Never the schedule, status, slug or wave. */
const FIELDS = ["title", "summary", "category", "format", "is_sensitive", "content_note", "opinion_not_advice", "notes", "needs_owner_decision", "brief"] as const;
type Field = (typeof FIELDS)[number];

type Existing = Record<string, unknown> & { slug: string; status: string; brief: Record<string, unknown> | null };

export type FieldChange = { field: Field; before: unknown; after: unknown };
export type DraftPlan =
  | { slug: string; action: "update"; changes: FieldChange[]; patch: Record<string, unknown> }
  | { slug: string; action: "unchanged" }
  | { slug: string; action: "skip"; reason: string };

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** What the Campaign should look like, from the topics file (the file is the source of truth). */
export function desiredFor(file: TopicFile, slug: string): TopicRow | undefined {
  return buildTopicRows(file, "2027-01-04").find((r) => r.slug === slug);
}

export function planOne(existing: Existing | undefined, desired: TopicRow | undefined, slug: string, summaryFromFile: boolean): DraftPlan {
  if (!desired) return { slug, action: "skip", reason: "not in the topics file" };
  if (!existing) return { slug, action: "skip", reason: "no Campaign with this slug on this project" };
  if (existing.status !== "draft") return { slug, action: "skip", reason: `status is "${existing.status}", not draft. Not touched.` };

  const patch: Record<string, unknown> = {};
  const changes: FieldChange[] = [];
  const want: Record<Field, unknown> = {
    title: desired.title,
    // The generic "to be refreshed" placeholder is not re-applied over whatever is there.
    summary: summaryFromFile ? desired.summary : existing.summary,
    category: desired.category,
    format: desired.format,
    is_sensitive: desired.is_sensitive,
    content_note: desired.content_note,
    opinion_not_advice: desired.opinion_not_advice,
    notes: desired.notes,
    needs_owner_decision: desired.needs_owner_decision,
    // Merge: keep the existing sources and facts_checked, replace what the decision changed.
    brief: { ...(existing.brief ?? {}), summary: desired.brief.summary, argument_for: desired.brief.argument_for, argument_against: desired.brief.argument_against, suggested_format: desired.brief.suggested_format },
  };
  for (const field of FIELDS) {
    if (!same(existing[field], want[field])) {
      changes.push({ field, before: existing[field] ?? null, after: want[field] });
      patch[field] = want[field];
    }
  }
  return changes.length ? { slug, action: "update", changes, patch } : { slug, action: "unchanged" };
}

export async function planDraftUpdates(client: SupabaseClient, file: TopicFile): Promise<DraftPlan[]> {
  const { data, error } = await client.from("campaigns").select(["slug", "status", ...FIELDS].join(", ")).in("slug", [...UPDATE_SLUGS]);
  if (error) throw new Error(`Could not read Campaigns: ${error.message}`);
  const bySlug = new Map(((data ?? []) as unknown as Existing[]).map((r) => [r.slug, r]));
  return UPDATE_SLUGS.map((slug) => {
    const topic = file.topics.find((t) => t.slug === slug);
    return planOne(bySlug.get(slug), desiredFor(file, slug), slug, Boolean(topic?.public_summary));
  });
}

/** Writes the "update" plans. Each UPDATE also requires status = draft, so a Campaign opened in the meantime is left alone. */
export async function applyDraftUpdates(client: SupabaseClient, plans: DraftPlan[]): Promise<{ updated: string[]; refused: string[] }> {
  const updated: string[] = [];
  const refused: string[] = [];
  for (const p of plans) {
    if (p.action !== "update") continue;
    const { data, error } = await client.from("campaigns").update(p.patch).eq("slug", p.slug).eq("status", "draft").select("slug");
    if (error) throw new Error(`Could not update ${p.slug}: ${error.message}`);
    (data?.length ? updated : refused).push(p.slug);
  }
  return { updated, refused };
}

function show(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  return typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v);
}

export function formatPlans(plans: DraftPlan[]): string[] {
  const out: string[] = [];
  for (const p of plans) {
    out.push(`\n${p.slug}`);
    if (p.action === "skip") out.push(`  SKIPPED: ${p.reason}`);
    else if (p.action === "unchanged") out.push("  Already up to date. Nothing to change.");
    else
      for (const c of p.changes) {
        out.push(`  ${c.field}:`);
        out.push(`    now:   ${show(c.before)}`);
        out.push(`    would: ${show(c.after)}`);
      }
  }
  return out;
}
