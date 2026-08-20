// Playbook step 2: JSONL → internal import mutations, batched. Idempotent —
// rerunning re-upserts by legacyId.
const [dir, ...flags] = process.argv.slice(2);
if (!dir) {
  console.error("usage: bun scripts/import-feedback.ts <jsonl-dir> [--prod]");
  process.exit(1);
}
const prod = flags.includes("--prod");
const BATCH = 200;

const files: Array<[string, string]> = [
  ["system-metrics.jsonl", "migrations:importSystemMetrics"],
  ["system-reflections.jsonl", "migrations:importSystemReflections"],
  ["system-iterations.jsonl", "migrations:importSystemIterations"],
];

for (const [file, fn] of files) {
  const path = `${dir}/${file}`;
  const text = await Bun.file(path).text().catch(() => "");
  const rows = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const args = ["convex", "run", fn, JSON.stringify({ rows: batch })];
    if (prod) args.push("--prod");
    const proc = Bun.spawnSync(["bunx", ...args], { cwd: import.meta.dir + "/.." });
    if (proc.exitCode !== 0) {
      console.error(proc.stderr.toString());
      throw new Error(`${fn} batch at offset ${i} failed`);
    }
    const result = JSON.parse(proc.stdout.toString().trim().split("\n").at(-1)!);
    inserted += result.inserted;
    updated += result.updated;
  }
  console.log(`${file}: rows=${rows.length} inserted=${inserted} updated=${updated}`);
}
