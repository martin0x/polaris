# Engineering Journal v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Engineering Journal — Polaris's first system on top of the foundation — as a topic-organised micro-log with markdown entries, full-text search, soft delete, and three-metric feedback integration.

**Architecture:** A self-contained `src/systems/journal/` module that conforms to the existing `SystemManifest` contract. Postgres tables (`journal_topics`, `journal_entries`) use a generated `tsvector` column + GIN index for FTS. Page routes live under a new `(systems)` route group. UI reuses Polaris design tokens, primitives, and the Lucide-based `Icon` component — no new visual language. Tiptap (with `tiptap-markdown`) authors entries; `react-markdown` plus a post-process pass renders them with `[[Topic]]` and `#tag` links.

**Tech Stack:** TypeScript 5, Bun, Next.js 16.2.4 (App Router), React 19, Prisma 7 (driver-adapter mode), PostgreSQL 17, Tiptap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `tiptap-markdown`), `react-markdown`, Zod 4, BullMQ, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-26-engineering-journal-design.md`

> **Cross-cutting notes that apply to every task:**
> - **Bun, not npm.** Anywhere a step runs `npm …`, the actual command is `bun …`. Anywhere it would run `tsx <file>.ts`, run `bun <file>.ts` (Bun executes TypeScript natively).
> - **Prisma client is at `@/generated/prisma/client`**, not `@prisma/client`. The schema's `datasource db` has no `url` — the URL is read at runtime by `src/platform/db/client.ts`.
> - **Auth runs in the catch-all** at `src/app/api/systems/[system]/[...path]/route.ts`. Route handlers receive an authenticated request and don't repeat the auth check. Pages should call `auth()` from `@/platform/auth/config` themselves when they need session info; the platform middleware already redirects unauthenticated visitors to `/auth/signin`.
> - **Design system is non-negotiable.** Tokens, never hex. Lucide via `Icon.tsx`. Sentence case. Paper + ink. See `docs/design/README.md` and `docs/design/polaris-design-system.md` before writing UI.
> - **Iteration logging is platform-level.** Use `feedback.logIteration("journal", { description, reason })` directly from any code path; do not add a journal-side CLI or admin UI.
> - **Out of scope (per spec §"What This Spec Does NOT Cover"):** Global Command Palette, Tiptap mention nodes, AI features, hard delete, edit history, mobile-first capture, nested topics, single-entry standalone page, tag management UI, iteration-logging tooling. Do not plan for these.

---

## File Map

Files this plan creates or modifies, organised by responsibility. Every path is exact.

```
# Database
prisma/schema.prisma                                # Add JournalTopic + JournalEntry models
prisma/migrations/<timestamp>_journal_init/migration.sql
                                                    # Prisma-generated + appended raw SQL (tsvector + GIN)

# System module
src/systems/journal/manifest.ts                     # Manifest (routes + jobs + nav + palette)
src/systems/journal/services/parser.ts              # extractTags, wordCount
src/systems/journal/services/parser.test.ts
src/systems/journal/services/search.ts              # searchEntries (FTS via prisma.$queryRaw)
src/systems/journal/services/search.test.ts
src/systems/journal/services/entries.ts             # createEntry, updateEntry, deleteEntry, getEntry, listEntries
src/systems/journal/services/topics.ts              # createTopic, updateTopic, getTopic, listTopics, listTags
src/systems/journal/services/jobs/computeActiveTopics.ts
src/systems/journal/services/jobs/computeActiveTopics.test.ts
src/systems/journal/services/jobs/index.ts          # registerSchedules() — schedules the cron once
src/systems/journal/schemas/entries.ts              # Zod: createEntry, updateEntry, listEntries query
src/systems/journal/schemas/topics.ts               # Zod: createTopic, updateTopic
src/systems/journal/routes/entries.ts               # listEntries, createEntry, getEntry, updateEntry, deleteEntry
src/systems/journal/routes/entries.test.ts
src/systems/journal/routes/topics.ts                # listTopics, createTopic, getTopic, updateTopic
src/systems/journal/routes/topics.test.ts
src/systems/journal/routes/tags.ts                  # listTags
src/systems/journal/routes/index.ts                 # Re-exports for manifest.routes wiring
src/systems/journal/palette.ts                      # topicsLayer, notesLayer (palette block)
src/systems/journal/components/MarkdownContent.tsx  # react-markdown + post-process
src/systems/journal/components/MarkdownContent.test.tsx
src/systems/journal/components/EntryCard.tsx
src/systems/journal/components/TopicChip.tsx
src/systems/journal/components/TagChip.tsx
src/systems/journal/components/Editor.tsx           # Tiptap configuration + serializer
src/systems/journal/components/TopicPicker.tsx
src/systems/journal/components/ComposeBox.tsx
src/systems/journal/components/EntryActions.tsx     # Edit / Delete hover actions

# Register the manifest
src/systems/index.ts                                # Add `manifest as journalManifest` import + entry

# Page routes
src/app/(systems)/layout.tsx                        # Mirrors (platform)/layout.tsx — TitleBar + Sidebar shell
src/app/(systems)/journal/layout.tsx                # Tab strip (Today / Topics / Tags + search input)
src/app/(systems)/journal/page.tsx                  # Today
src/app/(systems)/journal/topics/page.tsx           # Topics index
src/app/(systems)/journal/topics/[name]/page.tsx    # Topic page
src/app/(systems)/journal/tags/page.tsx             # Tags index
src/app/(systems)/journal/tags/[tag]/page.tsx       # Tag page
src/app/(systems)/journal/search/page.tsx           # Search results

# Design-system extension
src/app/_components/Icon.tsx                        # Add archive, edit-3, trash-2, tag, command paths + IconName entries
src/app/globals.css                                 # Append .hl, .compose, .entry-card, .tab-strip, journal-specific classes

# Worker bootstrap
src/platform/jobs/start-workers.ts                  # Add a one-time call into journal's registerSchedules()

# Test infrastructure
src/test/db.ts                                      # withCleanJournalTables() integration test helper
vitest.integration.config.ts                        # Integration-test runner (requires DATABASE_URL_TEST)
package.json                                        # Add test:integration + tiptap/react-markdown deps + integration script

# Environment
.env.example                                        # Add DATABASE_URL_TEST (commented)
```

---

## Test infrastructure conventions

Two layers of tests in this plan:

1. **Unit tests** (`*.test.ts(x)`) — pure logic, mocked Prisma, run by the existing `bun run test` script via `vitest.config.ts`.
2. **Integration tests** (`*.integration.test.ts`) — hit a real Postgres database via the platform's Prisma client. Run by a separate `bun run test:integration` script that points to `DATABASE_URL_TEST`. Each test file calls `withCleanJournalTables()` in a `beforeEach` to truncate `journal_entries` + `journal_topics`.

`vitest.integration.config.ts` and `src/test/db.ts` are introduced in **Task 1** because the very first integration we need (verifying the FTS migration) requires them.

`DATABASE_URL_TEST` points to a separate database on the same Postgres container — `polaris_test`. The plan creates it once in Task 1 and applies the migration there too.

---

## Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_journal_init/migration.sql` (Prisma generates the file; we append raw SQL)
- Create: `vitest.integration.config.ts`
- Create: `src/test/db.ts`
- Create: `src/systems/journal/services/__migration__.integration.test.ts` (one-shot smoke test for the tsvector column)
- Modify: `package.json` (add `test:integration` script + `pg` is already installed)
- Modify: `.env.example`

- [ ] **Step 1: Append the journal models to `prisma/schema.prisma`**

Add this block at the end of the file:

```prisma
// === Journal System ===

model JournalTopic {
  id          String    @id @default(cuid())
  name        String    @unique
  description String?
  parentId    String?   // reserved for nested topics; always null in v1
  archived    Boolean   @default(false)
  archivedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  entries     JournalEntry[]

  @@index([archived])
  @@map("journal_topics")
}

model JournalEntry {
  id           String    @id @default(cuid())
  topicId      String
  topic        JournalTopic @relation(fields: [topicId], references: [id])
  title        String?
  body         String    @db.Text
  tags         String[]  @default([])
  searchVector Unsupported("tsvector")?
  deletedAt    DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([topicId])
  @@index([deletedAt])
  @@index([createdAt(sort: Desc)])
  @@index([tags], type: Gin)
  @@map("journal_entries")
}
```

- [ ] **Step 2: Generate the migration**

Run: `bun prisma migrate dev --name journal_init --create-only`

Expected: a new folder under `prisma/migrations/` named `<timestamp>_journal_init/` with a `migration.sql` containing `CREATE TABLE journal_topics …` and `CREATE TABLE journal_entries …`. The `--create-only` flag stops Prisma from applying it so we can append raw SQL first.

- [ ] **Step 3: Append the tsvector column + GIN index to that migration**

Open the freshly-created `prisma/migrations/<timestamp>_journal_init/migration.sql` and append at the bottom:

```sql
-- Generated tsvector column for full-text search.
-- Title weighted 'A', body 'B', tags 'C'.
ALTER TABLE journal_entries
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', body), 'B') ||
    setweight(to_tsvector('english', array_to_string(tags, ' ')), 'C')
  ) STORED;

CREATE INDEX journal_entries_search_idx
  ON journal_entries USING GIN (search_vector);
```

- [ ] **Step 4: Apply the migration to the dev DB and regenerate the client**

Run: `bun prisma migrate deploy && bun prisma generate`

Expected: `Database is now in sync with the migration` and the Prisma Client emits to `src/generated/prisma/`.

- [ ] **Step 5: Set up the test database**

Add to `.env.example` (just below `DATABASE_URL`):

```env
# Optional — separate database for integration tests. If unset, integration tests skip.
DATABASE_URL_TEST=postgresql://polaris:polaris@localhost:5440/polaris_test
```

Then create the test database and apply the migration to it:

```bash
docker compose -f docker/docker-compose.yml exec postgres psql -U polaris -d polaris -c 'CREATE DATABASE polaris_test;'
DATABASE_URL=postgresql://polaris:polaris@localhost:5440/polaris_test bun prisma migrate deploy
```

Expected: both commands succeed; `polaris_test` now has the same schema as `polaris`.

- [ ] **Step 6: Add the integration vitest config**

Create `vitest.integration.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts", "src/**/*.integration.test.tsx"],
    setupFiles: ["src/test/setup-env.ts"],
    pool: "forks", // each suite gets a fresh process so the singleton Prisma client picks up DATABASE_URL_TEST
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create `src/test/setup-env.ts`:

```typescript
const testUrl = process.env.DATABASE_URL_TEST;
if (testUrl) {
  process.env.DATABASE_URL = testUrl;
}
```

- [ ] **Step 7: Add the test cleanup helper**

Create `src/test/db.ts`:

```typescript
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
```

- [ ] **Step 8: Wire up the script in `package.json`**

Modify `scripts`:

```json
{
  "scripts": {
    "dev": "docker compose -f docker/docker-compose.yml up -d && next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "workers": "bun src/platform/jobs/start-workers.ts"
  }
}
```

- [ ] **Step 9: Write the failing migration smoke test**

Create `src/systems/journal/services/__migration__.integration.test.ts`:

```typescript
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
```

- [ ] **Step 10: Run the integration suite to verify**

Run: `bun run test:integration`

Expected: PASS — the entry inserted by the test is matched by the FTS query, proving the generated tsvector column and GIN index work.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations vitest.integration.config.ts src/test package.json .env.example src/systems/journal/services/__migration__.integration.test.ts
git commit -m "feat(journal): add schema + tsvector migration and integration test scaffold"
```

---

## Task 2: System shell + body parser

**Files:**
- Create: `src/systems/journal/manifest.ts`
- Create: `src/systems/journal/services/parser.ts`
- Create: `src/systems/journal/services/parser.test.ts`
- Create: `src/systems/journal/palette.ts` (stub — populated later when palette consumer ships)
- Modify: `src/systems/index.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `src/systems/journal/services/parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractTags, wordCount } from "./parser";

