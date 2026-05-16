# Journal Sort Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle button in the topic header that switches entry ordering between newest-first and oldest-first, persisted globally in localStorage and driven server-side via query parameter.

**Architecture:** The topic page reads a `?sort=asc|desc` search param and passes it to the `listEntries` service which adjusts the Prisma `orderBy` and cursor direction. A client wrapper component handles localStorage persistence and initial redirect. The toggle button lives in `TopicHeaderActions`.

**Tech Stack:** Next.js (App Router, server components), Prisma, React (client components), localStorage, Vitest

---

## File Structure

| File | Role |
|------|------|
| `src/app/_components/Icon.tsx` | Add `arrow-up` and `arrow-down` icon paths |
| `src/systems/journal/schemas/entries.ts` | Add `sort` field to `listEntriesQuerySchema` |
| `src/systems/journal/services/entries.ts` | Accept `sort` param, adjust `orderBy` and cursor |
| `src/systems/journal/services/entries.integration.test.ts` | Test ascending sort and cursor behavior |
| `src/systems/journal/components/TopicHeaderActions.tsx` | Add sort toggle button |
| `src/systems/journal/components/SortRedirect.tsx` | Client component that reads localStorage and redirects |
| `src/app/(systems)/journal/topics/[name]/page.tsx` | Read `?sort` param, pass to service, render `SortRedirect` |

---

### Task 1: Add arrow icons to Icon component

**Files:**
- Modify: `src/app/_components/Icon.tsx`

- [ ] **Step 1: Add `arrow-up` and `arrow-down` paths**

Add these entries to the `PATHS` record (after the `archive` entry):

```tsx
"arrow-up": (
  <>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </>
),
"arrow-down": (
  <>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </>
),
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/Icon.tsx
git commit -m "feat(journal): add arrow-up and arrow-down icons"
```

---

### Task 2: Add sort field to entries schema

**Files:**
- Modify: `src/systems/journal/schemas/entries.ts`

- [ ] **Step 1: Add `sort` to `listEntriesQuerySchema`**

Add a `sort` field to `listEntriesQuerySchema`:

```ts
export const listEntriesQuerySchema = z.object({
  topicId: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  cursor: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/systems/journal/schemas/entries.ts
git commit -m "feat(journal): add sort field to listEntriesQuerySchema"
```

---

### Task 3: Update entries service to support sort direction

**Files:**
- Modify: `src/systems/journal/services/entries.ts`
- Modify: `src/systems/journal/services/entries.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `entries.integration.test.ts`:

```ts
it("returns entries in ascending order when sort=asc", async () => {
  const topic = await seedTopic();
  const first = await createEntry({ topicId: topic.id, body: "first" });
  await new Promise((r) => setTimeout(r, 5));
  const second = await createEntry({ topicId: topic.id, body: "second" });

  const asc = await listEntries({ topicId: topic.id, sort: "asc" });
  expect(asc[0].id).toBe(first.id);
  expect(asc[1].id).toBe(second.id);

  const desc = await listEntries({ topicId: topic.id, sort: "desc" });
  expect(desc[0].id).toBe(second.id);
  expect(desc[1].id).toBe(first.id);
});

