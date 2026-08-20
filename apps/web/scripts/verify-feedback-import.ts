import { prisma } from "../src/platform/db/client";

// Playbook verification: row counts + domain checksums (count and sum of
// value per system/name) compared between Postgres and Convex.
const prod = process.argv.includes("--prod");

const metrics = await prisma.systemMetric.findMany();
const reflectionCount = await prisma.systemReflection.count();
const iterationCount = await prisma.systemIteration.count();
const expected: Record<string, { count: number; sum: number }> = {};
for (const m of metrics) {
  const key = `${m.system}/${m.name}`;
  expected[key] ??= { count: 0, sum: 0 };
  expected[key].count += 1;
  expected[key].sum += m.value;
}
await prisma.$disconnect();

const args = ["convex", "run", "migrations:feedbackStats", "{}"];
if (prod) args.push("--prod");
const proc = Bun.spawnSync(["bunx", ...args], {
  cwd: import.meta.dir + "/../../../packages/backend",
});
if (proc.exitCode !== 0) {
  console.error(proc.stderr.toString());
  process.exit(1);
}
const stats = JSON.parse(proc.stdout.toString().trim().split("\n").at(-1)!);

let failed = false;
function check(label: string, want: number, got: number): void {
  const ok = want === got;
  if (!ok) failed = true;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: postgres=${want} convex=${got}`);
}
check("metric rows", metrics.length, stats.metricCount);
check("reflection rows", reflectionCount, stats.reflectionCount);
check("iteration rows", iterationCount, stats.iterationCount);
for (const [key, agg] of Object.entries(expected)) {
  const got = stats.metricsBySystemName[key] ?? { count: 0, sum: 0 };
  check(`count ${key}`, agg.count, got.count);
  check(`sum ${key}`, agg.sum, got.sum);
}
process.exit(failed ? 1 : 0);
