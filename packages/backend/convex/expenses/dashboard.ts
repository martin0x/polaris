import { v } from "convex/values";
import {
  manilaDayKeyFromMs,
  manilaMonthKeyFromMs,
  manilaMonthStartMs,
} from "@polaris/core/months";
import { query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import { loadItems } from "./activities";

export const summary = query({
  args: { now: v.optional(v.number()) }, // tests only; production omits
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const nowMs = args.now ?? Date.now();
    const monthStart = manilaMonthStartMs(manilaMonthKeyFromMs(nowMs));
    const today = manilaDayKeyFromMs(nowMs);

    const activities = await ctx.db
      .query("expenseActivities")
      .withIndex("by_started_at", (q) => q.gte("startedAt", monthStart))
      .order("desc")
      .collect();

    let monthCentavos = 0;
    let todayActivity: {
      id: string; title: string | null; typeName: string; items: number; totalCentavos: number;
    } | null = null;
    for (const a of activities) {
      const items = await loadItems(ctx, a._id);
      const total = items.reduce((sum, i) => sum + i.amountCentavos, 0);
      monthCentavos += total;
      if (todayActivity === null && manilaDayKeyFromMs(a.startedAt) === today) {
        const type = await ctx.db.get(a.typeId);
        todayActivity = {
          id: a._id as string,
          title: a.title ?? null,
          typeName: type?.name ?? "(deleted type)",
          items: items.length,
          totalCentavos: total,
        };
      }
    }

    const allTypes = await ctx.db.query("expenseActivityTypes").collect();
    const types = allTypes
      .filter((t) => !t.archived)
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
      .map((t) => ({ id: t._id as string, name: t.name }));

    return { monthCentavos, todayActivity, types };
  },
});
