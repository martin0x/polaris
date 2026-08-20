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

// convex run pretty-prints the result (JSON.stringify(result, null, 2));
// log lines may precede it. Parse the trailing JSON block.
function parseConvexRunResult(stdout: string): unknown {
  const lines = stdout.trim().split("\n");
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    const start = lines.lastIndexOf("{");
    if (start === -1) {
      throw new Error(`No JSON result in convex run output:\n${stdout}`);
    }
    return JSON.parse(lines.slice(start).join("\n"));
  }
}

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
    const result = parseConvexRunResult(proc.stdout.toString()) as {
      inserted: number;
      updated: number;
    };
    inserted += result.inserted;
    updated += result.updated;
  }
  console.log(`${file}: rows=${rows.length} inserted=${inserted} updated=${updated}`);
}