describe("extractTags", () => {
  it("returns the lowercased, deduplicated set of #tags", () => {
    const body = "working on #journal and #JOURNAL and #search";
    expect(extractTags(body)).toEqual(["journal", "search"]);
  });

  it("ignores tags inside fenced code blocks", () => {
    const body = "Real tag #real\n```\n#fakeincode\n```\n";
    expect(extractTags(body)).toEqual(["real"]);
  });

  it("ignores tags inside inline code", () => {
    const body = "use the `#fake` directive but #real-tag matters";
    expect(extractTags(body)).toEqual(["real-tag"]);
  });

  it("ignores a lone hash", () => {
    expect(extractTags("nothing here # alone")).toEqual([]);
  });

  it("ignores hash sequences in the middle of a word", () => {
    expect(extractTags("issue#123 is mid-word, #real is not")).toEqual(["real"]);
  });

  it("returns an empty array for empty input", () => {
    expect(extractTags("")).toEqual([]);
  });
});

describe("wordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(wordCount("one two three")).toBe(3);
  });

  it("strips fenced code before counting", () => {
    expect(wordCount("hello\n```\nfunction noisy(x) { return x }\n```\nworld")).toBe(2);
  });

  it("strips inline code before counting", () => {
    expect(wordCount("hello `noisy(x)` world")).toBe(2);
  });

  it("returns 0 for empty input", () => {
    expect(wordCount("")).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test src/systems/journal/services/parser.test.ts`
Expected: FAIL — module `./parser` does not exist yet.

- [ ] **Step 3: Implement the parser**

Create `src/systems/journal/services/parser.ts`:

```typescript
const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`]*`/g;
// Anchored: must be at start-of-string or preceded by non-word char.
// First char must be a letter so we skip "#123" but keep "#bug-1".
const TAG = /(?:^|[^\w])#([a-zA-Z][\w-]*)/g;

function stripCode(body: string): string {
  return body.replace(FENCED_CODE, "").replace(INLINE_CODE, "");
}

export function extractTags(body: string): string[] {
  if (!body) return [];
  const stripped = stripCode(body);
  const seen = new Set<string>();
  for (const match of stripped.matchAll(TAG)) {
    seen.add(match[1].toLowerCase());
  }
  return [...seen];
}

export function wordCount(body: string): number {
  if (!body) return 0;
  const stripped = stripCode(body);
  return stripped.split(/\s+/).filter(Boolean).length;
}
```

- [ ] **Step 4: Run tests until green**

Run: `bun run test src/systems/journal/services/parser.test.ts`
Expected: PASS, 11 / 11.

- [ ] **Step 5: Stub the palette block**

Create `src/systems/journal/palette.ts` — the journal manifest declares a `palette` block but the actual layer shapes are owned by the (separately-specced) Global Command Palette. Stubbing here lets the manifest typecheck against an open-ended structure, with the real shape filled in when the palette spec ships.

```typescript
// Palette layers for the Global Command Palette (separate spec).
// The shape is intentionally loose for v1: the palette consumer reads `name`
// to identify the layer. The full layer interface lands with that spec.

export const topicsLayer = {
  name: "journal:topics",
};

export const notesLayer = {
  name: "journal:notes",
};
```

- [ ] **Step 6: Write the manifest**

Create `src/systems/journal/manifest.ts`:

```typescript
import { SystemManifest } from "../types";
import * as palette from "./palette";

// Routes and jobs are wired in subsequent tasks. The empty maps are deliberate:
// they let the system register its nav and palette block with the platform
// before the route handlers exist.
export const manifest: SystemManifest = {
  name: "journal",
  displayName: "Engineering Journal",
  description: "Daily micro-log of building, learning, and working",

  routes: {},
  jobs: {},

  nav: {
    label: "Journal",
    icon: "book-open",
    href: "/journal",
  },

  // The platform's `SystemManifest` contract does not yet include `palette`.
  // The Global Command Palette spec extends it. Until that spec ships, we
  // attach the block via a non-typed assignment so the manifest still
  // typechecks. See `docs/superpowers/specs/2026-04-26-global-command-palette-design.md`.
};

(manifest as SystemManifest & { palette: { layers: unknown[] } }).palette = {
  layers: [palette.topicsLayer, palette.notesLayer],
};
```

- [ ] **Step 7: Register the manifest**

Modify `src/systems/index.ts` to:

```typescript
import { SystemManifest } from "./types";
import { manifest as journalManifest } from "./journal/manifest";

export const manifests: SystemManifest[] = [
  journalManifest,
];
```

- [ ] **Step 8: Manual verification — sidebar shows the journal nav**

Run: `bun run dev`

Open `http://localhost:3000` in a browser, sign in, and confirm:
- The left sidebar's "Systems" section now contains a "Journal" item with the open-book icon.
- Clicking it 404s for now (the page route doesn't exist yet) — that's expected.

- [ ] **Step 9: Commit**

```bash
git add src/systems/journal src/systems/index.ts
git commit -m "feat(journal): add manifest, body parser, and palette stub"
```

---

## Task 3: Search helper + entry/topic services

**Files:**
- Create: `src/systems/journal/services/search.ts`
- Create: `src/systems/journal/services/search.integration.test.ts`
- Create: `src/systems/journal/services/entries.ts`
- Create: `src/systems/journal/services/entries.integration.test.ts`
- Create: `src/systems/journal/services/topics.ts`
- Create: `src/systems/journal/services/topics.integration.test.ts`

These services centralise database access for the journal. Route handlers (Task 4) call into them. Pages (Tasks 6–9) also import from them when a server component needs to render data without going through the API.

- [ ] **Step 1: Write the failing entries-service tests**

Create `src/systems/journal/services/entries.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createEntry, getEntry, listEntries, updateEntry, softDeleteEntry } from "./entries";

async function seedTopic(name = "Polaris") {
  return prisma.journalTopic.create({ data: { name } });
}

describe("entries service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("creates an entry with parsed tags", async () => {
    const topic = await seedTopic();
    const entry = await createEntry({
      topicId: topic.id,
      title: "First",
      body: "Working on #search and #fts",
    });

    expect(entry.tags).toEqual(["search", "fts"]);
    expect(entry.title).toBe("First");
    expect(entry.topicId).toBe(topic.id);
  });

  it("excludes soft-deleted entries from list/get", async () => {
    const topic = await seedTopic();
    const entry = await createEntry({ topicId: topic.id, body: "kept" });
    const dead = await createEntry({ topicId: topic.id, body: "gone" });
    await softDeleteEntry(dead.id);

    const list = await listEntries({});
    expect(list.map((e) => e.id)).toEqual([entry.id]);
    expect(await getEntry(dead.id)).toBeNull();
  });

  it("re-parses tags on update", async () => {
    const topic = await seedTopic();
    const entry = await createEntry({ topicId: topic.id, body: "#one" });
    const updated = await updateEntry(entry.id, { body: "#two and #three" });

    expect(updated.tags.sort()).toEqual(["three", "two"]);
  });

  it("supports topic and tag filters in list", async () => {
    const a = await seedTopic("a");
    const b = await seedTopic("b");
    await createEntry({ topicId: a.id, body: "alpha #shared #only-a" });
    await createEntry({ topicId: b.id, body: "beta #shared" });

    const byTopic = await listEntries({ topicId: a.id });
    expect(byTopic).toHaveLength(1);

    const byTag = await listEntries({ tag: "only-a" });
    expect(byTag).toHaveLength(1);
    expect(byTag[0].topicId).toBe(a.id);

    const both = await listEntries({ tag: "shared" });
    expect(both).toHaveLength(2);
  });

  it("paginates by createdAt cursor", async () => {
    const topic = await seedTopic();
    for (let i = 0; i < 5; i++) {
      await createEntry({ topicId: topic.id, body: `entry ${i}` });
      await new Promise((r) => setTimeout(r, 5));
    }

    const firstPage = await listEntries({ limit: 2 });
    expect(firstPage).toHaveLength(2);

    const secondPage = await listEntries({
      limit: 2,
      cursor: firstPage[firstPage.length - 1].createdAt,
    });
    expect(secondPage).toHaveLength(2);
    expect(secondPage[0].id).not.toBe(firstPage[1].id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test:integration src/systems/journal/services/entries.integration.test.ts`
Expected: FAIL — module `./entries` does not exist.

- [ ] **Step 3: Implement the entries service**

Create `src/systems/journal/services/entries.ts`:

```typescript
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/platform/db/client";
import { extractTags, wordCount } from "./parser";

export type JournalEntryWithTopic = Prisma.JournalEntryGetPayload<{
  include: { topic: true };
}>;

export interface CreateEntryInput {
  topicId: string;
  title?: string | null;
  body: string;
}

export async function createEntry(
  input: CreateEntryInput
): Promise<JournalEntryWithTopic> {
  const tags = extractTags(input.body);
  return prisma.journalEntry.create({
    data: {
      topicId: input.topicId,
      title: input.title ?? null,
      body: input.body,
      tags,
    },
    include: { topic: true },
  });
}

export interface UpdateEntryInput {
  topicId?: string;
  title?: string | null;
  body?: string;
}

export async function updateEntry(
  id: string,
  input: UpdateEntryInput
): Promise<JournalEntryWithTopic> {
  const data: Record<string, unknown> = {};
  if (input.topicId !== undefined) data.topicId = input.topicId;
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) {
    data.body = input.body;
    data.tags = extractTags(input.body);
  }
  return prisma.journalEntry.update({
    where: { id },
    data,
    include: { topic: true },
  });
}

export async function softDeleteEntry(id: string): Promise<void> {
  await prisma.journalEntry.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function getEntry(id: string): Promise<JournalEntryWithTopic | null> {
  return prisma.journalEntry.findFirst({
    where: { id, deletedAt: null },
    include: { topic: true },
  });
}

export interface ListEntriesInput {
  topicId?: string;
  tag?: string;
  cursor?: Date;
  limit?: number;
}

export async function listEntries(
  input: ListEntriesInput
): Promise<JournalEntryWithTopic[]> {
  const limit = Math.min(input.limit ?? 50, 100);
  return prisma.journalEntry.findMany({
    where: {
      deletedAt: null,
      ...(input.topicId ? { topicId: input.topicId } : {}),
      ...(input.tag ? { tags: { has: input.tag } } : {}),
      ...(input.cursor ? { createdAt: { lt: input.cursor } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { topic: true },
  });
}

export function entryWordCount(body: string): number {
  return wordCount(body);
}
```

- [ ] **Step 4: Run the entries tests until green**

Run: `bun run test:integration src/systems/journal/services/entries.integration.test.ts`
Expected: PASS, 5 / 5.

- [ ] **Step 5: Write the failing topics-service tests**

Create `src/systems/journal/services/topics.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import {
  createTopic,
  getTopicByName,
  listTopics,
  renameTopic,
  archiveTopic,
  listTags,
} from "./topics";

describe("topics service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("creates a topic with a unique name", async () => {
    const topic = await createTopic({ name: "Polaris" });
    expect(topic.name).toBe("Polaris");
    expect(topic.archived).toBe(false);
  });

  it("rejects duplicate topic names", async () => {
    await createTopic({ name: "Polaris" });
    await expect(createTopic({ name: "Polaris" })).rejects.toThrow();
  });

  it("renames a topic without changing its id", async () => {
    const topic = await createTopic({ name: "Old" });
    const renamed = await renameTopic(topic.id, "New");
    expect(renamed.id).toBe(topic.id);
    expect(renamed.name).toBe("New");
  });

  it("archives a topic", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const archived = await archiveTopic(topic.id);
    expect(archived.archived).toBe(true);
    expect(archived.archivedAt).not.toBeNull();
  });

  it("lists active topics by default and includes archived only on request", async () => {
    await createTopic({ name: "alpha" });
    const beta = await createTopic({ name: "beta" });
    await archiveTopic(beta.id);

    const active = await listTopics({});
    expect(active.map((t) => t.name)).toEqual(["alpha"]);

    const all = await listTopics({ includeArchived: true });
    expect(all.map((t) => t.name)).toEqual(["alpha", "beta"]);
  });

  it("looks up a topic by URL-encoded name", async () => {
    await createTopic({ name: "Polaris notes" });
    const found = await getTopicByName("Polaris%20notes");
    expect(found?.name).toBe("Polaris notes");
  });

  it("aggregates tag counts from non-deleted entries", async () => {
    const topic = await createTopic({ name: "Polaris" });
    await prisma.journalEntry.create({
      data: { topicId: topic.id, body: "x", tags: ["a", "b"] },
    });
    await prisma.journalEntry.create({
      data: { topicId: topic.id, body: "y", tags: ["a"] },
    });
    await prisma.journalEntry.create({
      data: { topicId: topic.id, body: "z", tags: ["c"], deletedAt: new Date() },
    });

    const counts = await listTags();
    expect(counts).toEqual([
      { tag: "a", count: 2 },
      { tag: "b", count: 1 },
    ]);
  });
});
```

- [ ] **Step 6: Run the topics tests to verify they fail**

Run: `bun run test:integration src/systems/journal/services/topics.integration.test.ts`
Expected: FAIL — module `./topics` does not exist.

- [ ] **Step 7: Implement the topics service**

Create `src/systems/journal/services/topics.ts`:

```typescript
import { prisma } from "@/platform/db/client";
import type { JournalTopic } from "@/generated/prisma/client";

export interface CreateTopicInput {
  name: string;
  description?: string;
}

export async function createTopic(input: CreateTopicInput): Promise<JournalTopic> {
  return prisma.journalTopic.create({
    data: {
      name: input.name,
      description: input.description ?? null,
    },
  });
}

export async function listTopics(opts: {
  includeArchived?: boolean;
}): Promise<JournalTopic[]> {
  return prisma.journalTopic.findMany({
    where: opts.includeArchived ? {} : { archived: false },
    orderBy: { name: "asc" },
  });
}

export async function getTopicById(id: string): Promise<JournalTopic | null> {
  return prisma.journalTopic.findUnique({ where: { id } });
}

export async function getTopicByName(encoded: string): Promise<JournalTopic | null> {
  const name = decodeURIComponent(encoded);
  return prisma.journalTopic.findUnique({ where: { name } });
}

export async function renameTopic(id: string, name: string): Promise<JournalTopic> {
  return prisma.journalTopic.update({ where: { id }, data: { name } });
}

export async function updateTopicDescription(
  id: string,
  description: string | null
): Promise<JournalTopic> {
  return prisma.journalTopic.update({ where: { id }, data: { description } });
}

export async function archiveTopic(id: string): Promise<JournalTopic> {
  return prisma.journalTopic.update({
    where: { id },
    data: { archived: true, archivedAt: new Date() },
  });
}

export async function unarchiveTopic(id: string): Promise<JournalTopic> {
  return prisma.journalTopic.update({
    where: { id },
    data: { archived: false, archivedAt: null },
  });
}

export interface TagCount {
  tag: string;
  count: number;
}

export async function listTags(): Promise<TagCount[]> {
  const rows = await prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
    SELECT tag, COUNT(*)::bigint AS count
    FROM (
      SELECT unnest(tags) AS tag
      FROM journal_entries
      WHERE deleted_at IS NULL
    ) t
    GROUP BY tag
    ORDER BY tag;
  `;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}
```

- [ ] **Step 8: Run the topics tests until green**

Run: `bun run test:integration src/systems/journal/services/topics.integration.test.ts`
Expected: PASS, 7 / 7.

- [ ] **Step 9: Write the failing search-helper tests**

Create `src/systems/journal/services/search.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createEntry } from "./entries";
import { createTopic } from "./topics";
import { searchEntries } from "./search";

describe("searchEntries", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("returns recent entries when the query is empty", async () => {
    const topic = await createTopic({ name: "Polaris" });
    await createEntry({ topicId: topic.id, body: "first" });
    await createEntry({ topicId: topic.id, body: "second" });

    const results = await searchEntries({ q: "" });
    expect(results).toHaveLength(2);
  });

  it("ranks title matches above body matches", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const inBody = await createEntry({
      topicId: topic.id,
      body: "casual mention of harvest",
    });
    const inTitle = await createEntry({
      topicId: topic.id,
      title: "Harvest",
      body: "details below",
    });

    const results = await searchEntries({ q: "harvest" });
    expect(results.map((r) => r.id)).toEqual([inTitle.id, inBody.id]);
  });

  it("scopes by topicId when supplied", async () => {
    const a = await createTopic({ name: "a" });
    const b = await createTopic({ name: "b" });
    await createEntry({ topicId: a.id, body: "search hits" });
    await createEntry({ topicId: b.id, body: "search hits" });

    const scoped = await searchEntries({ q: "search", topicId: a.id });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].topicId).toBe(a.id);
  });

  it("excludes soft-deleted entries", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const live = await createEntry({ topicId: topic.id, body: "alive matter" });
    const dead = await createEntry({ topicId: topic.id, body: "alive matter" });
    await prisma.journalEntry.update({
      where: { id: dead.id },
      data: { deletedAt: new Date() },
    });

    const results = await searchEntries({ q: "alive" });
    expect(results.map((r) => r.id)).toEqual([live.id]);
  });
});
```

- [ ] **Step 10: Run the search tests to verify they fail**

Run: `bun run test:integration src/systems/journal/services/search.integration.test.ts`
Expected: FAIL — module `./search` does not exist.

- [ ] **Step 11: Implement the search helper**

Create `src/systems/journal/services/search.ts`:

```typescript
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/platform/db/client";
import type { JournalEntryWithTopic } from "./entries";

