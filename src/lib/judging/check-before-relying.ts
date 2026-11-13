// "Check before relying" (Sprint 7, W7). The AI judge cannot verify any source,
// so judges and admins are shown, next to each Dispatch, (a) the claims the
// model listed as needing a check (prompt v2) and (b) plain counts computed here
// from the text: links, figures and named studies. Nothing here caps or changes
// a score; it only tells a person where to look.

export type DispatchSource = { url: string; title?: string | null };

export type CheckCounts = {
  /** Links the author listed plus any web address typed into the text. */
  links: number;
  /** Money amounts, percentages and large or "N million" numbers. */
  figures: number;
  /** Phrases like "a 2023 UK trial", "an ONS survey", "report by the IFS", "according to Ofcom". */
  namedStudies: number;
};

const URL_RE = /https?:\/\/[^\s)<>"']+/gi;
const FIGURE_RE = /(?:[£$€]\s?\d[\d,.]*(?:\s?(?:bn|m|k|million|billion|thousand))?|\b\d[\d,.]*\s?(?:%|per cent|percent)|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s?(?:million|billion|thousand)\b)/gi;
const STUDY_NOUN = "(?:study|studies|survey|poll|trial|report|review|analysis|audit|census|inquiry|evaluation|experiment)";
const STUDY_RES = [
  new RegExp(`\\b(?:an?|the)?\\s*(?:\\d{4}\\s+)?(?:[A-Z][\\w&'-]*\\s+){1,4}${STUDY_NOUN}\\b`, "g"),
  new RegExp(`\\b${STUDY_NOUN}\\s+(?:by|from|of)\\s+(?:the\\s+)?[A-Z][\\w&'-]*`, "gi"),
  /\baccording to\s+(?:the\s+)?[A-Z][\w&'-]*/g,
];

const distinct = (matches: Iterable<string>) => new Set([...matches].map((m) => m.trim().toLowerCase().replace(/\s+/g, " "))).size;

export function countCheckSignals(body: string, sources: DispatchSource[] = []): CheckCounts {
  const typed = body.match(URL_RE) ?? [];
  const links = new Set([...sources.map((s) => String(s.url).trim().toLowerCase()), ...typed.map((u) => u.trim().replace(/[.,;:!?]+$/, "").toLowerCase())].filter(Boolean)).size;
  // Web addresses are removed first so their numbers and words are not counted as figures or studies.
  const text = body.replace(URL_RE, " ");
  const figures = distinct(text.match(FIGURE_RE) ?? []);
  const found = STUDY_RES.flatMap((re) => text.match(re) ?? []);
  return { links, figures, namedStudies: distinct(found) };
}

/** A short plain-English line for the counts, e.g. "2 links, 3 figures, 1 named study". */
export function describeCounts(c: CheckCounts): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return [n(c.links, "link", "links"), n(c.figures, "figure", "figures"), n(c.namedStudies, "named study", "named studies")].join(", ");
}

/** True when the Dispatch leans on figures or named studies but lists no link. Worth a second look; never a penalty. */
export function leansOnUnlinkedClaims(c: CheckCounts): boolean {
  return c.links === 0 && c.figures + c.namedStudies >= 2;
}
