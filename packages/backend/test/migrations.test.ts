import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

const rows = [
  { legacyId: "cm1", system: "journal", name: "entry_created", value: 1, recordedAt: 1_000 },
  { legacyId: "cm2", system: "journal", name: "words_per_entry", value: 42, recordedAt: 2_000 },
  { legacyId: "cm3", system: "expenses", name: "activity_started", value: 1, recordedAt: 3_000 },
];

test("importSystemMetrics inserts and is idempotent by legacyId", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(internal.migrations.importSystemMetrics, { rows });
  expect(first).toEqual({ inserted: 3, updated: 0 });
  const second = await t.mutation(internal.migrations.importSystemMetrics, { rows });
  expect(second).toEqual({ inserted: 0, updated: 3 });
  const all = await t.run(async (ctx) => ctx.db.query("systemMetrics").collect());
  expect(all).toHaveLength(3);
});

test("importSystemReflections and importSystemIterations round-trip", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.migrations.importSystemReflections, {
    rows: [{
      legacyId: "cr1", system: "journal", content: "note",
      strengths: ["a"], weaknesses: ["b"], ideas: [], createdAt: 10,
    }],
  });
  await t.mutation(internal.migrations.importSystemIterations, {
    rows: [{
      legacyId: "ci1", system: "expenses", description: "d", reason: "r",
      outcome: undefined, createdAt: 20,
    }],
  });
  const [r, i] = await t.run(async (ctx) =>
    Promise.all([
      ctx.db.query("systemReflections").collect(),
      ctx.db.query("systemIterations").collect(),
    ]),
  );
  expect(r[0].legacyId).toBe("cr1");
  expect(i[0].legacyId).toBe("ci1");
});

test("feedbackStats aggregates counts and per-metric sums", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.migrations.importSystemMetrics, { rows });
  const stats = await t.query(internal.migrations.feedbackStats, {});
  expect(stats.metricCount).toBe(3);
  expect(stats.metricsBySystemName["journal/entry_created"]).toEqual({ count: 1, sum: 1 });
  expect(stats.metricsBySystemName["journal/words_per_entry"]).toEqual({ count: 1, sum: 42 });
});
