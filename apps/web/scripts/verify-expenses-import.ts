import { manilaMonthKey } from "@polaris/core/months";
import { prisma } from "../src/platform/db/client";

// Playbook verification: row counts + per-Manila-month centavo sums + per-type
// activity counts, compared between Postgres and Convex.
const prod = process.argv.includes("--prod");

const [types, activities, items] = await Promise.all([
  prisma.expenseActivityType.findMany(),
  prisma.expenseActivity.findMany(),
  prisma.expenseItem.findMany(),
]);
const monthByActivity = new Map(activities.map((a) => [a.id, manilaMonthKey(a.startedAt)]));
const nameByType = new Map(types.map((t) => [t.id, t.name]));
const centavosByMonth: Record<string, number> = {};
for (const i of items) {
  const month = monthByActivity.get(i.activityId);
  if (month === undefined) continue;
  centavosByMonth[month] = (centavosByMonth[month] ?? 0) + i.amountCentavos;
}
const activitiesByType: Record<string, number> = {};
for (const a of activities) {
  const name = nameByType.get(a.typeId) ?? "(unknown)";
  activitiesByType[name] = (activitiesByType[name] ?? 0) + 1;
}
await prisma.$disconnect();

const args = ["convex", "run", "migrations:expenseStats", "{}"];
if (prod) args.push("--prod");
const proc = Bun.spawnSync(["bunx", ...args], { cwd: import.meta.dir + "/../../../packages/backend" });
if (proc.exitCode !== 0) {
  console.error(proc.stderr.toString());
  process.exit(1);
}
// convex run pretty-prints; log lines may precede the JSON — parse the tail.
function parseConvexRunResult(stdout: string): unknown {
  const lines = stdout.trim().split("\n");
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    const start = lines.lastIndexOf("{");
    if (start === -1) throw new Error(`No JSON result in convex run output:\n${stdout}`);
    return JSON.parse(lines.slice(start).join("\n"));
  }
}
const stats = parseConvexRunResult(proc.stdout.toString()) as {
  typeCount: number;
  activityCount: number;
  itemCount: number;
  centavosByMonth: Record<string, number>;
  activitiesByType: Record<string, number>;
};

let failed = false;
function check(label: string, want: number, got: number): void {
  const ok = want === got;
  if (!ok) failed = true;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: postgres=${want} convex=${got}`);
}
check("type rows", types.length, stats.typeCount);
check("activity rows", activities.length, stats.activityCount);
check("item rows", items.length, stats.itemCount);
for (const month of new Set([...Object.keys(centavosByMonth), ...Object.keys(stats.centavosByMonth)])) {
  check(`centavos ${month}`, centavosByMonth[month] ?? 0, stats.centavosByMonth[month] ?? 0);
}
for (const name of new Set([...Object.keys(activitiesByType), ...Object.keys(stats.activitiesByType)])) {
  check(`activities "${name}"`, activitiesByType[name] ?? 0, stats.activitiesByType[name] ?? 0);
}
process.exit(failed ? 1 : 0);
