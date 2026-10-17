import { convexRun } from "@polaris/backend/scripts/convex-run";
import { prisma } from "../src/platform/db/client";

// Playbook verification for the journal: row counts, live entries and body
// characters per topic, live entries per tag, then a field-by-field check of
// a sample of entries spread across the history. --prod targets production.
const prod = process.argv.includes("--prod");
const SAMPLE_SIZE = 20;

const [topics, entries] = await Promise.all([
  prisma.journalTopic.findMany(),
  prisma.journalEntry.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, topicId: true, title: true, body: true, tags: true,
      deletedAt: true, createdAt: true, updatedAt: true,
    },
  }),
]);
await prisma.$disconnect();

const liveByTopic = new Map<string, number>();
const charsByTopic = new Map<string, number>();
const tagCounts = new Map<string, number>();
let deleted = 0;
for (const e of entries) {
  if (e.deletedAt !== null) {
    deleted++;
    continue;
  }
  liveByTopic.set(e.topicId, (liveByTopic.get(e.topicId) ?? 0) + 1);
  charsByTopic.set(e.topicId, (charsByTopic.get(e.topicId) ?? 0) + e.body.length);
  for (const tag of e.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
}

type Pairs = Array<[string, number]>;
const stats = convexRun("journal/migrations:stats", {}, { prod }) as {
  topicCount: number;
  archivedTopicCount: number;
  parentLinkCount: number;
  entryCount: number;
  deletedEntryCount: number;
  liveEntriesByTopic: Pairs;
  liveBodyCharsByTopic: Pairs;
  liveTagCounts: Pairs;
};

let failed = false;
function check(label: string, want: unknown, got: unknown): void {
  const ok = JSON.stringify(want) === JSON.stringify(got);
  if (!ok) failed = true;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: postgres=${JSON.stringify(want)} convex=${JSON.stringify(got)}`);
}
function checkCounts(label: string, want: Map<string, number>, got: Pairs): void {
  const gotMap = new Map(got);
  for (const key of new Set([...want.keys(), ...gotMap.keys()])) {
    check(`${label} ${key}`, want.get(key) ?? 0, gotMap.get(key) ?? 0);
  }
}

check("topic rows", topics.length, stats.topicCount);
check("archived topics", topics.filter((t) => t.archived).length, stats.archivedTopicCount);
check("parent links", topics.filter((t) => t.parentId !== null).length, stats.parentLinkCount);
check("entry rows", entries.length, stats.entryCount);
check("deleted entries", deleted, stats.deletedEntryCount);
checkCounts("live entries in topic", liveByTopic, stats.liveEntriesByTopic);
checkCounts("body characters in topic", charsByTopic, stats.liveBodyCharsByTopic);
checkCounts("live entries tagged", tagCounts, stats.liveTagCounts);

// Side-by-side sample, evenly spaced from oldest to newest. Prints field
// names only, never entry text.
const step = Math.max(1, Math.floor(entries.length / SAMPLE_SIZE));
const sample = entries.filter((_, i) => i % step === 0).slice(0, SAMPLE_SIZE);
type Converted = {
  legacyTopicId: string | null; title: string | null; body: string; tags: string[];
  deletedAt: number | null; createdAt: number; updatedAt: number;
} | null;
const converted = convexRun(
  "journal/migrations:entriesByLegacyIds",
  { legacyIds: sample.map((e) => e.id) },
  { prod }
) as Converted[];
const FIELDS = ["legacyTopicId", "title", "body", "tags", "deletedAt", "createdAt", "updatedAt"] as const;
sample.forEach((e, i) => {
  const want = {
    legacyTopicId: e.topicId,
    title: e.title === "" ? null : e.title,
    body: e.body,
    tags: [...e.tags].sort(),
    deletedAt: e.deletedAt?.getTime() ?? null,
    createdAt: e.createdAt.getTime(),
    updatedAt: e.updatedAt.getTime(),
  };
  const row = converted[i];
  if (row === null) {
    check(`entry ${e.id}`, "present", "missing");
    return;
  }
  const got = { ...row, tags: [...row.tags].sort() };
  const diffs = FIELDS.filter((f) => JSON.stringify(want[f]) !== JSON.stringify(got[f]));
  check(`entry ${e.id}`, "same fields", diffs.length === 0 ? "same fields" : `differs in ${diffs.join(", ")}`);
});
process.exit(failed ? 1 : 0);
