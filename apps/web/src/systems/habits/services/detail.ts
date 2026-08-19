import { prisma } from "@/platform/db/client";
import { addDays, mondayOf, toDateString, toUtcDate, todayString } from "../lib/dates";
import type { TickDto } from "./ticks";

export interface DetailEntry {
  id: string;
  title: string | null;
  excerpt: string;
  createdAt: string; // ISO timestamp — the client groups into local days
}

export interface HabitDetail {
  last30: Array<Omit<TickDto, "habitId">>;
  entries: DetailEntry[];
  topicState: "ok" | "archived" | "missing";
  topicName: string;
  summary: null; // reserved for the AI-summary increment
}

export function excerptOf(body: string): string {
  const line = body.split("\n", 1)[0].trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

export async function getHabitDetail(
  id: string, weekRaw: string
): Promise<HabitDetail | null> {
  const habit = await prisma.habit.findUnique({ where: { id } });
  if (!habit) return null;

  const today = todayString();
  const monday = mondayOf(weekRaw);
  const topic = habit.journalTopicId
    ? await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId } })
    : null;
  const topicState = topic ? (topic.archived ? "archived" : "ok") : "missing";

  const [ticks, entries] = await Promise.all([
    prisma.habitTick.findMany({
      where: {
        habitId: id,
        date: { gte: toUtcDate(addDays(today, -29)), lte: toUtcDate(today) },
      },
      orderBy: { date: "asc" },
    }),
    topic && !topic.archived
      ? prisma.journalEntry.findMany({
          where: {
            topicId: topic.id,
            deletedAt: null,
            // Week padded ±1 day (UTC) so client-local grouping keeps edge entries.
            createdAt: {
              gte: toUtcDate(addDays(monday, -1)),
              lt: toUtcDate(addDays(monday, 8)),
            },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true, title: true, body: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    last30: ticks.map((t) => ({ date: toDateString(t.date), status: t.status })),
    entries: entries.map((e) => ({
      id: e.id, title: e.title, excerpt: excerptOf(e.body),
      createdAt: e.createdAt.toISOString(),
    })),
    topicState,
    topicName: topic?.name ?? habit.name,
    summary: null,
  };
}
