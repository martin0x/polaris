import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseAllowlist } from "../src/platform/auth/allowlist";

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  if (url.startsWith("prisma+postgres://") || url.startsWith("prisma://")) {
    return new PrismaClient({ accelerateUrl: url });
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

const prisma = createClient();

async function main() {
  console.log("Seeding database...");

  const emails = parseAllowlist(process.env.ALLOWED_EMAILS);
  for (const email of emails) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email },
    });
    console.log(`Seeded user: ${email}`);
  }

  console.log("Seeding complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
