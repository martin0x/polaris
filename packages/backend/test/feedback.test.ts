import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

test("record inserts a metric with a numeric recordedAt", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.feedback.record, { system: "journal", name: "entry_created", value: 1 });
  const rows = await t.run((ctx) => ctx.db.query("systemMetrics").collect());
  expect(rows).toHaveLength(1);
  expect(typeof rows[0].recordedAt).toBe("number");
});

test("getAllFeedback requires an identity", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.feedback.getAllFeedback, {})).rejects.toThrow();
});

test("getAllFeedback returns newest-first, capped lists", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 60; i++) {
      await ctx.db.insert("systemMetrics", {
        system: "journal",
        name: "entry_created",
        value: i,
        recordedAt: 1_000 + i,
      });
    }
    await ctx.db.insert("systemReflections", {
      system: "journal",
      content: "note",
      strengths: ["a"],
      weaknesses: [],
      ideas: [],
      createdAt: 5,
    });
    await ctx.db.insert("systemIterations", {
      system: "expenses",
      description: "d",
      reason: "r",
      createdAt: 6,
    });
  });
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const result = await asUser.query(api.feedback.getAllFeedback, {});
  expect(result.metrics).toHaveLength(50);
  expect(result.metrics[0].value).toBe(59); // newest first
  expect(result.reflections).toHaveLength(1);
  expect(result.iterations).toHaveLength(1);
});

test("addReflection and logIteration insert with createdAt", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.feedback.addReflection, {
    system: "journal",
    content: "went well",
    strengths: ["focus"],
    weaknesses: ["scope"],
    ideas: ["split"],
  });
  await t.mutation(internal.feedback.logIteration, {
    system: "journal",
    description: "tightened parser",
    reason: "false positives",
  });
  const [reflections, iterations] = await t.run(async (ctx) =>
    Promise.all([
      ctx.db.query("systemReflections").collect(),
      ctx.db.query("systemIterations").collect(),
    ]),
  );
  expect(reflections).toHaveLength(1);
  expect(typeof reflections[0].createdAt).toBe("number");
  expect(iterations).toHaveLength(1);
});
