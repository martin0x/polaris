import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/platform/db/client";

const outDir = join(import.meta.dir, "out");
mkdirSync(outDir, { recursive: true });

function writeJsonl(file: string, rows: unknown[]): void {
  writeFileSync(
    join(outDir, file),
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")
  );
}

const types = await prisma.expenseActivityType.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "expense-types.jsonl",
  types.map((t) => ({
    legacyId: t.id,
    name: t.name,
    position: t.position,
    archived: t.archived,
    ...(t.archivedAt === null ? {} : { archivedAt: t.archivedAt.getTime() }),
    createdAt: t.createdAt.getTime(),
  }))
);

const activities = await prisma.expenseActivity.findMany({ orderBy: { startedAt: "asc" } });
writeJsonl(
  "expense-activities.jsonl",
  activities.map((a) => ({
    legacyId: a.id,
    legacyTypeId: a.typeId,
    ...(a.title === null ? {} : { title: a.title }),
    startedAt: a.startedAt.getTime(),
  }))
);

const items = await prisma.expenseItem.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "expense-items.jsonl",
  items.map((i) => ({
    legacyId: i.id,
    legacyActivityId: i.activityId,
    name: i.name,
    amountCentavos: i.amountCentavos,
    position: i.position,
  }))
);

console.log(
  `exported types=${types.length} activities=${activities.length} items=${items.length} → ${outDir}`
);
await prisma.$disconnect();
