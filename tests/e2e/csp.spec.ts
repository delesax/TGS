import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestEnv } from "../test-env";

const env = loadTestEnv();
const service = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } });

test.describe("Sprint 7: Content Security Policy (report-only)", () => {
  test.beforeAll(async () => {
    await service.from("rate_limits").delete().like("bucket", "csp_%");
    await service.from("system_events").delete().eq("kind", "csp_report");
  });

  test("pages send the policy as report-only, never enforcing", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["content-security-policy-report-only"]).toContain("default-src 'self'");
    expect(res.headers()["content-security-policy"]).toBeUndefined();
  });

  test("a report is stored as directive and host only, with no address or query string", async ({ request }) => {
    const res = await request.post("/api/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: JSON.stringify({ "csp-report": { "document-uri": "https://example.test/private?token=abc", "effective-directive": "img-src", "blocked-uri": "https://tracker.example.test/pixel.gif?user=42" } }),
    });
    expect(res.status()).toBe(204);
    const { data } = await service.from("system_events").select("code, detail").eq("kind", "csp_report");
    expect(data).toEqual([{ code: "img-src", detail: { host: "tracker.example.test" } }]);
    expect(JSON.stringify(data)).not.toMatch(/token|user=42|private/);
  });

  test("junk and oversized bodies are ignored politely", async ({ request }) => {
    expect((await request.post("/api/csp-report", { data: "not json" })).status()).toBe(204);
    expect((await request.post("/api/csp-report", { data: JSON.stringify({ pad: "x".repeat(20_000) }) })).status()).toBe(204);
    const { count } = await service.from("system_events").select("id", { count: "exact", head: true }).eq("kind", "csp_report");
    expect(count).toBe(1);
  });

  test("a flood is cut off by the limit", async ({ request }) => {
    // Start from empty counters: the earlier tests in this file already used some of this window.
    await service.from("rate_limits").delete().like("bucket", "csp_%");
    await service.from("system_events").delete().eq("kind", "csp_report");
    const body = JSON.stringify({ "csp-report": { "effective-directive": "script-src", "blocked-uri": "https://x.example.test/a.js" } });
    for (let i = 0; i < 70; i++) await request.post("/api/csp-report", { data: body });
    const { count } = await service.from("system_events").select("id", { count: "exact", head: true }).eq("kind", "csp_report");
    expect(count).toBe(60);
  });
});
