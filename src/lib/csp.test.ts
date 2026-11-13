import { describe, expect, it } from "vitest";
import { blockedHost, buildCspReportOnly, parseCspReports } from "./csp";

describe("CSP report-only policy", () => {
  it("allows only this site plus the Supabase host, blocks framing and plugins, and reports to our route", () => {
    const p = buildCspReportOnly("https://abc.supabase.co");
    expect(p).toContain("default-src 'self'");
    expect(p).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("report-uri /api/csp-report");
    expect(buildCspReportOnly("http://127.0.0.1:54321")).toContain("ws://127.0.0.1:54321");
    expect(buildCspReportOnly(undefined)).toContain("connect-src 'self';");
    expect(buildCspReportOnly("not a url")).toContain("connect-src 'self';");
  });
});

describe("CSP report parsing", () => {
  it("keeps only the directive and the blocked host, never a path or query string", () => {
    expect(blockedHost("https://cdn.example.com/a/b.js?token=secret#x")).toBe("cdn.example.com");
    expect(blockedHost("inline")).toBe("inline");
    expect(blockedHost("data:image/png;base64,AAAA")).toBe("data");
    expect(blockedHost("")).toBe("unknown");
    expect(blockedHost(42)).toBe("unknown");
    expect(blockedHost("::::")).toBe("other");
  });

  it("reads the older report-uri format", () => {
    const r = parseCspReports({ "csp-report": { "document-uri": "https://site/page?secret=1", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.test/x.js?q=1", "original-policy": "default-src 'self'" } });
    expect(r).toEqual([{ directive: "script-src-elem", host: "evil.test" }]);
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  it("reads the Reporting API format and caps the number of reports", () => {
    const body = { effectiveDirective: "img-src", blockedURL: "https://img.test/p.png" };
    const r = parseCspReports(Array.from({ length: 9 }, () => ({ type: "csp-violation", body })));
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual({ directive: "img-src", host: "img.test" });
  });

  it("ignores anything else, including odd directive names", () => {
    expect(parseCspReports(null)).toEqual([]);
    expect(parseCspReports("x")).toEqual([]);
    expect(parseCspReports([{ type: "deprecation", body: {} }])).toEqual([]);
    expect(parseCspReports({ "csp-report": { "effective-directive": "<script>alert(1)</script>" } })).toEqual([]);
  });
});
