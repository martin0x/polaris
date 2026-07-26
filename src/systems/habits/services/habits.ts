import { prisma } from "@/platform/db/client";
import { Prisma, type Habit } from "@/generated/prisma/client";
import { createTopic, archiveTopic, unarchiveTopic } from "@/systems/journal/services/topics";

/** Thrown when a rename would collide with a journal topic the habit doesn't own. */
export class TopicNameCollisionError extends Error {
  constructor(name: string) {
    super(`A journal topic named "${name}" already exists — habit not renamed.`);
    this.name = "TopicNameCollisionError";
  }
}

export async function getHabitById(id: string): Promise<Habit | null> {
  return prisma.habit.findUnique({ where: { id } });
}

async function linkOrCreateTopic(name: string): Promise<string> {
  const existing = await prisma.journalTopic.findUnique({ where: { name } });
  if (existing) return existing.id;
  const topic = await createTopic({ name });
  return topic.id;
}

export async function createHabit(name: string, quote?: string | null): Promise<Habit> {
  const journalTopicId = await linkOrCreateTopic(name);
  const max = await prisma.habit.aggregate({ _max: { position: true } });
  return prisma.habit.create({
    data: { name, quote: quote || null, position: (max._max.position ?? 0) + 1, journalTopicId },
  });
}

/** Rename habit + topic in one transaction; a topic-name clash rolls both back. */
export async function renameHabit(id: string, name: string): Promise<Habit> {
  return prisma.$transaction(async (tx) => {
    const habit = await tx.habit.findUniqueOrThrow({ where: { id } });
    if (habit.journalTopicId) {
      const topic = await tx.journalTopic.findUnique({ where: { id: habit.journalTopicId } });
      if (topic && topic.name !== name) {
        try {
          await tx.journalTopic.update({ where: { id: topic.id }, data: { name } });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            throw new TopicNameCollisionError(name);
          }
          throw err;
        }
      }
    }
    return tx.habit.update({ where: { id }, data: { name } });
  });
}

export async function setQuote(id: string, quote: string | null): Promise<Habit> {
  return prisma.habit.update({ where: { id }, data: { quote } });
}

export async function reorderHabits(ids: string[]): Promise<void> {
  const current = await prisma.habit.findMany({
    where: { archived: false }, select: { id: true },
  });
  const want = new Set(ids);
  if (want.size !== ids.length || current.length !== ids.length ||
      !current.every((h) => want.has(h.id))) {
    throw new Error("reorder list mismatch");
  }
  await prisma.$transaction(
    ids.map((habitId, i) =>
      prisma.habit.update({ where: { id: habitId }, data: { position: i + 1 } })
    )
  );
}

async function setArchived(id: string, archived: boolean): Promise<Habit> {
  const habit = await prisma.habit.update({
    where: { id },
    data: { archived, archivedAt: archived ? new Date() : null },
  });
  if (habit.journalTopicId) {
    try {
      await (archived ? archiveTopic(habit.journalTopicId) : unarchiveTopic(habit.journalTopicId));
    } catch (err) {
      // A missing topic never blocks the habit action (record not found).
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")) throw err;
    }
  }
  return habit;
}

export async function archiveHabit(id: string): Promise<Habit> {
  return setArchived(id, true);
}

export async function unarchiveHabit(id: string): Promise<Habit> {
  return setArchived(id, false);
}

/** Relink or recreate the topic for a habit whose topic is gone. */
export async function recreateTopic(id: string): Promise<Habit> {
  const habit = await prisma.habit.findUniqueOrThrow({ where: { id } });
  const journalTopicId = await linkOrCreateTopic(habit.name);
  return prisma.habit.update({ where: { id }, data: { journalTopicId } });
}
