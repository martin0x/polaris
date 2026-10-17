import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { loadItems } from "./activities";

async function assertSignedIn(ctx: MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new ConvexError("Unauthorized");
}

// Telemetry snapshot, scheduled so a metrics failure can never fail or slow
// an item sync (docs/replatform.md §07).
async function scheduleSnapshot(ctx: MutationCtx, activityId: Id<"expenseActivities">) {
  const items = await loadItems(ctx, activityId);
  await ctx.scheduler.runAfter(0, internal.feedback.record, {
    system: "expenses",
    name: "items_per_activity",
    value: items.length,
  });
  await ctx.scheduler.runAfter(0, internal.feedback.record, {
    system: "expenses",
    name: "activity_total_centavos",
    value: items.reduce((sum, i) => sum + i.amountCentavos, 0),
  });
}

export const put = mutation({
  args: {
    activityId: v.id("expenseActivities"),
    clientId: v.string(),
    name: v.string(),
    amountCentavos: v.number(),
    position: v.number(),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = args.name.trim();
    if (name.length < 1 || name.length > 120) {
      throw new ConvexError("Item name must be 1-120 characters");
    }
    if (
      !Number.isInteger(args.amountCentavos) ||
      args.amountCentavos < 0 ||
      args.amountCentavos > 100_000_000
    ) {
      throw new ConvexError("Amount must be between 0 and 100,000,000 centavos");
    }
    if (!Number.isInteger(args.position) || args.position < 0) {
      throw new ConvexError("Position must be a non-negative integer");
    }
    if ((await ctx.db.get(args.activityId)) === null) {
      throw new ConvexError("Activity not found");
    }
    const existing = await ctx.db
      .query("expenseItems")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (existing !== null && existing.activityId !== args.activityId) {
      // Client ids are scoped to one activity — the old REST 409.
      throw new ConvexError("Item belongs to a different activity");
    }
    if (existing !== null) {
      await ctx.db.patch(existing._id, { name, amountCentavos: args.amountCentavos, position: args.position });
    } else {
      await ctx.db.insert("expenseItems", {
        activityId: args.activityId,
        clientId: args.clientId,
        name,
        amountCentavos: args.amountCentavos,
        position: args.position,
      });
    }
    await scheduleSnapshot(ctx, args.activityId);
    return null;
  },
});

export const remove = mutation({
  args: { activityId: v.id("expenseActivities"), clientId: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const existing = await ctx.db
      .query("expenseItems")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    // Deleting an already-deleted item is a success (offline replays).
    if (existing !== null && existing.activityId === args.activityId) {
      await ctx.db.delete(existing._id);
    }
    await scheduleSnapshot(ctx, args.activityId);
    return null;
  },
});
