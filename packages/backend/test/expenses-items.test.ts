import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const type = await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
  const activityId = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
  return { t, asUser, activityId };
}

const body = { name: "Milk", amountCentavos: 8950, position: 0 };

describe("expenses items", () => {
  it("creates an item with a client id", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    const detail = await asUser.query(api.expenses.activities.get, { id: activityId });
    expect(detail!.items).toEqual([{ clientId: "u1", ...body }]);
  });

  it("is idempotent — the same put twice does not duplicate", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    const detail = await asUser.query(api.expenses.activities.get, { id: activityId });
    expect(detail!.items).toHaveLength(1);
  });

  it("updates name and amount on replay with new values", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await asUser.mutation(api.expenses.items.put, {
      activityId, clientId: "u1", name: "Oat milk", amountCentavos: 12050, position: 0,
    });
    const detail = await asUser.query(api.expenses.activities.get, { id: activityId });
    expect(detail!.items).toEqual([
      { clientId: "u1", name: "Oat milk", amountCentavos: 12050, position: 0 },
    ]);
  });

  it("rejects a client id that belongs to a different activity", async () => {
    const { asUser, activityId } = await setup();
    const type2 = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
    const other = await asUser.mutation(api.expenses.activities.start, { typeId: type2.id });
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await expect(
      asUser.mutation(api.expenses.items.put, { activityId: other, clientId: "u1", ...body })
    ).rejects.toThrow();
  });

  it("rejects a put on a deleted activity", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.activities.remove, { id: activityId });
    await expect(
      asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body })
    ).rejects.toThrow();
  });

  it("validates name and amount bounds", async () => {
    const { asUser, activityId } = await setup();
    await expect(
      asUser.mutation(api.expenses.items.put, {
        activityId, clientId: "u1", name: "  ", amountCentavos: 100, position: 0,
      })
    ).rejects.toThrow();
    await expect(
      asUser.mutation(api.expenses.items.put, {
        activityId, clientId: "u1", name: "Milk", amountCentavos: -1, position: 0,
      })
    ).rejects.toThrow();
    await expect(
      asUser.mutation(api.expenses.items.put, {
        activityId, clientId: "u1", name: "Milk", amountCentavos: 100_000_001, position: 0,
      })
    ).rejects.toThrow();
  });

  it("remove deletes an item and succeeds when already gone", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await asUser.mutation(api.expenses.items.remove, { activityId, clientId: "u1" });
    await asUser.mutation(api.expenses.items.remove, { activityId, clientId: "u1" });
    const detail = await asUser.query(api.expenses.activities.get, { id: activityId });
    expect(detail!.items).toEqual([]);
  });

  it("records snapshot metrics after a put", async () => {
    vi.useFakeTimers();
    const { t, asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const metrics = await t.run(async (ctx) => ctx.db.query("systemMetrics").collect());
    expect(metrics).toContainEqual(
      expect.objectContaining({ system: "expenses", name: "items_per_activity", value: 1 })
    );
    expect(metrics).toContainEqual(
      expect.objectContaining({ system: "expenses", name: "activity_total_centavos", value: 8950 })
    );
  });
});
