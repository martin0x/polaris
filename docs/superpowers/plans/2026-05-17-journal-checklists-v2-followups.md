# Journal checklists v2 — review follow-ups

Found during a simplify review of commits `7d04f5e..e145e47` (the
journal sort-toggle + checklists-v2 batch). The clear-win cleanups
already landed in `fef8e5d`. The items below are real but were either
out of scope for that pass or carry enough risk that they want their
own commit.

Ordered by priority (impact × ease).

## 1. Drop `router.refresh()` after task toggle

**File:** `src/systems/journal/components/TaskCheckbox.tsx:47`

`router.refresh()` re-runs every server component on the page after a
checkbox save. For a journal page with many entries this re-parses every
entry's markdown. The local optimistic state is already correct; the
server already has the new body. The refresh is redundant **and** is
the root cause of follow-up #2's race.

**Fix:** delete the `router.refresh()` call. The next real navigation
(or a manual reload) will reflect the saved body.

**Risk:** if some downstream component depends on a fresh server fetch
after a toggle, it would stop updating. Quick scan suggests there's
none — `EntryCard` reads from props, `MarkdownContent` is pure.

## 2. Sync `initiallyChecked` prop into state, OR move toggle server-side

**File:** `src/systems/journal/components/TaskCheckbox.tsx:23`

`useState(initiallyChecked)` ignores subsequent prop changes. After
`router.refresh()` (or any parent re-render with a new body), the
checkbox can display state that no longer matches the entry. If two
checkboxes are toggled in quick succession, the second checkbox's
`body` prop is stale by the time its handler fires — the toggle
recomputes from the pre-second-toggle body and silently overwrites the
server-side new body.

**Two paths:**

- **A (small):** drop `router.refresh()` per #1 and trust optimistic
  state. The race largely disappears because the parent stops
  re-rendering during toggles. Cheapest fix.
- **B (better):** move the toggle server-side. New endpoint shape:
  ```
  PATCH /api/systems/journal/entries/[id]
    body: { toggleTaskLine: number }
  ```
  Server reads-modifies-writes the current body atomically using the
  existing `toggleTaskAtLine` helper. Returns the new entry. Client
  drops `body` and `initiallyChecked` props — receives `checked` from
  the response and updates local state. This also fixes follow-up #3.

**Recommendation:** ship A now (one-line delete), schedule B as a
proper feature.

## 3. Stop shipping full `body` to every `<TaskCheckbox>`

**Files:** `MarkdownContent.tsx:134`, `TaskCheckbox.tsx:11`

For an entry with N task items, the full body string is serialized N
times into the RSC payload and held N times in client memory. For long
entries this is wasteful, and it's the source of the staleness race in
#2.

**Fix:** subsumed by path B in #2. Skip if going with path A.

## 4. Add composite Prisma index for journal pagination

**File:** `prisma/schema.prisma` — `JournalEntry`

The existing index is `@@index([createdAt(sort: Desc)])`. The new
`sort=asc` cursor (`{ gt: cursor }`) can scan that index backwards, but
the `topicId` filter isn't pre-narrowed.

**Fix:** add `@@index([topicId, createdAt])`. Helps both the existing
`desc` path and the new `asc` path.

**Mechanics:** Prisma migration; safe to deploy (index creation, no
data change). On large tables consider `CREATE INDEX CONCURRENTLY` via
a raw SQL migration. Polaris is single-user so a regular migration is
fine for now.

## 5. CSS triplication in `globals.css`

**File:** `src/app/globals.css:277..538`

About 30 rules repeat `.prose X, .doc X, .compose .ProseMirror X`. Two
ways to collapse:

- **Tempting but risky:** `:is(.prose, .doc, .compose .ProseMirror) X`
  — but `:is()` takes the highest specificity of its arguments, so
  every `.prose X` rule's specificity rises from (0,1,1) to (0,2,1).
  This can silently break existing overrides elsewhere in the project.
- **Safer:** add `class="doc"` to the editor's root element via
  Tiptap's `editorProps.attributes` in `Editor.tsx`. Then collapse all
  triplets to `.prose X, .doc X` (specificity unchanged).

Mechanical refactor; do a visual diff against the design reference
pages after the change.

## 6. Shared journal API client

**Files:** `TaskCheckbox.tsx`, `ComposeBox.tsx`, `TopicHeaderActions.tsx`,
`EntryActions.tsx`

Four direct `fetch('/api/systems/journal/...')` callers in the journal
UI, each with hand-rolled headers and error handling. The duplication
predates this batch.

**Fix:** new `src/systems/journal/lib/api.ts` exporting
`updateEntry(id, patch)`, `deleteEntry(id)`, `createEntry(payload)`,
`updateTopic(id, patch)`. Each call site becomes a single line.

**Not blocking;** worthwhile when next touching one of those files.

## 7. Drop redundant `<div className="doc">` wrapper

**File:** `src/systems/journal/components/MarkdownContent.tsx:167`

The topic page is `<article className="doc">` and `MarkdownContent`
also wraps its output in `<div className="doc">`, which means
`.doc { max-width: 720px; margin: 0 auto }` nests twice.

**Risk:** other render contexts (search results, future surfaces) may
not provide the outer `.doc`. Audit callers before removing. If the
wrapper is removed, those callers must provide `.doc` themselves.

## Out of scope (do not do)

- `unist-util-position` for `hastSourceLine`: only saves a few lines
  and pulls in another import path. The local helper is fine.
- Consolidating markdown regex constants across `parser.ts`,
  `MarkdownContent.tsx`, and `tasks.ts`: those have different boundary
  semantics on purpose; merging them is a separate audit.
- `filterOutInputs`: only one call site, no real duplication.
