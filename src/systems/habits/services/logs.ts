import { prisma } from "@/platform/db/client";
import { createEntry } from "@/systems/journal/services/entries";
import { noonInTz, todayString } from "../lib/dates";
import { FutureDateError } from "./ticks";
import { excerptOf, type DetailEntry } from "./detail";

export class TopicArchivedError extends Error {
  constructor() {
    super("Journal topic is archived — unarchive it to keep logging.");
    this.name = "TopicArchivedError";
  }
}

export class TopicMissingError extends Error {
  constructor() {
    super("Journal topic is missing — recreate it from the tracker.");
    this.name = "TopicMissingError";
  }
}

export interface CreateLogInput {
  title?: string | null;
  body: string;
}

/** Create a journal entry under the habit's topic. Past days are backdated to
 * noon POLARIS_TZ so the entry stays on the intended calendar day. */
export async function createLog(
  habitId: string, date: string, input: CreateLogInput
): Promise<DetailEntry> {
  const today = todayString();
  if (date > today) throw new FutureDateError(date);
  const habit = await prisma.habit.findUniqueOrThrow({ where: { id: habitId } });
  const topic = habit.journalTopicId
    ? await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId } })
    : null;
  if (!topic) throw new TopicMissingError();
  if (topic.archived) throw new TopicArchivedError();
  const entry = await createEntry({
    topicId: topic.id,
    title: input.title ?? null,
    body: input.body,
    ...(date === today ? {} : { createdAt: noonInTz(date) }),
  });
  return {
    id: entry.id,
    title: entry.title,
    excerpt: excerptOf(entry.body),
    createdAt: entry.createdAt.toISOString(),
  };
}
