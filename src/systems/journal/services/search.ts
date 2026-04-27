import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/platform/db/client";
import type { JournalEntryWithTopic } from "./entries";

export interface SearchInput {
  q: string;
  topicId?: string;
  limit?: number;
}

interface RankedIdRow {
  id: string;
}

export async function searchEntries(input: SearchInput): Promise<JournalEntryWithTopic[]> {
  const { q, topicId, limit = 20 } = input;
  const trimmed = q.trim();

  const topicFilter = topicId
    ? Prisma.sql`AND e."topicId" = ${topicId}`
    : Prisma.empty;

  // Step 1: rank ids in the right order via the FTS index, then re-hydrate the
  // full entries (with topic relation) through Prisma so the type matches the
  // rest of the system. Two queries, both small — the GIN index does the work.
  const idRows = trimmed
    ? await prisma.$queryRaw<RankedIdRow[]>`
        SELECT e.id
        FROM journal_entries e
        WHERE e."deletedAt" IS NULL
          ${topicFilter}
          AND e.search_vector @@ to_tsquery('english', ${tsQuery(trimmed)})
        ORDER BY ts_rank(e.search_vector, to_tsquery('english', ${tsQuery(trimmed)})) DESC
        LIMIT ${limit};
      `
    : await prisma.$queryRaw<RankedIdRow[]>`
        SELECT e.id
        FROM journal_entries e
        WHERE e."deletedAt" IS NULL
          ${topicFilter}
        ORDER BY e."createdAt" DESC
        LIMIT ${limit};
      `;

  if (idRows.length === 0) return [];

  const entries = await prisma.journalEntry.findMany({
    where: { id: { in: idRows.map((r) => r.id) } },
    include: { topic: true },
  });

  const order = new Map(idRows.map((r, i) => [r.id, i]));
  return entries.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function tsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((tok) => /^[a-zA-Z0-9_-]+$/.test(tok))
    .join(" & ");
}
