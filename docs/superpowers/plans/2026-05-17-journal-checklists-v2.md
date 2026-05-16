# Journal Checklists v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Obsidian-style GFM checkboxes to the journal: editor recognizes `[ ] ` as task items, display renders them as clickable checkboxes that toggle the source `- [ ]` / `- [x]` line.

**Architecture:** Tiptap `TaskList`/`TaskItem` extensions handle composition; `tiptap-markdown` round-trips to GFM. Display uses `react-markdown` + `remark-gfm`. The custom `<li>` renderer pulls task-line metadata from a precomputed list keyed by **source line number** (not Nth-task index), so mismatches between rendered task items and source markers degrade gracefully instead of throwing.

**Tech Stack:** Tiptap v3.22.x, tiptap-markdown, react-markdown 10, remark-gfm 4, Next.js App Router, Vitest

---

## File Structure

| File | Role |
|------|------|
| `package.json` | Add `@tiptap/extension-task-list@3.22.4`, `@tiptap/extension-task-item@3.22.4`, `remark-gfm` |
| `src/systems/journal/lib/tasks.ts` | Pure `findTaskLines` + `toggleTaskAtLine` helpers |
| `src/systems/journal/lib/tasks.test.ts` | Unit tests for both helpers |
| `src/systems/journal/components/Editor.tsx` | Register TaskList + TaskItem |
| `src/systems/journal/components/TaskCheckbox.tsx` | Client component for interactive display checkboxes |
| `src/systems/journal/components/MarkdownContent.tsx` | remark-gfm + custom li renderer using line-number lookup |
| `src/systems/journal/components/EntryCard.tsx` | Pass `entryId` to `MarkdownContent` |
| `src/app/globals.css` | Editor + display task list styles |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install pinned versions**

```bash
npm install @tiptap/extension-task-list@3.22.4 @tiptap/extension-task-item@3.22.4 remark-gfm
```

The Tiptap extensions must be pinned to 3.22.4 because `@tiptap/starter-kit@3.22.4` peers `@tiptap/extension-list@3.22.4`; installing the latest `3.23.x` task extensions causes an `ERESOLVE` peer conflict.

- [ ] **Step 2: Verify all three are installed**

```bash
test -d node_modules/@tiptap/extension-task-list && echo "task-list OK"
test -d node_modules/@tiptap/extension-task-item && echo "task-item OK"
test -d node_modules/remark-gfm && echo "remark-gfm OK"
```
Expected: all three "OK" lines.

- [ ] **Step 3: Commit (package-lock.json is gitignored, only commit package.json)**

```bash
git add package.json
git commit -m "chore(journal): add tiptap task list and remark-gfm packages"
```

---

### Task 2: Create findTaskLines + toggleTaskAtLine with tests

**Files:**
- Create: `src/systems/journal/lib/tasks.ts`
- Create: `src/systems/journal/lib/tasks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/systems/journal/lib/tasks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findTaskLines, toggleTaskAtLine } from "./tasks";

describe("findTaskLines", () => {
  it("returns empty array when there are no task markers", () => {
    expect(findTaskLines("just text\n- a regular bullet")).toEqual([]);
  });

  it("finds an unchecked task on a single line", () => {
    expect(findTaskLines("- [ ] todo")).toEqual([
      { line: 0, checked: false, raw: "- [ ] todo" },
    ]);
  });

  it("finds a checked task and recognizes uppercase X", () => {
    const out = findTaskLines("- [x] one\n- [X] two");
    expect(out).toEqual([
      { line: 0, checked: true, raw: "- [x] one" },
      { line: 1, checked: true, raw: "- [X] two" },
    ]);
  });

  it("finds tasks mixed with other content and records correct line numbers", () => {
    const body = "intro\n\n- [ ] a\n- regular bullet\n- [x] b\n\n# heading";
    expect(findTaskLines(body)).toEqual([
      { line: 2, checked: false, raw: "- [ ] a" },
      { line: 4, checked: true, raw: "- [x] b" },
    ]);
  });

  it("recognizes indented (nested) task items", () => {
    expect(findTaskLines("- [ ] parent\n  - [ ] child")).toEqual([
      { line: 0, checked: false, raw: "- [ ] parent" },
      { line: 1, checked: false, raw: "  - [ ] child" },
    ]);
  });

  it("does not match escaped or inline [ ] text", () => {
    const body = "see [ ] here\n- \\[ \\] escaped\n- [ ] real";
    expect(findTaskLines(body)).toEqual([
      { line: 2, checked: false, raw: "- [ ] real" },
    ]);
  });
});

describe("toggleTaskAtLine", () => {
  it("flips unchecked to checked", () => {
    expect(toggleTaskAtLine("- [ ] todo", 0)).toBe("- [x] todo");
  });

  it("flips checked to unchecked", () => {
    expect(toggleTaskAtLine("- [x] done", 0)).toBe("- [ ] done");
  });

  it("accepts uppercase X as checked and writes lowercase x back", () => {
    expect(toggleTaskAtLine("- [X] done", 0)).toBe("- [ ] done");
    expect(toggleTaskAtLine("- [ ] todo", 0)).toBe("- [x] todo");
  });

  it("only modifies the specified line", () => {
    const body = "- [ ] a\n- [ ] b\n- [ ] c";
    expect(toggleTaskAtLine(body, 1)).toBe("- [ ] a\n- [x] b\n- [ ] c");
  });

  it("preserves indentation on nested items", () => {
    expect(toggleTaskAtLine("- [ ] parent\n  - [ ] child", 1)).toBe(
      "- [ ] parent\n  - [x] child"
    );
  });

  it("throws when the line is not a task marker", () => {
    expect(() => toggleTaskAtLine("- [ ] a\nregular text", 1)).toThrow();
  });

  it("throws when line number is out of range", () => {
    expect(() => toggleTaskAtLine("- [ ] only", 5)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/systems/journal/lib/tasks.test.ts`
