// Pure date-string math for the habits system. Dates are yyyy-mm-dd strings;
// Date objects only exist transiently, pinned to UTC midnight.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toUtcDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = toUtcDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateString(d);
}

/** ISO week: Monday start. */
export function mondayOf(s: string): string {
  const day = toUtcDate(s).getUTCDay(); // 0 = Sunday
  return addDays(s, -((day + 6) % 7));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Server-side "today" — single-user platform, one timezone anchor. */
export function todayString(tz: string = process.env.POLARIS_TZ ?? "Asia/Manila"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(Date.now()));
}

/** Client-side "today" from the browser clock. */
export function localTodayString(): string {
  const d = new Date(Date.now());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDayShort(s: string): string {
  const d = toUtcDate(s);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** En-dash ranges per the design system: Jul 20–26, 2026 / Jun 29 – Jul 5, 2026. */
export function formatWeekRange(monday: string): string {
  const a = toUtcDate(monday);
  const b = toUtcDate(addDays(monday, 6));
  const [ma, mb] = [MONTHS[a.getUTCMonth()], MONTHS[b.getUTCMonth()]];
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${ma} ${a.getUTCDate()}, ${a.getUTCFullYear()} – ${mb} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) {
    return `${ma} ${a.getUTCDate()} – ${mb} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
  }
  return `${ma} ${a.getUTCDate()}–${b.getUTCDate()}, ${b.getUTCFullYear()}`;
}

function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour === "24" ? "0" : p.hour), Number(p.minute), Number(p.second)
  );
  return asUtc - at.getTime();
}

/** UTC instant of 12:00 in `tz` on the given day — noon keeps a backdated
 * entry on the intended calendar day for any viewer timezone within ±12h. */
export function noonInTz(s: string, tz: string = process.env.POLARIS_TZ ?? "Asia/Manila"): Date {
  const noonUtc = new Date(`${s}T12:00:00Z`);
  return new Date(noonUtc.getTime() - tzOffsetMs(noonUtc, tz));
}

/** Group an ISO timestamp into the browser's local calendar day. */
export function localDayOf(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
