import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CATEGORIES, FORMATS, SLUG_PATTERN, fromUkInputValue } from "./campaigns";

// The fifteen launch topics in supabase/data/launch-topics.json, loaded as DRAFT
// Campaigns by `npm run topics:load`. Limits mirror the campaigns table.

export const SENSITIVE_NOTE_PLACEHOLDER = "DRAFT: content note to be written by the owner";
export const SUMMARY_PLACEHOLDER =
  "DRAFT: background to be refreshed by the owner before this Campaign opens. The facts in the topic bank were checked around 1 November 2026.";

const topicSchema = z.object({
  slug: z.string().max(80).regex(SLUG_PATTERN),
  title: z.string().min(5).max(160),
  category: z.enum(CATEGORIES),
  format: z.enum(FORMATS),
  suggested_format: z.string().max(500).optional(),
  wave: z.number().int().min(1).max(9),
  summary: z.string().min(1).max(2000),
  argument_for: z.string().max(2000).optional(),
  argument_against: z.string().max(2000).optional(),
  sources: z.array(z.url()).max(20).default([]),
  is_sensitive: z.boolean(),
  opinion_not_advice: z.boolean(),
  content_note: z.string().max(500).optional(),
  needs_owner_decision: z.string().max(1000).optional(),
});

export const topicFileSchema = z.object({
  _about: z.string().optional(),
  waves: z.record(z.string(), z.string()).optional(),
  default_duration_days: z.number().int().min(1).max(60),
  topics: z
    .array(topicSchema)
    .min(1)
    .refine((t) => new Set(t.map((x) => x.slug)).size === t.length, "Every topic needs a different slug."),
});

export type TopicFile = z.infer<typeof topicFileSchema>;
export type Topic = z.infer<typeof topicSchema>;

/** Adds whole calendar days to a YYYY-MM-DD date. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Turns the file into campaigns rows. Topics run one after another in wave
 * order (file order within a wave), each for default_duration_days, starting at
 * midnight UK time on `start`. Always drafts; nothing is scheduled.
 */
export function buildTopicRows(file: TopicFile, start: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(start))) {
    throw new Error("--start must be a date in the form YYYY-MM-DD");
  }
  const days = file.default_duration_days;
  const ordered = file.topics.map((t, i) => ({ t, i })).sort((a, b) => a.t.wave - b.t.wave || a.i - b.i);

  return ordered.map(({ t }, n) => {
    const startsAt = fromUkInputValue(`${addDays(start, n * days)}T00:00`)!;
    const endsAt = fromUkInputValue(`${addDays(start, (n + 1) * days)}T00:00`)!;
    const closedModerated = /^closed, moderated/i.test(t.suggested_format ?? "");
    const notes = [
      t.suggested_format ? `Intended setting: ${t.suggested_format}` : null,
      closedModerated ? "\"Closed, moderated debate\" is not a format yet: loaded as Open arena. Stricter moderation arrives in Sprint 4." : null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      slug: t.slug,
      title: t.title,
      // The topic bank's facts go stale, so they are kept in `brief` (not shown)
      // until the owner refreshes the summary.
      summary: SUMMARY_PLACEHOLDER,
      rules: null,
      category: t.category,
      format: t.format,
      status: "draft" as const,
      starts_at: startsAt,
      ends_at: endsAt,
      is_sensitive: t.is_sensitive,
      // Never write the real note for a sensitive topic: the owner does (CLAUDE.md rule 15).
      content_note: t.is_sensitive ? SENSITIVE_NOTE_PLACEHOLDER : null,
      opinion_not_advice: t.opinion_not_advice,
      wave: t.wave,
      needs_owner_decision: t.needs_owner_decision ?? null,
      notes: notes || null,
      rubric_published_at: null,
      brief: {
        source: "supabase/data/launch-topics.json",
        facts_checked: "around 1 November 2026",
        summary: t.summary,
        argument_for: t.argument_for ?? null,
        argument_against: t.argument_against ?? null,
        sources: t.sources,
        suggested_format: t.suggested_format ?? null,
      },
    };
  });
}

export type TopicRow = ReturnType<typeof buildTopicRows>[number];

/**
 * Inserts the rows that are not there yet, matched by slug. Existing
 * Campaigns are never changed. The campaigns audit trigger writes each insert
 * to audit_log.
 */
export async function loadTopics(client: SupabaseClient, rows: TopicRow[]) {
  const { data: existing, error } = await client.from("campaigns").select("slug").in("slug", rows.map((r) => r.slug));
  if (error) throw new Error(`Could not read existing Campaigns: ${error.message}`);
  const have = new Set((existing ?? []).map((r) => r.slug as string));
  const toInsert = rows.filter((r) => !have.has(r.slug));
  if (toInsert.length) {
    const { error: insertError } = await client.from("campaigns").insert(toInsert);
    if (insertError) throw new Error(`Could not create Campaigns: ${insertError.message}`);
  }
  return { created: toInsert.map((r) => r.slug), skipped: rows.filter((r) => have.has(r.slug)).map((r) => r.slug) };
}
