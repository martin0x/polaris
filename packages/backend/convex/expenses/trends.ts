import { ConvexError, v } from "convex/values";
import {
  lastNMonthKeysFromMs,
  manilaMonthKeyFromMs,
  manilaMonthStartMs,
} from "@polaris/core/months";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { loadItems } from "./activities";

// Replaces the Postgres `AT TIME ZONE 'Asia/Manila'` GROUP BY: a TypeScript
// aggregation over the indexed startedAt range — fine at personal scale.
export const get = query({
  args: {
    months: v.union(v.literal(3), v.literal(6), v.literal(12)),
    now: v.optional(v.number()), // tests only; production omits
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new ConvexError("Unauthorized");
    const nowMs = args.now ?? Date.now();
    const buckets = lastNMonthKeysFromMs(args.months, nowMs);
    const since = manilaMonthStartMs(buckets[0].key);
    const activities = await ctx.db
      .query("expenseActivities")
      .withIndex("by_started_at", (q) => q.gte("startedAt", since))
      .collect();

    const typeNames = new Map<Id<"expenseActivityTypes">, string>();
    // key `${month}|${typeId}` → { total, activities }
    const cells = new Map<string, { month: string; typeId: Id<"expenseActivityTypes">; total: number; activities: number }>();
    for (const a of activities) {
      if (!typeNames.has(a.typeId)) {
        typeNames.set(a.typeId, (await ctx.db.get(a.typeId))?.name ?? "(deleted type)");
      }
      const items = await loadItems(ctx, a._id);
      const month = manilaMonthKeyFromMs(a.startedAt);
      const key = `${month}|${a.typeId}`;
      const cell = cells.get(key) ?? { month, typeId: a.typeId, total: 0, activities: 0 };
      cell.total += items.reduce((sum, i) => sum + i.amountCentavos, 0);
      cell.activities += 1;
      cells.set(key, cell);
    }

    const sorted = [...cells.values()].sort((a, b) => a.month.localeCompare(b.month));
    const byMonth = sorted.map((c) => ({
      month: c.month,
      typeId: c.typeId as string,
      typeName: typeNames.get(c.typeId)!,
      totalCentavos: c.total,
    }));

    const thisKey = buckets[buckets.length - 1].key;
    const lastKey = buckets.length > 1 ? buckets[buckets.length - 2].key : null;
    const statsByType = new Map<
      string,
      { typeId: string; typeName: string; thisMonthCentavos: number; lastMonthCentavos: number; activityCount: number; totalAll: number }
    >();
    for (const c of sorted) {
      let s = statsByType.get(c.typeId);
      if (!s) {
        s = {
          typeId: c.typeId as string,
          typeName: typeNames.get(c.typeId)!,
          thisMonthCentavos: 0,
          lastMonthCentavos: 0,
          activityCount: 0,
          totalAll: 0,
        };
        statsByType.set(c.typeId, s);
      }
      s.totalAll += c.total;
      s.activityCount += c.activities;
      if (c.month === thisKey) s.thisMonthCentavos = c.total;
      if (lastKey && c.month === lastKey) s.lastMonthCentavos = c.total;
    }
    const byType = [...statsByType.values()].map(({ totalAll, ...s }) => ({
      ...s,
      avgPerActivityCentavos: s.activityCount > 0 ? Math.round(totalAll / s.activityCount) : 0,
    }));

    return { months: buckets, byMonth, byType };
  },
});
