import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { buildTopicRows, loadTopics, topicFileSchema } from "@/lib/launch-topics";
import { service } from "./helpers";

const file = topicFileSchema.parse(JSON.parse(readFileSync("supabase/data/launch-topics.json", "utf8")));
// Unique slugs so this test never clashes with topics loaded by hand into the local database.
const suffix = `t${Date.now().toString(36)}`;
const rows = buildTopicRows(file, "2027-01-04").map((r) => ({ ...r, slug: `${r.slug.slice(0, 60)}-${suffix}` }));

afterAll(async () => {
  await service.from("campaigns").delete().in("slug", rows.map((r) => r.slug));
});

describe("npm run topics:load", () => {
  it("creates all fifteen drafts, and loading twice creates no duplicates", async () => {
    const first = await loadTopics(service, rows);
    expect(first.created).toHaveLength(15);
    const second = await loadTopics(service, rows);
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(15);

    const { data } = await service.from("campaigns").select("slug, status, rubric_published_at").in("slug", rows.map((r) => r.slug));
    expect(data).toHaveLength(15);
    expect(new Set(data!.map((r) => r.status))).toEqual(new Set(["draft"]));
    expect(data!.every((r) => r.rubric_published_at === null)).toBe(true);
  });

  it("writes each insert to the audit log", async () => {
    const { data: campaigns } = await service.from("campaigns").select("id").in("slug", rows.map((r) => r.slug));
    const { data: entries } = await service
      .from("audit_log")
      .select("target_id")
      .eq("action", "campaign.created")
      .in("target_id", campaigns!.map((c) => c.id));
    expect(entries).toHaveLength(15);
  });
});
