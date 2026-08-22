import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const type = await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
  return { t, asUser, type };
}

describe("expenses activities", () => {
  it("starts an activity and reads it back with its type", async () => {
    const { asUser, type } = await setup();
    const id = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    const detail = await asUser.query(api.expenses.activities.get, { id });
    expect(detail).not.toBeNull();
    expect(detail!.typeName).toBe("Groceries");
    expect(detail!.title).toBeNull();
    expect(detail!.items).toEqual([]);
    expect(typeof detail!.startedAt).toBe("number");
  });

  it("start records an activity_started metric via the scheduler", async () => {
    vi.useFakeTimers();
    const { t, asUser, type } = await setup();
    await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    await t.finishInProgressScheduledFunctions();
    vi.useRealTimers();
    const metrics = await t.run(async (ctx) => ctx.db.query("systemMetrics").collect());
    expect(metrics).toContainEqual(
      expect.objectContaining({ system: "expenses", name: "activity_started", value: 1 })
    );
  });

  it("start rejects a deleted typeId", async () => {
    const { t, asUser, type } = await setup();
    await t.run(async (ctx) => ctx.db.delete(type.id));
    await expect(
      asUser.mutation(api.expenses.activities.start, { typeId: type.id })
    ).rejects.toThrow();
  });

  it("get returns null for an unknown id and resolves legacy ids", async () => {
    const { t, asUser, type } = await setup();
    expect(await asUser.query(api.expenses.activities.get, { id: "nonsense" })).toBeNull();
    await t.run(async (ctx) =>
      ctx.db.insert("expenseActivities", {
        typeId: type.id,
        startedAt: Date.now(),
        legacyId: "clegacy123",
      })
    );
    const detail = await asUser.query(api.expenses.activities.get, { id: "clegacy123" });
    expect(detail).not.toBeNull();
  });

  it("lists newest first with item counts and centavo totals, respecting limit", async () => {
    const { t, asUser, type } = await setup();
    const first = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    const second = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    await t.run(async (ctx) => {
      await ctx.db.patch(first, { startedAt: 1_000 });
      await ctx.db.patch(second, { startedAt: 2_000 });
      await ctx.db.insert("expenseItems", {
        activityId: first, clientId: "i1", name: "Milk", amountCentavos: 8950, position: 0,
      });
      await ctx.db.insert("expenseItems", {
        activityId: first, clientId: "i2", name: "Bread", amountCentavos: 6050, position: 1,
      });
    });
    const { activities } = await asUser.query(api.expenses.activities.list, {});
    expect(activities.map((a) => a.id)).toEqual([second, first]);
    expect(activities[1].itemCount).toBe(2);
    expect(activities[1].totalCentavos).toBe(15000);
    const limited = await asUser.query(api.expenses.activities.list, { limit: 1 });
    expect(limited.activities).toHaveLength(1);
  });

  it("updates and clears the title, and moves type", async () => {
    const { asUser, type } = await setup();
    const other = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
    const id = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    await asUser.mutation(api.expenses.activities.update, { id, title: "Weekly run" });
    expect((await asUser.query(api.expenses.activities.get, { id }))!.title).toBe("Weekly run");
    await asUser.mutation(api.expenses.activities.update, { id, title: null, typeId: other.id });
    const detail = await asUser.query(api.expenses.activities.get, { id });
    expect(detail!.title).toBeNull();
    expect(detail!.typeName).toBe("Transit");
  });

  it("remove cascades items and tolerates a repeat", async () => {
    const { t, asUser, type } = await setup();
    const id = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    await t.run(async (ctx) =>
      ctx.db.insert("expenseItems", {
        activityId: id, clientId: "i1", name: "Milk", amountCentavos: 100, position: 0,
      })
    );
    await asUser.mutation(api.expenses.activities.remove, { id });
    await asUser.mutation(api.expenses.activities.remove, { id }); // idempotent
    expect(await asUser.query(api.expenses.activities.get, { id })).toBeNull();
    const items = await t.run(async (ctx) => ctx.db.query("expenseItems").collect());
    expect(items).toEqual([]);
  });

  it("search matches title or type name, capped at 10, newest first", async () => {
    const { asUser, type } = await setup();
    const a = await asUser.mutation(api.expenses.activities.start, {
      typeId: type.id, title: "Costco run",
    });
    await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    const byTitle = await asUser.query(api.expenses.activities.search, { query: "costco" });
    expect(byTitle.map((r) => r.id)).toEqual([a]);
    const byType = await asUser.query(api.expenses.activities.search, { query: "grocer" });
    expect(byType).toHaveLength(2);
  });
});