it("paginates correctly with sort=asc cursor", async () => {
  const topic = await seedTopic();
  for (let i = 0; i < 5; i++) {
    await createEntry({ topicId: topic.id, body: `entry ${i}` });
    await new Promise((r) => setTimeout(r, 5));
  }

  const firstPage = await listEntries({ topicId: topic.id, limit: 2, sort: "asc" });
  expect(firstPage).toHaveLength(2);

  const secondPage = await listEntries({
    topicId: topic.id,
    limit: 2,
    sort: "asc",
    cursor: firstPage[firstPage.length - 1].createdAt,
  });
  expect(secondPage).toHaveLength(2);
  expect(secondPage[0].id).not.toBe(firstPage[1].id);
  expect(secondPage[0].createdAt.getTime()).toBeGreaterThan(
    firstPage[1].createdAt.getTime()
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/systems/journal/services/entries.integration.test.ts`
Expected: FAIL — `listEntries` does not accept `sort` parameter

- [ ] **Step 3: Update `ListEntriesInput` and `listEntries` implementation**

In `src/systems/journal/services/entries.ts`, update:

```ts
export interface ListEntriesInput {
  topicId?: string;
  tag?: string;
  cursor?: Date;
  limit?: number;
  sort?: "asc" | "desc";
}

export async function listEntries(
  input: ListEntriesInput
): Promise<JournalEntryWithTopic[]> {
  const limit = Math.min(input.limit ?? 50, 100);
  const sort = input.sort ?? "desc";
  return prisma.journalEntry.findMany({
    where: {
      deletedAt: null,
      ...(input.topicId ? { topicId: input.topicId } : {}),
      ...(input.tag ? { tags: { has: input.tag } } : {}),
      ...(input.cursor
        ? { createdAt: sort === "desc" ? { lt: input.cursor } : { gt: input.cursor } }
        : {}),
    },
    orderBy: { createdAt: sort },
    take: limit,
    include: { topic: true },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/systems/journal/services/entries.integration.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/journal/services/entries.ts src/systems/journal/services/entries.integration.test.ts
git commit -m "feat(journal): support sort direction in listEntries"
```

---

### Task 4: Create SortRedirect client component

**Files:**
- Create: `src/systems/journal/components/SortRedirect.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "polaris:journal:sortOrder";

export function SortRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const current = searchParams.get("sort");
    if (current) return;

    const stored = localStorage.getItem(STORAGE_KEY) as "asc" | "desc" | null;
    const sort = stored ?? "desc";

    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sort);
    router.replace(`?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/systems/journal/components/SortRedirect.tsx
git commit -m "feat(journal): add SortRedirect client component for localStorage persistence"
```

---

### Task 5: Add sort toggle to TopicHeaderActions

**Files:**
- Modify: `src/systems/journal/components/TopicHeaderActions.tsx`

- [ ] **Step 1: Update the component**

Replace the full content of `TopicHeaderActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/app/_components/Icon";

const STORAGE_KEY = "polaris:journal:sortOrder";

interface TopicHeaderActionsProps {
  topic: { id: string; name: string; archived: boolean };
}

export function TopicHeaderActions({ topic }: TopicHeaderActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);

  const currentSort = (searchParams.get("sort") as "asc" | "desc") ?? "desc";

  function handleToggleSort() {
    const next = currentSort === "desc" ? "asc" : "desc";
    localStorage.setItem(STORAGE_KEY, next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", next);
    router.push(`?${params.toString()}`);
  }

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
      <button type="button" className="btn btn-ghost" onClick={handleToggleSort}>
        <Icon name={currentSort === "desc" ? "arrow-down" : "arrow-up"} size={14} />{" "}
        {currentSort === "desc" ? "Newest first" : "Oldest first"}
      </button>
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

- [ ] **Step 2: Commit**

```bash
git add src/systems/journal/components/TopicHeaderActions.tsx
git commit -m "feat(journal): add sort toggle button to topic header"
```

---

### Task 6: Wire up the topic page

**Files:**
- Modify: `src/app/(systems)/journal/topics/[name]/page.tsx`

- [ ] **Step 1: Update the page to read sort param and render SortRedirect**

Replace the full content of the topic page:

```tsx
import { notFound } from "next/navigation";
import { getTopicByName } from "@/systems/journal/services/topics";
import { listEntries } from "@/systems/journal/services/entries";
import { ComposeBox } from "@/systems/journal/components/ComposeBox";
import { EntryCard } from "@/systems/journal/components/EntryCard";
import { HashAnchorScroll } from "@/systems/journal/components/HashAnchorScroll";
import { TopicHeaderActions } from "@/systems/journal/components/TopicHeaderActions";
import { SortRedirect } from "@/systems/journal/components/SortRedirect";

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { name } = await params;
  const { sort: sortParam } = await searchParams;
  const topic = await getTopicByName(name);
  if (!topic) notFound();

  const sort = sortParam === "asc" ? "asc" : "desc";
  const entries = await listEntries({ topicId: topic.id, limit: 100, sort });

  return (
    <article className="doc">
      <HashAnchorScroll />
      <SortRedirect />
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

- [ ] **Step 2: Run the dev server and verify**

Run: `npm run dev`
- Navigate to `/journal/topics/<any-topic>`
- Verify default is newest-first with `?sort=desc` in the URL
- Click the toggle — URL changes to `?sort=asc`, entries reverse, button reads "Oldest first"
- Refresh the page — localStorage persists the choice
- Visit a different topic — same sort preference applies

- [ ] **Step 3: Commit**

```bash
git add src/app/(systems)/journal/topics/\[name\]/page.tsx src/systems/journal/components/SortRedirect.tsx
git commit -m "feat(journal): wire sort param into topic page with localStorage redirect"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual smoke test**

- Fresh browser (no localStorage): topic page defaults to `?sort=desc`
- Toggle to asc: entries reorder, URL updates, localStorage written
- Navigate away and back: sort persists
- Open a different topic: same global sort applied
