import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";

function assertTypeName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > 40) {
    throw new ConvexError("Type name must be 1-40 characters");
  }
  return name;
}

async function assertNameFree(ctx: MutationCtx, name: string): Promise<void> {
  const existing = await ctx.db
    .query("expenseActivityTypes")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (existing !== null) throw new ConvexError(`Type "${name}" already exists`);
}

function toRow(doc: Doc<"expenseActivityTypes">) {
  return { id: doc._id, name: doc.name, position: doc.position, archived: doc.archived };
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const all = await ctx.db.query("expenseActivityTypes").collect(); // small table
    return all
      .filter((t) => args.includeArchived || !t.archived)
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
      .map(toRow);
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = assertTypeName(args.name);
    await assertNameFree(ctx, name);
    const all = await ctx.db.query("expenseActivityTypes").collect();
    const position = all.reduce((max, t) => Math.max(max, t.position), -1) + 1;
    const id = await ctx.db.insert("expenseActivityTypes", {
      name,
      position,
      archived: false,
      createdAt: Date.now(),
    });
    return toRow((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    id: v.id("expenseActivityTypes"),
    name: v.optional(v.string()),
    archived: v.optional(v.boolean()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if (args.name === undefined && args.archived === undefined && args.position === undefined) {
      throw new ConvexError("At least one field required");
    }
    const doc = await ctx.db.get(args.id);
    if (doc === null) throw new ConvexError("Type not found");
    const patch: Partial<Doc<"expenseActivityTypes">> = {};
    if (args.name !== undefined) {
      const name = assertTypeName(args.name);
      if (name !== doc.name) await assertNameFree(ctx, name);
      patch.name = name;
    }
    if (args.position !== undefined) {
      if (!Number.isInteger(args.position) || args.position < 0) {
        throw new ConvexError("Position must be a non-negative integer");
      }
      patch.position = args.position;
    }
    if (args.archived !== undefined) {
      patch.archived = args.archived;
      patch.archivedAt = args.archived ? Date.now() : undefined;
    }
    await ctx.db.patch(args.id, patch);
    return toRow((await ctx.db.get(args.id))!);
  },
});

// Atomic replacement for the old two-PATCH reorder swap: two rows can never
// be left sharing a position by a half-applied swap.
export const swap = mutation({
  args: { first: v.id("expenseActivityTypes"), second: v.id("expenseActivityTypes") },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const [a, b] = await Promise.all([ctx.db.get(args.first), ctx.db.get(args.second)]);
    if (a === null || b === null) throw new ConvexError("Type not found");
    await ctx.db.patch(a._id, { position: b.position });
    await ctx.db.patch(b._id, { position: a.position });
    return null;
  },
});
