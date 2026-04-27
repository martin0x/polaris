import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import {
  createTopic,
  getTopicByName,
  listTopics,
  renameTopic,
  archiveTopic,
  listTags,
} from "./topics";

describe("topics service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("creates a topic with a unique name", async () => {
    const topic = await createTopic({ name: "Polaris" });
    expect(topic.name).toBe("Polaris");
    expect(topic.archived).toBe(false);
  });

  it("rejects duplicate topic names", async () => {
    await createTopic({ name: "Polaris" });
    await expect(createTopic({ name: "Polaris" })).rejects.toThrow();
  });

  it("renames a topic without changing its id", async () => {
    const topic = await createTopic({ name: "Old" });
    const renamed = await renameTopic(topic.id, "New");
    expect(renamed.id).toBe(topic.id);
    expect(renamed.name).toBe("New");
  });

  it("archives a topic", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const archived = await archiveTopic(topic.id);
    expect(archived.archived).toBe(true);
    expect(archived.archivedAt).not.toBeNull();
  });

  it("lists active topics by default and includes archived only on request", async () => {
    await createTopic({ name: "alpha" });
    const beta = await createTopic({ name: "beta" });
    await archiveTopic(beta.id);

    const active = await listTopics({});
    expect(active.map((t) => t.name)).toEqual(["alpha"]);

    const all = await listTopics({ includeArchived: true });
    expect(all.map((t) => t.name)).toEqual(["alpha", "beta"]);
  });

  it("looks up a topic by URL-encoded name", async () => {
    await createTopic({ name: "Polaris notes" });
    const found = await getTopicByName("Polaris%20notes");
    expect(found?.name).toBe("Polaris notes");
  });

  it("aggregates tag counts from non-deleted entries", async () => {
    const topic = await createTopic({ name: "Polaris" });
    await prisma.journalEntry.create({
      data: { topicId: topic.id, body: "x", tags: ["a", "b"] },
    });
    await prisma.journalEntry.create({
      data: { topicId: topic.id, body: "y", tags: ["a"] },
    });
    await prisma.journalEntry.create({
      data: { topicId: topic.id, body: "z", tags: ["c"], deletedAt: new Date() },
    });

    const counts = await listTags();
    expect(counts).toEqual([
      { tag: "a", count: 2 },
      { tag: "b", count: 1 },
    ]);
  });
});
