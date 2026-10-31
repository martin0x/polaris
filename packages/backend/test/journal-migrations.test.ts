import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");
const m = internal.journal.migrations;

const topicRows = [
  { legacyId: "ct1", name: "Builds", archived: false, createdAt: 1_000, updatedAt: 2_000 },
  { legacyId: "ct2", name: "Ops", description: "Infra", archived: true, archivedAt: 3_000, createdAt: 1_500, updatedAt: 3_000 },
];
const parentRows = [{ legacyId: "ct2", legacyParentId: "ct1" }];
const entryRows = [
  { legacyId: "ce1", legacyTopicId: "ct1", title: "Ship", body: "shipped convex #build", tags: ["build"], createdAt: 10_000, updatedAt: 11_000 },
  { legacyId: "ce2", legacyTopicId: "ct1", body: "convex deploy notes", tags: [], createdAt: 20_000, updatedAt: 20_000 },
  { legacyId: "ce3", legacyTopicId: "ct2", body: "old #build", tags: ["build"], deletedAt: 31_000, createdAt: 30_000, updatedAt: 31_000 },
];

async function importAll(t: ReturnType<typeof convexTest>) {
  return {
    topics: await t.mutation(m.importTopics, { rows: topicRows }),
    parents: await t.mutation(m.linkTopicParents, { rows: parentRows }),
    entries: await t.mutation(m.importEntries, { rows: entryRows }),
  };
}

describe("journal imports", () => {
  it("imports topics, parent links, and entries with remapped ids, tags, and search text", async () => {
    const t = convexTest(schema, modules);
    expect(await importAll(t)).toEqual({
      topics: { inserted: 2, updated: 0 },
      parents: { linked: 1 },
      entries: { inserted: 3, updated: 0 },
    });
    const [builds, ops] = await t.run(async (ctx) => [
      await ctx.db.query("journalTopics").withIndex("by_legacy_id", (q) => q.eq("legacyId", "ct1")).unique(),
      await ctx.db.query("journalTopics").withIndex("by_legacy_id", (q) => q.eq("legacyId", "ct2")).unique(),
    ]);
    expect(ops).toMatchObject({ name: "Ops", description: "Infra", archived: true, archivedAt: 3_000, parentId: builds!._id });
    const ship = await t.run((ctx) =>
      ctx.db.query("journalEntries").withIndex("by_legacy_id", (q) => q.eq("legacyId", "ce1")).unique()
    );
    expect(ship).toMatchObject({ topicId: builds!._id, title: "Ship", searchText: "Ship\nshipped convex #build", createdAt: 10_000, updatedAt: 11_000 });
    const tags = await t.run((ctx) => ctx.db.query("entryTags").collect());
    expect(tags.map((r) => [r.tag, r.entryId, r.entryCreatedAt])).toEqual([["build", ship!._id, 10_000]]); // ce3 is deleted
  });

  it("is idempotent — a rerun updates in place, and parent links come back after replace", async () => {
    const t = convexTest(schema, modules);
    await importAll(t);
    expect(await importAll(t)).toEqual({
      topics: { inserted: 0, updated: 2 },
      parents: { linked: 1 },
      entries: { inserted: 0, updated: 3 },
    });
    const stats = await t.query(m.stats, {});
    expect(stats).toMatchObject({ topicCount: 2, parentLinkCount: 1, entryCount: 3, deletedEntryCount: 1 });
    expect(await t.run(async (ctx) => (await ctx.db.query("entryTags").collect()).length)).toBe(1);
  });

  it("throws on an unknown topic or parent", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(m.importEntries, { rows: [entryRows[0]] })).rejects.toThrow("Unknown topic ct1");
    await t.mutation(m.importTopics, { rows: [topicRows[1]] });
    await expect(t.mutation(m.linkTopicParents, { rows: parentRows })).rejects.toThrow("Unknown topic ct1");
  });

  it("refuses a topic name already used in Convex under another id", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ subject: "u|s" }).mutation(api.journal.topics.create, { name: "Builds" });
    await expect(t.mutation(m.importTopics, { rows: [topicRows[0]] })).rejects.toThrow(
      'Topic "Builds" already exists in Convex under another id'
    );
  });

  it("stats counts live entries, body characters, and tags per topic key", async () => {
    const t = convexTest(schema, modules);
    await importAll(t);
    const stats = await t.query(m.stats, {});
    expect(stats.archivedTopicCount).toBe(1);
    expect(stats.liveEntriesByTopic).toEqual([["ct1", 2]]);
    expect(stats.liveBodyCharsByTopic).toEqual([["ct1", "shipped convex #build".length + "convex deploy notes".length]]);
    expect(stats.liveTagCounts).toEqual([["build", 1]]);
  });

  it("entriesByLegacyIds returns comparable fields in input order", async () => {
    const t = convexTest(schema, modules);
    await importAll(t);
    expect(await t.query(m.entriesByLegacyIds, { legacyIds: ["ce3", "missing", "ce2"] })).toEqual([
      { legacyTopicId: "ct2", title: null, body: "old #build", tags: ["build"], deletedAt: 31_000, createdAt: 30_000, updatedAt: 31_000 },
      null,
      { legacyTopicId: "ct1", title: null, body: "convex deploy notes", tags: [], deletedAt: null, createdAt: 20_000, updatedAt: 20_000 },
    ]);
  });

  it("searchProbe runs the journal search and returns legacy ids", async () => {
    const t = convexTest(schema, modules);
    await importAll(t);
    expect((await t.query(m.searchProbe, { q: "convex" })).sort()).toEqual(["ce1", "ce2"]);
    expect(await t.query(m.searchProbe, { q: "convex deploy" })).toEqual(["ce2"]);
  });
});
