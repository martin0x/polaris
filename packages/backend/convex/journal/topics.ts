import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assertSignedIn } from "../lib/auth";
import {
  AGGREGATE_SCAN_LIMIT,
  TOPIC_SCAN_LIMIT,
  byName,
  cleanDescription,
  cleanTopicName,
  insertTopic,
  topicByName,
  topicDto,
  type TopicDoc,
} from "./model";

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topics = await ctx.db.query("journalTopics").take(TOPIC_SCAN_LIMIT);
    return topics
      .filter((t) => args.includeArchived || !t.archived)
      .sort(byName)
      .map(topicDto);
  },
});

// Topics index page: each topic with its live-entry count and latest entry.
export const listWithStats = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topics = (await ctx.db.query("journalTopics").take(TOPIC_SCAN_LIMIT))
      .filter((t) => args.includeArchived || !t.archived)
      .sort(byName);
    // Newest-first: if the cap is ever hit, the rows dropped are the oldest,
    // not the newest (which lastEntryAt below needs).
    const live = await ctx.db
      .query("journalEntries")
      .withIndex("by_deleted_at_created_at", (q) => q.eq("deletedAt", undefined))
      .order("desc")
      .take(AGGREGATE_SCAN_LIMIT);
    const stats = new Map<Id<"journalTopics">, { count: number; lastAt: number }>();
    for (const e of live) {
      const s = stats.get(e.topicId);
      if (s) {
        s.count += 1;
        s.lastAt = Math.max(s.lastAt, e.createdAt);
      } else {
        stats.set(e.topicId, { count: 1, lastAt: e.createdAt });
      }
    }
    return topics.map((t) => ({
      ...topicDto(t),
      entryCount: stats.get(t._id)?.count ?? 0,
      lastEntryAt: stats.get(t._id)?.lastAt ?? null,
    }));
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await topicByName(ctx, args.name);
    return topic === null ? null : topicDto(topic);
  },
});

const PALETTE_LIMIT = 10;

// Palette layer: active topics whose name contains the query, most recently
// changed first. An empty query (browsing the layer) lists the newest ones.
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const needle = args.query.trim().toLowerCase();
    const topics = await ctx.db.query("journalTopics").take(TOPIC_SCAN_LIMIT);
    return topics
      .filter((t) => !t.archived && (needle === "" || t.name.toLowerCase().includes(needle)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, PALETTE_LIMIT)
      .map(topicDto);
  },
});

export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = cleanTopicName(args.name);
    const description =
      args.description === undefined ? undefined : cleanDescription(args.description);
    const id = await insertTopic(ctx, name, description);
    return topicDto((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    id: v.id("journalTopics"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if (args.name === undefined && args.description === undefined && args.archived === undefined) {
      throw new ConvexError("At least one field required");
    }
    const topic = await ctx.db.get(args.id);
    if (topic === null) throw new ConvexError("Topic not found");

    const now = Date.now();
    const patch: Partial<Omit<TopicDoc, "_id" | "_creationTime">> = { updatedAt: now };
    if (args.name !== undefined) {
      const name = cleanTopicName(args.name);
      if (name !== topic.name) {
        if ((await topicByName(ctx, name)) !== null) {
          throw new ConvexError(`Topic "${name}" already exists`);
        }
        patch.name = name;
      }
    }
    if (args.description !== undefined) {
      // undefined in a patch removes the field
      patch.description = args.description === null ? undefined : cleanDescription(args.description);
    }
    if (args.archived !== undefined) {
      patch.archived = args.archived;
      patch.archivedAt = args.archived ? now : undefined;
    }
    await ctx.db.patch(args.id, patch);
    return topicDto((await ctx.db.get(args.id))!);
  },
});
