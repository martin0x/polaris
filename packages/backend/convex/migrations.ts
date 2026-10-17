import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { manilaMonthKeyFromMs } from "@polaris/core/months";

// Phase-1 data-migration playbook (docs/replatform.md §06): idempotent
// legacyId upserts so the import can rerun safely at the freeze/flip.

export const importSystemMetrics = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        system: v.string(),
        name: v.string(),
        value: v.number(),
        recordedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("systemMetrics")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("systemMetrics", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const importSystemReflections = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        system: v.string(),
        content: v.string(),
        strengths: v.array(v.string()),
        weaknesses: v.array(v.string()),
        ideas: v.array(v.string()),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("systemReflections")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("systemReflections", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const importSystemIterations = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        system: v.string(),
        description: v.string(),
        reason: v.string(),
        outcome: v.optional(v.string()),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("systemIterations")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("systemIterations", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const feedbackStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [metrics, reflections, iterations] = await Promise.all([
      ctx.db.query("systemMetrics").collect(),
      ctx.db.query("systemReflections").collect(),
      ctx.db.query("systemIterations").collect(),
    ]);
    const metricsBySystemName: Record<string, { count: number; sum: number }> = {};
    for (const m of metrics) {
      const key = `${m.system}/${m.name}`;
      metricsBySystemName[key] ??= { count: 0, sum: 0 };
      metricsBySystemName[key].count += 1;
      metricsBySystemName[key].sum += m.value;
    }
    return {
      metricCount: metrics.length,
      reflectionCount: reflections.length,
      iterationCount: iterations.length,
      metricsBySystemName,
    };
  },
});

// ── Expenses import (playbook §06, phase 2) ────────────────────────────────
// Import order: types → activities → items. Parents resolve by legacyId, so
// children throw (aborting the batch transaction) if a parent is missing.

export const importExpenseTypes = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        name: v.string(),
        position: v.number(),
        archived: v.boolean(),
        archivedAt: v.optional(v.number()),
        createdAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("expenseActivityTypes")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("expenseActivityTypes", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const importExpenseActivities = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        legacyTypeId: v.string(),
        title: v.optional(v.string()),
        startedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const type = await ctx.db
        .query("expenseActivityTypes")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyTypeId))
        .unique();
      if (type === null) throw new ConvexError(`Unknown type ${row.legacyTypeId}`);
      const doc = {
        typeId: type._id,
        ...(row.title === undefined ? {} : { title: row.title }),
        startedAt: row.startedAt,
        legacyId: row.legacyId,
      };
      const existing = await ctx.db
        .query("expenseActivities")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, doc);
        updated++;
      } else {
        await ctx.db.insert("expenseActivities", doc);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const importExpenseItems = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        legacyActivityId: v.string(),
        name: v.string(),
        amountCentavos: v.number(),
        position: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const activity = await ctx.db
        .query("expenseActivities")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyActivityId))
        .unique();
      if (activity === null) throw new ConvexError(`Unknown activity ${row.legacyActivityId}`);
      const doc = {
        activityId: activity._id,
        clientId: row.legacyId, // old Prisma PK was the client-generated uuid
        name: row.name,
        amountCentavos: row.amountCentavos,
        position: row.position,
        legacyId: row.legacyId,
      };
      const existing = await ctx.db
        .query("expenseItems")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, doc);
        updated++;
      } else {
        await ctx.db.insert("expenseItems", doc);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

// Verification aggregate — intentionally full-scan (playbook §06 checksums).
export const expenseStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [types, activities, items] = await Promise.all([
      ctx.db.query("expenseActivityTypes").collect(),
      ctx.db.query("expenseActivities").collect(),
      ctx.db.query("expenseItems").collect(),
    ]);
    const monthByActivity = new Map(activities.map((a) => [a._id, manilaMonthKeyFromMs(a.startedAt)]));
    const nameByType = new Map(types.map((t) => [t._id, t.name]));
    const centavosByMonth: Record<string, number> = {};
    for (const i of items) {
      const month = monthByActivity.get(i.activityId);
      if (month === undefined) continue;
      centavosByMonth[month] = (centavosByMonth[month] ?? 0) + i.amountCentavos;
    }
    const activitiesByType: Record<string, number> = {};
    for (const a of activities) {
      const name = nameByType.get(a.typeId) ?? "(unknown)";
      activitiesByType[name] = (activitiesByType[name] ?? 0) + 1;
    }
    return {
      typeCount: types.length,
      activityCount: activities.length,
      itemCount: items.length,
      centavosByMonth,
      activitiesByType,
    };
  },
});
