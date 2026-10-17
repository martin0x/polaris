import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

function setup() {
  const t = convexTest(schema, modules);
  return { t, asUser: t.withIdentity({ subject: "user1|session1" }) };
}

describe("journal topics", () => {
  it("rejects anonymous callers", async () => {
    const { t } = setup();
    await expect(t.query(api.journal.topics.list, {})).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.journal.topics.create, { name: "X" })).rejects.toThrow("Unauthorized");
  });

  it("creates trimmed topics and lists them by name, case-insensitively", async () => {
    const { asUser } = setup();
    const created = await asUser.mutation(api.journal.topics.create, { name: "  polaris " });
    expect(created).toMatchObject({ name: "polaris", description: null, archived: false });
    await asUser.mutation(api.journal.topics.create, { name: "Alpha", description: " First " });
    await asUser.mutation(api.journal.topics.create, { name: "beta" });
    const topics = await asUser.query(api.journal.topics.list, {});
    expect(topics.map((t) => t.name)).toEqual(["Alpha", "beta", "polaris"]);
    expect(topics[0].description).toBe("First");
  });

  it("rejects duplicate names and out-of-range names or descriptions", async () => {
    const { asUser } = setup();
    await asUser.mutation(api.journal.topics.create, { name: "Polaris" });
    await expect(asUser.mutation(api.journal.topics.create, { name: "Polaris" })).rejects.toThrow(
      'Topic "Polaris" already exists'
    );
    await expect(asUser.mutation(api.journal.topics.create, { name: "   " })).rejects.toThrow(
      "Topic name must be 1-80 characters"
    );
    await expect(asUser.mutation(api.journal.topics.create, { name: "x".repeat(81) })).rejects.toThrow(
      "Topic name must be 1-80 characters"
    );
    await expect(
      asUser.mutation(api.journal.topics.create, { name: "Ok", description: "d".repeat(281) })
    ).rejects.toThrow("Description must be at most 280 characters");
  });

  it("getByName finds an exact name and returns null otherwise", async () => {
    const { asUser } = setup();
    await asUser.mutation(api.journal.topics.create, { name: "Polaris notes" });
    expect(await asUser.query(api.journal.topics.getByName, { name: "Polaris notes" })).toMatchObject({
      name: "Polaris notes",
    });
    expect(await asUser.query(api.journal.topics.getByName, { name: "polaris notes" })).toBeNull();
  });

  it("update renames, edits or clears the description, and archives", async () => {
    const { t, asUser } = setup();
    const topic = await asUser.mutation(api.journal.topics.create, { name: "Old", description: "d" });
    await asUser.mutation(api.journal.topics.create, { name: "Taken" });

    const renamed = await asUser.mutation(api.journal.topics.update, { id: topic.id, name: " New " });
    expect(renamed.name).toBe("New");
    await expect(asUser.mutation(api.journal.topics.update, { id: topic.id, name: "Taken" })).rejects.toThrow(
      'Topic "Taken" already exists'
    );
    expect((await asUser.mutation(api.journal.topics.update, { id: topic.id, name: "New" })).name).toBe("New");

    const cleared = await asUser.mutation(api.journal.topics.update, { id: topic.id, description: null });
    expect(cleared.description).toBeNull();

    const archived = await asUser.mutation(api.journal.topics.update, { id: topic.id, archived: true });
    expect(archived.archived).toBe(true);
    const doc = await t.run((ctx) => ctx.db.get(topic.id));
    expect(typeof doc!.archivedAt).toBe("number");
    expect((await asUser.query(api.journal.topics.list, {})).map((x) => x.name)).toEqual(["Taken"]);
    expect(await asUser.query(api.journal.topics.list, { includeArchived: true })).toHaveLength(2);

    await asUser.mutation(api.journal.topics.update, { id: topic.id, archived: false });
    expect((await t.run((ctx) => ctx.db.get(topic.id)))!.archivedAt).toBeUndefined();

    await expect(asUser.mutation(api.journal.topics.update, { id: topic.id })).rejects.toThrow(
      "At least one field required"
    );
  });

  it("update bumps updatedAt and rejects a deleted topic", async () => {
    const { t, asUser } = setup();
    const topic = await asUser.mutation(api.journal.topics.create, { name: "A" });
    await t.run((ctx) => ctx.db.patch(topic.id, { updatedAt: 1 }));
    await asUser.mutation(api.journal.topics.update, { id: topic.id, description: "x" });
    expect((await t.run((ctx) => ctx.db.get(topic.id)))!.updatedAt).toBeGreaterThan(1);
    await t.run((ctx) => ctx.db.delete(topic.id));
    await expect(asUser.mutation(api.journal.topics.update, { id: topic.id, archived: true })).rejects.toThrow(
      "Topic not found"
    );
  });

  it("search matches name substrings, skips archived, newest-updated first, at most 10", async () => {
    const { t, asUser } = setup();
    const ids = [];
    for (let i = 0; i < 12; i++) {
      ids.push((await asUser.mutation(api.journal.topics.create, { name: `Build ${i}` })).id);
    }
    await asUser.mutation(api.journal.topics.create, { name: "Reading" });
    await t.run(async (ctx) => {
      for (let i = 0; i < ids.length; i++) await ctx.db.patch(ids[i], { updatedAt: 1000 + i });
    });
    await asUser.mutation(api.journal.topics.update, { id: ids[11], archived: true });

    const hits = await asUser.query(api.journal.topics.search, { query: " BUILD " });
    expect(hits).toHaveLength(10);
    expect(hits[0].name).toBe("Build 10"); // Build 11 is archived
    expect(hits.some((h) => h.name === "Reading")).toBe(false);

    // Empty query = browsing the layer: newest-updated topics, not [].
    const browse = await asUser.query(api.journal.topics.search, { query: "" });
    expect(browse).toHaveLength(10);
  });
});
