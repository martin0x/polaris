import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import {
  LIST_LIMIT_MAX,
  checkBody,
  cleanTitle,
  cleanTopicName,
  insertEntry,
  insertTopic,
  resolveTopicRef,
  topicByName,
} from "./model";

// Strangler window (phase 3 → 4): habits still lives in Postgres and reaches
// the journal only through these functions, called from the Next server
// (apps/web/src/systems/habits/services/journalBridge.ts). Phase 4 turns them
// into internal functions called by habits' own mutations.
// `ref` is a habit's stored journalTopicId: a Convex id, or the Postgres cuid
// of a topic imported in phase 3.

export const ensureTopic = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = cleanTopicName(args.name);
    const existing = await topicByName(ctx, name);
    return existing !== null ? existing._id : insertTopic(ctx, name);
  },
});

export const topicState = query({
  args: { ref: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await resolveTopicRef(ctx, args.ref);
    return topic === null ? null : { id: topic._id, name: topic.name, archived: topic.archived };
  },
});

export const renameTopic = mutation({
  args: { ref: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = cleanTopicName(args.name);
    const topic = await resolveTopicRef(ctx, args.ref);
    if (topic === null || topic.name === name) return { ok: true as const };
    if ((await topicByName(ctx, name)) !== null) {
      return { ok: false as const, reason: "collision" as const };
    }
    await ctx.db.patch(topic._id, { name, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

export const setTopicArchived = mutation({
  args: { ref: v.string(), archived: v.boolean() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await resolveTopicRef(ctx, args.ref);
    if (topic === null) return null; // a missing topic never blocks the habit action
    const now = Date.now();
    await ctx.db.patch(topic._id, {
      archived: args.archived,
      archivedAt: args.archived ? now : undefined,
      updatedAt: now,
    });
    return null;
  },
});

export const createLog = mutation({
  args: {
    ref: v.string(),
    title: v.optional(v.union(v.string(), v.null())),
    body: v.string(),
    createdAt: v.optional(v.number()), // past-day logs are backdated by habits
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await resolveTopicRef(ctx, args.ref);
    if (topic === null) return { ok: false as const, reason: "missing" as const };
    if (topic.archived) return { ok: false as const, reason: "archived" as const };
    checkBody(args.body);
    const id = await insertEntry(ctx, {
      topicId: topic._id,
      title: cleanTitle(args.title),
      body: args.body,
      createdAt: args.createdAt,
    });
    const entry = (await ctx.db.get(id))!;
    return {
      ok: true as const,
      entry: { id, title: entry.title ?? null, body: entry.body, createdAt: entry.createdAt },
    };
  },
});

export const topicEntries = query({
  args: { ref: v.string(), fromMs: v.number(), toMs: v.number() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await resolveTopicRef(ctx, args.ref);
    if (topic === null) return [];
    const docs = await ctx.db
      .query("journalEntries")
      .withIndex("by_topic_deleted_at_created_at", (q) =>
        q
          .eq("topicId", topic._id)
          .eq("deletedAt", undefined)
          .gte("createdAt", args.fromMs)
          .lt("createdAt", args.toMs)
      )
      .take(LIST_LIMIT_MAX);
    return docs.map((e) => ({ id: e._id, title: e.title ?? null, body: e.body, createdAt: e.createdAt }));
  },
});
