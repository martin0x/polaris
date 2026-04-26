# Engineering Journal — Design Spec

**Date:** 2026-04-26
**Author:** Raymart Villos
**Status:** Draft. First Polaris system, brainstormed alongside the Global
Command Palette spec (`2026-04-26-global-command-palette-design.md`). Builds
on top of the platform foundation
(`2026-04-22-platform-foundation-design.md`).

## Overview

The Engineering Journal is the first system to ship on the Polaris platform.
It is a micro-log–shaped daily journal for engineering work — short
timestamped entries about things being built, learned, or worked on. Entries
live in curated **topics**, are freely tagged with `#tag` strings, and can
inline-reference other topics with `[[Topic]]` syntax.

The journal is intentionally narrow in v1. It exists to validate the platform
foundation's system convention end-to-end, to give Polaris a daily-use surface,
and to serve as the first concrete consumer of the upcoming global command
palette (separate spec).

## Scope

### In scope for v1

- Many short, timestamped entries per day (micro-log rhythm).
- Flat topics (extensible to nested in a future migration).
- Entries belong to exactly one topic. Topic membership is the primary
  organizing axis — there is no separate folder hierarchy.
- Optional title + markdown body per entry. Body authored in a Tiptap WYSIWYG
  editor and stored as plain markdown via the `tiptap-markdown` extension.
- Inline `[[Topic]]` references and `#tag` strings, both rendered via
  cheap-path regex post-processing in the markdown renderer (no Tiptap mention
  nodes in v1).
- Tags stored as a `TEXT[]` column on the entry, refreshed by parsing the
  body on every save. A read-only `/journal/tags` index page.
- Edit-freely + soft-delete for entries. No edit history.
- Topic create (explicit + auto-create on first use), rename (ID-stable),
  archive (no hard delete in v1).
- Postgres `tsvector` full-text search via a journal-local search bar at
  `/journal/search?q=...`.
- Feedback integration: `entry_created`, `words_per_entry`, and
  `active_topic_count` metrics; reflections via the existing platform
  dashboard; iterations logged via a small CLI script run on shipping
  changes.
- Web-only, responsive, desktop-first. The platform's design system already
  enforces responsive layouts; nothing additional ships in v1.
- Manifest declares the `palette` block (`topics → notes` hierarchy) so the
  Global Command Palette can consume the journal at zero rework.

### Explicitly out of scope for v1

- The Global Command Palette itself (separate spec).
- Tiptap mention nodes (autocomplete chips for `[[Topic]]` and `#tag`).
- AI features: AI-generated reflections, semantic search via embeddings,
  auto-tagging, topic suggestions.
- Hard delete, edit history, append-only mode, edit-window mode.
- Mobile-first capture, PWA installability, voice input, share-sheet
  integration.
- Nested topics (`parentId` column reserved on `JournalTopic`, never
  populated; UI does not render hierarchy).
- Single-entry standalone page at `/journal/entries/[id]`. Edits happen
  inline; the palette uses `#entry-<id>` anchor links into the topic page.
- Tag management UI (rename, merge, archive). Read-only index only.
- Automated iteration logging from CI. The CLI ships; wiring it into GitHub
  Actions is follow-on.

## 1. Data Model

Two new tables, both prefixed `journal_` per the platform's system-table
convention.

### `JournalTopic`

```prisma
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
```

The `parentId` column is reserved for a future nested-topics migration and is
never populated in v1. The migration to nested topics is then a UI/query
change with no schema rework.

### `JournalEntry`

```prisma
model JournalEntry {
  id           String   @id @default(cuid())
  topicId      String
  topic        JournalTopic @relation(fields: [topicId], references: [id])
  title        String?
  body         String   @db.Text                 // markdown, serialized by tiptap-markdown
  tags         String[] @default([])             // populated from #tags in body on save
  searchVector Unsupported("tsvector")?         // generated column, see migration note
  deletedAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([topicId])
  @@index([deletedAt])
  @@index([createdAt(sort: Desc)])
  @@index([tags], type: Gin)
  @@map("journal_entries")
}
```

### Search vector — manual migration step

Prisma has no first-class support for generated `tsvector` columns. The
initial migration adds the column and its GIN index via raw SQL appended to
the Prisma-generated `migration.sql`:

```sql
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

Search queries go through `prisma.$queryRaw` with `to_tsquery` since Prisma
cannot generate tsvector queries.

### What is deliberately not in the schema

- **No `JournalTag` table.** Tags live on the entry as `TEXT[]`. The body
  parser refreshes the array on every save.
- **No `wordCount` column.** Computed at save time and passed straight to
  `feedback.recordMetric("journal", "words_per_entry", count)`.
- **No edit-history table.** Edits overwrite `body` directly; `updatedAt` is
  the only signal that an entry changed.
- **No system-specific iteration model.** Iterations use the platform-level
  `SystemIteration` table via `feedback.logIteration("journal", {...})`.
- **Soft delete is `deletedAt`, not a separate `Trash` table.** All read
  queries filter `WHERE deleted_at IS NULL`. A "Trash" view becomes a query,
  not a schema change.

## 2. System Manifest

The journal lives under `src/systems/journal/` and conforms to the platform's
`SystemManifest` contract, with the `palette` extension introduced by the
Global Command Palette spec.

```typescript
// src/systems/journal/manifest.ts

import type { SystemManifest } from "../types";
import * as routes from "./routes";
import * as jobs from "./services/jobs";
import * as palette from "./palette";

export const manifest: SystemManifest = {
  name: "journal",
  displayName: "Engineering Journal",
  description: "Daily micro-log of building, learning, and working",

  routes: {
    "GET /entries":       routes.listEntries,
    "POST /entries":      routes.createEntry,
    "GET /entries/:id":   routes.getEntry,
    "PATCH /entries/:id": routes.updateEntry,
    "DELETE /entries/:id":routes.deleteEntry,        // soft delete
    "GET /topics":        routes.listTopics,
    "POST /topics":       routes.createTopic,
    "GET /topics/:id":    routes.getTopic,
    "PATCH /topics/:id":  routes.updateTopic,        // rename / archive
    "GET /tags":          routes.listTags,
  },

  jobs: {
    "compute-active-topics": jobs.computeActiveTopics,
  },

  nav: {
    label: "Journal",
    icon: "book-open",
    href: "/journal",
  },

  palette: {
    layers: [palette.topicsLayer, palette.notesLayer],
  },
};
```

API routes are mounted by the platform at `/api/systems/journal/...`. The
catch-all in `src/app/api/systems/[system]/[...path]/route.ts` already
handles auth, route matching, and method dispatch.

The `compute-active-topics` job is registered through the manifest's `jobs`
map; the platform's `registerSystemJobs` picks it up automatically. The job
schedules itself with `repeat: { pattern: "0 23 * * *" }` (23:00 local) on
first worker boot via a `services/jobs/index.ts` setup function.

## 3. API Routes

All handlers live under `src/systems/journal/routes/`. Each handler follows
the platform's `RouteHandler` signature: `(req, params) => Promise<NextResponse>`.

### Entries

- **`POST /entries`** — create.
  - Body: `{ topicId: string; title?: string; body: string }` (Zod-validated).
  - Server parses tags from body (`extractTags`), computes word count
    (`wordCount`), inserts the row, calls `feedback.recordMetric` for
    `entry_created` (1) and `words_per_entry`, returns the new entry with
    its topic relation populated.
  - Returns 201.
- **`GET /entries`** — list with filters.
  - Query: `topicId?`, `tag?`, `q?` (full-text), `cursor?` (createdAt),
    `limit?` (default 50, max 100).
  - When `q` is present, uses the FTS path (see §6); otherwise filters by
    `topicId` / `tag` and paginates by `createdAt` cursor.
  - Always filters `deletedAt: null`.
- **`GET /entries/:id`** — single entry.
- **`PATCH /entries/:id`** — update title, body, or topicId. Body parser
  re-runs to refresh `tags`. `wordCount` re-recorded as a fresh
  `words_per_entry` metric.
- **`DELETE /entries/:id`** — soft delete. Sets `deletedAt = now()`. Idempotent.

### Topics

- **`POST /topics`** — create. Body: `{ name: string; description?: string }`.
  Returns 201 or 409 if name conflicts.
- **`GET /topics`** — list. Query: `archived?` (default false). Returns
  topics ordered by `name`.
- **`GET /topics/:id`** — single topic with entry counts.
- **`PATCH /topics/:id`** — rename (`{ name }`), update description, or
  archive (`{ archived: true }` sets `archivedAt = now()`). All optional.

### Tags

- **`GET /tags`** — distinct tags with counts. Implementation:
  ```sql
  SELECT tag, COUNT(*) FROM (
    SELECT unnest(tags) AS tag FROM journal_entries WHERE deleted_at IS NULL
  ) t GROUP BY tag ORDER BY tag;
  ```

### Validation

Each route validates input via Zod schemas defined in
`src/systems/journal/schemas/`. Failures return `badRequest()` from
`src/platform/api/errors.ts`.

## 4. Page Routes & UI

Next.js App Router pages live under `src/app/(systems)/journal/`. The
`(systems)` route group is created here for the first time and parallels the
existing `(platform)` group.

```
src/app/(systems)/journal/
  layout.tsx                    # Journal sub-nav (Today / Topics / Tags / Search input)
  page.tsx                      # Today
  topics/
    page.tsx                    # Topics index
    [name]/page.tsx             # Topic page (URL-encoded name as slug)
  tags/
    page.tsx                    # Tags index
    [tag]/page.tsx              # Tag filter
  search/
    page.tsx                    # Search results (?q=...)
