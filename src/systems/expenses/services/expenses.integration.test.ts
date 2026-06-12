import { beforeEach, describe, expect, it } from "vitest";
import { requireTestDatabase, withCleanExpenseTables } from "@/test/db";
import { createType, listTypes, updateType } from "./types";
import {
  deleteActivity,
  getActivityWithItems,
  listActivities,
  startActivity,
  updateActivity,
} from "./activities";
import { prisma } from "@/platform/db/client";

requireTestDatabase();

beforeEach(withCleanExpenseTables);

describe("types service", () => {
  it("creates types with incrementing position", async () => {
    const a = await createType("Groceries");
    const b = await createType("Dining out");
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  it("lists non-archived by position, includes archived on request", async () => {
    const a = await createType("Groceries");
    await createType("Dining out");
    await updateType(a.id, { archived: true });
    const visible = await listTypes({});
    expect(visible.map((t) => t.name)).toEqual(["Dining out"]);
    const all = await listTypes({ includeArchived: true });
    expect(all).toHaveLength(2);
  });

  it("archive sets archivedAt; unarchive clears it", async () => {
    const t = await createType("Errands");
    const archived = await updateType(t.id, { archived: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    const restored = await updateType(t.id, { archived: false });
    expect(restored.archivedAt).toBeNull();
  });

  it("rejects a duplicate name", async () => {
    await createType("Groceries");
    await expect(createType("Groceries")).rejects.toThrow();
  });
});

describe("activities service", () => {
  it("starts an activity and reads it back with its type", async () => {
    const t = await createType("Groceries");
    const a = await startActivity({ typeId: t.id, title: "SM North run" });
    const fetched = await getActivityWithItems(a.id);
    expect(fetched?.title).toBe("SM North run");
    expect(fetched?.type.name).toBe("Groceries");
    expect(fetched?.items).toEqual([]);
  });

  it("lists with item counts and centavo totals, newest first", async () => {
    const t = await createType("Groceries");
    const a = await startActivity({ typeId: t.id });
    await prisma.expenseItem.createMany({
      data: [
        { id: "i1", activityId: a.id, name: "Eggs", amountCentavos: 21500, position: 0 },
        { id: "i2", activityId: a.id, name: "Milk", amountCentavos: 9800, position: 1 },
      ],
    });
    const { activities } = await listActivities({ limit: 10 });
    expect(activities).toHaveLength(1);
    expect(activities[0].itemCount).toBe(2);
    expect(activities[0].totalCentavos).toBe(31300);
    expect(activities[0].typeName).toBe("Groceries");
  });

  it("paginates with a cursor", async () => {
    const t = await createType("Groceries");
    for (let i = 0; i < 3; i++) await startActivity({ typeId: t.id });
    const page1 = await listActivities({ limit: 2 });
    expect(page1.activities).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await listActivities({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.activities).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("updates title and deletes with item cascade", async () => {
    const t = await createType("Groceries");
    const a = await startActivity({ typeId: t.id });
    await updateActivity(a.id, { title: "Weekly run" });
    expect((await getActivityWithItems(a.id))?.title).toBe("Weekly run");
    await prisma.expenseItem.create({
      data: { id: "i1", activityId: a.id, name: "Eggs", amountCentavos: 100, position: 0 },
    });
    await deleteActivity(a.id);
    expect(await getActivityWithItems(a.id)).toBeNull();
    expect(await prisma.expenseItem.count()).toBe(0);
  });
});
