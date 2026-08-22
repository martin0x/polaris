import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

async function assertSignedIn(ctx: QueryCtx | MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new ConvexError("Unauthorized");
}

export async function loadItems(ctx: QueryCtx | MutationCtx, activityId: Id<"expenseActivities">) {
  const items = await ctx.db
    .query("expenseItems")
    .withIndex("by_activity", (q) => q.eq("activityId", activityId))
    .collect();
  return items.sort((a, b) => a.position - b.position);
}

async function typeName(
  ctx: QueryCtx | MutationCtx,
  typeId: Id<"expenseActivityTypes">
): Promise<string> {
  const type = await ctx.db.get(typeId);
  return type?.name ?? "(deleted type)";
}

export const start = mutation({
  args: { typeId: v.id("expenseActivityTypes"), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const type = await ctx.db.get(args.typeId);
    if (type === null) throw new ConvexError("Unknown type");
    const title = args.title?.trim();
    if (title !== undefined && (title.length < 1 || title.length > 120)) {
      throw new ConvexError("Title must be 1-120 characters");
    }
    const id = await ctx.db.insert("expenseActivities", {
      typeId: args.typeId,
      ...(title ? { title } : {}),
      startedAt: Date.now(),
    });
    // Scheduled so a metrics failure can never fail or slow starting an
    // activity (docs/replatform.md §07).
    await ctx.scheduler.runAfter(0, internal.feedback.record, {
      system: "expenses",
      name: "activity_started",
      value: 1,
    });
    return id;
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    // Accept both Convex ids and pre-migration cuid URLs.
    const normalized = ctx.db.normalizeId("expenseActivities", args.id);
    const doc = normalized
      ? await ctx.db.get(normalized)
      : await ctx.db
          .query("expenseActivities")
          .withIndex("by_legacy_id", (q) => q.eq("legacyId", args.id))
          .unique();
    if (doc === null) return null;
    const items = await loadItems(ctx, doc._id);
    return {
      id: doc._id,
      title: doc.title ?? null,
      typeId: doc.typeId,
      typeName: await typeName(ctx, doc.typeId),
      startedAt: doc.startedAt,
      items: items.map((i) => ({
        clientId: i.clientId,
        name: i.name,
        amountCentavos: i.amountCentavos,
        position: i.position,
      })),
    };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100);
    const rows = await ctx.db
      .query("expenseActivities")
      .withIndex("by_started_at")
      .order("desc")
      .take(limit);
    const names = new Map<Id<"expenseActivityTypes">, string>();
    const activities = [];
    for (const a of rows) {
      if (!names.has(a.typeId)) names.set(a.typeId, await typeName(ctx, a.typeId));
      const items = await loadItems(ctx, a._id);
      activities.push({
        id: a._id,
        typeId: a.typeId,
        typeName: names.get(a.typeId)!,
        title: a.title ?? null,
        startedAt: a.startedAt,
        itemCount: items.length,
        totalCentavos: items.reduce((sum, i) => sum + i.amountCentavos, 0),
      });
    }
    return { activities };
  },
});

export const update = mutation({
  args: {
    id: v.id("expenseActivities"),
    title: v.optional(v.union(v.string(), v.null())),
    typeId: v.optional(v.id("expenseActivityTypes")),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if (args.title === undefined && args.typeId === undefined) {
      throw new ConvexError("At least one field required");
    }
    const doc = await ctx.db.get(args.id);
    if (doc === null) throw new ConvexError("Activity not found");
    const patch: { title?: string | undefined; typeId?: Id<"expenseActivityTypes"> } = {};
    if (args.title !== undefined) {
      const title = args.title?.trim() ?? "";
      if (title.length > 120) throw new ConvexError("Title must be at most 120 characters");
      patch.title = title.length > 0 ? title : undefined; // undefined removes the field
    }
    if (args.typeId !== undefined) {
      if ((await ctx.db.get(args.typeId)) === null) throw new ConvexError("Unknown type");
      patch.typeId = args.typeId;
    }
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("expenseActivities") },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const doc = await ctx.db.get(args.id);
    if (doc === null) return null; // already gone — reactive UIs double-fire
    for (const item of await loadItems(ctx, args.id)) {
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(args.id);
    return null;
  },
});

// Palette layer search. Bounded scan of the newest activities — fine at
// personal scale (same trade the trends aggregation makes).
const SEARCH_SCAN_LIMIT = 500;

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const needle = args.query.trim().toLowerCase();
    if (needle.length === 0) {
      // Empty query = scoped palette browse → newest activities (legacy
      // parity: the old Prisma layer's `contains: ""` matched everything).
      const newest = await ctx.db
        .query("expenseActivities")
        .withIndex("by_started_at")
        .order("desc")
        .take(10);
      const names = new Map<Id<"expenseActivityTypes">, string>();
      const rows = [];
      for (const a of newest) {
        if (!names.has(a.typeId)) names.set(a.typeId, await typeName(ctx, a.typeId));
        rows.push({ id: a._id, title: a.title ?? null, typeName: names.get(a.typeId)!, startedAt: a.startedAt });
      }
      return rows;
    }
    const recent = await ctx.db
      .query("expenseActivities")
      .withIndex("by_started_at")
      .order("desc")
      .take(SEARCH_SCAN_LIMIT);
    const names = new Map<Id<"expenseActivityTypes">, string>();
    const results = [];
    for (const a of recent) {
      if (!names.has(a.typeId)) names.set(a.typeId, await typeName(ctx, a.typeId));
      const name = names.get(a.typeId)!;
      if (a.title?.toLowerCase().includes(needle) || name.toLowerCase().includes(needle)) {
        results.push({ id: a._id, title: a.title ?? null, typeName: name, startedAt: a.startedAt });
        if (results.length === 10) break;
      }
    }
    return results;
  },
});
