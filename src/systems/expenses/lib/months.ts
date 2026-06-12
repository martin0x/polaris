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
