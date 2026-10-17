import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { AGGREGATE_SCAN_LIMIT } from "./model";

const WEEK_MS = 7 * 86_400_000;

// Nightly sample (convex/crons.ts): how many topics got a live entry in the
// rolling last 7 days. Replaces the Vercel cron route.
export const compute = internalMutation({
  args: { now: v.optional(v.number()) }, // tests only; the cron omits it
  handler: async (ctx, args) => {
    const since = (args.now ?? Date.now()) - WEEK_MS;
    const recent = await ctx.db
      .query("journalEntries")
      .withIndex("by_deleted_at_created_at", (q) =>
        q.eq("deletedAt", undefined).gte("createdAt", since)
      )
      .take(AGGREGATE_SCAN_LIMIT);
    const count = new Set(recent.map((e) => e.topicId)).size;
    await ctx.scheduler.runAfter(0, internal.feedback.record, {
      system: "journal",
      name: "active_topic_count",
      value: count,
    });
    return count;
  },
});
