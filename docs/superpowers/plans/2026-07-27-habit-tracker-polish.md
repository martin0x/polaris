# Habit Tracker Polish + Log Flyout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six approved habit-tracker follow-ups from `docs/superpowers/specs/2026-07-27-habit-tracker-polish-design.md`: instant dropdown refresh, date numbers in the week header, serif habit names, an inline add-habit form with quote, the row menu at the end of the row, and per-day diamonds that create backdated journal logs through a new right-edge flyout.

**Architecture:** Server side, a new habits `logs` service wraps the journal's `createEntry` (extended with a service-layer-only `createdAt` override) and is exposed at `POST /habits/:id/logs`. Client side, the `HabitTracker` island gains a seq-guarded force-refetch for details (stale-while-revalidate), a rewritten diamond strip (one button per day), and a new `LogFlyout` panel built on a new `.flyout` CSS primitive. The remaining items are markup/CSS changes inside the existing components.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 (`@/generated/prisma/client`), Zod 4, vitest (unit + integration), bun.

## Global Constraints

- **Design tokens only** — never hex colors or raw px for color/type/radius/shadow/spacing/motion. Use `var(--accent)`, `var(--fg-faint)`, `var(--sp-2)`, `var(--fs-xs)`, `var(--dur-med)`, etc. (One deliberate exception already in the codebase: the 36px titlebar row height.)
- **Never fill Lucide icons.** The filled diamond is a custom inline SVG shape (like `TickCircle`'s disc), not a filled Lucide icon.
- **Sentence case everywhere**; no exclamation points; no emoji in chrome.
- **Error copy:** name the failure, name the recovery, never apologize. Exact strings in this plan are binding: `"Logs can't be written for future days."`, `"Journal topic is archived — unarchive it to keep logging."`, `"Journal topic is missing — recreate it from the tracker."`, `"Could not save the log."`
- **Dates are `yyyy-mm-dd` strings.** Server "today" = `todayString()` (`POLARIS_TZ`, default `Asia/Manila`); client "today" = `localTodayString()`.
- **Backdated logs** get `createdAt` = noon in `POLARIS_TZ` on the requested day; a log for today gets the real current timestamp.
- **Journal's public API is unchanged** — `createdAt` override exists only on the service-layer `CreateEntryInput`.
- **git hygiene:** `git add` explicit paths ONLY. NEVER `git add -A`, `git add .`, or `git commit -a` — the working tree contains unrelated files that must stay uncommitted (`bun.lock`, `package.json`, `shot.mjs`, `switch-sound.mp3`, `.claude/`, `docs/design/proposals/`, `font-*.mjs`, `palette-smoke.mjs`, and other `*.mjs` scratch files at the repo root).
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Commands:** unit tests `bun run test <file>`; integration tests `bun run test:integration <file>` (needs `DATABASE_URL_TEST` exported into the shell first — read it from `.env`: `export DATABASE_URL_TEST="$(grep '^DATABASE_URL_TEST=' .env | cut -d= -f2- | tr -d '\"')"`); lint `bun run lint`; types `bunx tsc --noEmit`.
- **Client tasks (5–8) have no automated UI tests.** Verification is `bun run lint` + `bunx tsc --noEmit`; visual verification happens at review time. Do NOT try to run the dev server, forge auth cookies, or take screenshots.

---

### Task 1: `noonInTz` date helper

**Files:**
- Modify: `src/systems/habits/lib/dates.ts`
- Test: `src/systems/habits/lib/dates.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `noonInTz(s: string, tz?: string): Date` — the UTC instant of 12:00 in `tz` on day `s`; `tz` defaults to `process.env.POLARIS_TZ ?? "Asia/Manila"`. Task 2 imports it.

- [ ] **Step 1: Write the failing tests**

Append to `src/systems/habits/lib/dates.test.ts` (inside the file's top-level scope, importing `noonInTz` alongside the existing imports from `./dates`):

```ts
describe("noonInTz", () => {
  it("pins Manila noon at 04:00 UTC", () => {
    expect(noonInTz("2026-07-22", "Asia/Manila").toISOString()).toBe(
      "2026-07-22T04:00:00.000Z"
    );
  });

  it("returns an instant that formats back to the same day in the target tz", () => {
    const zones = ["Asia/Manila", "UTC", "Pacific/Kiritimati", "Pacific/Midway", "America/New_York"];
    for (const tz of zones) {
      const d = noonInTz("2026-07-22", tz);
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(d);
      expect(day).toBe("2026-07-22");
    }
  });

  it("handles a northern-winter date across DST zones", () => {
    const d = noonInTz("2026-01-15", "America/New_York");
    expect(d.toISOString()).toBe("2026-01-15T17:00:00.000Z"); // EST is UTC-5
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test src/systems/habits/lib/dates.test.ts`
Expected: FAIL — `noonInTz` is not exported.

- [ ] **Step 3: Implement**

Append to `src/systems/habits/lib/dates.ts`:

```ts
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour === "24" ? "0" : p.hour), Number(p.minute), Number(p.second)
  );
  return asUtc - at.getTime();
}

/** UTC instant of 12:00 in `tz` on the given day — noon keeps a backdated
 * entry on the intended calendar day for any viewer timezone within ±12h. */
export function noonInTz(s: string, tz: string = process.env.POLARIS_TZ ?? "Asia/Manila"): Date {
  const noonUtc = new Date(`${s}T12:00:00Z`);
  return new Date(noonUtc.getTime() - tzOffsetMs(noonUtc, tz));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test src/systems/habits/lib/dates.test.ts`
Expected: PASS, whole file green, output pristine.

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/lib/dates.ts src/systems/habits/lib/dates.test.ts
git commit -m "feat(habits): noonInTz helper for backdated log timestamps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: journal `createdAt` override + habits `createLog` service

**Files:**
- Modify: `src/systems/journal/services/entries.ts` (add `createdAt` to `CreateEntryInput`)
- Modify: `src/systems/habits/services/detail.ts` (export `excerptOf`)
- Create: `src/systems/habits/services/logs.ts`
- Test: `src/systems/journal/services/entries.integration.test.ts` (append one test)
- Test: `src/systems/habits/services/logs.integration.test.ts` (new)

**Interfaces:**
- Consumes: `noonInTz` (Task 1); `FutureDateError` from `../services/ticks`; `createEntry` from `@/systems/journal/services/entries`; `DetailEntry` + `excerptOf` from `./detail`; `createHabit` from `./habits` (tests).
- Produces:
  - `CreateEntryInput.createdAt?: Date` (journal service, optional, service-layer only).
  - `createLog(habitId: string, date: string, input: CreateLogInput): Promise<DetailEntry>` where `CreateLogInput = { title?: string | null; body: string }`.
  - `TopicArchivedError`, `TopicMissingError` (message strings from Global Constraints). Task 3 imports all three.

- [ ] **Step 1: Write the failing tests**

Create `src/systems/habits/services/logs.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { prisma } from "@/platform/db/client";
import { addDays, noonInTz, todayString } from "../lib/dates";
import { createHabit } from "./habits";
import { createLog, TopicArchivedError, TopicMissingError } from "./logs";
import { FutureDateError } from "./ticks";

describe("createLog", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("creates a today log under the habit's topic with a current timestamp", async () => {
    const habit = await createHabit("Run");
    const before = Date.now();
    const log = await createLog(habit.id, todayString(), { body: "Did 5k #cardio" });
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id: log.id } });
    expect(entry.topicId).toBe(habit.journalTopicId);
    expect(entry.tags).toContain("cardio");
    expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(entry.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(log.excerpt).toBe("Did 5k #cardio");
  });

  it("backdates a past-day log to noon POLARIS_TZ on that day", async () => {
    const habit = await createHabit("Run");
    const date = addDays(todayString(), -3);
    const log = await createLog(habit.id, date, { title: "Missed note", body: "Backfilled" });
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id: log.id } });
    expect(entry.createdAt.toISOString()).toBe(noonInTz(date).toISOString());
    expect(entry.title).toBe("Missed note");
  });

  it("rejects future dates", async () => {
    const habit = await createHabit("Run");
    await expect(
      createLog(habit.id, addDays(todayString(), 1), { body: "Nope" })
    ).rejects.toBeInstanceOf(FutureDateError);
  });

  it("rejects when the topic is archived", async () => {
    const habit = await createHabit("Run");
    await prisma.journalTopic.update({
      where: { id: habit.journalTopicId! },
      data: { archived: true },
    });
    await expect(
      createLog(habit.id, todayString(), { body: "Nope" })
    ).rejects.toBeInstanceOf(TopicArchivedError);
  });

  it("rejects when the habit has no topic", async () => {
    const habit = await createHabit("Run");
    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: null } });
    await expect(
      createLog(habit.id, todayString(), { body: "Nope" })
    ).rejects.toBeInstanceOf(TopicMissingError);
  });
});
```

Append to the journal suite in `src/systems/journal/services/entries.integration.test.ts`, inside its existing top-level `describe`, matching the file's existing setup helpers (it already creates topics — reuse whatever helper or `createTopic` import the neighboring tests use):

```ts
it("honors an explicit createdAt override", async () => {
  const topic = await createTopic({ name: "Backdated" });
  const when = new Date("2026-07-01T04:00:00.000Z");
  const entry = await createEntry({ topicId: topic.id, body: "old", createdAt: when });
  expect(entry.createdAt.toISOString()).toBe(when.toISOString());
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export DATABASE_URL_TEST="$(grep '^DATABASE_URL_TEST=' .env | cut -d= -f2- | tr -d '"')"
bun run test:integration src/systems/habits/services/logs.integration.test.ts
```
Expected: FAIL — `./logs` module does not exist. The journal test fails to compile (no `createdAt` in `CreateEntryInput`).

- [ ] **Step 3: Implement**

In `src/systems/journal/services/entries.ts`, extend the input and pass it through:

```ts
export interface CreateEntryInput {
  topicId: string;
  title?: string | null;
  body: string;
  /** Service-layer only — lets system callers (habit logs) backdate an entry.
   * Deliberately NOT exposed through the journal's public API schema. */
  createdAt?: Date;
}
```

and in `createEntry`'s `data`:

```ts
    data: {
      topicId: input.topicId,
      title: input.title ?? null,
      body: input.body,
      tags,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
```

In `src/systems/habits/services/detail.ts`, change `function excerptOf` to `export function excerptOf` (no other change).

Create `src/systems/habits/services/logs.ts`:

```ts
import { prisma } from "@/platform/db/client";
import { createEntry } from "@/systems/journal/services/entries";
import { noonInTz, todayString } from "../lib/dates";
import { FutureDateError } from "./ticks";
import { excerptOf, type DetailEntry } from "./detail";

export class TopicArchivedError extends Error {
  constructor() {
    super("Journal topic is archived — unarchive it to keep logging.");
    this.name = "TopicArchivedError";
  }
}

export class TopicMissingError extends Error {
  constructor() {
    super("Journal topic is missing — recreate it from the tracker.");
    this.name = "TopicMissingError";
  }
}

export interface CreateLogInput {
  title?: string | null;
  body: string;
}

/** Create a journal entry under the habit's topic. Past days are backdated to
 * noon POLARIS_TZ so the entry stays on the intended calendar day. */
export async function createLog(
  habitId: string, date: string, input: CreateLogInput
): Promise<DetailEntry> {
  const today = todayString();
  if (date > today) throw new FutureDateError(date);
  const habit = await prisma.habit.findUniqueOrThrow({ where: { id: habitId } });
  const topic = habit.journalTopicId
    ? await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId } })
    : null;
  if (!topic) throw new TopicMissingError();
  if (topic.archived) throw new TopicArchivedError();
  const entry = await createEntry({
    topicId: topic.id,
    title: input.title ?? null,
    body: input.body,
    ...(date === today ? {} : { createdAt: noonInTz(date) }),
  });
  return {
    id: entry.id,
    title: entry.title,
    excerpt: excerptOf(entry.body),
    createdAt: entry.createdAt.toISOString(),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun run test:integration src/systems/habits/services/logs.integration.test.ts
bun run test:integration src/systems/journal/services/entries.integration.test.ts
```
Expected: both PASS, output pristine.

- [ ] **Step 5: Commit**

```bash
git add src/systems/journal/services/entries.ts src/systems/journal/services/entries.integration.test.ts src/systems/habits/services/detail.ts src/systems/habits/services/logs.ts src/systems/habits/services/logs.integration.test.ts
git commit -m "feat(habits): createLog service with backdated journal entries

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: log schema, route, and manifest registration

**Files:**
- Modify: `src/systems/habits/schemas/habits.ts`
- Create: `src/systems/habits/routes/logs.ts`
- Modify: `src/systems/habits/manifest.ts`
- Test: `src/systems/habits/routes/routes.integration.test.ts` (append)

**Interfaces:**
- Consumes: `createLog`, `TopicArchivedError`, `TopicMissingError` (Task 2); `FutureDateError` from `../services/ticks`; `getHabitById` from `../services/habits`; `entryWordCount` from `@/systems/journal/services/entries`; `dateStringSchema`.
- Produces: `createLogSchema`; route handler `createLogRoute` registered as `"POST /habits/:id/logs"`. The client (Task 8) calls `POST /api/systems/habits/habits/:id/logs` with `{ date, title?, body }` and receives `201 { entry: DetailEntry }`.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("habits routes", ...)` in `src/systems/habits/routes/routes.integration.test.ts`. Add these imports at the top of the file: `import { prisma } from "@/platform/db/client";` and `import { createLogRoute } from "./logs";`. Widen `makeHabit`'s return annotation to `{ id: string; name: string; journalTopicId: string | null }`.

```ts
  it("POST log creates a journal entry for that day", async () => {
    const habit = await makeHabit();
    const res = await createLogRoute(
      req("POST", { date: todayString(), body: "Logged from the tracker" }),
      { id: habit.id }
    );
    expect(res.status).toBe(201);
    const { entry } = await res.json();
    expect(entry.excerpt).toBe("Logged from the tracker");
  });

  it("POST log rejects future dates with 400", async () => {
    const habit = await makeHabit();
    const res = await createLogRoute(
      req("POST", { date: addDays(todayString(), 1), body: "Nope" }),
      { id: habit.id }
    );
    expect(res.status).toBe(400);
  });

  it("POST log on an archived topic 409s", async () => {
    const habit = await makeHabit();
    await prisma.journalTopic.update({
      where: { id: habit.journalTopicId! },
      data: { archived: true },
    });
    const res = await createLogRoute(
      req("POST", { date: todayString(), body: "Nope" }),
      { id: habit.id }
    );
    expect(res.status).toBe(409);
  });

  it("POST log for an unknown habit 404s", async () => {
    const res = await createLogRoute(
      req("POST", { date: todayString(), body: "Nope" }),
      { id: "missing" }
    );
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export DATABASE_URL_TEST="$(grep '^DATABASE_URL_TEST=' .env | cut -d= -f2- | tr -d '"')"
bun run test:integration src/systems/habits/routes/routes.integration.test.ts
```
Expected: FAIL — `./logs` route module does not exist.

- [ ] **Step 3: Implement**

Append to `src/systems/habits/schemas/habits.ts`:

```ts
export const createLogSchema = z.object({
  date: dateStringSchema,
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().min(1),
});
```

Create `src/systems/habits/routes/logs.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { feedback } from "@/platform/feedback";
import { RouteHandler } from "@/systems/types";
import { entryWordCount } from "@/systems/journal/services/entries";
import { createLogSchema } from "../schemas/habits";
import { getHabitById } from "../services/habits";
import { createLog, TopicArchivedError, TopicMissingError } from "../services/logs";
import { FutureDateError } from "../services/ticks";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const createLogRoute: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createLogSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid log", err.flatten());
    throw err;
  }
  const existing = await getHabitById(params.id);
  if (!existing) return notFound(`Habit ${params.id} not found`);
  try {
    const entry = await createLog(params.id, parsed.date, {
      title: parsed.title ?? null,
      body: parsed.body,
    });
    // Habit logs are journal entries — keep the journal's usage metrics honest.
    await Promise.allSettled([
      feedback.recordMetric("journal", "entry_created", 1),
      feedback.recordMetric("journal", "words_per_entry", entryWordCount(parsed.body)),
    ]);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    if (err instanceof FutureDateError) {
      return badRequest("Logs can't be written for future days.");
    }
    if (err instanceof TopicArchivedError || err instanceof TopicMissingError) {
      return apiError(409, err.message);
    }
    throw err;
  }
};
```

In `src/systems/habits/manifest.ts`, add the import and route:

```ts
import * as logs from "./routes/logs";
```

and in `routes` (after `"POST /habits/:id/recreate-topic"`):

```ts
    "POST /habits/:id/logs":            logs.createLogRoute,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test:integration src/systems/habits/routes/routes.integration.test.ts`
Expected: PASS (all existing tests still green), output pristine.

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/schemas/habits.ts src/systems/habits/routes/logs.ts src/systems/habits/manifest.ts src/systems/habits/routes/routes.integration.test.ts
git commit -m "feat(habits): POST /habits/:id/logs route

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: quote on habit creation

**Files:**
- Modify: `src/systems/habits/schemas/habits.ts`
- Modify: `src/systems/habits/services/habits.ts`
- Modify: `src/systems/habits/routes/habits.ts`
- Test: `src/systems/habits/routes/routes.integration.test.ts` (append)

**Interfaces:**
- Consumes: existing `createHabit` service and route.
- Produces: `createHabitSchema` accepts optional `quote` (trimmed, ≤500); `createHabit(name: string, quote?: string | null): Promise<Habit>` — empty/whitespace quote stored as `null`. Task 6's client sends `{ name, quote }`.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe` in `src/systems/habits/routes/routes.integration.test.ts`:

```ts
  it("POST /habits stores an optional quote", async () => {
    const res = await createHabitRoute(
      req("POST", { name: "Read", quote: "Books before bed" }), {}
    );
    expect(res.status).toBe(201);
    expect((await res.json()).habit.quote).toBe("Books before bed");
  });

  it("POST /habits treats an empty quote as absent", async () => {
    const res = await createHabitRoute(req("POST", { name: "Read", quote: "  " }), {});
    expect(res.status).toBe(201);
    expect((await res.json()).habit.quote).toBeNull();
  });

  it("POST /habits rejects an over-long quote", async () => {
    const res = await createHabitRoute(
      req("POST", { name: "Read", quote: "x".repeat(501) }), {}
    );
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test:integration src/systems/habits/routes/routes.integration.test.ts`
Expected: tests 1 and 3 FAIL — the old schema strips the unknown `quote` key, so test 1 gets `null` instead of the quote and test 3 gets 201 instead of 400. Test 2 already passes for the same stripping reason; that's expected.

- [ ] **Step 3: Implement**

In `src/systems/habits/schemas/habits.ts`:

```ts
export const createHabitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quote: z.string().trim().max(500).optional(),
});
```

In `src/systems/habits/services/habits.ts`, change `createHabit`:

```ts
export async function createHabit(name: string, quote?: string | null): Promise<Habit> {
  const journalTopicId = await linkOrCreateTopic(name);
  const max = await prisma.habit.aggregate({ _max: { position: true } });
  return prisma.habit.create({
    data: { name, quote: quote || null, position: (max._max.position ?? 0) + 1, journalTopicId },
  });
}
```

In `src/systems/habits/routes/habits.ts`, change the service call in `createHabit`:

```ts
    const habit = await createHabitService(parsed.name, parsed.quote);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test:integration src/systems/habits/routes/routes.integration.test.ts`
Expected: PASS, output pristine. Also run `bun run test:integration src/systems/habits/services/habits.integration.test.ts` to confirm existing service tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/schemas/habits.ts src/systems/habits/services/habits.ts src/systems/habits/routes/habits.ts src/systems/habits/routes/routes.integration.test.ts
git commit -m "feat(habits): accept a quote when creating a habit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: grid polish — date numbers, serif names, menu at end of row

**Files:**
- Modify: `src/systems/habits/components/HabitTracker.tsx`
- Modify: `src/systems/habits/components/RowDropdown.tsx` (trailing spacer only)
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: existing `RowMenu`, `dates` array, `DAY_INITIALS`.
- Produces: the 9-column grid (`minmax(160px, 1fr) repeat(7, 44px) 28px`) that Tasks 6–8 assume. No API changes.

- [ ] **Step 1: Update the header row in `HabitTracker.tsx`**

Replace the `habit-grid-head` block with:

```tsx
          <div className="habit-grid-row habit-grid-head" role="row">
            <span className="habit-name" />
            {dates.map((d, i) => (
              <span key={d} className={`habit-day${d === today ? " is-today" : ""}`}>
                <span>{DAY_INITIALS[i]}</span>
                <span className="habit-day-num">{Number(d.slice(8))}</span>
              </span>
            ))}
            <span />
          </div>
```

- [ ] **Step 2: Move the menu to a trailing cell**

In the habit row markup, remove `<RowMenu …/>` from inside the `.habit-name` span (the non-editing branch becomes just `<span className="habit-name-text">{h.name}</span>` — the fragment wrapper can go), and add a trailing cell after the `dates.map` of tick cells, inside the same `.habit-grid-row`:

```tsx
                <span className="habit-menu-cell">
                  <RowMenu
                    canMoveUp={week.habits[0]?.id !== h.id}
                    canMoveDown={week.habits[week.habits.length - 1]?.id !== h.id}
                    onRename={() => setEditingId(h.id)}
                    onMoveUp={() => void moveHabit(h.id, -1)}
                    onMoveDown={() => void moveHabit(h.id, 1)}
                    onArchive={() => void setArchived(h.id, true)}
                  />
                </span>
```

The menu now renders in both the editing and non-editing states — that's intended.

- [ ] **Step 3: Add the trailing spacer to the diamond strip**

In `RowDropdown.tsx`, inside `.habit-diamonds`, add a final `<span />` after the `dates.map(...)` block (Task 8 rewrites this strip; the spacer keeps columns aligned in the meantime).

- [ ] **Step 4: Update `globals.css`**

In the habits section:

```css
/* both grids grow a 28px trailing column for the row menu */
.habit-grid-row {
  grid-template-columns: minmax(160px, 1fr) repeat(7, 44px) 28px;
}
.habit-diamonds {
  grid-template-columns: minmax(160px, 1fr) repeat(7, 44px) 28px;
}
```

(edit the two existing `grid-template-columns` declarations in place — don't duplicate the rules). Then:

- `.habit-grid-head { min-height: 24px; }` → `min-height: 34px;`
- Replace the `.habit-day` rule with:

```css
.habit-day {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--fg-faint);
}
.habit-day-num { color: var(--fg-muted); }
.habit-day.is-today, .habit-day.is-today .habit-day-num { color: var(--accent); }
```

(the second line replaces the existing `.habit-day.is-today` rule)

- Extend `.habit-name-text`:

```css
.habit-name-text {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--font-serif); font-size: var(--fs-md); font-weight: 500;
}
```

- Add next to the `.habit-menu` rules:

```css
.habit-menu-cell { display: flex; justify-content: center; }
```

- In `.habit-menu-list`, change `left: 0;` to `right: 0;` (the menu now anchors to the row's right edge).

- [ ] **Step 5: Verify and commit**

Run: `bun run lint && bunx tsc --noEmit`
Expected: both clean.

```bash
git add src/systems/habits/components/HabitTracker.tsx src/systems/habits/components/RowDropdown.tsx src/app/globals.css
git commit -m "feat(habits): date numbers, serif names, row menu at line end

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: inline add-habit form

**Files:**
- Delete: `src/systems/habits/components/AddHabitRow.tsx`
- Create: `src/systems/habits/components/AddHabitForm.tsx`
- Modify: `src/systems/habits/components/HabitTracker.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `POST /api/systems/habits/habits` accepting `{ name, quote? }` (Task 4); `Icon` (`plus` glyph exists in `PATHS`).
- Produces: `AddHabitForm({ startOpen: boolean; onAdd: (name: string, quote: string) => Promise<boolean> })`.

- [ ] **Step 1: Create `AddHabitForm.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/_components/Icon";

interface AddHabitFormProps {
  startOpen: boolean;
  onAdd: (name: string, quote: string) => Promise<boolean>;
}

export function AddHabitForm({ startOpen, onAdd }: AddHabitFormProps) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState("");
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  const cancel = () => {
    setOpen(false);
    setName("");
    setQuote("");
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const added = await onAdd(trimmed, quote.trim());
    setBusy(false);
    if (added) cancel();
  };

  if (!open) {
    return (
      <div className="habit-add">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
          <Icon name="plus" size={16} />
          Add habit
        </button>
      </div>
    );
  }

  return (
    <form
      className="habit-add-form"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
    >
      <input
        ref={nameRef}
        className="habit-add-input"
        placeholder="Habit name"
        aria-label="Habit name"
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="habit-quote-input"
        placeholder="Quote, goal, or tip (optional)"
        aria-label="Quote, goal, or tip (optional)"
        rows={2}
        value={quote}
        disabled={busy}
        onChange={(e) => setQuote(e.target.value)}
      />
      <div className="habit-add-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          Add habit
        </button>
        <button type="button" className="btn btn-ghost" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

Delete `AddHabitRow.tsx` (`git rm src/systems/habits/components/AddHabitRow.tsx`).

- [ ] **Step 2: Wire it in `HabitTracker.tsx`**

- Replace the import: `import { AddHabitForm } from "./AddHabitForm";`
- Change `addHabit`'s signature and body:

```ts
  const addHabit = async (name: string, quote: string): Promise<boolean> => {
    const res = await fetch("/api/systems/habits/habits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quote ? { name, quote } : { name }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError(await errorOf(res, "Could not add the habit."));
      return false;
    }
    setError(null);
    await refresh();
    return true;
  };
```

- Replace the render call:

```tsx
        <AddHabitForm startOpen={searchParams.get("new") === "1"} onAdd={addHabit} />
```

- [ ] **Step 3: Update `globals.css`**

Replace the `.habit-add-row { … }` rule with:

```css
.habit-add { margin-top: var(--sp-4); display: flex; justify-content: center; }
.habit-add-form {
  margin: var(--sp-4) auto 0; max-width: 360px;
  display: flex; flex-direction: column; gap: var(--sp-2);
}
.habit-add-actions { display: flex; justify-content: center; gap: var(--sp-2); }
```

Keep the `.habit-add-input` rules — the form still uses them.

- [ ] **Step 4: Verify and commit**

Run: `bun run lint && bunx tsc --noEmit`
Expected: both clean (any remaining reference to `AddHabitRow` is a tsc error — fix it).

```bash
git add src/systems/habits/components/AddHabitForm.tsx src/systems/habits/components/HabitTracker.tsx src/app/globals.css
# AddHabitRow.tsx was already staged for deletion by `git rm` in Step 1
git commit -m "feat(habits): centered add-habit button expanding to a form with quote

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: stale-while-revalidate dropdown refresh

**Files:**
- Modify: `src/systems/habits/components/HabitTracker.tsx`

**Interfaces:**
- Consumes: existing `prefetchDetail`, `handleTick`, `details` state, `detailKey`.
- Produces: `prefetchDetail(habitId: string, opts?: { force?: boolean })` — Task 8 calls it with `{ force: true }` after creating a log.

- [ ] **Step 1: Add a seq guard and the `force` option to `prefetchDetail`**

Add a ref next to `tickSeq`:

```ts
  const detailSeq = useRef<Map<string, number>>(new Map());
```

Replace `prefetchDetail` with:

```ts
  const prefetchDetail = async (habitId: string, opts?: { force?: boolean }) => {
    const key = detailKey(habitId);
    if (!opts?.force && details[key]) return;
    const seq = (detailSeq.current.get(key) ?? 0) + 1;
    detailSeq.current.set(key, seq);
    try {
      const res = await fetch(`/api/systems/habits/habits/${habitId}/detail?week=${week.monday}`);
      if (!res.ok) return;
      const data: HabitDetail = await res.json();
      if (detailSeq.current.get(key) !== seq) return; // superseded by a newer fetch
      setDetails((d) => ({ ...d, [key]: data }));
    } catch {
      // detail loads lazily; the stale copy (or loading state) stays until a retry
    }
  };
```

- [ ] **Step 2: Keep the expanded row's detail alive on tick**

In `handleTick`, replace the `setDetails` invalidation block with:

```ts
    setDetails((d) => {
      const keep = expandedId === habitId ? detailKey(habitId) : null;
      const next = { ...d };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${habitId}|`) && k !== keep) delete next[k];
      }
      return next;
    });
    if (expandedId === habitId) void prefetchDetail(habitId, { force: true });
