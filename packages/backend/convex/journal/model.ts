import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Shared journal helpers — no Convex functions live in this file. Limits match
// the old Zod route schemas (apps/web/src/systems/journal/schemas).

export const TOPIC_NAME_MAX = 80;
export const TOPIC_DESCRIPTION_MAX = 280;
// Topics are a small table; table-wide topic reads take at most this many.
export const TOPIC_SCAN_LIMIT = 1000;

type Ctx = QueryCtx | MutationCtx;
export type TopicDoc = Doc<"journalTopics">;

export interface TopicDto {
  id: Id<"journalTopics">;
  name: string;
  description: string | null;
  archived: boolean;
}

export function topicDto(t: TopicDoc): TopicDto {
  return { id: t._id, name: t.name, description: t.description ?? null, archived: t.archived };
}

/** Case-insensitive name order. A plain comparison rather than localeCompare,
 *  which keeps Intl out of the Convex runtime. */
export function byName(a: { name: string }, b: { name: string }): number {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

export function cleanTopicName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > TOPIC_NAME_MAX) {
    throw new ConvexError(`Topic name must be 1-${TOPIC_NAME_MAX} characters`);
  }
  return name;
}

/** Trimmed description; an empty one becomes undefined (field removed). */
export function cleanDescription(raw: string): string | undefined {
  const description = raw.trim();
  if (description.length > TOPIC_DESCRIPTION_MAX) {
    throw new ConvexError(`Description must be at most ${TOPIC_DESCRIPTION_MAX} characters`);
  }
  return description.length > 0 ? description : undefined;
}

export async function topicByName(ctx: Ctx, name: string): Promise<TopicDoc | null> {
  return ctx.db
    .query("journalTopics")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

/** Inserts a topic; `name` must already be cleaned. Throws on a taken name. */
export async function insertTopic(
  ctx: MutationCtx,
  name: string,
  description?: string
): Promise<Id<"journalTopics">> {
  if ((await topicByName(ctx, name)) !== null) {
    throw new ConvexError(`Topic "${name}" already exists`);
  }
  const now = Date.now();
  return ctx.db.insert("journalTopics", {
    name,
    ...(description ? { description } : {}),
    archived: false,
    createdAt: now,
    updatedAt: now,
  });
}
