/**
 * search_tgs() marks matches with ⟦ and ⟧. Split on them so the page can wrap
 * matches in <mark> without ever treating text as HTML.
 */
export function splitHighlights(snippet: string): { text: string; match: boolean }[] {
  const parts: { text: string; match: boolean }[] = [];
  const re = /⟦([^⟧]*)⟧/g;
  let last = 0;
  for (const m of snippet.matchAll(re)) {
    if (m.index > last) parts.push({ text: snippet.slice(last, m.index), match: false });
    parts.push({ text: m[1], match: true });
    last = m.index + m[0].length;
  }
  if (last < snippet.length) parts.push({ text: snippet.slice(last), match: false });
  return parts.filter((p) => p.text);
}
