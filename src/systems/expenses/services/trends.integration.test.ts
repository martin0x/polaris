import { beforeEach, describe, expect, it } from "vitest";
import { requireTestDatabase, withCleanExpenseTables } from "@/test/db";
import { prisma } from "@/platform/db/client";
import { createType } from "./types";
import { getTrends } from "./trends";

requireTestDatabase();

beforeEach(withCleanExpenseTables);

const NOW = new Date("2026-06-15T04:00:00Z"); // June in Manila

async function seedActivity(typeId: string, startedAt: string, amounts: number[]) {
  const a = await prisma.expenseActivity.create({
    data: { typeId, startedAt: new Date(startedAt) },
  });
  await prisma.expenseItem.createMany({
    data: amounts.map((amountCentavos, i) => ({
      id: `${a.id}-i${i}`,
      activityId: a.id,
      name: `Item ${i}`,
      amountCentavos,
      position: i,
    })),
  });
  return a;
}

describe("getTrends", () => {
  it("buckets totals by Manila month and type", async () => {
    const groceries = await createType("Groceries");
    const dining = await createType("Dining out");
    await seedActivity(groceries.id, "2026-06-02T04:00:00Z", [10000, 5000]);
    await seedActivity(groceries.id, "2026-05-10T04:00:00Z", [20000]);
    await seedActivity(dining.id, "2026-06-05T04:00:00Z", [7500]);

    const trends = await getTrends(3, NOW);
    expect(trends.months.map((m) => m.key)).toEqual(["2026-04", "2026-05", "2026-06"]);
    const june = trends.byMonth.filter((r) => r.month === "2026-06");
    expect(june).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ typeName: "Groceries", totalCentavos: 15000 }),
        expect.objectContaining({ typeName: "Dining out", totalCentavos: 7500 }),
      ])
    );
  });

  it("computes per-type stats: this month, last month, average, count", async () => {
    const groceries = await createType("Groceries");
    await seedActivity(groceries.id, "2026-06-02T04:00:00Z", [10000]);
    await seedActivity(groceries.id, "2026-06-09T04:00:00Z", [30000]);
    await seedActivity(groceries.id, "2026-05-10T04:00:00Z", [20000]);

    const trends = await getTrends(6, NOW);
    const stats = trends.byType.find((s) => s.typeName === "Groceries")!;
    expect(stats.thisMonthCentavos).toBe(40000);
    expect(stats.lastMonthCentavos).toBe(20000);
    expect(stats.activityCount).toBe(3);
    expect(stats.avgPerActivityCentavos).toBe(20000);
  });

  it("excludes activities older than the window", async () => {
    const groceries = await createType("Groceries");
    await seedActivity(groceries.id, "2025-01-10T04:00:00Z", [99999]);
    const trends = await getTrends(3, NOW);
    expect(trends.byMonth).toHaveLength(0);
    expect(trends.byType).toHaveLength(0);
  });

  it("assigns a late-night UTC activity to the next Manila month", async () => {
    const groceries = await createType("Groceries");
    // 2026-05-31 17:30 UTC = 2026-06-01 01:30 Manila
    await seedActivity(groceries.id, "2026-05-31T17:30:00Z", [5000]);
    const trends = await getTrends(3, NOW);
    expect(trends.byMonth[0]).toMatchObject({ month: "2026-06", totalCentavos: 5000 });
  });
});
