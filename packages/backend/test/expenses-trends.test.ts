import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

const NOW = Date.UTC(2026, 6, 15); // 2026-07-15 UTC → Manila month 2026-07

async function seed() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const groceries = await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
  const transit = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
  async function activity(typeId: typeof groceries.id, startedAt: number, centavos: number[]) {
    return t.run(async (ctx) => {
      const id = await ctx.db.insert("expenseActivities", { typeId, startedAt });
      for (const [i, c] of centavos.entries()) {
        await ctx.db.insert("expenseItems", {
          activityId: id, clientId: `${id}-${i}`, name: `Item ${i}`, amountCentavos: c, position: i,
        });
      }
      return id;
    });
  }
  return { t, asUser, groceries, transit, activity };
}

describe("expenses trends", () => {
  it("buckets totals by Manila month and type", async () => {
    const { asUser, groceries, transit, activity } = await seed();
    await activity(groceries.id, Date.UTC(2026, 6, 2), [10_000, 5_000]); // Jul
    await activity(groceries.id, Date.UTC(2026, 5, 10), [2_000]);        // Jun
    await activity(transit.id, Date.UTC(2026, 6, 3), [1_500]);           // Jul
    const trends = await asUser.query(api.expenses.trends.get, { months: 3, now: NOW });
    expect(trends.months.map((m) => m.key)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(trends.byMonth).toContainEqual(
      expect.objectContaining({ month: "2026-07", typeName: "Groceries", totalCentavos: 15_000 })
    );
    expect(trends.byMonth).toContainEqual(
      expect.objectContaining({ month: "2026-06", typeName: "Groceries", totalCentavos: 2_000 })
    );
    expect(trends.byMonth).toContainEqual(
      expect.objectContaining({ month: "2026-07", typeName: "Transit", totalCentavos: 1_500 })
    );
  });

  it("computes per-type stats: this month, last month, average, count", async () => {
    const { asUser, groceries, activity } = await seed();
    await activity(groceries.id, Date.UTC(2026, 6, 2), [10_000]);
    await activity(groceries.id, Date.UTC(2026, 5, 10), [4_000]);
    const { byType } = await asUser.query(api.expenses.trends.get, { months: 3, now: NOW });
    const g = byType.find((s) => s.typeName === "Groceries")!;
    expect(g.thisMonthCentavos).toBe(10_000);
    expect(g.lastMonthCentavos).toBe(4_000);
    expect(g.activityCount).toBe(2);
    expect(g.avgPerActivityCentavos).toBe(7_000);
  });

  it("excludes activities older than the window", async () => {
    const { asUser, groceries, activity } = await seed();
    await activity(groceries.id, Date.UTC(2026, 1, 1), [9_999]); // Feb — outside 3-month window
    const trends = await asUser.query(api.expenses.trends.get, { months: 3, now: NOW });
    expect(trends.byMonth).toEqual([]);
  });

  it("assigns a late-night UTC activity to the next Manila month", async () => {
    const { asUser, groceries, activity } = await seed();
    await activity(groceries.id, Date.UTC(2026, 5, 30, 16, 30), [1_000]); // 2026-07-01 00:30 Manila
    const trends = await asUser.query(api.expenses.trends.get, { months: 3, now: NOW });
    expect(trends.byMonth).toEqual([
      expect.objectContaining({ month: "2026-07", totalCentavos: 1_000 }),
    ]);
  });
});

describe("expenses dashboard summary", () => {
  it("sums the Manila month and finds today's latest activity", async () => {
    const { asUser, groceries, activity } = await seed();
    const NOW_LOCAL = Date.UTC(2026, 6, 15, 4); // 2026-07-15 12:00 Manila
    await activity(groceries.id, Date.UTC(2026, 6, 14, 20), [3_000]); // Jul 15 Manila (today)
    await activity(groceries.id, Date.UTC(2026, 6, 2), [2_000]);      // Jul 2 (this month)
    await activity(groceries.id, Date.UTC(2026, 5, 1), [9_000]);      // June — excluded
    const s = await asUser.query(api.expenses.dashboard.summary, { now: NOW_LOCAL });
    expect(s.monthCentavos).toBe(5_000);
    expect(s.todayActivity).toEqual(
      expect.objectContaining({ typeName: "Groceries", items: 1, totalCentavos: 3_000 })
    );
    expect(s.types.map((x) => x.name)).toEqual(["Groceries", "Transit"]);
  });

  it("returns null todayActivity when nothing started today", async () => {
    const { asUser } = await seed();
    const s = await asUser.query(api.expenses.dashboard.summary, { now: Date.UTC(2026, 6, 15, 4) });
    expect(s.monthCentavos).toBe(0);
    expect(s.todayActivity).toBeNull();
  });
});
