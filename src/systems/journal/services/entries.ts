import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/platform/db/client";
import { extractTags, wordCount } from "./parser";

export type JournalEntryWithTopic = Prisma.JournalEntryGetPayload<{
  include: { topic: true };
}>;

export interface CreateEntryInput {
  topicId: string;
  title?: string | null;
  body: string;
}

export async function createEntry(
  input: CreateEntryInput
): Promise<JournalEntryWithTopic> {
  const tags = extractTags(input.body);
  return prisma.journalEntry.create({
    data: {
      topicId: input.topicId,
      title: input.title ?? null,
      body: input.body,
      tags,
    },
    include: { topic: true },
  });
}

export interface UpdateEntryInput {
  topicId?: string;
  title?: string | null;
  body?: string;
}

export async function updateEntry(
  id: string,
  input: UpdateEntryInput
): Promise<JournalEntryWithTopic> {
  const data: Record<string, unknown> = {};
  if (input.topicId !== undefined) data.topicId = input.topicId;
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) {
    data.body = input.body;
    data.tags = extractTags(input.body);
  }
  return prisma.journalEntry.update({
    where: { id },
    data,
    include: { topic: true },
  });
}

export async function softDeleteEntry(id: string): Promise<void> {
  await prisma.journalEntry.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function getEntry(id: string): Promise<JournalEntryWithTopic | null> {
  return prisma.journalEntry.findFirst({
    where: { id, deletedAt: null },
    include: { topic: true },
  });
}

export interface ListEntriesInput {
  topicId?: string;
  tag?: string;
  cursor?: Date;
  limit?: number;
}

export async function listEntries(
  input: ListEntriesInput
): Promise<JournalEntryWithTopic[]> {
  const limit = Math.min(input.limit ?? 50, 100);
  return prisma.journalEntry.findMany({
    where: {
      deletedAt: null,
      ...(input.topicId ? { topicId: input.topicId } : {}),
      ...(input.tag ? { tags: { has: input.tag } } : {}),
      ...(input.cursor ? { createdAt: { lt: input.cursor } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { topic: true },
  });
}

export function entryWordCount(body: string): number {
  return wordCount(body);
}
