import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";

describe("journal migration", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("populates the search_vector for inserted entries", async () => {
    const topic = await prisma.journalTopic.create({
      data: { name: "Polaris" },
    });
    await prisma.journalEntry.create({
      data: {
        topicId: topic.id,
        title: "Shipping the journal",
        body: "First system on the platform. #milestone",
        tags: ["milestone"],
      },
    });

    const rows = await prisma.$queryRaw<Array<{ matches: number }>>`
      SELECT COUNT(*)::int AS matches FROM journal_entries
      WHERE search_vector @@ to_tsquery('english', 'shipping & journal')
    `;

    expect(rows[0].matches).toBe(1);
  });
});
