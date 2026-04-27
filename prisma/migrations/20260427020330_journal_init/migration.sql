-- CreateTable
CREATE TABLE "journal_topics" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchVector" tsvector,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_topics_name_key" ON "journal_topics"("name");

-- CreateIndex
CREATE INDEX "journal_topics_archived_idx" ON "journal_topics"("archived");

-- CreateIndex
CREATE INDEX "journal_entries_topicId_idx" ON "journal_entries"("topicId");

-- CreateIndex
CREATE INDEX "journal_entries_deletedAt_idx" ON "journal_entries"("deletedAt");

-- CreateIndex
CREATE INDEX "journal_entries_createdAt_idx" ON "journal_entries"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "journal_entries_tags_idx" ON "journal_entries" USING GIN ("tags");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "journal_topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- IMMUTABLE wrapper around to_tsvector so the STORED generated column accepts
-- it. Postgres treats text -> regconfig resolution as STABLE; calling the
-- function with regconfig directly inside an IMMUTABLE wrapper is the standard
-- workaround. Title weighted 'A', body 'B', tags 'C'.
CREATE FUNCTION journal_search_vector(t text, b text, tg text[])
  RETURNS tsvector
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT setweight(to_tsvector('english'::regconfig, coalesce(t, '')),               'A')
      || setweight(to_tsvector('english'::regconfig, b),                              'B')
      || setweight(to_tsvector('english'::regconfig, array_to_string(tg, ' ')),       'C')
$$;

ALTER TABLE journal_entries
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (journal_search_vector(title, body, tags)) STORED;

CREATE INDEX journal_entries_search_idx
  ON journal_entries USING GIN (search_vector);