export interface SearchInput {
  q: string;
  topicId?: string;
  limit?: number;
}

interface RankedIdRow {
  id: string;
}

export async function searchEntries(input: SearchInput): Promise<JournalEntryWithTopic[]> {
  const { q, topicId, limit = 20 } = input;
  const trimmed = q.trim();

  const topicFilter = topicId
    ? Prisma.sql`AND e.topic_id = ${topicId}`
    : Prisma.empty;

  // Step 1: rank ids in the right order via the FTS index, then re-hydrate the
  // full entries (with topic relation) through Prisma so the type matches the
  // rest of the system. Two queries, both small — the GIN index does the work.
  const idRows = trimmed
    ? await prisma.$queryRaw<RankedIdRow[]>`
        SELECT e.id
        FROM journal_entries e
        WHERE e.deleted_at IS NULL
          ${topicFilter}
          AND e.search_vector @@ to_tsquery('english', ${tsQuery(trimmed)})
        ORDER BY ts_rank(e.search_vector, to_tsquery('english', ${tsQuery(trimmed)})) DESC
        LIMIT ${limit};
      `
    : await prisma.$queryRaw<RankedIdRow[]>`
        SELECT e.id
        FROM journal_entries e
        WHERE e.deleted_at IS NULL
          ${topicFilter}
        ORDER BY e.created_at DESC
        LIMIT ${limit};
      `;

  if (idRows.length === 0) return [];

  const entries = await prisma.journalEntry.findMany({
    where: { id: { in: idRows.map((r) => r.id) } },
    include: { topic: true },
  });

  // Preserve the rank order from step 1.
  const order = new Map(idRows.map((r, i) => [r.id, i]));
  return entries.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function tsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((tok) => /^[a-zA-Z0-9_-]+$/.test(tok))
    .join(" & ");
}
```

> **Implementation note:** keeping the FTS rank in raw SQL but hydrating the entry rows through Prisma's typed query keeps the result shape identical to what `listEntries` returns. The two-query pattern is cheap because the second query is a primary-key `IN` lookup served from the index.

- [ ] **Step 12: Run the search tests until green**

Run: `bun run test:integration src/systems/journal/services/search.integration.test.ts`
Expected: PASS, 4 / 4.

- [ ] **Step 13: Commit**

```bash
git add src/systems/journal/services
git commit -m "feat(journal): entries, topics, and search service helpers with integration tests"
```

---

## Task 4: API routes + Zod schemas + manifest wiring

**Files:**
- Create: `src/systems/journal/schemas/entries.ts`
- Create: `src/systems/journal/schemas/topics.ts`
- Create: `src/systems/journal/routes/entries.ts`
- Create: `src/systems/journal/routes/topics.ts`
- Create: `src/systems/journal/routes/tags.ts`
- Create: `src/systems/journal/routes/index.ts`
- Create: `src/systems/journal/routes/entries.integration.test.ts`
- Create: `src/systems/journal/routes/topics.integration.test.ts`
- Modify: `src/systems/journal/manifest.ts` (fill in `routes`)

- [ ] **Step 1: Write the entries Zod schema**

Create `src/systems/journal/schemas/entries.ts`:

```typescript
import { z } from "zod";

export const createEntrySchema = z.object({
  topicId: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().min(1),
});

export const updateEntrySchema = z.object({
  topicId: z.string().min(1).optional(),
  title: z.string().trim().max(200).nullable().optional(),
  body: z.string().min(1).optional(),
});

export const listEntriesQuerySchema = z.object({
  topicId: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  cursor: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateEntryBody = z.infer<typeof createEntrySchema>;
export type UpdateEntryBody = z.infer<typeof updateEntrySchema>;
export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;
```

- [ ] **Step 2: Write the topics Zod schema**

Create `src/systems/journal/schemas/topics.ts`:

```typescript
import { z } from "zod";

export const createTopicSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional(),
});

export const updateTopicSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(280).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" });

export const listTopicsQuerySchema = z.object({
  archived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export type CreateTopicBody = z.infer<typeof createTopicSchema>;
export type UpdateTopicBody = z.infer<typeof updateTopicSchema>;
```

- [ ] **Step 3: Write the failing entries-route tests**

Create `src/systems/journal/routes/entries.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createEntry as createEntryRoute, listEntries, updateEntry, deleteEntry } from "./entries";
import { createTopic } from "../services/topics";

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/systems/journal/entries", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/systems/journal/entries${query}`, {
    method: "GET",
  });
}

describe("entries routes", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("POST /entries creates and records both metrics", async () => {
    const topic = await createTopic({ name: "Polaris" });

    const res = await createEntryRoute(
      jsonRequest("POST", { topicId: topic.id, body: "first #milestone" }),
      {}
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.entry.tags).toEqual(["milestone"]);

    const metrics = await prisma.systemMetric.findMany({
      where: { system: "journal" },
      orderBy: { name: "asc" },
    });
    expect(metrics.map((m) => m.name).sort()).toEqual(["entry_created", "words_per_entry"]);
  });

  it("POST /entries returns 400 for invalid body", async () => {
    const res = await createEntryRoute(
      jsonRequest("POST", { topicId: "" }),
      {}
    );
    expect(res.status).toBe(400);
  });

  it("PATCH /entries/:id re-records words_per_entry", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const created = await createEntryRoute(
      jsonRequest("POST", { topicId: topic.id, body: "two words" }),
      {}
    );
    const { entry } = await created.json();

    const res = await updateEntry(
      jsonRequest("PATCH", { body: "now we have four words total" }),
      { id: entry.id }
    );
    expect(res.status).toBe(200);

    const metricRows = await prisma.systemMetric.findMany({
      where: { system: "journal", name: "words_per_entry" },
      orderBy: { recordedAt: "asc" },
    });
    expect(metricRows.map((m) => m.value)).toEqual([2, 6]);
  });

  it("DELETE /entries/:id soft-deletes and is idempotent", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const created = await createEntryRoute(
      jsonRequest("POST", { topicId: topic.id, body: "x" }),
      {}
    );
    const { entry } = await created.json();

    const first = await deleteEntry(jsonRequest("DELETE", {}), { id: entry.id });
    const second = await deleteEntry(jsonRequest("DELETE", {}), { id: entry.id });
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);

    const list = await listEntries(listRequest(), {});
    const json = await list.json();
    expect(json.entries).toHaveLength(0);
  });

  it("GET /entries supports q (FTS) path", async () => {
    const topic = await createTopic({ name: "Polaris" });
    await createEntryRoute(jsonRequest("POST", { topicId: topic.id, body: "alpha" }), {});
    await createEntryRoute(jsonRequest("POST", { topicId: topic.id, body: "beta" }), {});

    const res = await listEntries(listRequest("?q=alpha"), {});
    const json = await res.json();
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].body).toBe("alpha");
  });
});
```

- [ ] **Step 4: Run the entries-route tests to verify they fail**

Run: `bun run test:integration src/systems/journal/routes/entries.integration.test.ts`
Expected: FAIL — module `./entries` does not exist.

- [ ] **Step 5: Implement the entries route handlers**

Create `src/systems/journal/routes/entries.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { badRequest, notFound } from "@/platform/api/errors";
import { feedback } from "@/platform/feedback";
import { RouteHandler } from "@/systems/types";
import {
  createEntrySchema,
  listEntriesQuerySchema,
  updateEntrySchema,
} from "../schemas/entries";
import {
  createEntry as createEntryService,
  entryWordCount,
  getEntry as getEntryService,
  listEntries as listEntriesService,
  softDeleteEntry,
  updateEntry as updateEntryService,
} from "../services/entries";
import { searchEntries } from "../services/search";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function recordEntryMetrics(body: string) {
  await Promise.allSettled([
    feedback.recordMetric("journal", "entry_created", 1),
    feedback.recordMetric("journal", "words_per_entry", entryWordCount(body)),
  ]);
}

