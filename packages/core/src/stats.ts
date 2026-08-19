// Pure credit/streak math. All inputs are yyyy-mm-dd keyed; no Date objects leak in.
import { addDays, toUtcDate } from "./dates";

export type TickStatus = "PARTIAL" | "COMPLETE";

export function creditOf(status: TickStatus | undefined): number {
  if (status === "COMPLETE") return 1;
  if (status === "PARTIAL") return 0.5;
  return 0;
}

/** Consecutive ticked days ending today; an unticked today doesn't break the
 *  streak until tomorrow (lapse research: the pending day isn't a miss yet). */
export function currentStreak(byDate: ReadonlyMap<string, TickStatus>, today: string): number {
  let cursor = byDate.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (byDate.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(byDate: ReadonlyMap<string, TickStatus>): number {
  let best = 0;
  for (const date of byDate.keys()) {
    if (byDate.has(addDays(date, -1))) continue; // not a run start
    let len = 0;
    let cursor = date;
    while (byDate.has(cursor)) {
      len += 1;
      cursor = addDays(cursor, 1);
    }
    best = Math.max(best, len);
  }
  return best;
}

/** A lapse is a run of ≥ 2 consecutive missed days within [start, end]. */
export function countLapses(
  byDate: ReadonlyMap<string, TickStatus>, start: string, end: string
): number {
  let lapses = 0;
  let missRun = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (byDate.has(d)) {
      missRun = 0;
    } else {
      missRun += 1;
      if (missRun === 2) lapses += 1;
    }
  }
  return lapses;
}

/** A habit counts for a week if it existed before the week ended and wasn't
 *  archived before the week started. */
export function isEligibleWeek(
  createdOn: string, archivedOn: string | null, weekMonday: string
): boolean {
  const weekEnd = addDays(weekMonday, 6);
  return createdOn <= weekEnd && (archivedOn === null || archivedOn >= weekMonday);
}

/** Mean credit per weekday (Monday first) across [start, end]. */
export function dayOfWeekMeans(
  byDate: ReadonlyMap<string, TickStatus>, start: string, end: string
): number[] {
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const idx = (toUtcDate(d).getUTCDay() + 6) % 7;
    sums[idx] += creditOf(byDate.get(d));
    counts[idx] += 1;
  }
  return sums.map((s, i) => (counts[i] === 0 ? 0 : s / counts[i]));
}
