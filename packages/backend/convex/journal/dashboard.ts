import { v } from "convex/values";
import { manilaDayStartMs } from "@polaris/core/months";
import { query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import { AGGREGATE_SCAN_LIMIT, entryDtos } from "./model";

const DAY_MS = 86_400_000;

// Day boundaries are the Asia/Manila calendar day (decision log 7).
export const summary = query({
  args: { now: v.optional(v.number()) }, // tests only; production omits
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const todayStart = manilaDayStartMs(args.now ?? Date.now());
    const yesterdayStart = todayStart - DAY_MS;
    const recent = await ctx.db
      .query("journalEntries")
      .withIndex("by_deleted_at_created_at", (q) =>
        q.eq("deletedAt", undefined).gte("createdAt", yesterdayStart)
      )
      .take(AGGREGATE_SCAN_LIMIT);
    const todayCount = recent.filter((e) => e.createdAt >= todayStart).length;
    const last = await ctx.db
      .query("journalEntries")
      .withIndex("by_deleted_at_created_at", (q) => q.eq("deletedAt", undefined))
      .order("desc")
      .first();
    return {
      todayCount,
      yesterdayCount: recent.length - todayCount,
      lastEntry: last === null ? null : (await entryDtos(ctx, [last]))[0],
    };
  },
});