async function recordWordsMetric(body: string) {
  await feedback
    .recordMetric("journal", "words_per_entry", entryWordCount(body))
    .catch(() => {});
}

export const createEntry: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createEntrySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return badRequest("Invalid entry body", err.flatten());
    }
    throw err;
  }
  const entry = await createEntryService(parsed);
  await recordEntryMetrics(entry.body);
  return NextResponse.json({ entry }, { status: 201 });
};

export const updateEntry: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateEntrySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      return badRequest("Invalid entry update", err.flatten());
    }
    throw err;
  }

  const existing = await getEntryService(params.id);
  if (!existing) return notFound(`Entry ${params.id} not found`);

  const updated = await updateEntryService(params.id, parsed);
  if (parsed.body !== undefined) await recordWordsMetric(updated.body);
  return NextResponse.json({ entry: updated });
};

export const deleteEntry: RouteHandler = async (_req, params) => {
  await softDeleteEntry(params.id);
  return new NextResponse(null, { status: 204 });
};

export const getEntry: RouteHandler = async (_req, params) => {
  const entry = await getEntryService(params.id);
  if (!entry) return notFound(`Entry ${params.id} not found`);
  return NextResponse.json({ entry });
};

export const listEntries: RouteHandler = async (req) => {
  const search = Object.fromEntries(req.nextUrl.searchParams);
  let parsed;
  try {
    parsed = listEntriesQuerySchema.parse(search);
  } catch (err) {
    if (err instanceof ZodError) {
      return badRequest("Invalid query", err.flatten());
    }
    throw err;
  }

  if (parsed.q && parsed.q.trim().length > 0) {
    const entries = await searchEntries({
      q: parsed.q,
      topicId: parsed.topicId,
      limit: parsed.limit,
    });
    return NextResponse.json({ entries });
  }

  const entries = await listEntriesService({
    topicId: parsed.topicId,
    tag: parsed.tag,
    cursor: parsed.cursor,
    limit: parsed.limit,
  });
  return NextResponse.json({ entries });
};
```

- [ ] **Step 6: Run the entries-route tests until green**

Run: `bun run test:integration src/systems/journal/routes/entries.integration.test.ts`
Expected: PASS, 5 / 5.

- [ ] **Step 7: Write the failing topics-route tests**

Create `src/systems/journal/routes/topics.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createTopic, listTopics, updateTopic, getTopic } from "./topics";
import { listTags } from "./tags";

function req(method: string, body?: unknown, url = "http://localhost/api/systems/journal/topics") {
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("topics routes", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("POST /topics creates a topic and 409s on duplicate name", async () => {
    const first = await createTopic(req("POST", { name: "Polaris" }), {});
    expect(first.status).toBe(201);

    const dup = await createTopic(req("POST", { name: "Polaris" }), {});
    expect(dup.status).toBe(409);
  });

  it("PATCH /topics/:id renames", async () => {
    const created = await createTopic(req("POST", { name: "Old" }), {});
    const { topic } = await created.json();

    const renamed = await updateTopic(req("PATCH", { name: "New" }), { id: topic.id });
    expect(renamed.status).toBe(200);
    const json = await renamed.json();
    expect(json.topic.name).toBe("New");
  });

  it("PATCH /topics/:id archives when archived=true", async () => {
    const created = await createTopic(req("POST", { name: "Polaris" }), {});
    const { topic } = await created.json();

    const res = await updateTopic(
      req("PATCH", { archived: true }),
      { id: topic.id }
    );
    const json = await res.json();
    expect(json.topic.archived).toBe(true);
    expect(json.topic.archivedAt).not.toBeNull();
  });

  it("GET /topics excludes archived by default", async () => {
    await createTopic(req("POST", { name: "alpha" }), {});
    const beta = await createTopic(req("POST", { name: "beta" }), {});
    const { topic } = await beta.json();
    await updateTopic(req("PATCH", { archived: true }), { id: topic.id });

    const list = await listTopics(req("GET", undefined, "http://localhost/api/systems/journal/topics"), {});
    const json = await list.json();
    expect(json.topics.map((t: { name: string }) => t.name)).toEqual(["alpha"]);
  });

  it("GET /topics?archived=true includes archived", async () => {
    await createTopic(req("POST", { name: "alpha" }), {});
    const beta = await createTopic(req("POST", { name: "beta" }), {});
    const { topic } = await beta.json();
    await updateTopic(req("PATCH", { archived: true }), { id: topic.id });

    const list = await listTopics(
      req("GET", undefined, "http://localhost/api/systems/journal/topics?archived=true"),
      {}
    );
    const json = await list.json();
    expect(json.topics).toHaveLength(2);
  });

  it("GET /topics/:id returns the topic", async () => {
    const res = await createTopic(req("POST", { name: "Polaris" }), {});
    const { topic } = await res.json();

    const got = await getTopic(req("GET"), { id: topic.id });
    expect(got.status).toBe(200);
    const json = await got.json();
    expect(json.topic.name).toBe("Polaris");
  });

  it("GET /tags returns tag counts (read-only)", async () => {
    const tags = await listTags(req("GET", undefined, "http://localhost/api/systems/journal/tags"), {});
    expect(tags.status).toBe(200);
    const json = await tags.json();
    expect(json.tags).toEqual([]);
  });
});
```

- [ ] **Step 8: Run the topics-route tests to verify they fail**

Run: `bun run test:integration src/systems/journal/routes/topics.integration.test.ts`
Expected: FAIL — modules `./topics` and `./tags` do not exist.

- [ ] **Step 9: Implement the topics route handlers**

Create `src/systems/journal/routes/topics.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { createTopicSchema, listTopicsQuerySchema, updateTopicSchema } from "../schemas/topics";
import {
  archiveTopic,
  createTopic as createTopicService,
  getTopicById,
  listTopics as listTopicsService,
  renameTopic,
  unarchiveTopic,
  updateTopicDescription,
} from "../services/topics";
import { prisma } from "@/platform/db/client";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const createTopic: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createTopicSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid topic", err.flatten());
    throw err;
  }
  try {
    const topic = await createTopicService(parsed);
    return NextResponse.json({ topic }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return apiError(409, `Topic "${parsed.name}" already exists`);
    }
    throw err;
  }
};

export const listTopics: RouteHandler = async (req) => {
  const search = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = listTopicsQuerySchema.parse(search);
  const topics = await listTopicsService({ includeArchived: parsed.archived });
  return NextResponse.json({ topics });
};

export const getTopic: RouteHandler = async (_req, params) => {
  const topic = await getTopicById(params.id);
  if (!topic) return notFound(`Topic ${params.id} not found`);
  const entryCount = await prisma.journalEntry.count({
    where: { topicId: topic.id, deletedAt: null },
  });
  return NextResponse.json({ topic, entryCount });
};

export const updateTopic: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateTopicSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid update", err.flatten());
    throw err;
  }

  const existing = await getTopicById(params.id);
  if (!existing) return notFound(`Topic ${params.id} not found`);

  let topic = existing;
  if (parsed.name !== undefined) topic = await renameTopic(topic.id, parsed.name);
  if (parsed.description !== undefined) {
    topic = await updateTopicDescription(topic.id, parsed.description);
  }
  if (parsed.archived !== undefined) {
    topic = parsed.archived ? await archiveTopic(topic.id) : await unarchiveTopic(topic.id);
  }

  return NextResponse.json({ topic });
};
```

- [ ] **Step 10: Implement the tags route handler**

Create `src/systems/journal/routes/tags.ts`:

```typescript
import { NextResponse } from "next/server";
import { RouteHandler } from "@/systems/types";
import { listTags as listTagsService } from "../services/topics";

export const listTags: RouteHandler = async () => {
  const tags = await listTagsService();
  return NextResponse.json({ tags });
};
```

- [ ] **Step 11: Re-export and wire into the manifest**

Create `src/systems/journal/routes/index.ts`:

```typescript
export * as entries from "./entries";
export * as topics from "./topics";
export * as tags from "./tags";
```

Modify `src/systems/journal/manifest.ts` — replace the empty `routes: {}` map and import the route module:

```typescript
import { SystemManifest } from "../types";
import * as palette from "./palette";
import * as entries from "./routes/entries";
import * as topics from "./routes/topics";
import * as tags from "./routes/tags";

export const manifest: SystemManifest = {
  name: "journal",
  displayName: "Engineering Journal",
  description: "Daily micro-log of building, learning, and working",

  routes: {
    "GET /entries":        entries.listEntries,
    "POST /entries":       entries.createEntry,
    "GET /entries/:id":    entries.getEntry,
    "PATCH /entries/:id":  entries.updateEntry,
    "DELETE /entries/:id": entries.deleteEntry,
    "GET /topics":         topics.listTopics,
    "POST /topics":        topics.createTopic,
    "GET /topics/:id":     topics.getTopic,
    "PATCH /topics/:id":   topics.updateTopic,
    "GET /tags":           tags.listTags,
  },

  jobs: {},

  nav: {
    label: "Journal",
    icon: "book-open",
    href: "/journal",
  },
};

(manifest as SystemManifest & { palette: { layers: unknown[] } }).palette = {
  layers: [palette.topicsLayer, palette.notesLayer],
};
```

- [ ] **Step 12: Run all integration tests until green**

Run: `bun run test:integration`
Expected: PASS — every journal integration test (parser unit + entries/topics/search/routes/migration).

- [ ] **Step 13: Manual verification — hit a route via curl**

While `bun run dev` is running, sign in via the browser, copy the session cookie, and run:

```bash
curl -s -X POST http://localhost:3000/api/systems/journal/topics \
  -H "content-type: application/json" \
  -H "cookie: <next-auth.session-token=...>" \
  -d '{"name":"Polaris"}'
```

Expected: a `201` JSON response with the new topic.

- [ ] **Step 14: Commit**

```bash
git add src/systems/journal/schemas src/systems/journal/routes src/systems/journal/manifest.ts
git commit -m "feat(journal): API routes, Zod schemas, and manifest route map"
```

---

## Task 5: Daily cron job

**Files:**
- Create: `src/systems/journal/services/jobs/computeActiveTopics.ts`
- Create: `src/systems/journal/services/jobs/computeActiveTopics.integration.test.ts`
- Create: `src/systems/journal/services/jobs/index.ts`
- Modify: `src/systems/journal/manifest.ts` (fill in `jobs`)
- Modify: `src/platform/jobs/start-workers.ts` (call into `registerSchedules()`)

- [ ] **Step 1: Write the failing job test**

Create `src/systems/journal/services/jobs/computeActiveTopics.integration.test.ts`:

```typescript
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

    // Bump c's entry's createdAt to 30 days ago — should not count.
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:integration src/systems/journal/services/jobs/computeActiveTopics.integration.test.ts`
Expected: FAIL — module `./computeActiveTopics` does not exist.

- [ ] **Step 3: Implement the job**

Create `src/systems/journal/services/jobs/computeActiveTopics.ts`:

```typescript
import { prisma } from "@/platform/db/client";
import { feedback } from "@/platform/feedback";

export async function computeActiveTopics(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.journalEntry.groupBy({
    by: ["topicId"],
    where: { deletedAt: null, createdAt: { gte: sevenDaysAgo } },
  });
  await feedback.recordMetric("journal", "active_topic_count", result.length);
}
```

- [ ] **Step 4: Run the test until green**

Run: `bun run test:integration src/systems/journal/services/jobs/computeActiveTopics.integration.test.ts`
Expected: PASS, 2 / 2.

- [ ] **Step 5: Wrap the job for the BullMQ contract + schedule helper**

Create `src/systems/journal/services/jobs/index.ts`:

```typescript
import { Job } from "bullmq";
import { JobProcessor } from "@/systems/types";
import { getQueue } from "@/platform/jobs/queue";
import { computeActiveTopics } from "./computeActiveTopics";

