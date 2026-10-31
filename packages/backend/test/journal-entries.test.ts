import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const topic = await asUser.mutation(api.journal.topics.create, { name: "Polaris" });
  return { t, asUser, topic };
}

async function tagRows(t: ReturnType<typeof convexTest>, entryId: string) {
  return t.run(async (ctx) =>
    (await ctx.db.query("entryTags").collect()).filter((r) => r.entryId === entryId)
  );
}

describe("journal entries", () => {
  // Only Date is faked, so convex-test's scheduler keeps real timers.
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("creates an entry with tags, search text, and equal timestamps", async () => {
    const { t, asUser, topic } = await setup();
    vi.setSystemTime(5_000);
    const id = await asUser.mutation(api.journal.entries.create, {
      topicId: topic.id,
      title: " Ship day ",
      body: "Shipped #Convex and #search today",
    });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc).toMatchObject({
      title: "Ship day",
      tags: ["convex", "search"],
      searchText: "Ship day\nShipped #Convex and #search today",
      createdAt: 5_000,
      updatedAt: 5_000,
    });
    const rows = await tagRows(t, id);
    expect(rows.map((r) => r.tag).sort()).toEqual(["convex", "search"]);
    expect(rows.every((r) => r.entryCreatedAt === 5_000)).toBe(true);
  });

  it("stores an empty title as absent and lists DTOs newest first", async () => {
    const { asUser, topic } = await setup();
    vi.setSystemTime(1_000);
    const first = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, title: "  ", body: "one" });
    vi.setSystemTime(2_000);
    const second = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "two" });
    const { entries } = await asUser.query(api.journal.entries.list, {});
    expect(entries.map((e) => e.id)).toEqual([second, first]);
    expect(entries[1]).toEqual({
      id: first,
      topicId: topic.id,
      topicName: "Polaris",
      title: null,
      body: "one",
      tags: [],
      createdAt: 1_000,
      updatedAt: 1_000,
    });
  });

  it("rejects anonymous callers, unknown topics, blank bodies, and long titles", async () => {
    const { t, asUser, topic } = await setup();
    await expect(t.query(api.journal.entries.list, {})).rejects.toThrow("Unauthorized");
    await expect(
      asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "   " })
    ).rejects.toThrow("Write something before saving.");
    await expect(
      asUser.mutation(api.journal.entries.create, { topicId: topic.id, title: "x".repeat(201), body: "b" })
    ).rejects.toThrow("Titles can be at most 200 characters.");
    await t.run((ctx) => ctx.db.delete(topic.id));
    await expect(
      asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "b" })
    ).rejects.toThrow("Topic not found. Pick another topic.");
  });

  it("filters by sinceMs, by topic in both orders, and by tag", async () => {
    const { asUser, topic } = await setup();
    const other = await asUser.mutation(api.journal.topics.create, { name: "Other" });
    vi.setSystemTime(1_000);
    const a = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "a #x" });
    vi.setSystemTime(2_000);
    const b = await asUser.mutation(api.journal.entries.create, { topicId: other.id, body: "b #x" });
    vi.setSystemTime(3_000);
    const c = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "c" });

    type ListArgs = {
      topicId?: typeof topic.id;
      tag?: string;
      sinceMs?: number;
      sort?: "asc" | "desc";
      limit?: number;
    };
    const ids = async (args: ListArgs) =>
      (await asUser.query(api.journal.entries.list, args)).entries.map((e) => e.id);

    expect(await ids({ sinceMs: 2_000 })).toEqual([c, b]);
    expect(await ids({ topicId: topic.id })).toEqual([c, a]);
    expect(await ids({ topicId: topic.id, sort: "asc" })).toEqual([a, c]);
    expect(await ids({ tag: "x" })).toEqual([b, a]);
    expect(await ids({ limit: 1 })).toEqual([c]);
    expect(await ids({ limit: 0 })).toEqual([c]); // clamped to at least 1
  });

  it("rejects mixed list modes", async () => {
    const { asUser, topic } = await setup();
    await expect(asUser.query(api.journal.entries.list, { topicId: topic.id, tag: "x" })).rejects.toThrow(
      "Pass topicId or tag, not both"
    );
    await expect(asUser.query(api.journal.entries.list, { tag: "x", sinceMs: 1 })).rejects.toThrow(
      "sinceMs only works without topicId or tag"
    );
  });

  it("update recomputes tags and search text, clears the title, and moves topics", async () => {
    const { t, asUser, topic } = await setup();
    const other = await asUser.mutation(api.journal.topics.create, { name: "Other" });
    vi.setSystemTime(1_000);
    const id = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, title: "T", body: "old #a" });
    vi.setSystemTime(9_000);
    await asUser.mutation(api.journal.entries.update, { id, body: "new #b #c" });
    let doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc).toMatchObject({ body: "new #b #c", tags: ["b", "c"], searchText: "T\nnew #b #c", updatedAt: 9_000, createdAt: 1_000 });
    expect((await tagRows(t, id)).map((r) => r.tag).sort()).toEqual(["b", "c"]);

    await asUser.mutation(api.journal.entries.update, { id, title: null, topicId: other.id });
    doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc!.title).toBeUndefined();
    expect(doc!.searchText).toBe("new #b #c");
    expect(doc!.topicId).toBe(other.id);

    await expect(asUser.mutation(api.journal.entries.update, { id, body: " " })).rejects.toThrow(
      "Write something before saving."
    );
  });

  it("update rejects missing and deleted entries", async () => {
    const { t, asUser, topic } = await setup();
    const id = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "x" });
    await asUser.mutation(api.journal.entries.remove, { id });
    await expect(asUser.mutation(api.journal.entries.update, { id, body: "y" })).rejects.toThrow("Entry not found.");
    await t.run((ctx) => ctx.db.delete(id));
    await expect(asUser.mutation(api.journal.entries.update, { id, body: "y" })).rejects.toThrow("Entry not found.");
  });

  it("remove soft-deletes, hides the entry from every list, and is idempotent", async () => {
    const { t, asUser, topic } = await setup();
    const id = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "bye #x" });
    await asUser.mutation(api.journal.entries.remove, { id });
    await asUser.mutation(api.journal.entries.remove, { id }); // double-fire is fine
    expect(typeof (await t.run((ctx) => ctx.db.get(id)))!.deletedAt).toBe("number");
    expect((await asUser.query(api.journal.entries.list, {})).entries).toEqual([]);
    expect((await asUser.query(api.journal.entries.list, { topicId: topic.id })).entries).toEqual([]);
    expect((await asUser.query(api.journal.entries.list, { tag: "x" })).entries).toEqual([]);
    expect(await tagRows(t, id)).toEqual([]);
  });
});

describe("journal entry metrics", () => {
  it("create records entry_created and words_per_entry; update records words only for a new body", async () => {
    vi.useFakeTimers();
    const { t, asUser, topic } = await setup();
    const id = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "three little words" });
    await asUser.mutation(api.journal.entries.update, { id, title: "only a title" });
    await asUser.mutation(api.journal.entries.update, { id, body: "two words" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const metrics = await t.run((ctx) => ctx.db.query("systemMetrics").collect());
    const journal = metrics.filter((m) => m.system === "journal").map((m) => [m.name, m.value]);
    expect(journal).toEqual([
      ["entry_created", 1],
      ["words_per_entry", 3],
      ["words_per_entry", 2],
    ]);
  });
});
