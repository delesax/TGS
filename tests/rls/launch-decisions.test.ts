import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { service } from "./helpers";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
afterAll(() => sql.end());

describe("launch decision 4: the first-fortnight AI cap", () => {
  it("the global daily cap is 1,000, and so is the column default", async () => {
    const { data } = await service.from("community_settings").select("ai_daily_cap_global, ai_daily_cap_per_strategist, coach_uses_per_draft, coach_daily_cap").single();
    expect(data).toEqual({ ai_daily_cap_global: 1000, ai_daily_cap_per_strategist: 40, coach_uses_per_draft: 3, coach_daily_cap: 10 });
    const [{ column_default }] = await sql`select column_default from information_schema.columns where table_schema = 'public' and table_name = 'community_settings' and column_name = 'ai_daily_cap_global'`;
    expect(column_default).toBe("1000");
  });

  it("one audit entry records it: from 3000 to 1000, actor system", async () => {
    const { data } = await service.from("audit_log").select("actor_id, details").eq("action", "settings.changed");
    const entry = data!.find((e) => (e.details as { setting?: string }).setting === "ai_daily_cap_global");
    expect(entry).toBeDefined();
    expect(entry!.actor_id).toBeNull();
    expect(entry!.details).toMatchObject({ setting: "ai_daily_cap_global", from: 3000, to: 1000, actor: "system" });
  });
});

describe("content notes", () => {
  it("can be up to 1,000 characters, and no more", async () => {
    const slug = `note-limit-${Date.now()}`;
    const base = { slug, title: "Note limit test", category: "technology", status: "draft", starts_at: new Date(Date.now() + 86_400_000).toISOString(), ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString() };
    try {
      expect((await service.from("campaigns").insert({ ...base, is_sensitive: true, content_note: "x".repeat(1000) })).error).toBeNull();
      await service.from("campaigns").delete().eq("slug", slug);
      expect((await service.from("campaigns").insert({ ...base, is_sensitive: true, content_note: "x".repeat(1001) })).error).not.toBeNull();
    } finally {
      await service.from("campaigns").delete().eq("slug", slug);
    }
  });
});
