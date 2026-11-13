import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createUser, deleteUsers, service, type TestUser } from "./helpers";

// Sprint 7 rate limiter, event log and health read (migration 20261113000200). LOCAL Supabase only.

let member: TestUser;
let admin: TestUser;
const bucket = `test_${Date.now()}`;

beforeAll(async () => {
  [member, admin] = await Promise.all([createUser(), createUser({ admin: true })]);
});

afterAll(async () => {
  await service.from("rate_limits").delete().like("bucket", "test_%");
  await service.from("system_events").delete().eq("kind", "test_event");
  await deleteUsers([member, admin]);
});

describe("rate_limit_hit", () => {
  it("allows up to the limit, then refuses, and counts each subject separately", async () => {
    const hit = (subject: string) => service.rpc("rate_limit_hit", { p_bucket: bucket, p_subject: subject, p_max: 3, p_window_seconds: 3600 });
    for (let i = 0; i < 3; i++) expect((await hit("a")).data).toBe(true);
    expect((await hit("a")).data).toBe(false);
    expect((await hit("a")).data).toBe(false);
    expect((await hit("b")).data).toBe(true);
  });

  it("refuses bad settings", async () => {
    expect((await service.rpc("rate_limit_hit", { p_bucket: bucket, p_subject: "x", p_max: 0, p_window_seconds: 60 })).error?.message).toMatch(/BAD_INPUT/);
    expect((await service.rpc("rate_limit_hit", { p_bucket: bucket, p_subject: "x", p_max: 1, p_window_seconds: 999999 })).error?.message).toMatch(/BAD_INPUT/);
  });

  it("cannot be called, read or written by browser roles", async () => {
    for (const client of [anonClient(), member.client, admin.client]) {
      expect((await client.rpc("rate_limit_hit", { p_bucket: bucket, p_subject: "z", p_max: 1, p_window_seconds: 60 })).error).not.toBeNull();
      expect((await client.from("rate_limits").select("*")).error?.message).toMatch(/permission denied/i);
      expect((await client.from("rate_limits").insert({ bucket, subject: "z", window_start: new Date().toISOString(), hits: 1 })).error).not.toBeNull();
    }
  });
});

describe("system_events", () => {
  it("is written by the server, read only by an admin, and closed to browser roles", async () => {
    expect((await service.rpc("log_system_event", { p_kind: "test_event", p_code: "a_code", p_detail: { n: 1 } })).error).toBeNull();
    for (const client of [anonClient(), member.client]) {
      expect((await client.rpc("log_system_event", { p_kind: "test_event", p_code: "x" })).error).not.toBeNull();
      expect((await client.rpc("admin_recent_events")).error).not.toBeNull();
      expect((await client.from("system_events").select("*")).error?.message).toMatch(/permission denied/i);
    }
    const { data, error } = await admin.client.rpc("admin_recent_events", { p_limit: 20 });
    expect(error).toBeNull();
    expect((data as { kind: string }[]).some((e) => e.kind === "test_event")).toBe(true);
  });

  it("refuses a kind that is not a short fixed word", async () => {
    expect((await service.rpc("log_system_event", { p_kind: "Bad Kind!", p_code: "x" })).error).not.toBeNull();
  });

  it("is pruned after 30 days, and old rate-limit windows after two", async () => {
    await service.from("system_events").insert({ kind: "test_event", code: "old", created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() });
    await service.from("rate_limits").insert({ bucket: "test_old", subject: "s", window_start: new Date(Date.now() - 3 * 86_400_000).toISOString(), hits: 1 });
    const { data } = await service.rpc("prune_limits_and_events");
    expect((data as { system_events: number }).system_events).toBeGreaterThanOrEqual(1);
    expect((data as { rate_limits: number }).rate_limits).toBeGreaterThanOrEqual(1);
    const { data: left } = await service.from("system_events").select("id").eq("code", "old");
    expect(left).toEqual([]);
  });
});

describe("admin_health", () => {
  it("is readable only by an admin and has the expected shape", async () => {
    for (const client of [anonClient(), member.client]) expect((await client.rpc("admin_health")).error).not.toBeNull();
    const { data, error } = await admin.client.rpc("admin_health");
    expect(error).toBeNull();
    const h = data as Record<string, unknown>;
    for (const key of ["email_queued", "rubric_jobs_waiting", "moderation_pending", "ai_calls_today", "ai_daily_cap", "switches", "jobs"]) expect(h).toHaveProperty(key);
    expect(Array.isArray(h.jobs)).toBe(true);
    expect((h.jobs as { name: string }[]).some((j) => j.name === "housekeeping-limits-events")).toBe(true);
  });
});
