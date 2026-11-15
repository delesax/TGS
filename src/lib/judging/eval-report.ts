// Pure helpers for the judging evaluation report (scripts/eval-judging.ts), kept here so they are unit tested.
// The script itself calls the model and is never run by tests or CI.

/**
 * The report's path. The filename carries the UTC date AND time to the second, so a later run on the same
 * day can never overwrite an earlier one (a real run costs money and its output must be kept).
 * Example: evals/out/judging-real-v2-2026-11-13T121102Z.md
 */
export function evalReportPath(opts: { real: boolean; prompt: 1 | 2; now: Date }): string {
  const stamp = opts.now.toISOString().slice(0, 19).replace(/[-:]/g, "").replace(/^(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  return `evals/out/judging-${opts.real ? "real" : "fake"}${opts.prompt === 2 ? "-v2" : ""}-${stamp}Z.md`;
}

type ClaimRow = { item: { id: string }; got: unknown; claims?: string[] };

/**
 * The "unverified claims" section of a prompt v2 report: the counts, then every claim string per item, so a run
 * can be reviewed without re-running the model. Claim text comes from the model, so newlines are flattened.
 */
export function claimsSection(rows: ClaimRow[]): string[] {
  const scored = rows.filter((r) => r.got);
  const flat = (s: string) => s.replace(/\s+/g, " ").trim();
  const withClaims = scored.filter((r) => r.claims?.length);
  const total = withClaims.reduce((n, r) => n + (r.claims?.length ?? 0), 0);
  const lines = [`## Unverified claims, per item (${withClaims.length} of ${scored.length} items, ${total} claims)`, ""];
  for (const r of scored) {
    const claims = r.claims ?? [];
    if (!claims.length) {
      lines.push(`- ${r.item.id}: 0 claims`);
      continue;
    }
    lines.push(`- ${r.item.id}: ${claims.length} claim${claims.length === 1 ? "" : "s"}`);
    for (const c of claims) lines.push(`  - ${JSON.stringify(flat(c))}`);
  }
  lines.push("");
  return lines;
}