export const computeActiveTopicsJob: JobProcessor = async (_job: Job) => {
  await computeActiveTopics();
};

const SCHEDULE_PATTERN = "0 23 * * *";
const REPEAT_KEY = "compute-active-topics-daily";

export async function registerSchedules(): Promise<void> {
  const queue = getQueue("journal-queue");
  await queue.add(
    "compute-active-topics",
    {},
    {
      repeat: { pattern: SCHEDULE_PATTERN, key: REPEAT_KEY },
      removeOnComplete: 50,
      removeOnFail: 50,
    }
  );
}
```

- [ ] **Step 6: Wire the job into the manifest**

Modify `src/systems/journal/manifest.ts` to import `computeActiveTopicsJob` and fill the `jobs` map:

```typescript
// Add this import alongside the others:
import { computeActiveTopicsJob } from "./services/jobs";

// And replace the empty jobs map:
  jobs: {
    "compute-active-topics": computeActiveTopicsJob,
  },
```

- [ ] **Step 7: Register schedules on worker boot**

Modify `src/platform/jobs/start-workers.ts`:

```typescript
import { manifests } from "@/systems";
import { registerSystemJobs, shutdownWorkers } from "./registry";
import { registerSchedules as registerJournalSchedules } from "@/systems/journal/services/jobs";

console.log("Starting workers...");
registerSystemJobs(manifests);

// Per-system schedule registration. Each system that needs cron jobs exports
// a `registerSchedules()` function that adds repeatable jobs to its queue.
await registerJournalSchedules();

console.log("Workers running. Press Ctrl+C to stop.");

process.on("SIGINT", async () => {
  console.log("Shutting down workers...");
  await shutdownWorkers();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down workers...");
  await shutdownWorkers();
  process.exit(0);
});
```

- [ ] **Step 8: Manual verification — boot the worker**

Run: `bun run workers`

Expected output (within ~2s):
```
Starting workers...
Registered jobs for journal: compute-active-topics
Workers running. Press Ctrl+C to stop.
```

The schedule registration is idempotent (BullMQ uses the `repeat.key`), so booting workers repeatedly does not duplicate the cron.

- [ ] **Step 9: Commit**

```bash
git add src/systems/journal/services/jobs src/systems/journal/manifest.ts src/platform/jobs/start-workers.ts
git commit -m "feat(journal): daily compute-active-topics cron job"
```

---

## Task 6: Page shell + design-system extensions + read-only journal pages

**Files:**
- Modify: `src/app/_components/Icon.tsx` (add `archive`, `edit-3`, `trash-2`, `tag`, `command`)
- Modify: `src/app/(platform)/layout.tsx` (extend `ALLOWED_ICONS` to include the new icons)
- Modify: `src/app/globals.css` (append `.hl`, `.entry-card`, `.compose`, `.tab-strip`, `.entry-card.flash` classes)
- Create: `src/app/(systems)/layout.tsx`
- Create: `src/app/(systems)/journal/layout.tsx`
- Create: `src/app/(systems)/journal/page.tsx` (Today — read-only render of today's entries)
- Create: `src/app/(systems)/journal/topics/page.tsx`
- Create: `src/systems/journal/components/MarkdownContent.tsx`
- Create: `src/systems/journal/components/MarkdownContent.test.tsx`
- Create: `src/systems/journal/components/EntryCard.tsx`
- Create: `src/systems/journal/components/TopicChip.tsx`
- Create: `src/systems/journal/components/TagChip.tsx`
- Modify: `package.json` (add `react-markdown`)

This task ships everything except the editor and search. The page is read-only — the compose box arrives in Task 7 and the per-topic / per-tag / search pages in Tasks 8–9. That keeps the diff focused.

- [ ] **Step 1: Add react-markdown**

Run: `bun add react-markdown`

Expected: `react-markdown` (and its peer deps) added to `package.json`.

- [ ] **Step 2: Extend `Icon.tsx` with the new paths**

Modify `src/app/_components/Icon.tsx` — add five entries inside the `PATHS` constant (just before the closing `}`):

```typescript
  archive: (
    <>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </>
  ),
  "edit-3": (
    <>
      <path d="M13 21h8" />
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </>
  ),
  "trash-2": (
    <>
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  tag: (
    <>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </>
  ),
  command: (
    <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
  ),
```

> The `tag` icon's small dot is filled with `currentColor` per the Lucide source. That's how the tag glyph reads at 16px; treat it as the single approved exception to the "never fill" rule.

- [ ] **Step 3: Extend the platform layout's allowed icons**

Modify `src/app/(platform)/layout.tsx` — add the new names to `ALLOWED_ICONS`:

```typescript
const ALLOWED_ICONS: IconName[] = [
  "search", "plus", "compass", "calendar", "terminal", "book-open",
  "star", "list", "git-branch", "settings", "clock", "panel-right",
  "more-horizontal", "check", "x", "chevron-down", "chevron-right",
  "folder", "inbox", "hash", "moon", "user", "file-text", "bell",
  "sidebar", "list-todo", "archive", "edit-3", "trash-2", "tag", "command",
];
```

- [ ] **Step 4: Append journal-specific CSS to `globals.css`**

Append to the bottom of `src/app/globals.css`:

```css
/* ==========================================================================
   Journal — entry surfaces and inline highlights
   ========================================================================== */

.entry-card {
  background: var(--paper-1);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-4) var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  transition: background 0.12s ease;
}
.entry-card:hover {
  background: var(--paper-2);
}
.entry-card.flash {
  background: var(--accent-wash);
}
.entry-card .meta {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  flex-wrap: wrap;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-muted);
}
.entry-card .meta .time {
  margin-left: auto;
}
.entry-card .actions {
  display: none;
  gap: var(--sp-1);
}
.entry-card:hover .actions {
  display: flex;
}
.entry-card .actions button {
  background: transparent;
  border: 0;
  color: var(--fg-muted);
  padding: 2px 4px;
  border-radius: var(--r-sm);
  cursor: pointer;
}
.entry-card .actions button:hover {
  background: var(--bg-hover);
  color: var(--fg);
}

/* Tab strip used by the journal sub-nav. */
.tab-strip {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-3) 0 var(--sp-4);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--sp-6);
}
.tab-strip a {
  color: var(--fg-muted);
  text-decoration: none;
  font-size: 13.5px;
  padding: 4px 0;
}
.tab-strip a.active {
  color: var(--fg);
  border-bottom: 2px solid var(--accent);
  margin-bottom: -1px;
  padding-bottom: 2px;
}
.tab-strip .grow { flex: 1; }
.tab-strip .search-input {
  background: var(--paper-0);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 4px 8px;
  font-size: 13px;
  width: 240px;
  color: var(--fg);
}

/* Compose box surface. Tiptap-driven editor is wired in Task 7. */
.compose {
  background: var(--paper-1);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.compose .compose-header {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.compose .ProseMirror {
  min-height: 80px;
  outline: none;
}
.compose .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--fg-faint);
  pointer-events: none;
  float: left;
  height: 0;
}
.compose .compose-footer {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: 12px;
  color: var(--fg-muted);
}
.compose .compose-footer .grow { flex: 1; }

/* Highlight span used by the search results page. */
.hl {
  background: var(--mark);
  color: var(--mark-ink);
  padding: 0 2px;
  border-radius: 2px;
}
```

- [ ] **Step 5: Write the failing MarkdownContent tests**

Create `src/systems/journal/components/MarkdownContent.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "./MarkdownContent";

function html(body: string): string {
  return renderToStaticMarkup(<MarkdownContent body={body} />);
}

describe("MarkdownContent", () => {
  it("substitutes [[Topic]] for a topic link", () => {
    const out = html("see [[Polaris]] for context");
    expect(out).toContain('href="/journal/topics/Polaris"');
    expect(out).toContain(">Polaris<");
  });

  it("URL-encodes topic names with spaces", () => {
    const out = html("see [[Polaris notes]]");
    expect(out).toContain("/journal/topics/Polaris%20notes");
  });

  it("substitutes #tag for a tag link", () => {
    const out = html("logged a #bug today");
    expect(out).toContain('href="/journal/tags/bug"');
    expect(out).toContain("#bug");
  });

  it("does not substitute inside fenced code", () => {
    const out = html("```\nsee [[Polaris]] and #bug\n```");
    expect(out).not.toContain('href="/journal/topics/Polaris"');
    expect(out).not.toContain('href="/journal/tags/bug"');
  });

  it("does not substitute inside inline code", () => {
    const out = html("use `#bug` here, not really");
    expect(out).not.toContain('href="/journal/tags/bug"');
  });

  it("preserves URLs with hashes", () => {
    const out = html("see https://example.com/#section for details");
    expect(out).not.toContain('href="/journal/tags/section"');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `bun run test src/systems/journal/components/MarkdownContent.test.tsx`
Expected: FAIL — module `./MarkdownContent` does not exist.

- [ ] **Step 7: Implement MarkdownContent**

Create `src/systems/journal/components/MarkdownContent.tsx`:

```typescript
import Link from "next/link";
import ReactMarkdown from "react-markdown";

const TAG = /(?:^|[^\w])#([a-zA-Z][\w-]*)/g;
const WIKILINK = /\[\[([^\]]+)\]\]/g;

interface SubstitutedTextProps {
  value: string;
}

function SubstitutedText({ value }: SubstitutedTextProps): React.ReactNode {
  // Walk wikilinks first, then tags within the surviving plain segments.
  const wikiSegments = splitByPattern(value, WIKILINK, (raw, match) => ({
    kind: "wikilink" as const,
    name: match[1],
    raw,
  }));

  const final: React.ReactNode[] = [];
  let key = 0;
  for (const seg of wikiSegments) {
    if (seg.kind === "wikilink") {
      final.push(
        <Link key={`w-${key++}`} href={`/journal/topics/${encodeURIComponent(seg.name)}`} className="wikilink">
          {seg.name}
        </Link>
      );
      continue;
    }
    const tagSegments = splitByPattern(seg.text, TAG, (raw, match) => ({
      kind: "tag" as const,
      name: match[1].toLowerCase(),
      raw,
      // The TAG regex consumes the boundary char in match[0]; restore it as a
      // separate text segment so that "logged a #bug" reads as
      // ["logged a ", <Link>#bug</Link>].
      prefix: raw.startsWith("#") ? "" : raw.slice(0, raw.indexOf("#")),
    }));
    for (const tag of tagSegments) {
      if (tag.kind === "tag") {
        if (tag.prefix) final.push(tag.prefix);
        final.push(
          <Link key={`t-${key++}`} href={`/journal/tags/${tag.name}`} className="tag-inline">
            {`#${tag.name}`}
          </Link>
        );
      } else {
        final.push(tag.text);
      }
    }
  }
  return <>{final}</>;
}

type Segment<T> = T | { kind: "text"; text: string };

function splitByPattern<T extends { raw: string }>(
  source: string,
  pattern: RegExp,
  build: (raw: string, match: RegExpExecArray) => T
): Segment<T>[] {
  const out: Segment<T>[] = [];
  const regex = new RegExp(pattern.source, pattern.flags);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", text: source.slice(last, m.index) });
    }
    out.push(build(m[0], m));
    last = m.index + m[0].length;
  }
  if (last < source.length) {
    out.push({ kind: "text", text: source.slice(last) });
  }
  return out;
}

