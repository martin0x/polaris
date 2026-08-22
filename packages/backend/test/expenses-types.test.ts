import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// Tests live outside convex/ so the CLI never bundles them; that means
// convex-test needs the module map passed explicitly.
const modules = import.meta.glob("../convex/**/*.*s");

describe("expenses types", () => {
  it("rejects unauthenticated reads and writes", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.expenses.types.list, {})).rejects.toThrow();
    await expect(t.mutation(api.expenses.types.create, { name: "Groceries" })).rejects.toThrow();
  });

  it("creates types with incrementing position", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const a = await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
    const b = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  it("trims names and rejects empty or over-40-char names", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const created = await asUser.mutation(api.expenses.types.create, { name: "  Dining  " });
    expect(created.name).toBe("Dining");
    await expect(asUser.mutation(api.expenses.types.create, { name: "   " })).rejects.toThrow();
    await expect(
      asUser.mutation(api.expenses.types.create, { name: "x".repeat(41) })
    ).rejects.toThrow();
  });

  it("rejects a duplicate name on create and rename", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
    const other = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
    await expect(asUser.mutation(api.expenses.types.create, { name: "Groceries" })).rejects.toThrow();
    await expect(
      asUser.mutation(api.expenses.types.update, { id: other.id, name: "Groceries" })
    ).rejects.toThrow();
  });

  it("lists non-archived by position, includes archived on request", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const a = await asUser.mutation(api.expenses.types.create, { name: "A" });
    await asUser.mutation(api.expenses.types.create, { name: "B" });
    await asUser.mutation(api.expenses.types.update, { id: a.id, archived: true });
    const active = await asUser.query(api.expenses.types.list, {});
    expect(active.map((x) => x.name)).toEqual(["B"]);
    const all = await asUser.query(api.expenses.types.list, { includeArchived: true });
    expect(all.map((x) => x.name)).toEqual(["A", "B"]);
  });

  it("archive sets archivedAt; unarchive clears it", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const created = await asUser.mutation(api.expenses.types.create, { name: "A" });
    await asUser.mutation(api.expenses.types.update, { id: created.id, archived: true });
    let doc = await t.run(async (ctx) => ctx.db.get(created.id));
    expect(doc!.archived).toBe(true);
    expect(typeof doc!.archivedAt).toBe("number");
    await asUser.mutation(api.expenses.types.update, { id: created.id, archived: false });
    doc = await t.run(async (ctx) => ctx.db.get(created.id));
    expect(doc!.archived).toBe(false);
    expect(doc!.archivedAt).toBeUndefined();
  });

  it("update requires at least one field", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const created = await asUser.mutation(api.expenses.types.create, { name: "A" });
    await expect(asUser.mutation(api.expenses.types.update, { id: created.id })).rejects.toThrow();
  });

  it("swap exchanges the positions of two types atomically", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const a = await asUser.mutation(api.expenses.types.create, { name: "A" });
    const b = await asUser.mutation(api.expenses.types.create, { name: "B" });
    await asUser.mutation(api.expenses.types.swap, { first: a.id, second: b.id });
    const list = await asUser.query(api.expenses.types.list, {});
    expect(list.map((x) => x.name)).toEqual(["B", "A"]);
  });
});
