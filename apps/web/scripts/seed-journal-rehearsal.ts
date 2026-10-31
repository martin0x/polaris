import { prisma } from "../src/platform/db/client";

// Real-shaped journal rows for the copy rehearsal, LOCAL Postgres only
// (playbook §06: an almost-empty table passes every checksum and proves
// nothing). Fixed ids, so reruns update in place instead of duplicating.
const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Refusing to seed: DATABASE_URL is not a localhost database.");
  process.exit(1);
}

const DAY = 86_400_000;
const now = Date.now();
const WORDS = [
  "deploy", "convex", "search", "index", "react", "hooks", "migration", "schema", "testing", "build",
  "vercel", "postgres", "journal", "habits", "palette", "refactor", "reading", "coffee", "notes", "shipping",
];
const TAGS = ["build", "ops", "reading", "bug"];

const topics = [
  { id: "rehearsal-topic-builds", name: "Rehearsal · Builds", archived: false, parentId: null },
  { id: "rehearsal-topic-ops", name: "Rehearsal · Ops", archived: false, parentId: "rehearsal-topic-builds" },
  { id: "rehearsal-topic-reading", name: "Rehearsal · Reading", archived: false, parentId: null },
  { id: "rehearsal-topic-archived", name: "Rehearsal · Archived", archived: true, parentId: null },
];
for (const t of topics) {
  const data = {
    name: t.name,
    description: "Seeded for the phase 3 rehearsal",
    archived: t.archived,
    archivedAt: t.archived ? new Date(now - 10 * DAY) : null,
    parentId: t.parentId,
  };
  await prisma.journalTopic.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });
}

const ENTRY_COUNT = 48; // about four months, every 2.5 days
for (let i = 0; i < ENTRY_COUNT; i++) {
  const words = Array.from({ length: 6 + (i % 5) }, (_, k) => WORDS[(i * 7 + k * 3) % WORDS.length]);
  const tags =
    i % 3 === 0 ? [TAGS[i % TAGS.length]]
    : i % 5 === 0 ? [TAGS[i % TAGS.length], TAGS[(i + 1) % TAGS.length]]
    : [];
  const tasks = i % 7 === 0 ? "\n\n- [ ] follow up\n- [x] done" : "";
  const body = [words.join(" "), ...tags.map((t) => `#${t}`)].join(" ") + tasks;
  const createdAt = new Date(now - i * 2.5 * DAY);
  const data = {
    topicId: topics[i % topics.length].id,
    title: i % 4 === 0 ? `Rehearsal entry ${i}` : null,
    body,
    tags, // matches extractTags(body)
    deletedAt: i % 16 === 5 ? new Date(createdAt.getTime() + DAY) : null,
    createdAt,
  };
  const id = `rehearsal-entry-${String(i).padStart(2, "0")}`;
  await prisma.journalEntry.upsert({ where: { id }, create: { id, ...data }, update: data });
}

console.log(`seeded ${topics.length} topics and ${ENTRY_COUNT} entries into local Postgres`);
await prisma.$disconnect();