```

The expanded row keeps its (stale) detail on screen and swaps in the fresh copy as soon as the refetch lands — no "Loading…" flash. Collapsed rows keep today's delete-and-rehydrate-on-hover behavior.

- [ ] **Step 3: Verify and commit**

Run: `bun run lint && bunx tsc --noEmit`
Expected: both clean.

```bash
git add src/systems/habits/components/HabitTracker.tsx
git commit -m "fix(habits): expanded dropdown refreshes immediately after a tick

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: per-day diamonds + log flyout

**Files:**
- Modify: `src/systems/habits/lib/dates.ts` (move `localDayOf` here)
- Modify: `src/systems/habits/components/RowDropdown.tsx`
- Create: `src/systems/habits/components/LogFlyout.tsx`
- Modify: `src/systems/habits/components/HabitTracker.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `POST /habits/:id/logs` (Task 3); `prefetchDetail(…, { force: true })` (Task 7); the 9-column grid (Task 5); `formatDayShort`, `localTodayString` from `../lib/dates`; `Icon` (`x` glyph exists).
- Produces:
  - `localDayOf(iso: string): string` exported from `lib/dates.ts`.
  - `RowDropdownProps` gains `onOpenLog: (date: string, trigger: HTMLElement) => void`.
  - `LogFlyout({ target: LogTarget; logs: DetailEntry[]; onClose: () => void; onCreate: (title: string, body: string) => Promise<string | null> })` with `LogTarget = { habitId: string; habitName: string; topicName: string; date: string }` — `onCreate` resolves `null` on success, an error message string on failure.
  - New `.flyout` CSS primitive.

- [ ] **Step 1: Move `localDayOf` into `lib/dates.ts`**

Append to `src/systems/habits/lib/dates.ts`:

```ts
/** Group an ISO timestamp into the browser's local calendar day. */
export function localDayOf(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
```

Delete the private copy at the top of `RowDropdown.tsx` and import it from `../lib/dates` instead.

- [ ] **Step 2: Rewrite the diamond strip in `RowDropdown.tsx`**

- Add `onOpenLog: (date: string, trigger: HTMLElement) => void;` to `RowDropdownProps` and destructure it.
- Add `formatDayShort` and `localTodayString` to the `../lib/dates` import; remove the now-unused `Icon` import (`Link` stays — the topic notes and the flyout still deep-link).
- Replace the `topicState === "ok"` diamonds block with:

```tsx
      {detail.topicState === "ok" && (
        <div className="habit-diamonds" aria-label="Journal logs this week">
          <span />
          {dates.map((d) => {
            const logs = byDay.get(d) ?? [];
            if (d > today) return <span key={d} className="habit-diamond-cell" />;
            const label = logs.length
              ? `${logs[0].title ?? logs[0].excerpt}${logs.length > 1 ? ` +${logs.length - 1} more` : ""}`
              : `Log ${habit.name} — ${formatDayShort(d)}`;
            return (
              <span key={d} className="habit-diamond-cell">
                <button
                  type="button"
                  className="habit-diamond"
                  title={label}
                  aria-label={label}
                  onClick={(e) => onOpenLog(d, e.currentTarget)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path
                      d="M7 1.5 12.5 7 7 12.5 1.5 7Z"
                      className={logs.length ? "habit-diamond-fill" : "habit-diamond-outline"}
                    />
                  </svg>
                </button>
              </span>
            );
          })}
          <span />
        </div>
      )}
```

with `const today = localTodayString();` declared above the return (next to the existing `topicHref`/`byDay` lines). The filled state is a custom SVG shape on purpose — Lucide icons are never filled.

- [ ] **Step 3: Create `LogFlyout.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/_components/Icon";
import type { DetailEntry } from "../services/detail";
import { formatDayShort } from "../lib/dates";

export interface LogTarget {
  habitId: string;
  habitName: string;
  topicName: string;
  date: string;
}

interface LogFlyoutProps {
  target: LogTarget;
  logs: DetailEntry[];
  onClose: () => void;
  /** Resolves null on success; an error message string on failure. */
  onCreate: (title: string, body: string) => Promise<string | null>;
}

export function LogFlyout({ target, logs, onClose, onCreate }: LogFlyoutProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle("");
    setBody("");
    setError(null);
    titleRef.current?.focus();
  }, [target.habitId, target.date]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    const err = await onCreate(title.trim(), body);
    setBusy(false);
    if (err) setError(err); // success closes the flyout from the parent
  };

  const topicHref = `/journal/topics/${encodeURIComponent(target.topicName)}`;

  return (
    <aside
      ref={panelRef}
      className="flyout"
      role="dialog"
      aria-label={`Log ${target.habitName} — ${formatDayShort(target.date)}`}
    >
      <header className="flyout-head">
        <div className="flyout-title-wrap">
          <span className="flyout-title">{target.habitName}</span>
          <span className="flyout-sub">{formatDayShort(target.date)}</span>
        </div>
        <button type="button" className="btn btn-ghost habit-nav" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </header>
      {logs.length > 0 && (
        <ul className="flyout-list">
          {logs.map((e) => (
            <li key={e.id}>
              <Link href={`${topicHref}#entry-${e.id}`}>{e.title ?? e.excerpt}</Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flyout-form">
        <input
          ref={titleRef}
          className="habit-add-input"
          placeholder="Title (optional)"
          aria-label="Title (optional)"
          maxLength={200}
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="habit-quote-input"
          placeholder="Write the log — #tags work."
          aria-label="Log body"
          rows={8}
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <p className="habit-error">{error}</p>}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !body.trim()}
          onClick={() => void submit()}
        >
          Add log
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Wire the flyout in `HabitTracker.tsx`**

- Imports: add `localDayOf` to the `../lib/dates` import; add `import { LogFlyout, type LogTarget } from "./LogFlyout";`.
- State + handlers (next to the `expandedId` block):

```ts
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const logTrigger = useRef<HTMLElement | null>(null);

  const openLog = (habitId: string, habitName: string, date: string, trigger: HTMLElement) => {
    logTrigger.current = trigger;
    setLogTarget({
      habitId,
      habitName,
      topicName: details[detailKey(habitId)]?.topicName ?? habitName,
      date,
    });
  };

  const closeLog = useCallback(() => {
    setLogTarget(null);
    logTrigger.current?.focus();
    logTrigger.current = null;
  }, []);

  const createLogEntry = async (title: string, body: string): Promise<string | null> => {
    if (!logTarget) return null;
    const res = await fetch(`/api/systems/habits/habits/${logTarget.habitId}/logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: logTarget.date, ...(title ? { title } : {}), body }),
    }).catch(() => null);
    if (!res || !res.ok) return errorOf(res, "Could not save the log.");
    const { entry } = (await res.json()) as { entry: HabitDetail["entries"][number] };
    const key = detailKey(logTarget.habitId);
    // Patch the new log in optimistically so the diamond fills immediately…
    setDetails((d) =>
      d[key] ? { ...d, [key]: { ...d[key], entries: [...d[key].entries, entry] } } : d
    );
    // …then let the server copy confirm it.
    void prefetchDetail(logTarget.habitId, { force: true });
    closeLog();
    return null;
  };
