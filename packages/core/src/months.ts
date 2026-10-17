/** All month bucketing is done in Asia/Manila (single-user system; UTC+8, no DST). */
export const MANILA_TZ = "Asia/Manila";

export interface MonthBucket {
  key: string; // "2026-06"
  label: string; // "Jun"
}

const KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "2-digit",
});

export function manilaMonthKey(d: Date): string {
  return KEY_FORMAT.format(d); // en-CA yields "YYYY-MM"
}

export function lastNMonthKeys(n: number, now: Date): MonthBucket[] {
  const [year, month] = manilaMonthKey(now).split("-").map(Number);
  const out: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    out.push({ key, label });
  }
  return out;
}

/** Start of the given "YYYY-MM" bucket as an absolute instant (Manila is UTC+8). */
export function manilaMonthStart(key: string): Date {
  return new Date(`${key}-01T00:00:00+08:00`);
}

// ── Intl-free variants ──────────────────────────────────────────────────────
// Manila is UTC+8 with no DST, so calendar math is a fixed offset. These are
// safe in runtimes without full ICU (Convex functions, Hermes on mobile).

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function manilaMonthKeyFromMs(ms: number): string {
  const d = new Date(ms + MANILA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function manilaDayKeyFromMs(ms: number): string {
  const d = new Date(ms + MANILA_OFFSET_MS);
  return `${manilaMonthKeyFromMs(ms)}-${pad2(d.getUTCDate())}`;
}

export function lastNMonthKeysFromMs(n: number, nowMs: number): MonthBucket[] {
  const [year, month] = manilaMonthKeyFromMs(nowMs).split("-").map(Number);
  const out: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push({
      key: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`,
      label: MONTH_LABELS[d.getUTCMonth()],
    });
  }
  return out;
}

export function manilaMonthStartMs(key: string): number {
  return Date.parse(`${key}-01T00:00:00+08:00`);
}
