# Journal checklists v2 (Obsidian-style)

Add GFM task lists (checkboxes) to the journal editor and display. The body
stores `- [ ]` and `- [x]` as plain markdown. Clicking a checkbox on a rendered
entry toggles its source line and persists via PATCH.

This is a re-attempt of an earlier spec (rolled back) that suffered from
index-mismatch bugs when the UI rendered more task items than the source body
contained markers. The fix here is line-number-based identification with
graceful degradation.

## Editor changes

- Install `@tiptap/extension-task-list` and `@tiptap/extension-task-item`
  pinned to Tiptap 3.22.x (matches starter-kit's bundled extension-list).
- Register both in `Editor.tsx`; use `TaskItem.configure({ nested: true })`
  so nested task items work.
- Markdown shortcut `[ ] ` at the start of a line auto-converts to a task
  item (Tiptap's default input rule). Enter creates the next task item.

## Display changes

- Install `remark-gfm`.
- In `MarkdownContent.tsx`, pass `remarkPlugins={[remarkGfm]}` so
  `- [ ]` / `- [x]` parse as task list items.
- Add a custom `li` renderer that detects task-list-items and hands them
  to a `TaskCheckbox` client component.

## Click toggle

The previous design counted the Nth task item in the UI and toggled the Nth
marker in the source. When the rendered UI count and source marker count
disagreed (e.g. from escaped legacy content or unexpected remark-gfm
classification), clicks threw "index out of range".

The new design uses **line numbers** as the stable identifier:

- Before rendering, `findTaskLines(body)` returns a list of
  `{ line, checked, raw }` for every `- [ ]` / `- [x]` marker in the source.
- The `li` renderer increments a counter to pull the Nth entry from this list
  and passes its `line` to `TaskCheckbox`.
- If the renderer is invoked more times than there are entries in the list
  (i.e. UI thinks there are more task items than the source actually has),
  the extras render as plain disabled checkboxes and log a console warning —
  no crashes, no broken clicks.
- `TaskCheckbox` is a client component. On click: optimistically flip local
  state, compute the new body via `toggleTaskAtLine(body, line)`, PATCH
  `/api/systems/journal/entries/:id`, then `router.refresh()` on success or
  revert + show inline error on failure.

## Pure helpers (unit-tested)

In `src/systems/journal/lib/tasks.ts`:

```ts
findTaskLines(body: string): Array<{ line: number; checked: boolean; raw: string }>
toggleTaskAtLine(body: string, lineNumber: number): string
```

Both are pure string functions with no React or DOM dependencies. Tests cover:
checked/unchecked detection, uppercase X, indented (nested) items, lines that
aren't task markers, line numbers that don't point at a task marker.

## Styling

Add to `globals.css`, scoped to both `.compose .ProseMirror` (editor) and
`.doc` (display):

- `ul[data-type="taskList"]` / `.doc .task-list`: no list-style, no
  padding-inline-start, so checkboxes align flush left.
- `li[data-type="taskItem"]` / `.doc .task-item`: flex row, checkbox aligned
  with the first text line.
- Checkbox: 14×14, paper-cream background, `border: 1px solid var(--border)`,
  `border-radius: var(--r-xs)`, `accent-color: var(--accent)`.
- Checked state via `data-checked="true"` on the `<li>`: strikethrough label,
  dimmed to `var(--ink-4)`.
- Display checkboxes get `cursor: pointer` and a subtle hover.

## Files

| File | Change |
|------|--------|
| `package.json` | Add 3 deps (pinned versions) |
| `src/systems/journal/lib/tasks.ts` | `findTaskLines` + `toggleTaskAtLine` |
| `src/systems/journal/lib/tasks.test.ts` | Unit tests |
| `src/systems/journal/components/Editor.tsx` | Register TaskList + TaskItem |
| `src/systems/journal/components/TaskCheckbox.tsx` | New client component |
| `src/systems/journal/components/MarkdownContent.tsx` | remark-gfm + custom li renderer |
| `src/systems/journal/components/EntryCard.tsx` | Pass `entryId` to MarkdownContent |
| `src/app/globals.css` | Task list styles |

## Legacy escaped content

Existing entries with `\[ \]` text are out of scope. The user will manually
clean them up by re-editing the affected entries.

## Out of scope

- Cross-system Tasks integration (no separate Tasks system exists).
- Due dates, priorities, drag-reorder, bulk "check all".
- Automatic migration of legacy escaped content.
