import { prisma } from "@/platform/db/client";
import type { JournalTopic } from "@/generated/prisma/client";

export interface CreateTopicInput {
  name: string;
  description?: string;
}

export async function createTopic(input: CreateTopicInput): Promise<JournalTopic> {
  return prisma.journalTopic.create({
    data: {
      name: input.name,
      description: input.description ?? null,
    },
  });
}

export async function listTopics(opts: {
  includeArchived?: boolean;
}): Promise<JournalTopic[]> {
  return prisma.journalTopic.findMany({
    where: opts.includeArchived ? {} : { archived: false },
    orderBy: { name: "asc" },
  });
}

export async function getTopicById(id: string): Promise<JournalTopic | null> {
  return prisma.journalTopic.findUnique({ where: { id } });
}

export async function getTopicByName(encoded: string): Promise<JournalTopic | null> {
  const name = decodeURIComponent(encoded);
  return prisma.journalTopic.findUnique({ where: { name } });
}

export async function renameTopic(id: string, name: string): Promise<JournalTopic> {
  return prisma.journalTopic.update({ where: { id }, data: { name } });
}

export async function updateTopicDescription(
  id: string,
  description: string | null
): Promise<JournalTopic> {
  return prisma.journalTopic.update({ where: { id }, data: { description } });
}

export async function archiveTopic(id: string): Promise<JournalTopic> {
  return prisma.journalTopic.update({
    where: { id },
    data: { archived: true, archivedAt: new Date() },
  });
}

export async function unarchiveTopic(id: string): Promise<JournalTopic> {
  return prisma.journalTopic.update({
    where: { id },
    data: { archived: false, archivedAt: null },
  });
}

export interface TagCount {
  tag: string;
  count: number;
}

export async function listTags(): Promise<TagCount[]> {
  const rows = await prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
    SELECT tag, COUNT(*)::bigint AS count
    FROM (
      SELECT unnest(tags) AS tag
      FROM journal_entries
      WHERE "deletedAt" IS NULL
    ) t
    GROUP BY tag
    ORDER BY tag;
  `;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}
