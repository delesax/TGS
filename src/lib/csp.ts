// Content Security Policy, REPORT-ONLY (Sprint 7). Nothing is blocked: the browser only tells us what a stricter
// policy would have blocked, so we can tighten it later without breaking anything. Read the reports with
// docs/LAUNCH_RUNBOOK.md ("Reading CSP reports").

/** Builds the policy text. The Supabase address is the only third-party host the pages talk to. */
export function buildCspReportOnly(supabaseUrl: string | undefined): string {
  let connect = "'self'";
  try {
    if (supabaseUrl) {
      const u = new URL(supabaseUrl);
      connect += ` ${u.origin} ${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`;
    }
  } catch {
    // An unparseable address just means connect-src stays 'self'; the reports will show it.
  }
  return [
    "default-src 'self'",
    // Next.js adds inline scripts and styles; 'unsafe-inline' keeps the report quiet about those until a nonce is added.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
    "report-to csp",
  ].join("; ");
}

export type CspSummary = { directive: string; host: string };

const KEYWORDS = new Set(["inline", "eval", "data", "blob", "self", "wasm-eval", "trusted-types-policy", "trusted-types-sink"]);

/** Reduces a blocked address to a host or a keyword. Never a path or query string. */
export function blockedHost(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "unknown";
  const v = raw.trim().toLowerCase();
  if (KEYWORDS.has(v)) return v;
  if (/^(data|blob):/.test(v)) return v.split(":")[0];
  try {
    const u = new URL(v);
    if (u.host) return u.host.slice(0, 80);
    return u.protocol.replace(":", "").slice(0, 20) || "other";
  } catch {
    return "other";
  }
}

function summarise(r: Record<string, unknown>): CspSummary | null {
  const directive = r["effective-directive"] ?? r["effectiveDirective"] ?? r["violated-directive"] ?? r["violatedDirective"];
  if (typeof directive !== "string" || !directive) return null;
  const word = directive.trim().split(/\s+/)[0].toLowerCase();
  if (!/^[a-z-]{3,40}$/.test(word)) return null;
  return { directive: word, host: blockedHost(r["blocked-uri"] ?? r["blockedURL"] ?? r["blockedUri"]) };
}

/**
 * Accepts both report formats: the older `application/csp-report` object ({"csp-report": {...}}) and the newer
 * Reporting API array ([{type: "csp-violation", body: {...}}]). Returns at most 5 summaries, with nothing but a
 * directive name and a host: no page address, no query string, no page content.
 */
export function parseCspReports(payload: unknown): CspSummary[] {
  const out: CspSummary[] = [];
  const add = (r: unknown) => {
    if (r && typeof r === "object") {
      const s = summarise(r as Record<string, unknown>);
      if (s) out.push(s);
    }
  };
  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, 5)) if (item && typeof item === "object" && (item as { type?: unknown }).type === "csp-violation") add((item as { body?: unknown }).body);
  } else if (payload && typeof payload === "object") {
    add((payload as Record<string, unknown>)["csp-report"]);
  }
  return out.slice(0, 5);
}
