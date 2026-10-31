import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/platform/db/client";

// Playbook step 1 for the journal: Postgres → JSONL, cuids kept, dates as ms.
const outDir = join(import.meta.dir, "out");
mkdirSync(outDir, { recursive: true });

function writeJsonl(file: string, rows: unknown[]): void {
  writeFileSync(join(outDir, file), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
}

const topics = await prisma.journalTopic.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "journal-topics.jsonl",
  topics.map((t) => ({
    legacyId: t.id,
    name: t.name,
    ...(t.description === null ? {} : { description: t.description }),
    archived: t.archived,
    ...(t.archivedAt === null ? {} : { archivedAt: t.archivedAt.getTime() }),
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
  }))
);

// Written even when empty: the import driver treats a missing file as an error.
const parents = topics.filter((t) => t.parentId !== null);
writeJsonl(
  "journal-topic-parents.jsonl",
  parents.map((t) => ({ legacyId: t.id, legacyParentId: t.parentId! }))
);

const entries = await prisma.journalEntry.findMany({
  orderBy: { createdAt: "asc" },
  select: {
    id: true, topicId: true, title: true, body: true, tags: true,
    deletedAt: true, createdAt: true, updatedAt: true,
  },
});
writeJsonl(
  "journal-entries.jsonl",
  entries.map((e) => ({
    legacyId: e.id,
    legacyTopicId: e.topicId,
    ...(e.title === null || e.title === "" ? {} : { title: e.title }),
    body: e.body,
    tags: e.tags,
    ...(e.deletedAt === null ? {} : { deletedAt: e.deletedAt.getTime() }),
    createdAt: e.createdAt.getTime(),
    updatedAt: e.updatedAt.getTime(),
  }))
);

console.log(
  `exported topics=${topics.length} parents=${parents.length} entries=${entries.length} → ${outDir}`
);
await prisma.$disconnect();
