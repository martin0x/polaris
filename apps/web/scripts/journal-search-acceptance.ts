import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { convexRun } from "@polaris/backend/scripts/convex-run";
import { prisma } from "../src/platform/db/client";
import { buildQuerySet, compareResults, overallRecall, type Comparison } from "./lib/searchQueries";

// Search acceptance pass (docs/replatform.md §08): the same queries through
// the old Postgres full-text search and the new Convex search, side by side.
// Exits 0 — the verdict belongs to the person reading the report.
//   bun scripts/journal-search-acceptance.ts [--prod] [--queries <file, one per line>]
// The terminal gets counts only; titles go to the git-ignored report file.
const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const queriesAt = argv.indexOf("--queries");
const extra = queriesAt >= 0 ? readFileSync(argv[queriesAt + 1], "utf8").split("\n") : [];
const LIMIT = 50;

// The old apps/web/src/systems/journal/services/search.ts query, verbatim.
function tsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((tok) => /^[a-zA-Z0-9_-]+$/.test(tok))
    .join(" & ");
}

async function postgresSearch(q: string): Promise<string[]> {
  const tsq = tsQuery(q.trim());
  if (!tsq) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT e.id
    FROM journal_entries e
    WHERE e."deletedAt" IS NULL
      AND e.search_vector @@ to_tsquery('english', ${tsq})
    ORDER BY ts_rank(e.search_vector, to_tsquery('english', ${tsq})) DESC
    LIMIT ${LIMIT};
  `;
  return rows.map((r) => r.id);
}

const corpus = await prisma.journalEntry.findMany({
  where: { deletedAt: null },
  select: { id: true, title: true, body: true, tags: true },
});
const queries = buildQuerySet(corpus, extra);
const rows: Comparison[] = [];
for (const q of queries) {
  const postgres = await postgresSearch(q);
  const convex = convexRun("journal/migrations:searchProbe", { q, limit: LIMIT }, { prod }) as string[];
  rows.push(compareResults(q, postgres, convex));
}
await prisma.$disconnect();

const label = new Map(corpus.map((e) => [e.id, e.title ?? e.body.split("\n", 1)[0].slice(0, 60)]));
const cell = (s: string) => s.replace(/\|/g, "\\|");
const titles = (ids: string[]) =>
  ids.slice(0, 3).map((id) => `"${cell(label.get(id) ?? id)}"`).join(", ") +
  (ids.length > 3 ? ` +${ids.length - 3} more` : "");

const missesNothing = rows.filter((r) => r.onlyPostgres.length === 0).length;
const summary =
  `${corpus.length} live entries, ${rows.length} queries (${prod ? "production" : "dev"} Convex). ` +
  `Convex found ${Math.round(overallRecall(rows) * 100)}% of what Postgres found; ` +
  `${missesNothing} of ${rows.length} queries miss nothing.`;
const countsTable = [
  "| Query | Postgres | Convex | Both |",
  "|---|---|---|---|",
  ...rows.map((r) => `| ${cell(r.query)} | ${r.postgres.length} | ${r.convex.length} | ${r.shared} |`),
];
const detailTable = [
  "| Query | Postgres | Convex | Both | Only Postgres finds | Only Convex finds |",
  "|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${cell(r.query)} | ${r.postgres.length} | ${r.convex.length} | ${r.shared} | ${titles(r.onlyPostgres)} | ${titles(r.onlyConvex)} |`
  ),
];

const outDir = join(import.meta.dir, "out");
mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "search-acceptance.md");
writeFileSync(
  reportPath,
  [`# Journal search acceptance — ${new Date().toISOString().slice(0, 10)}`, "", summary, "", ...detailTable, ""].join("\n")
);
console.log([summary, "", ...countsTable, "", `Details with titles: ${reportPath}`].join("\n"));
