-- CreateTable
CREATE TABLE "expense_activity_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_activity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_activities" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "title" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_items" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCentavos" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_activity_types_name_key" ON "expense_activity_types"("name");

-- CreateIndex
CREATE INDEX "expense_activity_types_archived_idx" ON "expense_activity_types"("archived");

-- CreateIndex
CREATE INDEX "expense_activities_typeId_idx" ON "expense_activities"("typeId");

-- CreateIndex
CREATE INDEX "expense_activities_startedAt_idx" ON "expense_activities"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "expense_items_activityId_idx" ON "expense_items"("activityId");

-- AddForeignKey
ALTER TABLE "expense_activities" ADD CONSTRAINT "expense_activities_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "expense_activity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_items" ADD CONSTRAINT "expense_items_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "expense_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the starter activity types (fixed-but-adjustable list per the spec).
INSERT INTO "expense_activity_types" ("id", "name", "position", "updatedAt") VALUES
  ('seed-groceries',  'Groceries',  0, CURRENT_TIMESTAMP),
  ('seed-dining-out', 'Dining out', 1, CURRENT_TIMESTAMP),
  ('seed-night-out',  'Night out',  2, CURRENT_TIMESTAMP),
  ('seed-shopping',   'Shopping',   3, CURRENT_TIMESTAMP),
  ('seed-transport',  'Transport',  4, CURRENT_TIMESTAMP),
  ('seed-errands',    'Errands',    5, CURRENT_TIMESTAMP);
