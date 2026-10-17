import { chunkRows, parseConvexRunResult, parseJsonl } from "./batching";

export { parseConvexRunResult };

// packages/backend — where `convex run` finds the project and its .env.local.
const BACKEND_DIR = `${import.meta.dir}/../..`;

/** Runs one Convex function through the CLI and returns its parsed result. */
export function convexRun(fn: string, args: unknown, opts: { prod: boolean }): unknown {
  const argv = ["bunx", "convex", "run", fn, JSON.stringify(args)];
  if (opts.prod) argv.push("--prod");
  const proc = Bun.spawnSync(argv, { cwd: BACKEND_DIR });
  if (proc.exitCode !== 0) {
    throw new Error(`${fn} failed:\n${proc.stderr.toString()}`);
  }
  return parseConvexRunResult(proc.stdout.toString());
}

export async function readJsonl(path: string): Promise<unknown[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`Missing ${path} — run the export first`);
  return parseJsonl(await file.text());
}

/** Playbook step 2: each JSONL file, in order, batched into its internal
 *  import mutation. Prints the summed counts the mutations return. */
export async function importJsonl(
  dir: string,
  files: Array<[file: string, fn: string]>,
  opts: { prod: boolean }
): Promise<void> {
  for (const [file, fn] of files) {
    const rows = await readJsonl(`${dir}/${file}`);
    const totals: Record<string, number> = {};
    for (const batch of chunkRows(rows)) {
      const result = convexRun(fn, { rows: batch }, opts) as Record<string, number>;
      for (const [key, value] of Object.entries(result)) totals[key] = (totals[key] ?? 0) + value;
    }
    const counts = Object.entries(totals).map(([k, v]) => `${k}=${v}`).join(" ");
    console.log(`${file}: rows=${rows.length} ${counts}`.trimEnd());
  }
}
