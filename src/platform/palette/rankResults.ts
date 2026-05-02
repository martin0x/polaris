import type { PaletteResultWithMeta } from "./types";

function tier(r: PaletteResultWithMeta, q: string): number {
  const label = r.label.toLowerCase();
  const sublabel = r.sublabel?.toLowerCase() ?? "";
  if (label.startsWith(q)) return 0;
  if (label.includes(q)) return 1;
  if (sublabel.includes(q)) return 2;
  return 3;
}

export function rankResults(
  results: PaletteResultWithMeta[],
  query: string
): PaletteResultWithMeta[] {
  if (!query) return [...results];
  const q = query.toLowerCase();
  // Array.prototype.sort is stable as of ES2019, so equal tiers preserve input order.
  return [...results].sort((a, b) => tier(a, q) - tier(b, q));
}
