// Journal search helpers shared by the Convex search query and the web
// acceptance script. Tokenizing mirrors Convex's search index (Tantivy's
// SimpleTokenizer): lowercase, split on anything that isn't a letter or digit.

const NON_WORD = /[^\p{L}\p{N}]+/u;

export function searchTerms(text: string): string[] {
  return [...new Set(text.toLowerCase().split(NON_WORD).filter((t) => t.length > 0))];
}

/** True when every term starts some word of `text`. The old Postgres search
 *  ANDed its terms; Convex's index matches any one of them, so the journal
 *  search query keeps only candidates that pass this. */
export function matchesAllTerms(text: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const words = searchTerms(text);
  return terms.every((term) => words.some((word) => word.startsWith(term)));
}