```

Topic pages use the URL-encoded `name` as the route parameter. Renames
invalidate old URLs — acceptable for a personal system without externally
shared links.

### Layout (`layout.tsx`)

Renders a horizontal tab strip at the top of the journal content area:
`Today` | `Topics` | `Tags`, right-aligned with a search input. Hitting
Enter in the input routes to `/journal/search?q=...`. The platform's primary
Sidebar keeps a single `Journal` entry; the journal's sub-navigation is the
tab strip plus page-level lists.

### Today page

1. Greeting line — current date rendered with `--font-serif`
   (e.g., `Apr 26 · Sunday`).
2. `<ComposeBox />`, default topic = last-used (read from `localStorage`).
3. Today's entries in reverse chronological order, rendered as `<EntryCard />`s.
4. Empty state: "No entries today. Pick a topic and start logging."

### Topics index page

Alphabetical list of non-archived topics with entry counts. A header action
links to the create-topic flow. Archived topics live behind a "Show
archived" toggle.

### Topic page

1. Topic name rendered as `h1` in terracotta `--heading`, description below.
2. Topic actions: rename (modal), archive (confirm).
3. `<ComposeBox />` pre-scoped to this topic.
4. Entries list, paginated by cursor (`createdAt`).
5. Empty state: "No entries under <topic> yet."
6. On mount, reads `window.location.hash`. If it matches `#entry-<id>`,
   scrolls the matching `<EntryCard />` into view and applies a temporary
   highlight class for ~1.5s. This is the deep-link target the global
   palette uses.

### Tags index page

Alphabetical list of tags with counts. Each row links to `/journal/tags/[tag]`.

### Tag page

Header: `#<tag>` plus count. Entries list, no compose box (tags lift from
body content; there is no "create entry under #tag" mental model).

### Search results page

Reads `q` query param. Renders the query echoed at top, then a list of
`<EntryCard />`s ordered by `ts_rank(search_vector, to_tsquery(q))`, with
matched spans wrapped in `<mark class="hl">`. Empty state: "No matches for
*<query>*. Try a different word."

## 5. Components

All journal components live in `src/systems/journal/components/` and reuse
the design-system primitives from `src/app/_components/` and the utility
classes in `src/app/globals.css`.

### `<ComposeBox />`

The central component. Mounted on Today, topic, and tag pages (read-only on
tag pages — actually omitted there; see §4).

- Topic picker (combobox): selects existing topic or "New topic…"
  inline-create. Defaults to the last-used topic from `localStorage`. Inline
  topic creation POSTs to `/api/systems/journal/topics` and uses the
  returned id before save.
- Optional title field: collapsed behind a `+ Title` affordance, expands to
  a single-line text input above the editor.
- Tiptap editor: `StarterKit` + `tiptap-markdown` + `Link` + `Placeholder`.
  Placeholder copy: "What did you build, learn, or wrestle with?"
- Footer: word count, Cmd-Enter hint, primary Save button. When editing an
  existing entry, the button becomes "Save changes" and a Cancel button
  appears.
- Save flow:
  1. Client serializes via `editor.storage.markdown.getMarkdown()`.
  2. POSTs to `/api/systems/journal/entries`.
  3. On 201, prepends the new entry to the visible list, clears the editor,
     refocuses.
- Edit flow: clicking Edit on an `EntryCard` transforms the card in place
  into a `ComposeBox` instance bound to that entry's id. PATCH on save.

### `<EntryCard />`

Used on Today, topic, tag, and search-result pages.

- Header line: topic chip, tag chips, relative timestamp (`2h ago`,
  hovers reveal absolute time).
- Title (if present) rendered with `--font-serif`.
- Body rendered through the shared `<MarkdownContent />` helper (see below).
  Body collapses past ~10 lines with a "Show more" toggle.
- Hover-revealed actions: Edit (transforms in place), Delete (confirm modal
  → soft-delete).
