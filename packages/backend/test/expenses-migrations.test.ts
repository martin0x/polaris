import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

const typeRow = { legacyId: "ct1", name: "Groceries", position: 0, archived: false, createdAt: 1_000 };
const activityRow = { legacyId: "ca1", legacyTypeId: "ct1", title: "Weekly run", startedAt: Date.UTC(2026, 6, 2) };
const itemRow = { legacyId: "ui1", legacyActivityId: "ca1", name: "Milk", amountCentavos: 8950, position: 0 };

describe("expense imports", () => {
  it("imports types, activities, items with remapped relations", async () => {
    const t = convexTest(schema, modules);
    const r1 = await t.mutation(internal.migrations.importExpenseTypes, { rows: [typeRow] });
    expect(r1).toEqual({ inserted: 1, updated: 0 });
    await t.mutation(internal.migrations.importExpenseActivities, { rows: [activityRow] });
    await t.mutation(internal.migrations.importExpenseItems, { rows: [itemRow] });
    const item = await t.run(async (ctx) =>
      ctx.db.query("expenseItems").withIndex("by_legacy_id", (q) => q.eq("legacyId", "ui1")).unique()
    );
    expect(item!.clientId).toBe("ui1");
    const activity = await t.run(async (ctx) => ctx.db.get(item!.activityId));
    expect(activity!.legacyId).toBe("ca1");
  });

  it("is idempotent — a rerun updates instead of duplicating", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.migrations.importExpenseTypes, { rows: [typeRow] });
    await t.mutation(internal.migrations.importExpenseActivities, { rows: [activityRow] });
    await t.mutation(internal.migrations.importExpenseItems, { rows: [itemRow] });
    const r2 = await t.mutation(internal.migrations.importExpenseTypes, { rows: [typeRow] });
    const r3 = await t.mutation(internal.migrations.importExpenseActivities, { rows: [activityRow] });
    const r4 = await t.mutation(internal.migrations.importExpenseItems, { rows: [itemRow] });
    expect(r2).toEqual({ inserted: 0, updated: 1 });
    expect(r3).toEqual({ inserted: 0, updated: 1 });
    expect(r4).toEqual({ inserted: 0, updated: 1 });
    const stats = await t.query(internal.migrations.expenseStats, {});
    expect(stats.typeCount).toBe(1);
    expect(stats.activityCount).toBe(1);
    expect(stats.itemCount).toBe(1);
  });

  it("throws on an unknown parent", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.migrations.importExpenseActivities, { rows: [activityRow] })
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.migrations.importExpenseItems, { rows: [itemRow] })
    ).rejects.toThrow();
  });

  it("expenseStats buckets centavos by Manila month and counts by type name", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.migrations.importExpenseTypes, { rows: [typeRow] });
    await t.mutation(internal.migrations.importExpenseActivities, {
      rows: [
        activityRow,
        { legacyId: "ca2", legacyTypeId: "ct1", startedAt: Date.UTC(2026, 5, 30, 16, 30) }, // 2026-07 Manila
      ],
    });
    await t.mutation(internal.migrations.importExpenseItems, {
      rows: [
        itemRow,
        { legacyId: "ui2", legacyActivityId: "ca2", name: "Fare", amountCentavos: 1050, position: 0 },
      ],
    });
    const stats = await t.query(internal.migrations.expenseStats, {});
    expect(stats.centavosByMonth).toEqual({ "2026-07": 10_000 });
    expect(stats.activitiesByType).toEqual({ Groceries: 2 });
  });
});
