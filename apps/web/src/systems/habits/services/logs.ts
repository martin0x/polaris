import { prisma } from "@/platform/db/client";
import { journalBridge } from "./journalBridge";
import { noonInTz, todayString } from "@polaris/core/dates";
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
  if (!habit.journalTopicId) throw new TopicMissingError();
  const result = await journalBridge.createLog(habit.journalTopicId, {
    title: input.title ?? null,
    body: input.body,
    ...(date === today ? {} : { createdAt: noonInTz(date).getTime() }),
  });
  if (!result.ok) {
    throw result.reason === "archived" ? new TopicArchivedError() : new TopicMissingError();
  }
  return {
    id: result.entry.id,
    title: result.entry.title,
    excerpt: excerptOf(result.entry.body),
    createdAt: new Date(result.entry.createdAt).toISOString(),
  };
}
