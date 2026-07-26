import { prisma } from "@/platform/db/client";
import { addDays, formatDayShort, mondayOf, toDateString, toUtcDate, todayString } from "../lib/dates";
import {
  countLapses, creditOf, currentStreak, dayOfWeekMeans, isEligibleWeek,
  longestStreak, type TickStatus,
} from "../lib/stats";

export interface ChartsData {
  weeks: Array<{ label: string; complete: number; partial: number }>;
  streaks: Array<{ id: string; name: string; current: number; longest: number; lapses90: number }>;
  weekday: Array<{ id: string; name: string; means: number[] }>;
  calendar: Array<{ date: string; intensity: number }>;
  hasTicks: boolean;
}

const maxDate = (a: string, b: string): string => (a > b ? a : b);

export async function getChartsData(): Promise<ChartsData> {
  const today = todayString();
  const thisMonday = mondayOf(today);
  const firstMonday = addDays(thisMonday, -77); // 12 weeks including the current one
  const calStart = addDays(today, -90);         // 91 calendar days
  const windowStart = calStart < firstMonday ? calStart : firstMonday;

  const [habits, ticks] = await Promise.all([
    prisma.habit.findMany(), // archived habits still count for the weeks they lived
    prisma.habitTick.findMany({ where: { date: { gte: toUtcDate(windowStart) } } }),
  ]);

  const byHabit = new Map<string, Map<string, TickStatus>>();
  for (const t of ticks) {
    const m = byHabit.get(t.habitId) ?? new Map<string, TickStatus>();
    m.set(toDateString(t.date), t.status);
    byHabit.set(t.habitId, m);
  }
  const windows = habits.map((h) => ({
    id: h.id,
    name: h.name,
    archived: h.archived,
    createdOn: toDateString(h.createdAt),
    archivedOn: h.archivedAt ? toDateString(h.archivedAt) : null,
    ticks: byHabit.get(h.id) ?? new Map<string, TickStatus>(),
  }));

  const weeks: ChartsData["weeks"] = [];
  for (let m = firstMonday; m <= thisMonday; m = addDays(m, 7)) {
    const eligible = windows.filter((h) => isEligibleWeek(h.createdOn, h.archivedOn, m));
    let complete = 0;
    let partial = 0;
    for (const h of eligible) {
      for (let d = m; d <= addDays(m, 6); d = addDays(d, 1)) {
        const s = h.ticks.get(d);
        if (s === "COMPLETE") complete += 1;
        else if (s === "PARTIAL") partial += 0.5;
      }
    }
    const denom = 7 * eligible.length;
    weeks.push({
      label: formatDayShort(m),
      complete: denom ? Math.round((complete / denom) * 100) : 0,
      partial: denom ? Math.round((partial / denom) * 100) : 0,
    });
  }

  const active = windows.filter((h) => !h.archived);
  const streaks = active.map((h) => ({
    id: h.id,
    name: h.name,
    current: currentStreak(h.ticks, today),
    longest: longestStreak(h.ticks),
    lapses90: countLapses(
      h.ticks, maxDate(addDays(today, -89), h.createdOn), addDays(today, -1)
    ),
  }));

  const weekday = active.map((h) => ({
    id: h.id,
    name: h.name,
    means: dayOfWeekMeans(h.ticks, maxDate(addDays(today, -89), h.createdOn), today),
  }));

  const calendar: ChartsData["calendar"] = [];
  for (let d = calStart; d <= today; d = addDays(d, 1)) {
    // A habit counts for the day if it existed by then, or — for a tick that
    // predates its recorded creation timestamp — if real data was logged for
    // that day anyway; recorded activity should never be silently dropped.
    const existing = windows.filter(
      (h) => (h.createdOn <= d || h.ticks.has(d)) && (h.archivedOn === null || h.archivedOn >= d)
    );
    const sum = existing.reduce((acc, h) => acc + creditOf(h.ticks.get(d)), 0);
    calendar.push({ date: d, intensity: existing.length ? sum / existing.length : 0 });
  }

  return { weeks, streaks, weekday, calendar, hasTicks: ticks.length > 0 };
}
