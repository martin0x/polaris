import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createTopic } from "../topics";
import { createEntry } from "../entries";
import { computeActiveTopics } from "./computeActiveTopics";

describe("computeActiveTopics", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(async () => {
    await prisma.systemMetric.deleteMany({ where: { system: "journal" } });
    await withCleanJournalTables();
  });

  it("records distinct topic count over the last 7 days", async () => {
    const a = await createTopic({ name: "a" });
    const b = await createTopic({ name: "b" });
    const c = await createTopic({ name: "c" });

    await createEntry({ topicId: a.id, body: "fresh" });
    await createEntry({ topicId: b.id, body: "fresh" });

    const old = await createEntry({ topicId: c.id, body: "old" });
    await prisma.journalEntry.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    await computeActiveTopics();

    const metric = await prisma.systemMetric.findFirst({
      where: { system: "journal", name: "active_topic_count" },
    });
    expect(metric?.value).toBe(2);
  });

  it("ignores soft-deleted entries", async () => {
    const a = await createTopic({ name: "a" });
    const entry = await createEntry({ topicId: a.id, body: "x" });
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { deletedAt: new Date() },
    });

    await computeActiveTopics();

    const metric = await prisma.systemMetric.findFirst({
      where: { system: "journal", name: "active_topic_count" },
    });
    expect(metric?.value).toBe(0);
  });
});