```

- Pass the opener to the dropdown:

```tsx
                <RowDropdown
                  habit={h}
                  dates={dates}
                  detail={details[detailKey(h.id)] ?? null}
                  onSaveQuote={(q) => void saveQuote(h.id, q)}
                  onRecreateTopic={() => void recreateTopic(h.id)}
                  onOpenLog={(date, trigger) => openLog(h.id, h.name, date, trigger)}
                />
```

- Render the flyout at the end of the fragment (after `<ArchivedDisclosure …/>`):

```tsx
      {logTarget && (
        <LogFlyout
          target={logTarget}
          logs={(details[detailKey(logTarget.habitId)]?.entries ?? []).filter(
            (e) => localDayOf(e.createdAt) === logTarget.date
          )}
          onClose={closeLog}
          onCreate={createLogEntry}
        />
      )}
```

- [ ] **Step 5: Update `globals.css`**

Replace the two existing `.habit-diamond` rules (`.habit-diamond { color: var(--link); … }` and `.habit-diamond:hover { … }`) with:

```css
.habit-diamond {
  background: none; border: none; cursor: pointer;
  display: inline-flex; padding: 2px; border-radius: var(--r-xs);
}
.habit-diamond:hover { background: var(--bg-hover); }
.habit-diamond:focus-visible { outline: none; box-shadow: var(--ring); }
.habit-diamond-outline { fill: none; stroke: var(--fg-faint); stroke-width: 1.5; }
.habit-diamond-fill { fill: var(--accent); }
```

Add the flyout primitive at the end of the habits section:

```css
/* Flyout — right-edge panel primitive (first used by the habit log compose) */
.flyout {
  position: fixed; top: 36px; /* matches the titlebar row height */
  right: 0; bottom: 0; z-index: 40;
  width: min(380px, 90vw);
  background: var(--paper-1);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  padding: var(--sp-4);
  display: flex; flex-direction: column; gap: var(--sp-3);
  overflow-y: auto;
  animation: flyout-in var(--dur-med) var(--ease-out);
}
@keyframes flyout-in { from { transform: translateX(100%); } to { transform: none; } }
.flyout-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-2); }
.flyout-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.flyout-title { font-family: var(--font-serif); font-size: var(--fs-lg); font-weight: 500; }
.flyout-sub { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--fg-muted); }
.flyout-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-1); }
.flyout-list a { color: var(--link); font-size: var(--fs-sm); }
.flyout-list a:hover { color: var(--link-hover); }
.flyout-form { display: flex; flex-direction: column; gap: var(--sp-2); }

