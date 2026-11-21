// Handle removal for an opt-in public Verdict page (spec item g, docs/POST_LAUNCH_GAPS_SPEC.md). PURE AND NOT WIRED: no route uses it,
// nothing is indexed, and the members-only Verdict page is unchanged. It only does the text work, so the legal question (is a rationale
// without handles still personal data?) can be answered with the real behaviour in front of the reader.
//
// Rationale text names Strategists as @{user:<id>} tokens (src/lib/judging/rationale.ts). Here each distinct person becomes a stable
// label ("Strategist A", "Strategist B") in order of first appearance, so the text still reads as one story. A handle typed into prose
// ("@jane") cannot be replaced safely (we do not know who it is): it is reported, and the page must not be published until an admin
// has edited it.

const TOKEN = /@\{user:([0-9a-f-]{36})\}/g;
const STRAY = /(?<![\w@{])@[A-Za-z0-9_]{2,}/g;

/** "A", "B", ... "Z", "AA", "AB", ... for index 0, 1, ... */
export function letterLabel(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export type Anonymised = {
  text: string;
  /** Distinct Strategists replaced. */
  people: number;
  /** Handles typed into the prose: the text is NOT safe to publish while this is not empty. */
  strayHandles: string[];
};

export function anonymiseRationale(text: string, labels?: Map<string, string>): Anonymised {
  const map = labels ?? new Map<string, string>();
  const replaced = text.replace(TOKEN, (_, id: string) => {
    if (!map.has(id)) map.set(id, `Strategist ${letterLabel(map.size)}`);
    return map.get(id)!;
  });
  return { text: replaced, people: map.size, strayHandles: [...new Set(replaced.match(STRAY) ?? [])] };
}

/**
 * Several texts of one Verdict (the rationale, each award's reason, the winning case) with ONE shared labelling, so "Strategist A"
 * means the same person throughout the page.
 */
export function anonymiseAll(texts: string[]): { texts: string[]; people: number; strayHandles: string[] } {
  const labels = new Map<string, string>();
  const parts = texts.map((t) => anonymiseRationale(t, labels));
  return { texts: parts.map((p) => p.text), people: labels.size, strayHandles: [...new Set(parts.flatMap((p) => p.strayHandles))] };
}
