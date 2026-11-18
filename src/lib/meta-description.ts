/**
 * A search-result description (about 155 characters) derived from a Campaign's public summary.
 * Whitespace is collapsed, the cut falls on a word boundary, and an unfinished draft summary
 * ("DRAFT: ...") or an empty one gives null so the page falls back to the site description.
 */
export const META_DESCRIPTION_MAX = 155;

export function metaDescription(text: string | null | undefined, prefix = ""): string | null {
  const body = (text ?? "").replace(/\s+/g, " ").trim();
  if (!body || /^DRAFT\b/i.test(body)) return null;
  const full = `${prefix}${body}`;
  if (full.length <= META_DESCRIPTION_MAX) return full;
  const room = META_DESCRIPTION_MAX - 1; // one character for the ellipsis
  const cut = full.slice(0, room + 1);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (lastSpace > room * 0.6 ? cut.slice(0, lastSpace) : full.slice(0, room)).replace(/[\s,;:.\-–—]+$/, "");
  return `${head}…`;
}
