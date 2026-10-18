import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// Records a metric. Internal only — scheduled from other modules' mutations
// so a metrics failure never fails a user action.
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
