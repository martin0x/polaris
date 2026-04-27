import { prisma } from "@/platform/db/client";

export async function withCleanJournalTables(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "journal_entries", "journal_topics" RESTART IDENTITY CASCADE'
  );
}

export function requireTestDatabase(): void {
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error(
      "DATABASE_URL_TEST is not set. Integration tests require a dedicated test database."
    );
  }
}
