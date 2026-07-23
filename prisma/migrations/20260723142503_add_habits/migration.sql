-- CreateEnum
CREATE TYPE "HabitTickStatus" AS ENUM ('PARTIAL', 'COMPLETE');

-- CreateTable
CREATE TABLE "habits" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quote" TEXT,
    "position" INTEGER NOT NULL,
    "journalTopicId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_ticks" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "HabitTickStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habit_ticks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "habits_name_key" ON "habits"("name");

-- CreateIndex
CREATE UNIQUE INDEX "habits_journalTopicId_key" ON "habits"("journalTopicId");

-- CreateIndex
CREATE INDEX "habits_archived_idx" ON "habits"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "habit_ticks_habitId_date_key" ON "habit_ticks"("habitId", "date");

-- CreateIndex
CREATE INDEX "habit_ticks_date_idx" ON "habit_ticks"("date");

-- AddForeignKey
ALTER TABLE "habit_ticks" ADD CONSTRAINT "habit_ticks_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "habits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
