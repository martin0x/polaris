import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createEntry, getEntry, listEntries, updateEntry, softDeleteEntry } from "./entries";

async function seedTopic(name = "Polaris") {
  return prisma.journalTopic.create({ data: { name } });
}

describe("entries service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("creates an entry with parsed tags", async () => {
    const topic = await seedTopic();
    const entry = await createEntry({
      topicId: topic.id,
      title: "First",
      body: "Working on #search and #fts",
    });

    expect(entry.tags).toEqual(["search", "fts"]);
    expect(entry.title).toBe("First");
    expect(entry.topicId).toBe(topic.id);
  });

  it("excludes soft-deleted entries from list/get", async () => {
    const topic = await seedTopic();
    const entry = await createEntry({ topicId: topic.id, body: "kept" });
    const dead = await createEntry({ topicId: topic.id, body: "gone" });
    await softDeleteEntry(dead.id);

    const list = await listEntries({});
    expect(list.map((e) => e.id)).toEqual([entry.id]);
    expect(await getEntry(dead.id)).toBeNull();
  });

  it("re-parses tags on update", async () => {
    const topic = await seedTopic();
    const entry = await createEntry({ topicId: topic.id, body: "#one" });
    const updated = await updateEntry(entry.id, { body: "#two and #three" });

    expect(updated.tags.sort()).toEqual(["three", "two"]);
  });

  it("supports topic and tag filters in list", async () => {
    const a = await seedTopic("a");
    const b = await seedTopic("b");
    await createEntry({ topicId: a.id, body: "alpha #shared #only-a" });
    await createEntry({ topicId: b.id, body: "beta #shared" });

    const byTopic = await listEntries({ topicId: a.id });
    expect(byTopic).toHaveLength(1);

    const byTag = await listEntries({ tag: "only-a" });
    expect(byTag).toHaveLength(1);
    expect(byTag[0].topicId).toBe(a.id);

    const both = await listEntries({ tag: "shared" });
    expect(both).toHaveLength(2);
  });

  it("paginates by createdAt cursor", async () => {
    const topic = await seedTopic();
    for (let i = 0; i < 5; i++) {
      await createEntry({ topicId: topic.id, body: `entry ${i}` });
      await new Promise((r) => setTimeout(r, 5));
    }

    const firstPage = await listEntries({ limit: 2 });
    expect(firstPage).toHaveLength(2);

    const secondPage = await listEntries({
      limit: 2,
      cursor: firstPage[firstPage.length - 1].createdAt,
    });
    expect(secondPage).toHaveLength(2);
    expect(secondPage[0].id).not.toBe(firstPage[1].id);
  });
});
