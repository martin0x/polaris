import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createEntry } from "./entries";
import { createTopic } from "./topics";
import { searchEntries } from "./search";

describe("searchEntries", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("returns recent entries when the query is empty", async () => {
    const topic = await createTopic({ name: "Polaris" });
    await createEntry({ topicId: topic.id, body: "first" });
    await createEntry({ topicId: topic.id, body: "second" });

    const results = await searchEntries({ q: "" });
    expect(results).toHaveLength(2);
  });

  it("ranks title matches above body matches", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const inBody = await createEntry({
      topicId: topic.id,
      body: "casual mention of harvest",
    });
    const inTitle = await createEntry({
      topicId: topic.id,
      title: "Harvest",
      body: "details below",
    });

    const results = await searchEntries({ q: "harvest" });
    expect(results.map((r) => r.id)).toEqual([inTitle.id, inBody.id]);
  });

  it("scopes by topicId when supplied", async () => {
    const a = await createTopic({ name: "a" });
    const b = await createTopic({ name: "b" });
    await createEntry({ topicId: a.id, body: "search hits" });
    await createEntry({ topicId: b.id, body: "search hits" });

    const scoped = await searchEntries({ q: "search", topicId: a.id });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].topicId).toBe(a.id);
  });

  it("excludes soft-deleted entries", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const live = await createEntry({ topicId: topic.id, body: "alive matter" });
    const dead = await createEntry({ topicId: topic.id, body: "alive matter" });
    await prisma.journalEntry.update({
      where: { id: dead.id },
      data: { deletedAt: new Date() },
    });

    const results = await searchEntries({ q: "alive" });
    expect(results.map((r) => r.id)).toEqual([live.id]);
  });
});
