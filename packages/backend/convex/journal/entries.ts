import { ConvexError, v } from "convex/values";
import { extractTags } from "@polaris/core/parser";
import { mutation, query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import {
  checkBody,
  clampLimit,
  cleanTitle,
  entryDtos,
  insertEntry,
  recordWordsMetric,
  searchEntryDocs,
  searchTextOf,
  writeEntryTags,
  type EntryDoc,
} from "./model";

// One query, three modes (decision log 9): a tag's entries, a topic's entries,
// or every live entry (optionally since a moment — the Today page).
export const list = query({
  args: {
    topicId: v.optional(v.id("journalTopics")),
    tag: v.optional(v.string()),
    sinceMs: v.optional(v.number()),
    sort: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if (args.topicId !== undefined && args.tag !== undefined) {
      throw new ConvexError("Pass topicId or tag, not both");
    }
    if (args.sinceMs !== undefined && (args.topicId !== undefined || args.tag !== undefined)) {
      throw new ConvexError("sinceMs only works without topicId or tag");
    }
    const limit = clampLimit(args.limit, 50);
    const order = args.sort ?? "desc";
    const { tag, topicId, sinceMs } = args;

    let docs: EntryDoc[];
    if (tag !== undefined) {
      const rows = await ctx.db
        .query("entryTags")
        .withIndex("by_tag_entry_created_at", (q) => q.eq("tag", tag))
        .order(order)
        .take(limit);
      docs = [];
      for (const row of rows) {
        const entry = await ctx.db.get(row.entryId);
        if (entry !== null && entry.deletedAt === undefined) docs.push(entry);
      }
    } else if (topicId !== undefined) {
      docs = await ctx.db
        .query("journalEntries")
        .withIndex("by_topic_deleted_at_created_at", (q) =>
          q.eq("topicId", topicId).eq("deletedAt", undefined)
        )
        .order(order)
        .take(limit);
    } else {
      docs = await ctx.db
        .query("journalEntries")
        .withIndex("by_deleted_at_created_at", (q) =>
          sinceMs === undefined
            ? q.eq("deletedAt", undefined)
            : q.eq("deletedAt", undefined).gte("createdAt", sinceMs)
        )
        .order(order)
        .take(limit);
    }
    return { entries: await entryDtos(ctx, docs) };
  },
});

export const create = mutation({
  args: {
    topicId: v.id("journalTopics"),
    title: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if ((await ctx.db.get(args.topicId)) === null) {
      throw new ConvexError("Topic not found. Pick another topic.");
    }
    checkBody(args.body);
    return insertEntry(ctx, { topicId: args.topicId, title: cleanTitle(args.title), body: args.body });
  },
});

export const update = mutation({
  args: {
    id: v.id("journalEntries"),
    topicId: v.optional(v.id("journalTopics")),
    title: v.optional(v.union(v.string(), v.null())),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const entry = await ctx.db.get(args.id);
    if (entry === null || entry.deletedAt !== undefined) throw new ConvexError("Entry not found.");

    const patch: Partial<Omit<EntryDoc, "_id" | "_creationTime">> = { updatedAt: Date.now() };
    if (args.topicId !== undefined) {
      if ((await ctx.db.get(args.topicId)) === null) {
        throw new ConvexError("Topic not found. Pick another topic.");
      }
      patch.topicId = args.topicId;
    }
    const title = args.title !== undefined ? cleanTitle(args.title) : entry.title;
    if (args.title !== undefined) patch.title = title; // undefined removes the field
    const body = args.body ?? entry.body;
    if (args.body !== undefined) {
      checkBody(args.body);
      patch.body = args.body;
      patch.tags = extractTags(args.body);
    }
    patch.searchText = searchTextOf(title, body);
    await ctx.db.patch(args.id, patch);

    if (args.body !== undefined) {
      await writeEntryTags(ctx, args.id, patch.tags!, entry.createdAt);
      await recordWordsMetric(ctx, args.body);
    }
    return null;
  },
});

export const search = query({
  args: {
    q: v.string(),
    topicId: v.optional(v.id("journalTopics")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const docs = await searchEntryDocs(ctx, {
      q: args.q,
      topicId: args.topicId,
      limit: clampLimit(args.limit, 20),
    });
    return { entries: await entryDtos(ctx, docs) };
  },
});

export const remove = mutation({
  args: { id: v.id("journalEntries") },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const entry = await ctx.db.get(args.id);
    if (entry === null || entry.deletedAt !== undefined) return null; // reactive UIs double-fire
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    await writeEntryTags(ctx, args.id, [], entry.createdAt);
    return null;
  },
});
