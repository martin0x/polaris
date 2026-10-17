import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { clampLimit, searchEntryDocs, searchTextOf, topicByName, writeEntryTags } from "./model";

// Data-copy playbook (docs/replatform.md §06), phase 3. Import order: topics →
// topic parents → entries. Idempotent: rows upsert by legacyId; nothing is
// ever deleted. Run through packages/backend/scripts/import-journal.ts.

async function topicByLegacyId(ctx: QueryCtx | MutationCtx, legacyId: string) {
  return ctx.db
    .query("journalTopics")
    .withIndex("by_legacy_id", (q) => q.eq("legacyId", legacyId))
    .unique();
}

export const importTopics = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        archived: v.boolean(),
        archivedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const sameName = await topicByName(ctx, row.name);
      if (sameName !== null && sameName.legacyId !== row.legacyId) {
        throw new ConvexError(
          `Topic "${row.name}" already exists in Convex under another id; rename one of them before importing ${row.legacyId}`
        );
      }
      const existing = await topicByLegacyId(ctx, row.legacyId);
      // replace drops parentId; linkTopicParents (run next) restores current links
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("journalTopics", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const linkTopicParents = internalMutation({
  args: { rows: v.array(v.object({ legacyId: v.string(), legacyParentId: v.string() })) },
  handler: async (ctx, args) => {
    let linked = 0;
    for (const row of args.rows) {
      const topic = await topicByLegacyId(ctx, row.legacyId);
      if (topic === null) throw new ConvexError(`Unknown topic ${row.legacyId}`);
      const parent = await topicByLegacyId(ctx, row.legacyParentId);
      if (parent === null) throw new ConvexError(`Unknown topic ${row.legacyParentId}`);
      await ctx.db.patch(topic._id, { parentId: parent._id });
      linked++;
    }
    return { linked };
  },
});

export const importEntries = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        legacyTopicId: v.string(),
        title: v.optional(v.string()),
        body: v.string(),
        tags: v.array(v.string()),
        deletedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const topic = await topicByLegacyId(ctx, row.legacyTopicId);
      if (topic === null) throw new ConvexError(`Unknown topic ${row.legacyTopicId}`);
      const doc = {
        topicId: topic._id,
        ...(row.title === undefined ? {} : { title: row.title }),
        body: row.body,
        tags: row.tags,
        searchText: searchTextOf(row.title, row.body),
        ...(row.deletedAt === undefined ? {} : { deletedAt: row.deletedAt }),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        legacyId: row.legacyId,
      };
      const existing = await ctx.db
        .query("journalEntries")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      let id: Id<"journalEntries">;
      if (existing !== null) {
        await ctx.db.replace(existing._id, doc);
        id = existing._id;
        updated++;
      } else {
        id = await ctx.db.insert("journalEntries", doc);
        inserted++;
      }
      await writeEntryTags(ctx, id, row.deletedAt === undefined ? row.tags : [], row.createdAt);
    }
    return { inserted, updated };
  },
});

function pairs(counts: Map<string, number>): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// Verification aggregate — intentionally full-scan (playbook §06 checksums).
export const stats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [topics, entries, tagRows] = await Promise.all([
      ctx.db.query("journalTopics").collect(),
      ctx.db.query("journalEntries").collect(),
      ctx.db.query("entryTags").collect(),
    ]);
    const keyOf = new Map<Id<"journalTopics">, string>(topics.map((t) => [t._id, t.legacyId ?? t._id]));
    const live = new Map<string, number>();
    const chars = new Map<string, number>();
    let deletedEntryCount = 0;
    for (const e of entries) {
      if (e.deletedAt !== undefined) {
        deletedEntryCount++;
        continue;
      }
      const key = keyOf.get(e.topicId) ?? "(unknown topic)";
      live.set(key, (live.get(key) ?? 0) + 1);
      chars.set(key, (chars.get(key) ?? 0) + e.body.length);
    }
    const tagCounts = new Map<string, number>();
    for (const row of tagRows) tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
    return {
      topicCount: topics.length,
      archivedTopicCount: topics.filter((t) => t.archived).length,
      parentLinkCount: topics.filter((t) => t.parentId !== undefined).length,
      entryCount: entries.length,
      deletedEntryCount,
      liveEntriesByTopic: pairs(live),
      liveBodyCharsByTopic: pairs(chars),
      liveTagCounts: pairs(tagCounts),
    };
  },
});

export const entriesByLegacyIds = internalQuery({
  args: { legacyIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out = [];
    for (const legacyId of args.legacyIds) {
      const e = await ctx.db
        .query("journalEntries")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", legacyId))
        .unique();
      if (e === null) {
        out.push(null);
        continue;
      }
      const topic = await ctx.db.get(e.topicId);
      out.push({
        legacyTopicId: topic === null ? null : (topic.legacyId ?? topic._id),
        title: e.title ?? null,
        body: e.body,
        tags: e.tags,
        deletedAt: e.deletedAt ?? null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      });
    }
    return out;
  },
});

// The search acceptance script's view of journal search (no user identity
// under `convex run`, so the public query can't be called directly).
export const searchProbe = internalQuery({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const docs = await searchEntryDocs(ctx, { q: args.q, limit: clampLimit(args.limit, 50) });
    return docs.map((e) => e.legacyId ?? e._id);
  },
});