Expected: FAIL — file `./tasks` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/systems/journal/lib/tasks.ts`:

```ts
const TASK_LINE = /^(\s*[-*]\s+\[)([ xX])(\]\s)/;

export interface TaskLine {
  line: number;
  checked: boolean;
  raw: string;
}

export function findTaskLines(body: string): TaskLine[] {
  const lines = body.split("\n");
  const out: TaskLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_LINE);
    if (m) {
      out.push({
        line: i,
        checked: m[2].toLowerCase() === "x",
        raw: lines[i],
      });
    }
  }
  return out;
}

export function toggleTaskAtLine(body: string, lineNumber: number): string {
  const lines = body.split("\n");
  if (lineNumber < 0 || lineNumber >= lines.length) {
    throw new Error(`toggleTaskAtLine: line ${lineNumber} out of range`);
  }
  const original = lines[lineNumber];
  const next = original.replace(TASK_LINE, (_, before, mark, after) => {
    const flipped = mark === " " ? "x" : " ";
    return `${before}${flipped}${after}`;
  });
  if (next === original) {
    throw new Error(`toggleTaskAtLine: line ${lineNumber} is not a task marker`);
  }
  lines[lineNumber] = next;
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/systems/journal/lib/tasks.test.ts`
Expected: All tests PASS (13 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/systems/journal/lib/tasks.ts src/systems/journal/lib/tasks.test.ts
git commit -m "feat(journal): add findTaskLines and toggleTaskAtLine helpers"
```

---

### Task 3: Register TaskList + TaskItem in the editor

**Files:**
- Modify: `src/systems/journal/components/Editor.tsx`

- [ ] **Step 1: Add the imports and register the extensions**

Modify `src/systems/journal/components/Editor.tsx` by adding two imports and two extension entries. The full file should be:

```tsx
"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
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
      StarterKit.configure({ link: { openOnClick: false } }),
      Placeholder.configure({
        placeholder: "What did you build, learn, or wrestle with?",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({ html: false, breaks: true, linkify: true }),
    ],
    content: initialBody,
    immediatelyRender: false,
    onUpdate({ editor }) {
      const storage = editor.storage as unknown as { markdown: MarkdownStorage };
      onChange?.(storage.markdown.getMarkdown());
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  return <EditorContent editor={editor} />;
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/systems/journal/components/Editor.tsx
git commit -m "feat(journal): register TaskList and TaskItem extensions in editor"
```

---

### Task 4: Create the TaskCheckbox client component

**Files:**
- Create: `src/systems/journal/components/TaskCheckbox.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toggleTaskAtLine } from "../lib/tasks";

interface TaskCheckboxProps {
  entryId: string;
  lineNumber: number;
  initiallyChecked: boolean;
  body: string;
  children: ReactNode;
}

export function TaskCheckbox({
  entryId,
  lineNumber,
  initiallyChecked,
  body,
  children,
}: TaskCheckboxProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(initiallyChecked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    if (busy) return;
    const next = !checked;
    setChecked(next);
    setBusy(true);
    setError(null);

    try {
      const nextBody = toggleTaskAtLine(body, lineNumber);
      const res = await fetch(`/api/systems/journal/entries/${entryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: nextBody }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        setChecked(!next);
        setError(`Save failed (${res.status}): ${detail.slice(0, 120) || res.statusText}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setChecked(!next);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Save failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="task-item" data-checked={checked ? "true" : "false"}>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleToggle}
        disabled={busy}
        aria-label="Toggle task"
      />
      <span className="task-label">{children}</span>
      {error ? <span className="task-error">{error}</span> : null}
    </li>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/systems/journal/components/TaskCheckbox.tsx
git commit -m "feat(journal): add TaskCheckbox client component"
```

---

### Task 5: Wire remark-gfm + task-line lookup into MarkdownContent

**Files:**
- Modify: `src/systems/journal/components/MarkdownContent.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { Children, isValidElement } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { TaskCheckbox } from "./TaskCheckbox";
import { findTaskLines } from "../lib/tasks";

const TAG = /(?:^|\s)#([a-zA-Z][\w-]*)/g;
const WIKILINK = /\[\[([^\]]+)\]\]/g;

interface SubstitutedTextProps {
  value: string;
}

type WikiSegment = { kind: "wikilink"; name: string; raw: string };

type TagSegment = { kind: "tag"; name: string; raw: string; prefix: string };

function SubstitutedText({ value }: SubstitutedTextProps): React.ReactNode {
  const wikiSegments = splitByPattern<WikiSegment>(value, WIKILINK, (raw, match) => ({
    kind: "wikilink",
    name: match[1],
    raw,
  }));

  const final: React.ReactNode[] = [];
  let key = 0;
  for (const seg of wikiSegments) {
    if (seg.kind === "wikilink") {
      final.push(
        <Link
          key={`w-${key++}`}
          href={`/journal/topics/${encodeURIComponent(seg.name)}`}
          className="wikilink"
        >
          {seg.name}
        </Link>
      );
      continue;
    }
    const tagSegments = splitByPattern<TagSegment>(seg.text, TAG, (raw, match) => ({
      kind: "tag",
      name: match[1].toLowerCase(),
      raw,
      prefix: raw.startsWith("#") ? "" : raw.slice(0, raw.indexOf("#")),
    }));
    for (const tag of tagSegments) {
      if (tag.kind === "tag") {
        if (tag.prefix) final.push(tag.prefix);
        final.push(
          <Link
            key={`t-${key++}`}
            href={`/journal/tags/${tag.name}`}
            className="tag-inline"
          >
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

type TextSegment = { kind: "text"; text: string };

function splitByPattern<T extends { kind: string }>(
  source: string,
  pattern: RegExp,
  build: (raw: string, match: RegExpExecArray) => T
): (T | TextSegment)[] {
  const out: (T | TextSegment)[] = [];
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

interface MarkdownContentProps {
  body: string;
  entryId?: string;
}

export function MarkdownContent({ body, entryId }: MarkdownContentProps) {
  // Precompute source task lines once per render. The Nth task-list-item
  // rendered maps to the Nth entry here; if remark-gfm renders more
  // task-list-items than the source has markers, the extras degrade to
  // non-interactive checkboxes with a console warning.
  const taskLines = findTaskLines(body);
  let renderCursor = 0;

  const components: Components = {
    p: ({ children }) => <p>{renderChildren(children)}</p>,
    li: ({ node, children, className, ...rest }) => {
      const classNames = hastClassList(node);
      const isTask = classNames.includes("task-list-item");
      if (isTask && entryId) {
        const task = taskLines[renderCursor++];
        if (!task) {
          if (typeof window !== "undefined") {
            console.warn(
              "[MarkdownContent] task-list-item rendered without matching source marker; rendering as disabled checkbox"
            );
          }
          const checked = hastTaskItemChecked(node);
          return (
            <li className="task-item" data-checked={checked ? "true" : "false"}>
              <input type="checkbox" checked={checked} disabled aria-label="Task (read-only)" />
              <span className="task-label">{filterOutInputs(children)}</span>
            </li>
          );
        }
        return (
          <TaskCheckbox
            entryId={entryId}
            lineNumber={task.line}
            initiallyChecked={task.checked}
            body={body}
          >
            {filterOutInputs(children)}
          </TaskCheckbox>
        );
      }
      return (
        <li className={className} {...rest}>
          {renderChildren(children)}
        </li>
      );
    },
    ul: ({ node, className, children, ...rest }) => {
      const classNames = hastClassList(node);
      if (classNames.includes("contains-task-list")) {
        return (
          <ul className="task-list" {...rest}>
            {children}
          </ul>
        );
      }
      return (
        <ul className={className} {...rest}>
          {children}
        </ul>
      );
    },
    h1: ({ children }) => <h2>{renderChildren(children)}</h2>,
    h2: ({ children }) => <h3>{renderChildren(children)}</h3>,
    h3: ({ children }) => <h4>{renderChildren(children)}</h4>,
  };

  return (
    <div className="doc">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
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

type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: HastElement[];
};

function hastClassList(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const n = node as HastElement;
  const cls = n.properties?.className;
  if (Array.isArray(cls)) return cls.map(String);
  if (typeof cls === "string") return cls.split(/\s+/);
  return [];
}

function hastTaskItemChecked(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as HastElement;
  const input = n.children?.find(
    (c) => c?.type === "element" && c?.tagName === "input"
  );
  return input?.properties?.checked === true;
}

function filterOutInputs(children: React.ReactNode): React.ReactNode {
  return Children.toArray(children).filter((c) => {
    if (isValidElement(c) && c.type === "input") return false;
    return true;
  });
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/systems/journal/components/MarkdownContent.tsx
git commit -m "feat(journal): wire remark-gfm with line-number task lookup"
```

---

### Task 6: Pass entryId from EntryCard to MarkdownContent

**Files:**
- Modify: `src/systems/journal/components/EntryCard.tsx`

- [ ] **Step 1: Pass entryId**

Find this line in `src/systems/journal/components/EntryCard.tsx`:

```tsx
<MarkdownContent body={entry.body} />
```

Replace with:

```tsx
<MarkdownContent body={entry.body} entryId={entry.id} />
```

- [ ] **Step 2: Type check and run tests**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: no type errors, all unit tests pass (existing 73 + new findTaskLines/toggleTaskAtLine tests).

- [ ] **Step 3: Commit**

```bash
git add src/systems/journal/components/EntryCard.tsx
git commit -m "feat(journal): pass entryId to MarkdownContent for interactive checkboxes"
```

---

### Task 7: Add CSS for task lists, task items, and checked state

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Locate the insertion point**

In `src/app/globals.css`, find the rule that ends with:

```css
.prose li > p, .doc li > p, .compose .ProseMirror li > p {
  margin: 0;
}
```

- [ ] **Step 2: Append the task list rules right after that block**

Add this CSS immediately after:

```css
/* Task lists (GFM checkboxes) -------------------------------------------- */
.doc ul.task-list,
.doc ul.contains-task-list,
.compose .ProseMirror ul[data-type="taskList"] {
  list-style: none;
  padding-inline-start: 0;
  margin: 0 0 var(--sp-4);
}
.doc .task-item,
.doc li.task-list-item,
.compose .ProseMirror li[data-type="taskItem"] {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  margin: var(--sp-1) 0;
  color: var(--ink-2);
  line-height: var(--lh-relaxed);
}
.doc .task-item > input[type="checkbox"],
.doc li.task-list-item > input[type="checkbox"],
.compose .ProseMirror li[data-type="taskItem"] > label > input[type="checkbox"] {
  width: 14px;
  height: 14px;
  margin-top: 0.35em;
  background: var(--paper-0);
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  accent-color: var(--accent);
  flex-shrink: 0;
}
.doc .task-item > input[type="checkbox"]:not(:disabled) {
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.doc .task-item > input[type="checkbox"]:not(:disabled):hover {
  border-color: var(--accent);
}
.doc .task-item[data-checked="true"] .task-label,
.compose .ProseMirror li[data-type="taskItem"][data-checked="true"] > div {
  text-decoration: line-through;
  color: var(--ink-4);
}
.doc .task-item .task-label > p {
  margin: 0;
}
.doc .task-item .task-error {
  font-size: var(--fs-xs);
  color: var(--danger);
  margin-left: var(--sp-2);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(journal): style task lists for editor and display"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass (existing 73 + 13 new task-helper tests = 86 total).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: compiles successfully.

- [ ] **Step 4: Manual smoke test**

If the dev server isn't running, start it (`npm run dev`). Then:

- Navigate to any topic page and create a new entry by typing:
  ```
  [ ] one
  ```
  followed by a space (the input rule should convert this to a task item with a checkbox).
- Press Enter and type `two`, Enter and type `three`, etc. Each Enter should create a new task item.
- Save the entry.
- On the rendered entry card:
  - Three checkboxes appear, all unchecked.
  - Click the first checkbox.
  - It instantly becomes checked with strikethrough text.
  - Network panel shows a PATCH to `/api/systems/journal/entries/<id>` returning 200.
- Reload the page; the first item stays checked.
- Edit the entry; the editor shows the first item as checked.