- "Edited 2h ago" caption when `updatedAt > createdAt`.

### `<MarkdownContent body={...} />`

Single source of truth for entry rendering. Runs `react-markdown` with the
design-system `code-block` class, then a post-process pass that swaps
`[[Topic]]` and `#tag` literals for routed `<Link>` elements:

- `[[Polaris]]` → `<Link href="/journal/topics/Polaris">Polaris</Link>`
  (URL-encoded).
- `#bug` → `<Link href="/journal/tags/bug">#bug</Link>`.

The post-process runs on the rendered AST, not the raw text, so substitutions
inside fenced code blocks are skipped (code blocks remain literal).

### `<TopicChip />` / `<TagChip />`

Small inline pill components built on `.tag-inline`. Click navigates.

### `<TopicPicker />`

Combobox used inside `<ComposeBox />`. Lists active topics with a sticky
"New topic…" item at the bottom. Inline-create POSTs to
`/api/systems/journal/topics` and returns the new id before save proceeds.

## 6. Editor & Body Parser

### Tiptap configuration (`src/systems/journal/components/Editor.tsx`)

Extensions:

- `StarterKit` — paragraph, headings, bold, italic, code, codeBlock,
  blockquote, hardBreak, ordered/bullet lists, undo/redo.
- `tiptap-markdown` — markdown serialization in/out. `editor.storage.markdown.getMarkdown()`
  returns the body for save; `Markdown.parse(body)` populates the editor for
  edits.
- `Link.configure({ openOnClick: false })` — auto-linkify URLs.
- `Placeholder.configure({ placeholder: "What did you build, learn, or wrestle with?" })`.

Hotkeys are intercepted at the `<ComposeBox />` form level, not inside the
editor — Cmd-Enter / Ctrl-Enter triggers save.

Excluded from v1 by design:

