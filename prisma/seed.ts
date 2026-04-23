import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const prisma = new PrismaClient({ accelerateUrl: url });

async function main() {
  console.log("Seeding database...");

  const email = process.env.ALLOWED_EMAIL;
  if (email) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: "Raymart" },
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
