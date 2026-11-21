// Normalisation for the Campaign draft helper's checks (docs/CAMPAIGN_DRAFT_HELPER_SPEC.md, "Normalisation before the checks" and
// "What counts as a date"). Pure. Used for COMPARISON ONLY: the admin always sees the model's own text. It makes formats equal and
// never values: a different figure or date never matches.

/** Text in comparison form: Unicode folded, quotes, dashes, ellipsis and whitespace made equal, lower case. */
export function normText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .toLowerCase()
    .replace(/[‘’‚′`´]/g, "'")
    .replace(/[“”„″«»]/g, '"')
    .replace(/[‐-―−⁃]/g, "-")
    .replace(/(\d)\s*-\s*(\d)/g, "$1-$2")
    .replace(/…/g, "...")
    .replace(/[\s   ]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export type DateParts = { d: number | null; m: number; y: number | null; raw: string };

const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const MONTH_INDEX: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const monthNo = (token: string) => MONTH_INDEX[token.slice(0, 3)];
const validDay = (d: number) => d >= 1 && d <= 31;
const validMonth = (m: number) => m >= 1 && m <= 12;

/**
 * Dates in already-normalised text, and the text with each date blanked out. A month name is a date only when it sits next to a
 * day number or a year ("3 March", "March 3", "March 2026"); a bare "march", "may" or "august" is an ordinary word and is ignored.
 * Numeric forms are day first (3/12/2026) or ISO (2026-12-03); two-digit years are not interpreted.
 */
export function extractDates(text: string): { dates: DateParts[]; rest: string } {
  const dates: DateParts[] = [];
  let rest = text;
  const take = (re: RegExp, make: (m: RegExpMatchArray) => Omit<DateParts, "raw"> | null) => {
    rest = rest.replace(re, (...args) => {
      const groups = args.slice(0, -2) as string[];
      const made = make(groups as unknown as RegExpMatchArray);
      if (!made) return groups[0];
      dates.push({ ...made, raw: groups[0].trim() });
      return " ";
    });
  };
  const ORD = "(?:st|nd|rd|th)?";
  // 3rd of March 2026 | 3 Mar | 12 march, 2026
  take(new RegExp(`(?<![\\d/-])(\\d{1,2})${ORD}(?:\\s+of)?\\s+${MONTH}(?:,?\\s+(\\d{4}))?(?![a-z\\d])`, "g"), (m) => {
    const d = Number(m[1]);
    return validDay(d) ? { d, m: monthNo(m[2]), y: m[3] ? Number(m[3]) : null } : null;
  });
  // March 3 | March 3rd, 2026
  take(new RegExp(`(?<![a-z])${MONTH}\\s+(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?(?![a-z\\d])`, "g"), (m) => {
    const d = Number(m[2]);
    return validDay(d) ? { d, m: monthNo(m[1]), y: m[3] ? Number(m[3]) : null } : null;
  });
  // March 2026
  take(new RegExp(`(?<![a-z])${MONTH}\\s+(\\d{4})(?![a-z\\d])`, "g"), (m) => ({ d: null, m: monthNo(m[1]), y: Number(m[2]) }));
  // 2026-12-03
  take(/(?<![\d/-])(\d{4})-(\d{1,2})-(\d{1,2})(?![\d/-])/g, (m) => (validMonth(Number(m[2])) && validDay(Number(m[3])) ? { d: Number(m[3]), m: Number(m[2]), y: Number(m[1]) } : null));
  // 3/12/2026 (day first)
  take(/(?<![\d/-])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/-])/g, (m) => (validDay(Number(m[1])) && validMonth(Number(m[2])) ? { d: Number(m[1]), m: Number(m[2]), y: Number(m[3]) } : null));
  return { dates, rest };
}

/**
 * Is a date written in the output supported by the notes? With a day: day and month must be equal and the years equal or one side
 * silent. Month and year only: the notes need a date in that month and year (any day, or no day).
 */
export function dateSupported(out: DateParts, known: DateParts[]): boolean {
  if (out.d !== null) return known.some((k) => k.m === out.m && k.d === out.d && (out.y === null || k.y === null || k.y === out.y));
  return known.some((k) => k.m === out.m && k.y === out.y);
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

export type Figure = { key: string; raw: string };

const FACTOR: Record<string, number> = { million: 1e6, billion: 1e9, thousand: 1e3, bn: 1e9 };
const canon = (v: number) => String(Number(v.toPrecision(12)));

/**
 * Figures in already-normalised text with dates removed, compared by value: 1,000 = 1000 = 1 000; £1.2 million = £1.2m = 1200000;
 * 3rd = 3; 10% = 10 % = 10 percent = 10 per cent. A percentage keeps its "%" so 10% is not 1.0%.
 * `spaceGroups` reads "12 300" as 12300 (what an output means); off, it reads two figures (the notes are read both ways).
 */
export function extractFigures(text: string, spaceGroups: boolean): Figure[] {
  const group = spaceGroups ? "[ ,]" : ",";
  const re = new RegExp(`([£$€])?\\s?(\\d{1,3}(?:${group}\\d{3})+|\\d+)(\\.\\d+)?(?:\\s?(%|percent|per[ -]?cent|million|billion|thousand|bn|m|k))?(?:st|nd|rd|th)?(?![a-z\\d])`, "g");
  const out: Figure[] = [];
  for (const m of text.matchAll(re)) {
    const [raw, cur, int, frac, unit] = m;
    let value = Number(int.replace(/[ ,]/g, "") + (frac ?? ""));
    if (Number.isNaN(value)) continue;
    let pct = false;
    if (unit === "%" || unit === "percent" || /^per[ -]?cent$/.test(unit ?? "")) pct = true;
    else if (unit && (unit === "m" || unit === "k")) {
      if (!cur) {
        // "5m" with no currency sign is not read as millions; the figure stands alone.
        out.push({ key: canon(value), raw: raw.trim().slice(0, 40) });
        continue;
      }
      value *= unit === "m" ? 1e6 : 1e3;
    } else if (unit) value *= FACTOR[unit] ?? 1;
    out.push({ key: pct ? `${canon(value)}%` : canon(value), raw: raw.trim().slice(0, 40) });
  }
  return out;
}

/** What the notes support: dates, and the set of figure values (read with and without space-grouped thousands, plus years). */
export function knownFromNotes(notes: string): { dates: DateParts[]; figures: Set<string> } {
  const n = normText(notes);
  const { dates, rest } = extractDates(n);
  const figures = new Set<string>();
  for (const f of [...extractFigures(rest, true), ...extractFigures(rest, false)]) figures.add(f.key);
  for (const d of dates) if (d.y !== null) figures.add(String(d.y));
  return { dates, figures };
}

/** Problems in one model-written string: dates and figures the notes do not support. Messages name only the rejected token (40 characters at most). */
export function figureAndDateProblems(where: string, text: string, known: { dates: DateParts[]; figures: Set<string> }): string[] {
  const problems: string[] = [];
  const { dates, rest } = extractDates(normText(text));
  for (const d of dates) if (!dateSupported(d, known.dates)) problems.push(`${where}: a date that is not in the notes: ${d.raw.slice(0, 40)}`);
  for (const f of extractFigures(rest, true)) {
    const plain = f.key.replace(/%$/, "");
    const ok = f.key.endsWith("%") ? known.figures.has(f.key) : known.figures.has(plain) || known.figures.has(`${plain}%`);
    if (!ok) problems.push(`${where}: a figure or date part that is not in the notes: ${f.raw}`);
  }
  return problems;
}
