// Pure helpers for the data-copy scripts (docs/replatform.md §06). No Bun APIs
// in this file, so the backend test suite can import it.

export const MAX_BATCH_ROWS = 200;
// Each batch rides on the `convex run` command line, and macOS caps arguments
// plus environment at 1 MiB (ARG_MAX).
export const MAX_BATCH_BYTES = 512 * 1024;

export function chunkRows<T>(
  rows: T[],
  maxRows: number = MAX_BATCH_ROWS,
  maxBytes: number = MAX_BATCH_BYTES
): T[][] {
  const encoder = new TextEncoder();
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length + 1; // + separator
    if (size > maxBytes) {
      throw new Error(`A single row is ${size} bytes — over the ${maxBytes}-byte batch limit`);
    }
    if (current.length > 0 && (current.length === maxRows || bytes + size > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** `convex run` pretty-prints its result, and log lines may come first. Try
 *  the last line on its own, then every line that opens a top-level object or
 *  array, from the bottom up. */
export function parseConvexRunResult(stdout: string): unknown {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const head = lines[i].trimEnd();
    if (i === lines.length - 1 || head === "{" || head === "[") {
      try {
        return JSON.parse(lines.slice(i).join("\n"));
      } catch {
        // not the start of the result — keep scanning up
      }
    }
  }
  throw new Error(`No JSON result in convex run output:\n${stdout}`);
}

export function parseJsonl(text: string): unknown[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}