export function MarkdownContent({ body }: { body: string }) {
  return (
    <div className="doc">
      <ReactMarkdown
        components={{
          // Substitute [[Topic]] / #tag in regular text nodes only — react-markdown
          // routes fenced code blocks through `code` and inline code through `code` too,
          // both of which we leave untouched, so substitutions skip them automatically.
          p: ({ children }) => <p>{renderChildren(children)}</p>,
          li: ({ children }) => <li>{renderChildren(children)}</li>,
          h1: ({ children }) => <h2>{renderChildren(children)}</h2>,
          h2: ({ children }) => <h3>{renderChildren(children)}</h3>,
          h3: ({ children }) => <h4>{renderChildren(children)}</h4>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function renderChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") return <SubstitutedText value={children} />;
  if (Array.isArray(children)) {
    return children.map((c, i) =>
      typeof c === "string" ? <SubstitutedText key={i} value={c} /> : c
    );
  }
  return children;
}
```

> **Implementation note:** entry headings (`#`, `##`, `###` in user-authored markdown) demote one level so the page's own `h1` (the topic name or "Today") stays the document's primary heading. That matches the Polaris design rule: `h1` is the terracotta heading; entry-internal headings are smaller siblings.

- [ ] **Step 8: Run the test until green**

Run: `bun run test src/systems/journal/components/MarkdownContent.test.tsx`
Expected: PASS, 6 / 6.

- [ ] **Step 9: Implement TopicChip and TagChip**

Create `src/systems/journal/components/TopicChip.tsx`:

```typescript
import Link from "next/link";

export function TopicChip({ name }: { name: string }) {
  return (
    <Link
      href={`/journal/topics/${encodeURIComponent(name)}`}
      className="tag-inline"
      style={{
        background: "var(--accent-wash)",
        color: "var(--accent-ink)",
      }}
    >
      {name}
    </Link>
  );
}
```

Create `src/systems/journal/components/TagChip.tsx`:

```typescript
import Link from "next/link";

export function TagChip({ tag }: { tag: string }) {
  return (
    <Link href={`/journal/tags/${tag}`} className="tag-inline">
      {`#${tag}`}
    </Link>
  );
}
```

- [ ] **Step 10: Implement EntryCard (server component, no actions yet)**

Create `src/systems/journal/components/EntryCard.tsx`:

```typescript
import type { JournalEntryWithTopic } from "../services/entries";
import { MarkdownContent } from "./MarkdownContent";
import { TopicChip } from "./TopicChip";
import { TagChip } from "./TagChip";

const RTF = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

function relativeTime(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return RTF.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RTF.format(hours, "hour");
  const days = Math.round(hours / 24);
  return RTF.format(days, "day");
}

export function EntryCard({ entry }: { entry: JournalEntryWithTopic }) {
  const edited = entry.updatedAt.getTime() > entry.createdAt.getTime() + 1000;
  return (
    <article id={`entry-${entry.id}`} className="entry-card">
      <div className="meta">
        <TopicChip name={entry.topic.name} />
        {entry.tags.map((t) => (
          <TagChip key={t} tag={t} />
        ))}
        <span className="time" title={entry.createdAt.toISOString()}>
          {relativeTime(entry.createdAt)}
        </span>
      </div>
      {entry.title ? (
        <h3 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>{entry.title}</h3>
      ) : null}
      <MarkdownContent body={entry.body} />
      {edited ? (
        <p className="caption" style={{ margin: 0 }}>
          Edited {relativeTime(entry.updatedAt)}
        </p>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 11: Create the (systems) layout**

Create `src/app/(systems)/layout.tsx` — mirrors `(platform)/layout.tsx` so journal pages render inside the same shell:

```typescript
import { auth, signOut } from "@/platform/auth/config";
import { manifests } from "@/systems";
import { createSystemRegistry } from "@/systems/registry";
import { TitleBar } from "@/app/_components/TitleBar";
import { Sidebar } from "@/app/_components/Sidebar";
import type { IconName } from "@/app/_components/Icon";

const registry = createSystemRegistry(manifests);

const FALLBACK_ICON: IconName = "folder";
const ALLOWED_ICONS: IconName[] = [
  "search", "plus", "compass", "calendar", "terminal", "book-open",
  "star", "list", "git-branch", "settings", "clock", "panel-right",
  "more-horizontal", "check", "x", "chevron-down", "chevron-right",
  "folder", "inbox", "hash", "moon", "user", "file-text", "bell",
  "sidebar", "list-todo", "archive", "edit-3", "trash-2", "tag", "command",
];

export default async function SystemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const systems = registry.navItems().map((item) => ({
    href: item.href,
    label: item.label,
    icon: (ALLOWED_ICONS.includes(item.icon as IconName)
      ? item.icon
      : FALLBACK_ICON) as IconName,
  }));

  const sidebarFooter = session?.user ? (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/auth/signin" });
      }}
      style={{ marginTop: 4 }}
    >
      <button
        type="submit"
        className="sb-item"
        style={{ width: "100%", color: "var(--danger)" }}
      >
        Sign out
      </button>
    </form>
  ) : null;

  return (
    <div className="app-shell">
      <TitleBar
        crumbs={["Polaris", "Journal"]}
        syncState="ok"
        email={session?.user?.email}
      />
      <div className="body">
        <Sidebar systems={systems} footer={sidebarFooter} />
        <main className="main">
          <div className="content">{children}</div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Create the journal sub-layout (tab strip)**

Create `src/app/(systems)/journal/layout.tsx`:

```typescript
import Link from "next/link";

export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <nav className="tab-strip" aria-label="Journal sections">
        <Link href="/journal">Today</Link>
        <Link href="/journal/topics">Topics</Link>
        <Link href="/journal/tags">Tags</Link>
        <span className="grow" />
        <form action="/journal/search" method="GET">
          <input
            type="search"
            name="q"
            placeholder="Search journal"
            className="search-input"
            aria-label="Search journal"
          />
        </form>
      </nav>
      {children}
    </>
  );
}
```

> **Implementation note:** the active-tab style is applied via plain anchor highlighting from each page's perspective — matching the rest of Polaris's design (no JS for nav state). If the user wants live `.active` styling later, swap these `<Link>`s for a small client component that reads `usePathname()`.

- [ ] **Step 13: Create the Today page (read-only)**

Create `src/app/(systems)/journal/page.tsx`:

```typescript
import { listEntries } from "@/systems/journal/services/entries";
import { EntryCard } from "@/systems/journal/components/EntryCard";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long" });

function formatHeader(d: Date): string {
  // Spec wants "Apr 26 · Sunday" — date first, weekday second, separated by ·
  return `${DATE_FORMAT.format(d)} · ${WEEKDAY_FORMAT.format(d)}`;
}

export default async function JournalTodayPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const entries = await listEntries({ limit: 100 });
  const todays = entries.filter((e) => e.createdAt >= startOfToday);

  return (
    <article className="doc">
      <h1 style={{ fontFamily: "var(--font-serif)" }}>
        {formatHeader(new Date())}
      </h1>
      {todays.length === 0 ? (
        <p className="lead">
          No entries today. Pick a topic and start logging.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {todays.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 14: Create the Topics index page**

Create `src/app/(systems)/journal/topics/page.tsx`:

```typescript
import Link from "next/link";
import { listTopics } from "@/systems/journal/services/topics";
import { prisma } from "@/platform/db/client";

export default async function TopicsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const params = await searchParams;
  const includeArchived = params.archived === "true";
  const topics = await listTopics({ includeArchived });

  const counts = await prisma.journalEntry.groupBy({
    by: ["topicId"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const countByTopic = new Map(counts.map((c) => [c.topicId, c._count._all]));

  return (
    <article className="doc">
      <h1>Topics</h1>
      {topics.length === 0 ? (
        <p className="lead">No topics yet. Create one when you log your first entry.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {topics.map((topic) => (
            <li key={topic.id} style={{ padding: "var(--sp-2) 0", borderBottom: "1px solid var(--border)" }}>
              <Link
                href={`/journal/topics/${encodeURIComponent(topic.name)}`}
                style={{ color: "var(--fg)", textDecoration: "none" }}
              >
                <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.1em" }}>{topic.name}</span>
                <span className="caption" style={{ marginLeft: "var(--sp-3)" }}>
                  {countByTopic.get(topic.id) ?? 0} entries
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="caption" style={{ marginTop: "var(--sp-6)" }}>
        <Link href={`/journal/topics?archived=${includeArchived ? "false" : "true"}`}>
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </p>
    </article>
  );
}
```

- [ ] **Step 14a: Smoke-run the type checker**

Run: `bun run lint`
Expected: pass with no errors. (ESLint walks the same tsconfig.)

- [ ] **Step 15: Run all tests**

Run: `bun run test && bun run test:integration`
Expected: PASS — all unit and integration suites green.

- [ ] **Step 16: Manual verification — navigate the read-only journal**

Run: `bun run dev`. In the browser:
1. Sign in.
2. Click "Journal" in the sidebar — `/journal` shows today's empty state.
3. Use `curl` (or psql via the docker compose container) to insert a topic + entry directly so the page has something to render. For example:

```bash
curl -s -X POST http://localhost:3000/api/systems/journal/topics \
  -H "content-type: application/json" \
  -H "cookie: <next-auth.session-token=...>" \
  -d '{"name":"Polaris"}'

curl -s -X POST http://localhost:3000/api/systems/journal/entries \
  -H "content-type: application/json" \
  -H "cookie: <next-auth.session-token=...>" \
  -d '{"topicId":"<from-step-above>","body":"first entry #milestone"}'
```

4. Refresh `/journal` — the entry appears as a paper card with the tag chip and topic chip rendered.
5. Visit `/journal/topics` — the topic shows up with entry count `1`.

- [ ] **Step 17: Commit**

```bash
git add src/app/_components/Icon.tsx src/app/(platform)/layout.tsx src/app/globals.css \
  src/app/(systems) src/systems/journal/components package.json bun.lock
git commit -m "feat(journal): page shell, MarkdownContent, EntryCard, topics index"
```

---

## Task 7: ComposeBox — Tiptap editor + topic picker + save flow

**Files:**
- Modify: `package.json` (add Tiptap deps)
- Create: `src/systems/journal/components/Editor.tsx`
- Create: `src/systems/journal/components/TopicPicker.tsx`
- Create: `src/systems/journal/components/ComposeBox.tsx`
- Create: `src/systems/journal/components/EntryActions.tsx`
- Modify: `src/systems/journal/components/EntryCard.tsx` (mount actions; switch to compose-on-edit)
- Modify: `src/app/(systems)/journal/page.tsx` (mount `<ComposeBox />`)

This is the largest UI surface in the plan. Keep it on a single PR even though it's wide — splitting it leaves an inconsistent UX (a dead Today page) on `main` between merges.

- [ ] **Step 1: Install Tiptap deps**

Run: `bun add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-placeholder tiptap-markdown`

Expected: deps land in `package.json`. (`@tiptap/pm` is the ProseMirror peer that `@tiptap/react` requires — installing it explicitly avoids version-mismatch warnings.)

- [ ] **Step 2: Implement the editor wrapper**

Create `src/systems/journal/components/Editor.tsx`:

```typescript
"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";

interface JournalEditorProps {
  initialBody?: string;
  onChange?: (body: string) => void;
  onEditorReady?: (editor: Editor) => void;
}

export function JournalEditor({
  initialBody = "",
  onChange,
  onEditorReady,
}: JournalEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: "What did you build, learn, or wrestle with?",
      }),
      Markdown.configure({ html: false, breaks: true, linkify: true }),
    ],
    content: initialBody,
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange?.(editor.storage.markdown.getMarkdown());
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  return <EditorContent editor={editor} />;
}
```

> **Implementation note:** `immediatelyRender: false` is required by Tiptap when the editor is rendered inside a Next.js client component that may briefly hydrate after server render. Without it, hydration can surface a transient mismatch warning.

- [ ] **Step 3: Implement the topic picker**

Create `src/systems/journal/components/TopicPicker.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";

export interface PickerTopic {
  id: string;
  name: string;
}

interface TopicPickerProps {
  selected: PickerTopic | null;
  onSelect: (topic: PickerTopic) => void;
}

export function TopicPicker({ selected, onSelect }: TopicPickerProps) {
  const [topics, setTopics] = useState<PickerTopic[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/systems/journal/topics")
      .then((r) => r.json())
      .then((data) => setTopics(data.topics ?? []))
      .catch(() => setTopics([]));
  }, []);

  async function handleCreate(name: string) {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/systems/journal/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error ?? "Could not create topic");
      }
      const { topic } = await res.json();
      setTopics((prev) => [...prev, topic].sort((a, b) => a.name.localeCompare(b.name)));
      onSelect(topic);
      setOpen(false);
      setCreating("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
      >
        {selected ? selected.name : "Pick topic"}
      </button>
      {open ? (
        <div
          className="paper-card"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 10,
            minWidth: 220,
            padding: 6,
          }}
          role="listbox"
        >
          {topics.map((t) => (
            <button
              key={t.id}
              type="button"
              className="sb-item"
              style={{ width: "100%", justifyContent: "flex-start" }}
              onClick={() => {
                onSelect(t);
                setOpen(false);
              }}
            >
              {t.name}
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
            <input
              type="text"
              value={creating}
              onChange={(e) => setCreating(e.target.value)}
              placeholder="New topic…"
              style={{
                width: "100%",
                background: "var(--paper-0)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "4px 8px",
                fontSize: 13,
                color: "var(--fg)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate(creating);
                }
              }}
              disabled={busy}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement the compose box**

Create `src/systems/journal/components/ComposeBox.tsx`:

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Editor } from "@tiptap/react";
import { JournalEditor } from "./Editor";
import { TopicPicker, type PickerTopic } from "./TopicPicker";

const LAST_TOPIC_KEY = "journal:lastTopic";

interface ComposeBoxProps {
  defaultTopic?: PickerTopic | null;
  // When present, the box edits an existing entry instead of creating one.
  editingEntry?: {
    id: string;
    title: string | null;
    body: string;
    topic: PickerTopic;
  };
  onSubmitted?: () => void;
  onCancel?: () => void;
}

function loadStoredTopic(): PickerTopic | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_TOPIC_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.id && parsed.name ? parsed : null;
  } catch {
    return null;
  }
}

export function ComposeBox({
  defaultTopic = null,
  editingEntry,
  onSubmitted,
  onCancel,
}: ComposeBoxProps) {
  const router = useRouter();
  const isEditing = Boolean(editingEntry);
  const [topic, setTopic] = useState<PickerTopic | null>(
    editingEntry?.topic ?? defaultTopic ?? null
  );
  const [showTitle, setShowTitle] = useState(Boolean(editingEntry?.title));
  const [title, setTitle] = useState(editingEntry?.title ?? "");
  const [body, setBody] = useState(editingEntry?.body ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    if (!editingEntry && !defaultTopic && !topic) {
      const stored = loadStoredTopic();
      if (stored) setTopic(stored);
    }
  }, [defaultTopic, editingEntry, topic]);

  const wordCount = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .split(/\s+/)
    .filter(Boolean).length;

  async function handleSubmit() {
    if (!topic) {
      setError("Pick a topic first.");
      return;
    }
    if (!body.trim()) {
      setError("Write something before saving.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const url = isEditing
      ? `/api/systems/journal/entries/${editingEntry!.id}`
      : "/api/systems/journal/entries";
    const method = isEditing ? "PATCH" : "POST";
    const payload: Record<string, unknown> = { body, topicId: topic.id };
    if (showTitle && title.trim()) payload.title = title.trim();
    else if (isEditing) payload.title = null;

    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setError(detail.error ?? "Could not save the entry. Try again.");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topic));
      }

      if (!isEditing) {
        editorRef.current?.commands.clearContent();
        setBody("");
        setTitle("");
        setShowTitle(false);
      }
      onSubmitted?.();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="compose" onKeyDown={handleKeyDown}>
      <div className="compose-header">
        <TopicPicker selected={topic} onSelect={setTopic} />
        {!showTitle ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowTitle(true)}
          >
            + Title
          </button>
        ) : null}
      </div>
      {showTitle ? (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional title"
          style={{
            background: "var(--paper-0)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            padding: "6px 10px",
            fontFamily: "var(--font-serif)",
            fontSize: "1.05em",
            color: "var(--fg)",
          }}
        />
      ) : null}
      <JournalEditor
        initialBody={editingEntry?.body ?? ""}
        onEditorReady={(editor) => {
          editorRef.current = editor;
        }}
        onChange={setBody}
      />
      {error ? (
        <p className="caption" style={{ color: "var(--danger)" }}>{error}</p>
      ) : null}
      <div className="compose-footer">
        <span className="caption">{wordCount} words</span>
        <span className="caption">⌘↵ to save</span>
        <span className="grow" />
        {isEditing ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {isEditing ? "Save changes" : "Save"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement EntryActions and rewire EntryCard**

Create `src/systems/journal/components/EntryActions.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/_components/Icon";

interface EntryActionsProps {
  entryId: string;
  onEdit: () => void;
}

export function EntryActions({ entryId, onEdit }: EntryActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this entry? It moves to trash.")) return;
    setBusy(true);
    try {
      await fetch(`/api/systems/journal/entries/${entryId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions" aria-label="Entry actions">
      <button type="button" onClick={onEdit} aria-label="Edit entry">
        <Icon name="edit-3" size={14} />
      </button>
      <button
        type="button"
        onClick={handleDelete}
        aria-label="Delete entry"
        disabled={busy}
      >
        <Icon name="trash-2" size={14} />
      </button>
    </div>
  );
}
```

Replace `src/systems/journal/components/EntryCard.tsx` entirely with:

```typescript
"use client";

import { useState } from "react";
import type { JournalEntryWithTopic } from "../services/entries";
import { ComposeBox } from "./ComposeBox";
import { EntryActions } from "./EntryActions";
import { MarkdownContent } from "./MarkdownContent";
import { TopicChip } from "./TopicChip";
import { TagChip } from "./TagChip";

const RTF = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

function relativeTime(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return RTF.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RTF.format(hours, "hour");
  const days = Math.round(hours / 24);
  return RTF.format(days, "day");
}

export function EntryCard({ entry }: { entry: JournalEntryWithTopic }) {
  const [editing, setEditing] = useState(false);
  const edited = entry.updatedAt.getTime() > entry.createdAt.getTime() + 1000;

  if (editing) {
    return (
      <ComposeBox
        editingEntry={{
          id: entry.id,
          title: entry.title,
          body: entry.body,
          topic: { id: entry.topic.id, name: entry.topic.name },
        }}
        onSubmitted={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article id={`entry-${entry.id}`} className="entry-card">
      <div className="meta">
        <TopicChip name={entry.topic.name} />
        {entry.tags.map((t) => (
          <TagChip key={t} tag={t} />
        ))}
        <span className="time" title={new Date(entry.createdAt).toISOString()}>
          {relativeTime(new Date(entry.createdAt))}
        </span>
        <EntryActions entryId={entry.id} onEdit={() => setEditing(true)} />
      </div>
      {entry.title ? (
        <h3 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>{entry.title}</h3>
      ) : null}
      <MarkdownContent body={entry.body} />
      {edited ? (
        <p className="caption" style={{ margin: 0 }}>
          Edited {relativeTime(new Date(entry.updatedAt))}
        </p>
      ) : null}
    </article>
  );
}
```

> **Implementation note:** `EntryCard` is now a client component because edit-in-place needs `useState`. The Today page passes server-fetched entries through, which crosses the server/client boundary — `Date` instances arrive as ISO strings, so we wrap them with `new Date(…)` defensively. (This is how Next.js currently serialises Dates over RSC.)

- [ ] **Step 6: Mount the compose box on Today**

Replace `src/app/(systems)/journal/page.tsx` with:

```typescript
import { listEntries } from "@/systems/journal/services/entries";
import { EntryCard } from "@/systems/journal/components/EntryCard";
import { ComposeBox } from "@/systems/journal/components/ComposeBox";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "long" });

function formatHeader(d: Date): string {
  return `${DATE_FORMAT.format(d)} · ${WEEKDAY_FORMAT.format(d)}`;
}

export default async function JournalTodayPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const entries = await listEntries({ limit: 100 });
  const todays = entries.filter((e) => e.createdAt >= startOfToday);

  return (
    <article className="doc">
      <h1 style={{ fontFamily: "var(--font-serif)" }}>
        {formatHeader(new Date())}
      </h1>
      <ComposeBox />
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginTop: "var(--sp-6)" }}>
        {todays.length === 0 ? (
          <p className="lead">No entries today. Pick a topic and start logging.</p>
        ) : (
          todays.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 7: Run tests**

Run: `bun run test && bun run test:integration`
Expected: PASS — none of the existing tests should regress.

- [ ] **Step 8: Manual verification — exercise compose / edit / delete**

`bun run dev`. In the browser, sign in, open `/journal`, and confirm:
1. Picking "Polaris" (created in a prior task) and typing a paragraph + Cmd↵ saves the entry.
2. Adding `#new-tag` inline, saving, then refreshing — the chip renders on the EntryCard and `/journal/tags` (after Task 8) lists it.
3. Hovering an EntryCard shows Edit / Delete icons. Clicking Edit transforms the card into a ComposeBox with the existing body; saving updates in place.
4. Clicking Delete prompts, then the entry disappears.
5. Pulling localStorage in DevTools shows `journal:lastTopic` set to the last-used topic.

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock src/systems/journal/components src/app/(systems)/journal/page.tsx
git commit -m "feat(journal): Tiptap compose box, edit-in-place, and delete flow"
```

---

## Task 8: Topic page, Tags index, Tag page

**Files:**
- Create: `src/app/(systems)/journal/topics/[name]/page.tsx`
- Create: `src/app/(systems)/journal/tags/page.tsx`
- Create: `src/app/(systems)/journal/tags/[tag]/page.tsx`
- Create: `src/systems/journal/components/HashAnchorScroll.tsx`
- Create: `src/systems/journal/components/TopicHeaderActions.tsx`

- [ ] **Step 1: Implement the hash-anchor scroll helper**

The topic page needs to scroll a deep-link target into view and flash it. Create `src/systems/journal/components/HashAnchorScroll.tsx`:

```typescript
"use client";

import { useEffect } from "react";

export function HashAnchorScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#entry-")) return;

    const target = document.getElementById(hash.slice(1));
    if (!target) return;

    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("flash");
    const t = setTimeout(() => target.classList.remove("flash"), 1500);
    return () => clearTimeout(t);
  }, []);

  return null;
}
```

- [ ] **Step 2: Implement the topic header actions (rename / archive)**

Create `src/systems/journal/components/TopicHeaderActions.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/_components/Icon";

interface TopicHeaderActionsProps {
  topic: { id: string; name: string; archived: boolean };
}

export function TopicHeaderActions({ topic }: TopicHeaderActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleRename() {
    const next = window.prompt("New name", topic.name);
    if (!next || next === topic.name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/systems/journal/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        window.alert("Could not rename. Pick a name that isn't already in use.");
        return;
      }
      router.replace(`/journal/topics/${encodeURIComponent(next)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!window.confirm(`Archive "${topic.name}"? It moves out of the active list.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/systems/journal/topics/${topic.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      router.push("/journal/topics");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "var(--sp-2)" }}>
      <button type="button" className="btn btn-ghost" onClick={handleRename} disabled={busy}>
        <Icon name="edit-3" size={14} /> Rename
      </button>
      <button type="button" className="btn btn-ghost" onClick={handleArchive} disabled={busy}>
        <Icon name="archive" size={14} /> Archive
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Implement the topic page**

Create `src/app/(systems)/journal/topics/[name]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { getTopicByName } from "@/systems/journal/services/topics";
import { listEntries } from "@/systems/journal/services/entries";
import { ComposeBox } from "@/systems/journal/components/ComposeBox";
import { EntryCard } from "@/systems/journal/components/EntryCard";
import { HashAnchorScroll } from "@/systems/journal/components/HashAnchorScroll";
import { TopicHeaderActions } from "@/systems/journal/components/TopicHeaderActions";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const topic = await getTopicByName(name);
  if (!topic) notFound();

  const entries = await listEntries({ topicId: topic.id, limit: 100 });

  return (
    <article className="doc">
      <HashAnchorScroll />
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--sp-4)" }}>
        <div>
          <h1>{topic.name}</h1>
          {topic.description ? (
            <p className="lead" style={{ marginTop: -8 }}>{topic.description}</p>
          ) : null}
        </div>
        <TopicHeaderActions topic={{ id: topic.id, name: topic.name, archived: topic.archived }} />
      </header>

      <ComposeBox defaultTopic={{ id: topic.id, name: topic.name }} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", marginTop: "var(--sp-6)" }}>
        {entries.length === 0 ? (
          <p className="lead">No entries under {topic.name} yet.</p>
        ) : (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Implement the tags index**

Create `src/app/(systems)/journal/tags/page.tsx`:

```typescript
import Link from "next/link";
import { listTags } from "@/systems/journal/services/topics";

export default async function TagsIndexPage() {
  const tags = await listTags();

  return (
    <article className="doc">
      <h1>Tags</h1>
      {tags.length === 0 ? (
        <p className="lead">No tags yet. They appear automatically as you write.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {tags.map(({ tag, count }) => (
            <li
              key={tag}
              style={{
                padding: "var(--sp-2) 0",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                gap: "var(--sp-3)",
              }}
            >
              <Link href={`/journal/tags/${tag}`} className="tag-inline">
                {`#${tag}`}
              </Link>
              <span className="caption">{count} entries</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
```

- [ ] **Step 5: Implement the tag page**

Create `src/app/(systems)/journal/tags/[tag]/page.tsx`:

```typescript
import { listEntries } from "@/systems/journal/services/entries";
import { EntryCard } from "@/systems/journal/components/EntryCard";

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const entries = await listEntries({ tag, limit: 100 });

  return (
    <article className="doc">
      <h1>{`#${tag}`}</h1>
      <p className="caption" style={{ marginTop: -8 }}>
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        {entries.length === 0 ? (
          <p className="lead">No entries with #{tag} yet.</p>
        ) : (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 6: Run tests**

Run: `bun run test && bun run test:integration && bun run lint`
Expected: PASS / no errors.

- [ ] **Step 7: Manual verification — topic + tag flows**

`bun run dev`. In the browser:
1. Visit `/journal/topics/Polaris` (using the topic created earlier). Confirm:
   - The compose box is pre-scoped to Polaris.
   - The Rename button prompts; renaming routes to the new URL.
   - The Archive button prompts and redirects back to `/journal/topics`.
2. Visit `/journal/tags`. Confirm a list of distinct tags rendered with counts.
3. Click any tag chip. Confirm the tag page lists exactly the matching entries.
4. Visit `/journal/topics/Polaris#entry-<some-entry-id>`. Confirm the matching card scrolls into view and briefly flashes with the accent wash.

- [ ] **Step 8: Commit**

```bash
git add src/app/(systems)/journal/topics/\[name\]/page.tsx \
  src/app/(systems)/journal/tags \
  src/systems/journal/components/HashAnchorScroll.tsx \
  src/systems/journal/components/TopicHeaderActions.tsx
git commit -m "feat(journal): topic page, tags index, tag page, deep-link scroll"
```

---

## Task 9: Search results page + final integration smoke

**Files:**
- Create: `src/app/(systems)/journal/search/page.tsx`
- Create: `src/systems/journal/services/highlight.ts` (small helper for `<mark class="hl">` injection)
- Create: `src/systems/journal/services/highlight.test.ts`

The search helper from Task 3 returns ranked entries; this page renders them and decorates body/title text with `<mark class="hl">` spans. Highlighting runs in JS — `ts_headline` would force the SQL helper to fork a separate path; spec wording allows either, and JS keeps the helper single-purpose.

- [ ] **Step 1: Write the failing highlight test**

Create `src/systems/journal/services/highlight.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { highlight } from "./highlight";

describe("highlight", () => {
  it("wraps each matching term in <mark class=\"hl\">", () => {
    expect(highlight("alpha beta gamma", "beta")).toBe(
      'alpha <mark class="hl">beta</mark> gamma'
    );
  });

  it("is case-insensitive", () => {
    expect(highlight("Alpha BETA gamma", "beta")).toBe(
      'Alpha <mark class="hl">BETA</mark> gamma'
    );
  });

  it("handles multi-token queries", () => {
    expect(highlight("alpha beta gamma", "alpha gamma")).toBe(
      '<mark class="hl">alpha</mark> beta <mark class="hl">gamma</mark>'
    );
  });

  it("escapes regex metacharacters in the query", () => {
    expect(highlight("a+b is hard", "a+b")).toBe(
      '<mark class="hl">a+b</mark> is hard'
    );
  });

  it("escapes HTML in the source text before injecting marks", () => {
    expect(highlight("<script>", "script")).toBe(
      '&lt;<mark class="hl">script</mark>&gt;'
    );
  });

  it("returns the original text when the query is empty", () => {
    expect(highlight("alpha beta", "  ")).toBe("alpha beta");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test src/systems/journal/services/highlight.test.ts`
Expected: FAIL — module `./highlight` does not exist.

- [ ] **Step 3: Implement the highlight helper**

Create `src/systems/journal/services/highlight.ts`:

```typescript
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlight(text: string, query: string): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return text;

  const escaped = escapeHtml(text);
  const pattern = new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "gi");
  return escaped.replace(pattern, '<mark class="hl">$1</mark>');
}
```

- [ ] **Step 4: Run tests until green**

Run: `bun run test src/systems/journal/services/highlight.test.ts`
Expected: PASS, 6 / 6.

- [ ] **Step 5: Implement the search page**

Create `src/app/(systems)/journal/search/page.tsx`:

```typescript
import Link from "next/link";
import { searchEntries } from "@/systems/journal/services/search";
import { highlight } from "@/systems/journal/services/highlight";
import { TopicChip } from "@/systems/journal/components/TopicChip";
import { TagChip } from "@/systems/journal/components/TagChip";

const RTF = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

function relative(d: Date): string {
  const minutes = Math.round((d.getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return RTF.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RTF.format(hours, "hour");
  return RTF.format(Math.round(hours / 24), "day");
}

export default async function SearchResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const trimmed = q.trim();
  const results = trimmed ? await searchEntries({ q: trimmed, limit: 50 }) : [];

  return (
    <article className="doc">
      <h1>Search</h1>
      <p className="caption" style={{ marginTop: -8 }}>
        {trimmed ? <>Results for <em>{trimmed}</em></> : "Type a query in the journal toolbar."}
      </p>

      {trimmed && results.length === 0 ? (
        <p className="lead">No matches for <em>{trimmed}</em>. Try a different word.</p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        {results.map((entry) => (
          <Link
            key={entry.id}
            href={`/journal/topics/${encodeURIComponent(entry.topic.name)}#entry-${entry.id}`}
            className="entry-card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="meta">
              <TopicChip name={entry.topic.name} />
              {entry.tags.map((t) => (
                <TagChip key={t} tag={t} />
              ))}
              <span className="time">{relative(new Date(entry.createdAt))}</span>
            </div>
            {entry.title ? (
              <h3
                style={{ fontFamily: "var(--font-serif)", margin: 0 }}
                dangerouslySetInnerHTML={{ __html: highlight(entry.title, trimmed) }}
              />
            ) : null}
            <p
              style={{ margin: 0, color: "var(--fg-muted)" }}
              dangerouslySetInnerHTML={{
                __html: highlight(snippet(entry.body, trimmed), trimmed),
              }}
            />
          </Link>
        ))}
      </div>
    </article>
  );
}

function snippet(body: string, query: string, radius = 80): string {
  if (!query) return body.slice(0, radius * 2);
  const idx = body.toLowerCase().indexOf(query.toLowerCase().split(/\s+/)[0] ?? "");
  if (idx < 0) return body.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + radius);
  return (start > 0 ? "… " : "") + body.slice(start, end) + (end < body.length ? " …" : "");
}
```

> **Implementation note:** `dangerouslySetInnerHTML` is acceptable here because `highlight()` HTML-escapes the source text before injecting any marks. The only HTML the browser sees is `<mark class="hl">…</mark>` plus escaped user content.

- [ ] **Step 6: Run all tests + lint**

Run: `bun run test && bun run test:integration && bun run lint`
Expected: PASS / no errors.

- [ ] **Step 7: Manual verification — full v1 smoke**

`bun run dev`. Walk the entire journal:

1. Sign in → land on `/dashboard`.
2. Sidebar shows "Journal" → click → `/journal` Today page.
3. Pick a topic, type a paragraph with `#tag` and `[[Wikilink]]`, press Cmd↵ — entry appears at top.
4. Hover the entry → Edit → modify body → save. The entry updates in place.
5. Hover the entry → Delete → confirm — it disappears.
6. Type "milestone" (or whatever tag/word you used) into the search box → Enter → land on `/journal/search?q=milestone` → confirm the entry appears with the term highlighted with the warm yellow `--mark` colour.
7. Click a search result → it deep-links to the topic page and the corresponding card flashes briefly.
8. Visit `/journal/topics` → confirm topic counts.
9. Visit `/journal/tags` → confirm tag counts. Click a tag → confirm filtered list.
10. From a terminal, run `bun src/platform/jobs/start-workers.ts`. Confirm log output:
    ```
    Registered jobs for journal: compute-active-topics
    Workers running. Press Ctrl+C to stop.
    ```
11. Run `psql -U polaris -h localhost -p 5440 polaris -c "SELECT * FROM \"SystemMetric\" WHERE system='journal' ORDER BY \"recordedAt\" DESC LIMIT 5;"`. Confirm `entry_created` and `words_per_entry` rows from the previous steps.

- [ ] **Step 8: Log a v1 ship iteration**

Iteration logging is a platform-level API; the journal calls into it directly. Run a one-off via Bun to mark v1 shipped:

```bash
bun -e 'import("@/platform/feedback").then(({ feedback }) => feedback.logIteration("journal", { description: "Engineering Journal v1 shipped: topics + entries + tags + FTS + daily metric.", reason: "First system on Polaris. Validates the platform/system convention end-to-end and gives Polaris a daily-use surface." }))'
```

(Adjust the import alias if Bun's resolver complains; alternatively, drop the body into a temporary `bun run` script and delete it.)

- [ ] **Step 9: Commit**

```bash
git add src/systems/journal/services/highlight.ts src/systems/journal/services/highlight.test.ts \
  src/app/(systems)/journal/search/page.tsx
git commit -m "feat(journal): search results page with highlighted snippets"
```

- [ ] **Step 10: Open a single tracking PR (or merge sequentially)**

Each task above is intended to land as its own PR. If you've been pushing to a feature branch, open the final PR now:

```bash
git push -u origin <branch>
gh pr create --title "feat(journal): Engineering Journal v1" --body "$(cat <<'EOF'
## Summary
- Adds the Engineering Journal as Polaris's first system.
- Postgres tsvector + GIN search; soft delete; topic/tag organisation.
- Integrates with platform feedback (entry_created, words_per_entry, active_topic_count daily cron).

## Test plan
- [x] Unit tests for parser + MarkdownContent + highlight
- [x] Integration tests for entries/topics/search/cron services and routes
- [x] Manual smoke: compose, edit, delete, search, deep link, archive, tag pages
EOF
)"
```

---

## Self-review notes

(Filled in by the reviewer after the plan is written.)

- Schema + tsvector + GIN index → Task 1 ✓
- System manifest with palette + nav → Task 2 ✓ (manifest stub; Task 4 fills routes)
- Body parser (`extractTags`, `wordCount`) → Task 2 ✓
- Search helper → Task 3 ✓
- Entries / topics services → Task 3 ✓
- API routes + Zod schemas (entries, topics, tags) → Task 4 ✓
- Manifest routes + jobs maps populated → Task 4 + Task 5 ✓
- Daily `compute-active-topics` cron → Task 5 ✓
- Schedule registration on worker boot → Task 5 ✓
- Page routes (Today, Topics, Topic, Tags, Tag, Search) → Tasks 6, 8, 9 ✓
- `MarkdownContent` post-process for `[[Topic]]` and `#tag` → Task 6 ✓
- `EntryCard`, `TopicChip`, `TagChip` → Task 6 ✓
- `ComposeBox` with Tiptap + topic picker + Cmd↵ + edit-in-place → Task 7 ✓
- Hash-anchor deep-link scroll on topic page → Task 8 ✓
- Search results with `ts_rank` ordering and `<mark class="hl">` highlights → Task 9 ✓
- Feedback metric writes use `Promise.allSettled` (best-effort, do not roll back entry create) → Task 4 ✓
- Soft delete (`deletedAt`), idempotent → Task 4 ✓
- Iteration logging stays platform-level (no journal CLI) → noted, used in Task 9 step 8 ✓
- Tests for parser (unit), MarkdownContent (unit), highlight (unit), routes (integration), search (integration), cron (integration), migration (integration) → Tasks 1–9 ✓
- Out-of-scope items per spec deliberately not planned: Global Command Palette, Tiptap mention nodes, AI features, hard delete / edit history, mobile / PWA, nested topics, single-entry standalone page, tag management UI, iteration-logging tooling ✓
