import { beforeEach, describe, expect, it } from "vitest";
import { requireTestDatabase, withCleanExpenseTables } from "@/test/db";
import { createType } from "./types";
import { startActivity } from "./activities";
import { ItemConflictError, deleteItem, upsertItem } from "./items";
import { prisma } from "@/platform/db/client";

requireTestDatabase();

beforeEach(withCleanExpenseTables);

async function fixture() {
  const t = await createType("Groceries");
  return startActivity({ typeId: t.id });
}

describe("upsertItem", () => {
  it("creates an item with a client id", async () => {
    const a = await fixture();
    const item = await upsertItem(a.id, "client-id-1", {
      name: "Eggs",
      amountCentavos: 21500,
      position: 0,
    });
    expect(item.id).toBe("client-id-1");
    expect(item.amountCentavos).toBe(21500);
  });

  it("is idempotent — the same PUT twice does not duplicate", async () => {
    const a = await fixture();
    const body = { name: "Eggs", amountCentavos: 21500, position: 0 };
    await upsertItem(a.id, "client-id-1", body);
    await upsertItem(a.id, "client-id-1", body);
    expect(await prisma.expenseItem.count()).toBe(1);
  });

  it("updates name and amount on replay with new values", async () => {
    const a = await fixture();
    await upsertItem(a.id, "client-id-1", { name: "Eggs", amountCentavos: 21500, position: 0 });
    const updated = await upsertItem(a.id, "client-id-1", {
      name: "Eggs (dozen)",
      amountCentavos: 22000,
      position: 0,
    });
    expect(updated.name).toBe("Eggs (dozen)");
    expect(updated.amountCentavos).toBe(22000);
  });

  it("rejects an id that belongs to a different activity", async () => {
    const a = await fixture();
    const b = await fixture();
    await upsertItem(a.id, "client-id-1", { name: "Eggs", amountCentavos: 100, position: 0 });
    await expect(
      upsertItem(b.id, "client-id-1", { name: "Eggs", amountCentavos: 100, position: 0 })
    ).rejects.toBeInstanceOf(ItemConflictError);
  });
});

describe("deleteItem", () => {
  it("deletes an item", async () => {
    const a = await fixture();
    await upsertItem(a.id, "client-id-1", { name: "Eggs", amountCentavos: 100, position: 0 });
    await deleteItem(a.id, "client-id-1");
    expect(await prisma.expenseItem.count()).toBe(0);
  });

  it("succeeds when the item is already gone", async () => {
    const a = await fixture();
    await expect(deleteItem(a.id, "never-existed")).resolves.toBeUndefined();
  });
});
