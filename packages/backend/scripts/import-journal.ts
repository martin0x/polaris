import { importJsonl } from "./lib/convexRun";

// Playbook step 2 for the journal: topics, then parent links, then entries.
// Idempotent — rerunning re-upserts by legacyId.
const [dir, ...flags] = process.argv.slice(2);
if (!dir) {
  console.error("usage: bun scripts/import-journal.ts <jsonl-dir> [--prod]");
  process.exit(1);
}

await importJsonl(
  dir,
  [
    ["journal-topics.jsonl", "journal/migrations:importTopics"],
    ["journal-topic-parents.jsonl", "journal/migrations:linkTopicParents"],
    ["journal-entries.jsonl", "journal/migrations:importEntries"],
  ],
  { prod: flags.includes("--prod") }
);
