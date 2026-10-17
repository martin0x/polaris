import { searchTerms } from "@polaris/core/search";

// Query set for the journal search acceptance pass, drawn from the corpus
// itself (there is no log of real searches) plus any queries the user adds.

export interface CorpusEntry {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
}

const STOPWORDS = new Set([
  "about", "after", "again", "also", "been", "before", "being", "both", "could", "does",
  "doing", "down", "each", "from", "have", "having", "here", "into", "just", "like",
  "more", "most", "much", "need", "only", "other", "over", "same", "should", "some",
  "such", "than", "that", "their", "them", "then", "there", "these", "they", "this",
  "those", "through", "very", "want", "were", "what", "when", "where", "which", "while",
  "will", "with", "would", "your",
]);

function byCount(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key]) => key);
}

export function buildQuerySet(entries: CorpusEntry[], extra: string[] = []): string[] {
  const wordFreq = new Map<string, number>(); // number of entries containing the word
  const wordsByEntry: Array<Set<string>> = [];
  for (const e of entries) {
    const words = new Set(
      searchTerms(`${e.title ?? ""} ${e.body}`).filter(
        (w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w)
      )
    );
    wordsByEntry.push(words);
    for (const w of words) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }
  const topWords = byCount(wordFreq).slice(0, 12);

  const tagFreq = new Map<string, number>();
  for (const e of entries) for (const tag of e.tags) tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
  const topTags = byCount(tagFreq).slice(0, 6);

  const pairFreq = new Map<string, number>();
  for (let i = 0; i < topWords.length; i++) {
    for (let j = i + 1; j < topWords.length; j++) {
      const n = wordsByEntry.filter((w) => w.has(topWords[i]) && w.has(topWords[j])).length;
      if (n >= 2) pairFreq.set(`${topWords[i]} ${topWords[j]}`, n);
    }
  }
  const pairs = byCount(pairFreq).slice(0, 6);

  // Partial words: where prefix matching (new) and stemming (old) differ most.
  const prefixes = topWords.filter((w) => w.length >= 7).slice(0, 6).map((w) => w.slice(0, 4));

  const extras = extra.map((q) => q.trim()).filter((q) => q.length > 0);
  return [...new Set([...topWords, ...topTags, ...pairs, ...prefixes, ...extras])];
}

export interface Comparison {
  query: string;
  postgres: string[];
  convex: string[];
  shared: number;
  onlyPostgres: string[];
  onlyConvex: string[];
}

export function compareResults(query: string, postgres: string[], convex: string[]): Comparison {
  const inConvex = new Set(convex);
  const inPostgres = new Set(postgres);
  return {
    query,
    postgres,
    convex,
    shared: postgres.filter((id) => inConvex.has(id)).length,
    onlyPostgres: postgres.filter((id) => !inConvex.has(id)),
    onlyConvex: convex.filter((id) => !inPostgres.has(id)),
  };
}

/** Share of Postgres hits Convex also returns, pooled across queries;
 *  1 when Postgres found nothing at all. */
export function overallRecall(rows: Comparison[]): number {
  const total = rows.reduce((n, r) => n + r.postgres.length, 0);
  return total === 0 ? 1 : rows.reduce((n, r) => n + r.shared, 0) / total;
}

export interface Summary {
  recall: number;
  judged: number;
  missesNothing: number;
  postgresEmpty: number;
  convexOnlyWhenPostgresEmpty: number;
}

/** Headline numbers for the report. "miss nothing" is only meaningful for
 *  queries Postgres itself answered — a query where Postgres found 0 trivially
 *  has no `onlyPostgres`, so it's tracked separately, not folded into
 *  `missesNothing` (that would overstate Convex's coverage). */
export function summarize(rows: Comparison[]): Summary {
  const judgedRows = rows.filter((r) => r.postgres.length > 0);
  const postgresEmptyRows = rows.filter((r) => r.postgres.length === 0);
  return {
    recall: overallRecall(rows),
    judged: judgedRows.length,
    missesNothing: judgedRows.filter((r) => r.onlyPostgres.length === 0).length,
    postgresEmpty: postgresEmptyRows.length,
    convexOnlyWhenPostgresEmpty: postgresEmptyRows.filter((r) => r.convex.length > 0).length,
  };
}
