import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

// Server-trusted writes during the strangler window: the Next server proves
// itself with the shared CRON_SECRET. Phases 2-4 replace these call sites
// with internal calls inside Convex and this gate goes away.
function assertServiceKey(serviceKey: string): void {
  const expected = process.env.CRON_SECRET;
  if (!expected || serviceKey !== expected) {
    throw new ConvexError("Invalid service key");
  }
}

export const recordMetric = mutation({
  args: {
    system: v.string(),
    name: v.string(),
    value: v.number(),
    serviceKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    await ctx.db.insert("systemMetrics", {
      system: args.system,
      name: args.name,
      value: args.value,
      recordedAt: Date.now(),
    });
  },
});

// Internal twin of recordMetric for calls that originate inside Convex
// (scheduled from other modules' mutations) — no service key needed.
export const record = internalMutation({
  args: { system: v.string(), name: v.string(), value: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("systemMetrics", {
      system: args.system,
      name: args.name,
      value: args.value,
      recordedAt: Date.now(),
    });
  },
});

// Hand-run via `bunx convex run feedback:addReflection '…'` — matching the
// historical bun -e workflow; no production call sites exist.
export const addReflection = internalMutation({
  args: {
    system: v.string(),
    content: v.string(),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    ideas: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("systemReflections", { ...args, createdAt: Date.now() });
  },
});

export const logIteration = internalMutation({
  args: {
    system: v.string(),
    description: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("systemIterations", { ...args, createdAt: Date.now() });
  },
});

export const getAllFeedback = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new ConvexError("Unauthorized");
    const [metrics, reflections, iterations] = await Promise.all([
      ctx.db.query("systemMetrics").withIndex("by_recorded_at").order("desc").take(50),
      ctx.db.query("systemReflections").withIndex("by_created_at").order("desc").take(20),
      ctx.db.query("systemIterations").withIndex("by_created_at").order("desc").take(20),
    ]);
    return { metrics, reflections, iterations };
  },
});