- Mention extensions (cheap-path regex covers `[[Topic]]` and `#tag`).
- Image (no upload UI; could land later).
- Table (engineering content rarely needs it).
- TaskList (the journal isn't a task system).

### Body parser (`src/systems/journal/services/parser.ts`)

Server-side, called on every entry create/update before insert.

- **`extractTags(body: string): string[]`**
  - Strips fenced code blocks (regex `\`\`\`[\s\S]*?\`\`\``) and inline code
    (`` `...` ``) before matching.
  - Matches `/#([a-zA-Z][\w-]*)/g`.
  - Lowercases, deduplicates.
- **`wordCount(body: string): number`**
  - Strips fenced + inline code.
  - `body.split(/\s+/).filter(Boolean).length`.

`[[Topic]]` references are not extracted server-side in v1 — they're
rendered at read time by `<MarkdownContent />`. The Global Command Palette
spec may revisit this.

## 7. Search

### Implementation

- `searchVector` is a generated `tsvector` column on `journal_entries`
  (see §1 migration step). It weights title (`A`), body (`B`), and tags
  joined by spaces (`C`).
- A GIN index on `search_vector` powers fast queries.
- The search query helper lives in `src/systems/journal/services/search.ts`:

```typescript
export async function searchEntries(opts: {
  q: string;
  topicId?: string;
  limit?: number;
}): Promise<JournalEntryWithTopic[]> {
  const { q, topicId, limit = 20 } = opts;
  const trimmed = q.trim();

  if (!trimmed) {
    // Empty query → return recent entries (used when the palette opens
    // into a topic-scoped layer before the user has typed anything).
    return prisma.$queryRaw`
      SELECT e.*, t.name AS "topicName"
      FROM journal_entries e
      JOIN journal_topics t ON t.id = e.topic_id
      WHERE e.deleted_at IS NULL
        ${topicId ? Prisma.sql`AND e.topic_id = ${topicId}` : Prisma.empty}
      ORDER BY e.created_at DESC
      LIMIT ${limit};
    `;
  }

  const query = trimmed.split(/\s+/).join(" & ");
  return prisma.$queryRaw`
    SELECT e.*, t.name AS "topicName"
    FROM journal_entries e
    JOIN journal_topics t ON t.id = e.topic_id
    WHERE e.deleted_at IS NULL
      ${topicId ? Prisma.sql`AND e.topic_id = ${topicId}` : Prisma.empty}
      AND e.search_vector @@ to_tsquery('english', ${query})
    ORDER BY ts_rank(e.search_vector, to_tsquery('english', ${query})) DESC
    LIMIT ${limit};
  `;
}
```

The same helper backs both `/api/systems/journal/entries?q=...` (via
`routes.listEntries`) and the palette's notes-layer search.

### UI

The search input lives in the journal layout's tab strip (right-aligned).
Hitting Enter routes to `/journal/search?q=...`. The results page renders
matching entries with `ts_headline`-derived highlight spans wrapped in
`<mark class="hl">`.

## 8. Feedback Integration

Three metrics, recorded passively. No journal-specific reflection or
iteration UI in v1; reflections happen on the platform `/dashboard` and
iterations are logged through the CLI below.

### Metrics

- **`entry_created`** — recorded as `1` after every successful entry create.
- **`words_per_entry`** — recorded with the entry's word count after every
  successful create or update.
- **`active_topic_count`** — recorded once daily by the
  `compute-active-topics` cron job.

All three calls are best-effort: a failure logs but does not roll back the
entry create or update. Metric writes losing rows is acceptable; entry
writes losing rows is not.

### Daily cron job

`src/systems/journal/services/jobs/computeActiveTopics.ts`:

```typescript
export async function computeActiveTopics(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.journalEntry.groupBy({
    by: ["topicId"],
    where: { deletedAt: null, createdAt: { gte: sevenDaysAgo } },
  });
  await feedback.recordMetric("journal", "active_topic_count", result.length);
}
```

Registered in the manifest's `jobs` block as `compute-active-topics`.
Schedule pattern `"0 23 * * *"` (23:00 local). Schedule registration runs
once on first worker boot via the manifest's setup function.

### Iteration logging — `bin/log-iteration.ts`

Lives at the platform level (`bin/`), but specified here because the
journal is the first consumer.

- Invocation:
  ```
  bun bin/log-iteration --system journal \
    --description "<text>" --reason "<text>" [--outcome "<text>"]
  ```
- Wraps `feedback.logIteration(system, { description, reason, outcome })`.
- v1 usage: run manually after merging changes to main.
- A `package.json` script alias is added: `"log-iteration": "bun bin/log-iteration.ts"`.
- Automated iteration logging from CI is follow-on; not blocked on the
  journal spec.

## 9. Testing Strategy

Pragmatic, not exhaustive. Vitest, in `src/systems/journal/__tests__/` and
`src/systems/journal/**/*.test.ts`.

### Required

- **Unit: `parser.ts`.** Tag extraction with code-fence and inline-code
  skipping; word count likewise. Edge cases: lone `#`, `#hash` mid-word, tags
  inside fenced blocks, mixed case dedup.
- **Unit: `<MarkdownContent />` post-process.** `[[Topic]]` and `#tag`
  substitution; substitution skipped inside code blocks; substitution does
  not corrupt URLs that happen to contain `#`.
- **Integration: route handlers.** `createEntry`, `listEntries`,
  `updateEntry`, `deleteEntry` (soft-delete), `createTopic`, `updateTopic`
  (rename + archive). Run against a real Postgres test database with
  per-suite cleanup.
- **Integration: full-text search.** Seed known entries, run
  `searchEntries` with various queries, assert ranking and result set.
- **Integration: daily cron.** Invoke `computeActiveTopics` directly with
  seeded data and verify the metric is recorded with the right value.

### Skipped for v1

- **Component-level UI tests** for `<ComposeBox />` and `<EntryCard />` —
  slow, brittle, low return on a single-user system. Manual verification
  covers v1.
- **E2E browser tests** — no Playwright/Cypress in the platform yet.
  Manual smoke through Today / topic / tag / search on each PR.
- **Tiptap editor tests** — Tiptap is a trusted dependency; our logic is
  exercised through `parser.ts` and `<MarkdownContent />` tests.

## What This Spec Does NOT Cover

- The Global Command Palette itself — separate spec at
  `2026-04-26-global-command-palette-design.md`. The journal's manifest
  declares a `palette` block (see §2) consumable by that spec, but no
  palette code lands here.
- Tiptap mention nodes for `[[Topic]]` and `#tag` autocomplete chips. Cheap
  regex path is enough for v1.
- AI features: AI-generated reflections, embeddings/pgvector semantic
  search, auto-tagging, topic suggestions, compose-time draft prompts.
- Hard delete and edit history. Soft delete only; no version table.
- Mobile-first capture, PWA install, voice input, share-sheet integration.
- Nested topics. `parentId` column reserved; UI flat in v1.
- Single-entry standalone page at `/journal/entries/[id]`. Edits are inline;
  deep links use the `#entry-<id>` anchor on the topic page.
- Tag management UI (rename, merge, archive). Index page is read-only.
- Automated iteration logging from CI. CLI ships; Actions wiring is
  follow-on.