@media (prefers-reduced-motion: reduce) {
  .flyout { animation: none; }
}
```

- [ ] **Step 6: Verify and commit**

Run: `bun run lint && bunx tsc --noEmit && bun run test`
Expected: all clean (the unit suite guards the `lib/dates.ts` move).

```bash
git add src/systems/habits/lib/dates.ts src/systems/habits/components/RowDropdown.tsx src/systems/habits/components/LogFlyout.tsx src/systems/habits/components/HabitTracker.tsx src/app/globals.css
git commit -m "feat(habits): per-day diamonds with journal log flyout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Spec Coverage Map

| Spec section | Tasks |
|---|---|
| §1 Instant dropdown refresh (stale-while-revalidate, `force` option) | 7 |
| §2 Date numbers + today highlight | 5 |
| §3 Serif habit names | 5 |
| §4 Add-habit flow (button → inline form, quote on create, `?new=1`) | 4, 6 |
| §5 Menu at end of row (9-column grid, spacers, right-anchored list) | 5 |
| §6 Diamonds (one per day, filled accent SVG, pre-`createdOn` days included, future hidden) | 8 |
| §6 Flyout primitive + LogFlyout (a11y, focus return, retarget) | 8 |
| §6 Saving (`POST /habits/:id/logs`, backdating via `noonInTz`, journal `createdAt` override, optimistic diamond fill) | 1, 2, 3, 8 |
| Testing (unit `noonInTz` + schemas, integration logs service/route + quote-on-create) | 1, 2, 3, 4 |
| Out of scope (no journal UI/API backdating, no log edit/delete, no tick/chart changes) | — enforced by absence |
