import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/platform/db/client";

// Playbook step 1 (docs/replatform.md §06): Postgres → JSONL, cuids intact
// as legacyId, DateTime → ms numbers.
const outDir = join(import.meta.dir, "out");
mkdirSync(outDir, { recursive: true });

function writeJsonl(file: string, rows: unknown[]): void {
  writeFileSync(
    join(outDir, file),
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""),
  );
}

const metrics = await prisma.systemMetric.findMany({ orderBy: { recordedAt: "asc" } });
writeJsonl(
  "system-metrics.jsonl",
  metrics.map((m) => ({
    legacyId: m.id,
    system: m.system,
    name: m.name,
    value: m.value,
    recordedAt: m.recordedAt.getTime(),
  })),
);

const reflections = await prisma.systemReflection.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "system-reflections.jsonl",
  reflections.map((r) => ({
    legacyId: r.id,
    system: r.system,
    content: r.content,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    ideas: r.ideas,
    createdAt: r.createdAt.getTime(),
  })),
);

const iterations = await prisma.systemIteration.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "system-iterations.jsonl",
  iterations.map((i) => ({
    legacyId: i.id,
    system: i.system,
    description: i.description,
    reason: i.reason,
    ...(i.outcome === null ? {} : { outcome: i.outcome }),
    createdAt: i.createdAt.getTime(),
  })),
);

console.log(
  `exported metrics=${metrics.length} reflections=${reflections.length} iterations=${iterations.length} → ${outDir}`,
);
await prisma.$disconnect();
