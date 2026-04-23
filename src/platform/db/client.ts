import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // prisma+postgres:// URLs use Prisma Accelerate protocol
  if (url.startsWith("prisma+postgres://") || url.startsWith("prisma://")) {
    return new PrismaClient({ accelerateUrl: url });
  }

  // Direct PostgreSQL connections require a driver adapter (e.g. @prisma/adapter-pg)
  throw new Error(
    "Direct PostgreSQL URLs require a driver adapter. " +
      "Use a prisma+postgres:// URL or configure an adapter.",
  );
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
