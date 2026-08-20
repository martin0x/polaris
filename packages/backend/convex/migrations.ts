import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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
