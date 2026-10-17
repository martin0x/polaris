import { prisma } from "@/platform/db/client";
import type { Habit } from "@/generated/prisma/client";
import { journalBridge } from "./journalBridge";

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

export async function createHabit(name: string, quote?: string | null): Promise<Habit> {
  const journalTopicId = await journalBridge.ensureTopic(name);
  const max = await prisma.habit.aggregate({ _max: { position: true } });
  return prisma.habit.create({
    data: { name, quote: quote || null, position: (max._max.position ?? 0) + 1, journalTopicId },
  });
}

/** Renames the topic first — a clash stops there with nothing changed — then
 *  the habit. The two live in different databases, so this is not one
 *  transaction (phase 3 decision log 2). */
export async function renameHabit(id: string, name: string): Promise<Habit> {
  const habit = await prisma.habit.findUniqueOrThrow({ where: { id } });
  if (habit.journalTopicId && (await journalBridge.renameTopic(habit.journalTopicId, name)) === "collision") {
    throw new TopicNameCollisionError(name);
  }
  return prisma.habit.update({ where: { id }, data: { name } });
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
  // A missing topic never blocks the habit action — the bridge ignores it.
  if (habit.journalTopicId) await journalBridge.setTopicArchived(habit.journalTopicId, archived);
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
  const journalTopicId = await journalBridge.ensureTopic(habit.name);
  return prisma.habit.update({ where: { id }, data: { journalTopicId } });
}
