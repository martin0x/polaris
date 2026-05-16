# Journal topic sort toggle

Add a toggle button to the topic header that reverses chronological order of
entries (newest-first ↔ oldest-first), persisted globally via localStorage and
driven server-side via a query parameter.

## Data flow

1. Topic page (`/journal/topics/[name]`) reads `?sort=asc|desc` search param.
2. Default is `desc` (newest first).
3. The sort direction is passed to `listEntries`, which sets
   `orderBy: { createdAt: direction }`.
4. Cursor comparison flips to `gt` when `sort=asc` (for pagination correctness).

## Toggle button

- Location: `TopicHeaderActions` component, alongside Rename and Archive.
- Style: `btn btn-ghost` matching existing buttons.
- Icon: `arrow-down` when newest-first, `arrow-up` when oldest-first.
- Label: "Newest first" / "Oldest first" reflecting current state.
- On click: flips sort param in URL via `router.push`, persists to localStorage.

## Persistence

- localStorage key: `polaris:journal:sortOrder` (values: `"asc"` | `"desc"`).
- On first visit without a `?sort` param, a client component reads localStorage
  and redirects to include `?sort=<stored value>` (or `desc` if unset).
- After redirect, the server page always receives an explicit sort param.

## Service changes

- `ListEntriesInput` gains `sort?: "asc" | "desc"` (default `"desc"`).
- `listEntries` uses it for the Prisma `orderBy` clause.
- Cursor condition becomes `lt` for desc, `gt` for asc.

## Files to modify

| File | Change |
|------|--------|
| `src/systems/journal/services/entries.ts` | Add `sort` to input, adjust `orderBy` and cursor |
| `src/systems/journal/components/TopicHeaderActions.tsx` | Add sort toggle button with localStorage read/write |
| `src/app/(systems)/journal/topics/[name]/page.tsx` | Read `?sort` param, pass to `listEntries`, add redirect wrapper |

## Out of scope

- Per-topic persistence (single global preference).
- Sort by anything other than `createdAt`.
- Pagination UX (cursor loading is not yet exposed to users).
