/*
  Warnings:

  - You are about to drop the `Account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VerificationToken` table. If the table is not empty, all the data it contains will be lost.

  Note: the Prisma-generated diff also proposed dropping the `journal_entries.search_vector`
  generated column and its GIN index. That is pre-existing schema/DB drift unrelated to this
  migration (the `searchVector Unsupported("tsvector")` field has no `@map("search_vector")`,
  so Prisma's introspection sees a name mismatch). Those statements were removed by hand —
  this migration only touches the four NextAuth tables, per the phase-1 auth teardown brief.

*/
-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "VerificationToken";
