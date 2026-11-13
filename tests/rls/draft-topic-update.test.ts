import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UPDATE_SLUGS, applyDraftUpdates, formatPlans, planDraftUpdates } from "@/lib/draft-topic-update";
import { buildTopicRows, topicFileSchema } from "@/lib/launch-topics";
import { service } from "./helpers";

// The one-off script for hosted DRAFT Campaigns: dry run by default, drafts only, never the schedule.
// Runs against the LOCAL database with stand-ins for the three hosted rows.

const file = topicFileSchema.parse(JSON.parse(readFileSync("supabase/data/launch-topics.json", "utf8")));
const [boe, rosebank, dying] = UPDATE_SLUGS;
const base = buildTopicRows(file, "2027-01-04");
const schedule = (slug: string) => {
  const r = base.find((x) => x.slug === slug)!;
  return { starts_at: r.starts_at, ends_at: r.ends_at };
};

beforeAll(async () => {
  await service.from("campaigns").delete().in("slug", [...UPDATE_SLUGS]);
  const old = (slug: string, over: Record<string, unknown>) => {
    const r = base.find((x) => x.slug === slug)!;
    return { ...r, ...over };
  };
  const { error } = await service.from("campaigns").insert([
    // Still a draft, with the old wording.
    old(boe, { title: "Should the Bank of England raise interest rates on 5 November?", needs_owner_decision: "Pick the next MPC date", summary: "DRAFT: background to be refreshed" }),
    // NOT a draft: it has been scheduled. Must be left completely alone.
    old(rosebank, { title: "Having approved Jackdaw, should the UK also approve Rosebank?", status: "scheduled", notes: null, needs_owner_decision: null }),
    // Draft with the placeholder note and the old format.
    old(dying, { format: "open_arena", content_note: "DRAFT: content note to be written by the owner", notes: "old" }),
  ]);
  if (error) throw error;
});

afterAll(async () => {
  await service.from("campaigns").delete().in("slug", [...UPDATE_SLUGS]);
});

const row = async (slug: string) => (await service.from("campaigns").select("*").eq("slug", slug).single()).data!;

describe("scripts/update-draft-topics.ts", () => {
  it("a dry run prints a diff and writes nothing", async () => {
    const before = await Promise.all(UPDATE_SLUGS.map(row));
    const plans = await planDraftUpdates(service, file);
    const text = formatPlans(plans).join("\n");
    expect(text).toContain("Should the Bank of England keep interest rates high until inflation is firmly back at 2%");
    expect(text).toContain("now:");
    expect(text).toContain("would:");
    // Rosebank is scheduled, so it is skipped and says why.
    expect(plans.find((p) => p.slug === rosebank)).toMatchObject({ action: "skip", reason: expect.stringContaining("not draft") });
    expect(plans.find((p) => p.slug === boe)?.action).toBe("update");
    expect(plans.find((p) => p.slug === dying)?.action).toBe("update");
    // Nothing changed.
    expect(await Promise.all(UPDATE_SLUGS.map(row))).toEqual(before);
  });

  it("with confirm it updates the drafts only, and never the schedule, status, wave or slug", async () => {
    const before = { boe: await row(boe), rosebank: await row(rosebank), dying: await row(dying) };
    const plans = await planDraftUpdates(service, file);
    const result = await applyDraftUpdates(service, plans);
    expect(result.updated.sort()).toEqual([boe, dying].sort());

    const after = { boe: await row(boe), rosebank: await row(rosebank), dying: await row(dying) };
    // Bank of England
    expect(after.boe.title).toBe("Should the Bank of England keep interest rates high until inflation is firmly back at 2%, even if that slows growth?");
    expect(after.boe.needs_owner_decision).toBeNull();
    expect(after.boe.summary).toMatch(/^As of \[opening date\], Bank Rate is \[x\]%/);
    expect(after.boe.brief.argument_for).toMatch(/Stable prices protect savers/);
    expect(after.boe.brief.sources).toEqual(before.boe.brief.sources); // merged, not replaced
    // Assisted dying
    expect(after.dying.format).toBe("oxford");
    expect(after.dying.content_note).toMatch(/Samaritans 116 123/);
    expect(after.dying.needs_owner_decision).toBeTruthy();
    expect(after.dying.notes).toContain("Check each phone number on the day it opens.");
    // Rosebank was not a draft: byte-for-byte unchanged.
    expect(after.rosebank).toEqual(before.rosebank);
    // The schedule, status, wave and slug are never written.
    for (const k of ["boe", "dying"] as const) {
      for (const col of ["starts_at", "ends_at", "status", "wave", "slug"]) expect(after[k][col], `${k}.${col}`).toEqual(before[k][col]);
    }
    expect(Date.parse(before.boe.starts_at)).toBe(Date.parse(schedule(boe).starts_at));
  });

  it("is idempotent: running again finds nothing to change", async () => {
    const plans = await planDraftUpdates(service, file);
    expect(plans.find((p) => p.slug === boe)?.action).toBe("unchanged");
    expect(plans.find((p) => p.slug === dying)?.action).toBe("unchanged");
  });

  it("refuses at the database even if a Campaign stops being a draft between the plan and the write", async () => {
    await service.from("campaigns").update({ title: "old title", needs_owner_decision: "x" }).eq("slug", boe);
    const plans = await planDraftUpdates(service, file);
    expect(plans.find((p) => p.slug === boe)?.action).toBe("update");
    await service.from("campaigns").update({ status: "scheduled", needs_owner_decision: null }).eq("slug", boe);
    const result = await applyDraftUpdates(service, plans);
    expect(result.refused).toContain(boe);
    expect((await row(boe)).title).toBe("old title");
  });
});
