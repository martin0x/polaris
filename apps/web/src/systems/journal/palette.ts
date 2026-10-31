import type { PaletteLayer } from "@/platform/palette/types";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";
import { firstLine, relativeTime } from "@polaris/core/format";

export const topicsLayer: PaletteLayer = {
  name: "topics",
  singular: "topic",
  async search(query, _parentId) {
    const token = await convexAuthNextjsToken();
    const topics = await fetchQuery(api.journal.topics.search, { query }, { token });
    return topics.map((t) => ({
      id: t.id,
      label: t.name,
      sublabel: t.description ?? undefined,
      icon: "spool" as const,
      href: `/journal/topics/${encodeURIComponent(t.name)}`,
      drillable: true,
    }));
  },
};

export const notesLayer: PaletteLayer = {
  name: "notes",
  singular: "note",
  async search(query, parentId) {
    const token = await convexAuthNextjsToken();
    // parentId is a topics-layer result id — a Convex topic id.
    const { entries } = await fetchQuery(
      api.journal.entries.search,
      { q: query, ...(parentId ? { topicId: parentId as Id<"journalTopics"> } : {}), limit: 20 },
      { token }
    );
    return entries.map((e) => ({
      id: e.id,
      label: e.title ?? firstLine(e.body, 80),
      sublabel: relativeTime(new Date(e.createdAt)),
      icon: "file-text" as const,
      href: `/journal/topics/${encodeURIComponent(e.topicName)}#entry-${e.id}`,
      drillable: false,
    }));
  },
};
