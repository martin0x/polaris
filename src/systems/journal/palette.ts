import type { PaletteLayer } from "@/platform/palette/types";
import { prisma } from "@/platform/db/client";
import { searchEntries } from "./services/search";
import { firstLine, relativeTime } from "./lib/format";

export const topicsLayer: PaletteLayer = {
  name: "topics",
  singular: "topic",
  search: async (query, _parentId) => {
    const trimmed = query.trim();
    const topics = await prisma.journalTopic.findMany({
      where: {
        archived: false,
        ...(trimmed
          ? { name: { contains: trimmed, mode: "insensitive" as const } }
          : {}),
      },
      take: 10,
      orderBy: { updatedAt: "desc" },
    });
    return topics.map((t) => ({
      id: t.id,
      label: t.name,
      sublabel: t.description ?? undefined,
      icon: "folder" as const,
      href: `/journal/topics/${encodeURIComponent(t.name)}`,
      drillable: true,
    }));
  },
};

export const notesLayer: PaletteLayer = {
  name: "notes",
  singular: "note",
  search: async (query, parentId) => {
    const entries = await searchEntries({
      q: query,
      topicId: parentId ?? undefined,
      limit: 20,
    });
    return entries.map((e) => ({
      id: e.id,
      label: e.title ?? firstLine(e.body, 80),
      sublabel: relativeTime(new Date(e.createdAt)),
      icon: "file-text" as const,
      href: `/journal/topics/${encodeURIComponent(e.topic.name)}#entry-${e.id}`,
      drillable: false,
    }));
  },
};
