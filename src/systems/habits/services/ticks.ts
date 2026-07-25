import { prisma } from "@/platform/db/client";
import type { HabitTickStatus } from "@/generated/prisma/client";
import { mondayOf, weekDates, toUtcDate, toDateString, todayString } from "../lib/dates";

export class FutureDateError extends Error {
  constructor(date: string) {
    super(`Cannot tick ${date} — it hasn't happened yet.`);
    this.name = "FutureDateError";
  }
}

export interface TickDto {
  habitId: string;
  date: string;
  status: HabitTickStatus;
}

export interface HabitDto {
  id: string;
  name: string;
  quote: string | null;
  position: number;
  journalTopicId: string | null;
  createdOn: string;
}

export interface WeekData {
  monday: string;
  habits: HabitDto[];
  archivedHabits: Array<{ id: string; name: string }>;
  ticks: TickDto[];
}

export async function getWeek(startRaw: string): Promise<WeekData> {
  const monday = mondayOf(startRaw);
  const dates = weekDates(monday);
  const [habits, archivedHabits, ticks] = await Promise.all([
    prisma.habit.findMany({ where: { archived: false }, orderBy: { position: "asc" } }),
    prisma.habit.findMany({
      where: { archived: true }, orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.habitTick.findMany({
      where: { date: { gte: toUtcDate(dates[0]), lte: toUtcDate(dates[6]) } },
    }),
  ]);
  return {
    monday,
    habits: habits.map((h) => ({
      id: h.id, name: h.name, quote: h.quote, position: h.position,
      journalTopicId: h.journalTopicId, createdOn: toDateString(h.createdAt),
    })),
    archivedHabits,
    ticks: ticks.map((t) => ({
      habitId: t.habitId, date: toDateString(t.date), status: t.status,
    })),
  };
}

export async function upsertTick(
  habitId: string, date: string, status: HabitTickStatus
): Promise<TickDto> {
  if (date > todayString()) throw new FutureDateError(date);
  const tick = await prisma.habitTick.upsert({
    where: { habitId_date: { habitId, date: toUtcDate(date) } },
    update: { status },
    create: { habitId, date: toUtcDate(date), status },
  });
  return { habitId: tick.habitId, date: toDateString(tick.date), status: tick.status };
}

export async function removeTick(habitId: string, date: string): Promise<void> {
  await prisma.habitTick.deleteMany({
    where: { habitId, date: toUtcDate(date) },
  });
}
