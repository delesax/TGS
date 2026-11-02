/**
 * Reads the query string of an email confirmation link. Email templates
 * HTML-escape "&" as "&amp;", so a link can arrive as "?code=x&amp;next=/y",
 * which a URL parser reads as a key named "amp;next". Strip that prefix.
 */
export function readConfirmParams(searchParams: URLSearchParams): Map<string, string> {
  const params = new Map<string, string>();
  for (const [key, value] of searchParams) {
    params.set(key.replace(/^(amp;)+/, ""), value);
  }
  return params;
}
