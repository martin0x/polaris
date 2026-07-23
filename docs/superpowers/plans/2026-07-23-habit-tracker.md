# Habit Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Habits system to Polaris — a weekly 3-state tick tracker with Journal topic sync, an expandable per-habit dropdown (diamond log links, quote, 30-day calendar, AI-summary placeholder), sounds, and a four-module Charts tab.

**Architecture:** A self-contained system module at `src/systems/habits/` (manifest-routed API, Prisma services, pure-function libs) with thin server pages under `src/app/(systems)/habits/`. The tracker page server-renders the current week into a client island that keeps an in-memory week cache, prefetches neighbors and row detail, and applies ticks optimistically. Charts are server-computed and passed to client components.

**Tech Stack:** Next.js 16 (App Router, React 19), Prisma 7 + PostgreSQL, Zod 4, recharts, vitest, Web Audio API, bun.

**Spec:** `docs/superpowers/specs/2026-07-23-habit-tracker-design.md` — read it before starting any task.

## Global Constraints

- **Design system is law.** Read `docs/design/README.md` before any UI task. Tokens only (`var(--paper-1)`, `var(--sp-4)`, `var(--success)` …) — never hex or raw px in components. Sentence case everywhere. No emoji in chrome. Icons only via `Icon` (`src/app/_components/Icon.tsx`), stroke 1.5, never filled Lucide.
- **Copy rules:** empty state = short declarative + one-line nudge; error = name the failure, name the recovery, never apologize. Em dash for asides, en dash for ranges.
- **This is Next.js 16** — `params`/`searchParams` are Promises in pages. When unsure, read `node_modules/next/dist/docs/`.
- **Runtime is bun**: `bun run test` (unit), `bun run test:integration` (needs `DATABASE_URL_TEST` in `.env`), `bun run dev` (starts docker Postgres + next dev), `bunx prisma ...`.
- **Dates cross every API boundary as `yyyy-mm-dd` strings.** Server-side "today" always comes from `todayString()` (`POLARIS_TZ`, default `Asia/Manila`). Never `new Date().toISOString().slice(0,10)` outside `lib/dates.ts`.
- **Tick credit:** COMPLETE = 1, PARTIAL = 0.5, off (no row) = 0. Any tick keeps a streak alive.
- **Weeks are ISO** — Monday start. A week is identified by its Monday `yyyy-mm-dd`.
- **Commit after every task** (solo project, commits on `main` or the worktree branch; worktree branches use hyphens, never slashes, e.g. `feat-habit-tracker`).
- **UI verification:** dev server + forged auth cookie screenshot (recipe in Task 8). Repo test suite has no jsdom — client components are verified visually, logic lives in testable libs/services.

## File structure

```
prisma/schema.prisma                                 (modify — enum + 2 models)
src/test/db.ts                                       (modify — withCleanHabitTables)
src/systems/habits/
  lib/dates.ts, dates.test.ts                        (pure date math)
  lib/stats.ts, stats.test.ts                        (credit/streak/lapse math)
  lib/sounds.ts                                      (Web Audio engine, client-only)
  services/habits.ts, habits.integration.test.ts     (CRUD + topic sync)
  services/ticks.ts, ticks.integration.test.ts       (week query, tick upsert/delete)
  services/detail.ts, detail.integration.test.ts     (30-day window, entries, topicState)
  services/charts.ts, charts.integration.test.ts     (chart datasets)
  schemas/habits.ts                                  (Zod)
  routes/habits.ts, ticks.ts, detail.ts              (RouteHandlers)
  routes/routes.integration.test.ts
  manifest.ts, dashboard.tsx, palette.ts
  components/HabitTracker.tsx                        (island: state, cache, optimistic)
  components/TickCircle.tsx                          (3-state circle + hold)
  components/WeekHeader.tsx                          (arrows, range, month popover)
  components/HabitRow.tsx                            (row + menu + expansion host)
  components/RowDropdown.tsx                         (diamonds, quote, mini-cal, summary)
  components/charts/{ConsistencyTrend,StreakTiles,DayOfWeekHeatmap,CalendarHeatmap}.tsx
src/systems/index.ts                                 (modify — register manifest)
src/systems/dashboards.ts                            (modify — register dashboard)
src/app/(systems)/habits/layout.tsx                  (TabStrip: Tracker | Charts)
src/app/(systems)/habits/page.tsx                    (server: initial week → island)
src/app/(systems)/habits/charts/page.tsx             (server: charts data → components)
src/app/_components/Icon.tsx                         (modify — repeat, diamond)
src/app/(systems)/layout.tsx                         (modify — ALLOWED_ICONS + "repeat")
src/app/(platform)/layout.tsx                        (modify — ALLOWED_ICONS + "repeat")
src/app/globals.css                                  (modify — habits section + keyframes)
public/icons/{repeat,diamond}.svg                    (Lucide sources)
```

---

### Task 1: Prisma models and migration

**Files:**
- Modify: `prisma/schema.prisma` (append at end of file)
- Modify: `src/test/db.ts`

**Interfaces:**
- Produces: `Habit`, `HabitTick` Prisma models and `HabitTickStatus` enum importable from `@/generated/prisma/client`; `withCleanHabitTables()` from `@/test/db`.

- [ ] **Step 1: Append models to `prisma/schema.prisma`**

```prisma
// ── Habits ────────────────────────────────────────────────────────────────

enum HabitTickStatus {
  PARTIAL
  COMPLETE
}

model Habit {
  id             String      @id @default(cuid())
  name           String      @unique
  quote          String?     @db.Text
  position       Int
  /// Journal topic linked to this habit — plain string, no cross-system FK.
  journalTopicId String?     @unique
  archived       Boolean     @default(false)
  archivedAt     DateTime?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  ticks          HabitTick[]

  @@index([archived])
  @@map("habits")
}

model HabitTick {
  id        String          @id @default(cuid())
  habitId   String
  habit     Habit           @relation(fields: [habitId], references: [id])
  date      DateTime        @db.Date
  status    HabitTickStatus
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@unique([habitId, date])
  @@index([date])
  @@map("habit_ticks")
}
```

- [ ] **Step 2: Run the migration**

Run: `docker compose -f docker/docker-compose.yml up -d && bunx prisma migrate dev --name add_habits`
Expected: new migration under `prisma/migrations/*_add_habits/` creating `habits`, `habit_ticks`, and the `HabitTickStatus` enum; `prisma generate` runs automatically.

Also apply it to the test database: `DATABASE_URL="$DATABASE_URL_TEST" bunx prisma migrate deploy` (read `DATABASE_URL_TEST` from `.env`; if the existing test scripts handle this differently — check `vitest.integration.config.ts` — follow that convention instead).

- [ ] **Step 3: Add the test-table cleaner to `src/test/db.ts`**

After `withCleanExpenseTables`, add:

```ts
export async function withCleanHabitTables(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "habit_ticks", "habits", "journal_entries", "journal_topics" RESTART IDENTITY CASCADE'
  );
}
```

(Journal tables are included because habit services create topics/entries in tests.)

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean (same status as before the task).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/test/db.ts src/generated
git commit -m "feat(habits): add Habit and HabitTick models"
```

---

### Task 2: Pure date math — `lib/dates.ts`

**Files:**
- Create: `src/systems/habits/lib/dates.ts`
- Test: `src/systems/habits/lib/dates.test.ts`

**Interfaces:**
- Produces (exact signatures — later tasks import these):
  - `isDateString(s: string): boolean`
  - `toUtcDate(s: string): Date` / `toDateString(d: Date): string`
  - `addDays(s: string, n: number): string`
  - `mondayOf(s: string): string`
  - `weekDates(monday: string): string[]` (7 entries)
  - `todayString(tz?: string): string` (server "today" per `POLARIS_TZ`, default `Asia/Manila`)
  - `localTodayString(): string` (client "today" from the browser clock)
  - `formatWeekRange(monday: string): string` (`Jul 20–26, 2026` / `Jun 29 – Jul 5, 2026` / `Dec 29, 2025 – Jan 4, 2026`)

- [ ] **Step 1: Write the failing tests**

Create `src/systems/habits/lib/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  addDays, formatWeekRange, isDateString, mondayOf, toDateString,
  todayString, toUtcDate, weekDates,
} from "./dates";

describe("dates", () => {
  it("validates date strings", () => {
    expect(isDateString("2026-07-23")).toBe(true);
    expect(isDateString("2026-7-23")).toBe(false);
    expect(isDateString("garbage")).toBe(false);
  });

  it("round-trips through UTC", () => {
    expect(toDateString(toUtcDate("2026-07-23"))).toBe("2026-07-23");
  });

  it("adds days across month and year bounds", () => {
    expect(addDays("2026-07-23", 1)).toBe("2026-07-24");
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("finds the ISO Monday", () => {
    expect(mondayOf("2026-07-23")).toBe("2026-07-20"); // Thursday → Monday
    expect(mondayOf("2026-07-20")).toBe("2026-07-20"); // Monday is fixed point
    expect(mondayOf("2026-07-26")).toBe("2026-07-20"); // Sunday belongs to prior Monday
  });

  it("lists the week's dates", () => {
    const w = weekDates("2026-07-20");
    expect(w).toHaveLength(7);
    expect(w[0]).toBe("2026-07-20");
    expect(w[6]).toBe("2026-07-26");
  });

  it("today respects the timezone", () => {
    // 2026-07-23T20:00:00Z is already the 24th in Manila (UTC+8)
    const real = Date.now;
    Date.now = () => new Date("2026-07-23T20:00:00Z").getTime();
    try {
      expect(todayString("Asia/Manila")).toBe("2026-07-24");
      expect(todayString("UTC")).toBe("2026-07-23");
    } finally {
      Date.now = real;
    }
  });

  it("formats week ranges", () => {
    expect(formatWeekRange("2026-07-20")).toBe("Jul 20–26, 2026");
    expect(formatWeekRange("2026-06-29")).toBe("Jun 29 – Jul 5, 2026");
    expect(formatWeekRange("2025-12-29")).toBe("Dec 29, 2025 – Jan 4, 2026");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/systems/habits/lib/dates.test.ts`
Expected: FAIL — cannot resolve `./dates`.

- [ ] **Step 3: Implement `src/systems/habits/lib/dates.ts`**

```ts
// Pure date-string math for the habits system. Dates are yyyy-mm-dd strings;
// Date objects only exist transiently, pinned to UTC midnight.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isDateString(s: string): boolean {
  return DATE_RE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

export function toUtcDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = toUtcDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateString(d);
}

/** ISO week: Monday start. */
export function mondayOf(s: string): string {
  const day = toUtcDate(s).getUTCDay(); // 0 = Sunday
  return addDays(s, -((day + 6) % 7));
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Server-side "today" — single-user platform, one timezone anchor. */
export function todayString(tz: string = process.env.POLARIS_TZ ?? "Asia/Manila"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(Date.now()));
}

/** Client-side "today" from the browser clock. */
export function localTodayString(): string {
  const d = new Date(Date.now());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** En-dash ranges per the design system: Jul 20–26, 2026 / Jun 29 – Jul 5, 2026. */
export function formatWeekRange(monday: string): string {
  const a = toUtcDate(monday);
  const b = toUtcDate(addDays(monday, 6));
  const [ma, mb] = [MONTHS[a.getUTCMonth()], MONTHS[b.getUTCMonth()]];
  if (a.getUTCFullYear() !== b.getUTCFullYear()) {
    return `${ma} ${a.getUTCDate()}, ${a.getUTCFullYear()} – ${mb} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
  }
  if (a.getUTCMonth() !== b.getUTCMonth()) {
    return `${ma} ${a.getUTCDate()} – ${mb} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
  }
  return `${ma} ${a.getUTCDate()}–${b.getUTCDate()}, ${b.getUTCFullYear()}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun run test -- src/systems/habits/lib/dates.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/lib/dates.ts src/systems/habits/lib/dates.test.ts
git commit -m "feat(habits): pure date-string helpers"
```

---

### Task 3: Streak and credit math — `lib/stats.ts`

**Files:**
- Create: `src/systems/habits/lib/stats.ts`
- Test: `src/systems/habits/lib/stats.test.ts`

**Interfaces:**
- Consumes: `addDays` from `./dates`.
- Produces (exact signatures):
  - `type TickStatus = "PARTIAL" | "COMPLETE"`
  - `creditOf(status: TickStatus | undefined): number` (1 / 0.5 / 0)
  - `currentStreak(byDate: ReadonlyMap<string, TickStatus>, today: string): number` — consecutive ticked days ending today; an unticked today doesn't break it (counts back from yesterday).
  - `longestStreak(byDate: ReadonlyMap<string, TickStatus>): number`
  - `countLapses(byDate: ReadonlyMap<string, TickStatus>, start: string, end: string): number` — runs of ≥ 2 consecutive missed days inside `[start, end]`.
  - `isEligibleWeek(createdOn: string, archivedOn: string | null, weekMonday: string): boolean`
  - `dayOfWeekMeans(byDate: ReadonlyMap<string, TickStatus>, start: string, end: string): number[]` — 7 mean credits, Monday first.

- [ ] **Step 1: Write the failing tests**

Create `src/systems/habits/lib/stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  countLapses, creditOf, currentStreak, dayOfWeekMeans, isEligibleWeek,
  longestStreak, type TickStatus,
} from "./stats";

const m = (entries: Array<[string, TickStatus]>) => new Map<string, TickStatus>(entries);

describe("creditOf", () => {
  it("scores complete 1, partial 0.5, off 0", () => {
    expect(creditOf("COMPLETE")).toBe(1);
    expect(creditOf("PARTIAL")).toBe(0.5);
    expect(creditOf(undefined)).toBe(0);
  });
});

describe("currentStreak", () => {
  it("counts consecutive days ending today", () => {
    const t = m([["2026-07-21", "PARTIAL"], ["2026-07-22", "COMPLETE"], ["2026-07-23", "COMPLETE"]]);
    expect(currentStreak(t, "2026-07-23")).toBe(3);
  });

  it("does not break on an unticked today", () => {
    const t = m([["2026-07-21", "COMPLETE"], ["2026-07-22", "COMPLETE"]]);
    expect(currentStreak(t, "2026-07-23")).toBe(2);
  });

  it("is zero after a gap", () => {
    const t = m([["2026-07-20", "COMPLETE"]]);
    expect(currentStreak(t, "2026-07-23")).toBe(0);
  });
});

describe("longestStreak", () => {
  it("finds the longest run anywhere", () => {
    const t = m([
      ["2026-07-01", "COMPLETE"], ["2026-07-02", "PARTIAL"], ["2026-07-03", "COMPLETE"],
      ["2026-07-10", "COMPLETE"], ["2026-07-11", "COMPLETE"],
    ]);
    expect(longestStreak(t)).toBe(3);
  });

  it("is zero with no ticks", () => {
    expect(longestStreak(m([]))).toBe(0);
  });
});

describe("countLapses", () => {
  it("counts runs of two or more missed days", () => {
    // window Jul 1–10; ticks on 1,2,5,8 → misses: 3-4 (lapse), 6-7 (lapse), 9-10 (lapse)
    const t = m([
      ["2026-07-01", "COMPLETE"], ["2026-07-02", "COMPLETE"],
      ["2026-07-05", "PARTIAL"], ["2026-07-08", "COMPLETE"],
    ]);
    expect(countLapses(t, "2026-07-01", "2026-07-10")).toBe(3);
  });

  it("ignores single missed days", () => {
    const t = m([["2026-07-01", "COMPLETE"], ["2026-07-03", "COMPLETE"], ["2026-07-04", "COMPLETE"]]);
    expect(countLapses(t, "2026-07-01", "2026-07-04")).toBe(0);
  });
});

describe("isEligibleWeek", () => {
  it("requires existence before week end and no archive before week start", () => {
    expect(isEligibleWeek("2026-07-22", null, "2026-07-20")).toBe(true);   // created mid-week
    expect(isEligibleWeek("2026-07-27", null, "2026-07-20")).toBe(false);  // created after week
    expect(isEligibleWeek("2026-01-01", "2026-07-19", "2026-07-20")).toBe(false); // archived before
    expect(isEligibleWeek("2026-01-01", "2026-07-22", "2026-07-20")).toBe(true);  // archived mid-week
  });
});

describe("dayOfWeekMeans", () => {
  it("averages credit per weekday, Monday first", () => {
    // Two weeks, Mon Jul 13 & Mon Jul 20: Mondays complete, Tuesdays one partial
    const t = m([
      ["2026-07-13", "COMPLETE"], ["2026-07-20", "COMPLETE"],
      ["2026-07-14", "PARTIAL"],
    ]);
    const means = dayOfWeekMeans(t, "2026-07-13", "2026-07-26");
    expect(means[0]).toBe(1);     // both Mondays complete
    expect(means[1]).toBe(0.25);  // one partial of two Tuesdays
    expect(means[6]).toBe(0);     // Sundays untouched
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test -- src/systems/habits/lib/stats.test.ts`
Expected: FAIL — cannot resolve `./stats`.

- [ ] **Step 3: Implement `src/systems/habits/lib/stats.ts`**

```ts
// Pure credit/streak math. All inputs are yyyy-mm-dd keyed; no Date objects leak in.
import { addDays, toUtcDate } from "./dates";

export type TickStatus = "PARTIAL" | "COMPLETE";

export function creditOf(status: TickStatus | undefined): number {
  if (status === "COMPLETE") return 1;
  if (status === "PARTIAL") return 0.5;
  return 0;
}

/** Consecutive ticked days ending today; an unticked today doesn't break the
 *  streak until tomorrow (lapse research: the pending day isn't a miss yet). */
export function currentStreak(byDate: ReadonlyMap<string, TickStatus>, today: string): number {
  let cursor = byDate.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (byDate.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(byDate: ReadonlyMap<string, TickStatus>): number {
  let best = 0;
  for (const date of byDate.keys()) {
    if (byDate.has(addDays(date, -1))) continue; // not a run start
    let len = 0;
    let cursor = date;
    while (byDate.has(cursor)) {
      len += 1;
      cursor = addDays(cursor, 1);
    }
    best = Math.max(best, len);
  }
  return best;
}

/** A lapse is a run of ≥ 2 consecutive missed days within [start, end]. */
export function countLapses(
  byDate: ReadonlyMap<string, TickStatus>, start: string, end: string
): number {
  let lapses = 0;
  let missRun = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (byDate.has(d)) {
      missRun = 0;
    } else {
      missRun += 1;
      if (missRun === 2) lapses += 1;
    }
  }
  return lapses;
}

/** A habit counts for a week if it existed before the week ended and wasn't
 *  archived before the week started. */
export function isEligibleWeek(
  createdOn: string, archivedOn: string | null, weekMonday: string
): boolean {
  const weekEnd = addDays(weekMonday, 6);
  return createdOn <= weekEnd && (archivedOn === null || archivedOn >= weekMonday);
}

/** Mean credit per weekday (Monday first) across [start, end]. */
export function dayOfWeekMeans(
  byDate: ReadonlyMap<string, TickStatus>, start: string, end: string
): number[] {
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const idx = (toUtcDate(d).getUTCDay() + 6) % 7;
    sums[idx] += creditOf(byDate.get(d));
    counts[idx] += 1;
  }
  return sums.map((s, i) => (counts[i] === 0 ? 0 : s / counts[i]));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun run test -- src/systems/habits/lib/stats.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/lib/stats.ts src/systems/habits/lib/stats.test.ts
git commit -m "feat(habits): credit, streak, and lapse math"
```

---

### Task 4: Habit CRUD with Journal topic sync — `services/habits.ts`

**Files:**
- Create: `src/systems/habits/services/habits.ts`
- Test: `src/systems/habits/services/habits.integration.test.ts`

**Interfaces:**
- Consumes: `createTopic`, `archiveTopic`, `unarchiveTopic` from `@/systems/journal/services/topics`; `todayString` from `../lib/dates`.
- Produces (exact signatures):
  - `class TopicNameCollisionError extends Error { constructor(name: string) }`
  - `createHabit(name: string): Promise<Habit>` — links or creates the same-name topic.
  - `renameHabit(id: string, name: string): Promise<Habit>` — atomic with topic rename; throws `TopicNameCollisionError` on topic name clash.
  - `setQuote(id: string, quote: string | null): Promise<Habit>`
  - `reorderHabits(ids: string[]): Promise<void>` — throws `Error("reorder list mismatch")` unless `ids` is exactly the unarchived set.
  - `archiveHabit(id: string): Promise<Habit>` / `unarchiveHabit(id: string): Promise<Habit>` — sync the topic, tolerate a missing one.
  - `recreateTopic(id: string): Promise<Habit>` — relinks or creates the topic for a habit whose topic is gone.
  - `getHabitById(id: string): Promise<Habit | null>`

- [ ] **Step 1: Write the failing integration tests**

Create `src/systems/habits/services/habits.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { createTopic } from "@/systems/journal/services/topics";
import {
  archiveHabit, createHabit, recreateTopic, renameHabit, reorderHabits,
  setQuote, TopicNameCollisionError, unarchiveHabit,
} from "./habits";

describe("habits service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("creates a habit and its same-name topic", async () => {
    const habit = await createHabit("Morning run");
    expect(habit.position).toBe(1);
    const topic = await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId! } });
    expect(topic?.name).toBe("Morning run");
  });

  it("links an existing same-name topic instead of failing", async () => {
    const topic = await createTopic({ name: "Reading" });
    const habit = await createHabit("Reading");
    expect(habit.journalTopicId).toBe(topic.id);
  });

  it("positions habits sequentially", async () => {
    await createHabit("A");
    const b = await createHabit("B");
    expect(b.position).toBe(2);
  });

  it("rename syncs the topic atomically", async () => {
    const habit = await createHabit("Old name");
    await renameHabit(habit.id, "New name");
    const topic = await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId! } });
    expect(topic?.name).toBe("New name");
  });

  it("rename collision with a foreign topic changes nothing", async () => {
    await createTopic({ name: "Taken" });
    const habit = await createHabit("Mine");
    await expect(renameHabit(habit.id, "Taken")).rejects.toBeInstanceOf(TopicNameCollisionError);
    const fresh = await prisma.habit.findUnique({ where: { id: habit.id } });
    expect(fresh?.name).toBe("Mine");
  });

  it("archive and unarchive sync the topic", async () => {
    const habit = await createHabit("Stretch");
    await archiveHabit(habit.id);
    let topic = await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId! } });
    expect(topic?.archived).toBe(true);
    await unarchiveHabit(habit.id);
    topic = await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId! } });
    expect(topic?.archived).toBe(false);
  });

  it("archive survives a missing topic", async () => {
    const habit = await createHabit("Orphan");
    await prisma.journalEntry.deleteMany({});
    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: "gone" } });
    const archived = await archiveHabit(habit.id);
    expect(archived.archived).toBe(true);
  });

  it("reorder rewrites positions and rejects bad lists", async () => {
    const a = await createHabit("A");
    const b = await createHabit("B");
    await reorderHabits([b.id, a.id]);
    const rows = await prisma.habit.findMany({ orderBy: { position: "asc" } });
    expect(rows.map((r) => r.name)).toEqual(["B", "A"]);
    await expect(reorderHabits([a.id])).rejects.toThrow("reorder list mismatch");
  });

  it("stores and clears the quote", async () => {
    const habit = await createHabit("Write");
    await setQuote(habit.id, "Little and often.");
    await setQuote(habit.id, null);
    const fresh = await prisma.habit.findUnique({ where: { id: habit.id } });
    expect(fresh?.quote).toBeNull();
  });

  it("recreates a lost topic", async () => {
    const habit = await createHabit("Meditate");
    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: null } });
    await prisma.journalTopic.delete({ where: { name: "Meditate" } });
    const fixed = await recreateTopic(habit.id);
    const topic = await prisma.journalTopic.findUnique({ where: { id: fixed.journalTopicId! } });
    expect(topic?.name).toBe("Meditate");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test:integration -- src/systems/habits/services/habits.integration.test.ts`
Expected: FAIL — cannot resolve `./habits`.

- [ ] **Step 3: Implement `src/systems/habits/services/habits.ts`**

```ts
import { prisma } from "@/platform/db/client";
import { Prisma, type Habit } from "@/generated/prisma/client";
import { createTopic, archiveTopic, unarchiveTopic } from "@/systems/journal/services/topics";

/** Thrown when a rename would collide with a journal topic the habit doesn't own. */
export class TopicNameCollisionError extends Error {
  constructor(name: string) {
    super(`A journal topic named "${name}" already exists — habit not renamed.`);
    this.name = "TopicNameCollisionError";
  }
}

export async function getHabitById(id: string): Promise<Habit | null> {
  return prisma.habit.findUnique({ where: { id } });
}

async function linkOrCreateTopic(name: string): Promise<string> {
  const existing = await prisma.journalTopic.findUnique({ where: { name } });
  if (existing) return existing.id;
  const topic = await createTopic({ name });
  return topic.id;
}

export async function createHabit(name: string): Promise<Habit> {
  const journalTopicId = await linkOrCreateTopic(name);
  const max = await prisma.habit.aggregate({ _max: { position: true } });
  return prisma.habit.create({
    data: { name, position: (max._max.position ?? 0) + 1, journalTopicId },
  });
}

/** Rename habit + topic in one transaction; a topic-name clash rolls both back. */
export async function renameHabit(id: string, name: string): Promise<Habit> {
  try {
    return await prisma.$transaction(async (tx) => {
      const habit = await tx.habit.findUniqueOrThrow({ where: { id } });
      if (habit.journalTopicId) {
        const topic = await tx.journalTopic.findUnique({ where: { id: habit.journalTopicId } });
        if (topic && topic.name !== name) {
          await tx.journalTopic.update({ where: { id: topic.id }, data: { name } });
        }
      }
      return tx.habit.update({ where: { id }, data: { name } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new TopicNameCollisionError(name);
    }
    throw err;
  }
}

export async function setQuote(id: string, quote: string | null): Promise<Habit> {
  return prisma.habit.update({ where: { id }, data: { quote } });
}

export async function reorderHabits(ids: string[]): Promise<void> {
  const current = await prisma.habit.findMany({
    where: { archived: false }, select: { id: true },
  });
  const want = new Set(ids);
  if (want.size !== ids.length || current.length !== ids.length ||
      !current.every((h) => want.has(h.id))) {
    throw new Error("reorder list mismatch");
  }
  await prisma.$transaction(
    ids.map((habitId, i) =>
      prisma.habit.update({ where: { id: habitId }, data: { position: i + 1 } })
    )
  );
}

async function setArchived(id: string, archived: boolean): Promise<Habit> {
  const habit = await prisma.habit.update({
    where: { id },
    data: { archived, archivedAt: archived ? new Date() : null },
  });
  if (habit.journalTopicId) {
    try {
      await (archived ? archiveTopic(habit.journalTopicId) : unarchiveTopic(habit.journalTopicId));
    } catch (err) {
      // A missing topic never blocks the habit action (record not found).
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")) throw err;
    }
  }
  return habit;
}

export async function archiveHabit(id: string): Promise<Habit> {
  return setArchived(id, true);
}

export async function unarchiveHabit(id: string): Promise<Habit> {
  return setArchived(id, false);
}

/** Relink or recreate the topic for a habit whose topic is gone. */
export async function recreateTopic(id: string): Promise<Habit> {
  const habit = await prisma.habit.findUniqueOrThrow({ where: { id } });
  const journalTopicId = await linkOrCreateTopic(habit.name);
  return prisma.habit.update({ where: { id }, data: { journalTopicId } });
}
```

Note: `archive survives a missing topic` works because `journalTopicId: "gone"` makes `archiveTopic` throw P2025, which `setArchived` swallows.

- [ ] **Step 4: Run to verify pass**

Run: `bun run test:integration -- src/systems/habits/services/habits.integration.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/services/habits.ts src/systems/habits/services/habits.integration.test.ts
git commit -m "feat(habits): habit CRUD with journal topic sync"
```

---

### Task 5: Week query and tick writes — `services/ticks.ts`

**Files:**
- Create: `src/systems/habits/services/ticks.ts`
- Test: `src/systems/habits/services/ticks.integration.test.ts`

**Interfaces:**
- Consumes: `mondayOf`, `weekDates`, `toUtcDate`, `toDateString`, `todayString` from `../lib/dates`.
- Produces (exact shapes — the island and routes depend on them):

```ts
interface TickDto { habitId: string; date: string; status: "PARTIAL" | "COMPLETE" }
interface HabitDto {
  id: string; name: string; quote: string | null; position: number;
  journalTopicId: string | null; createdOn: string;
}
interface WeekData {
  monday: string; habits: HabitDto[];
  archivedHabits: Array<{ id: string; name: string }>; ticks: TickDto[];
}
getWeek(startRaw: string): Promise<WeekData>
upsertTick(habitId: string, date: string, status: "PARTIAL" | "COMPLETE"): Promise<TickDto>  // throws FutureDateError
removeTick(habitId: string, date: string): Promise<void>
class FutureDateError extends Error
```

- [ ] **Step 1: Write the failing integration tests**

Create `src/systems/habits/services/ticks.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { addDays, todayString } from "../lib/dates";
import { createHabit, archiveHabit } from "./habits";
import { FutureDateError, getWeek, removeTick, upsertTick } from "./ticks";

describe("ticks service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("getWeek normalizes to Monday and returns habits + ticks + archived", async () => {
    const habit = await createHabit("Run");
    const other = await createHabit("Old");
    await archiveHabit(other.id);
    const today = todayString();
    await upsertTick(habit.id, today, "PARTIAL");

    const week = await getWeek(today); // any day in the week
    expect(week.monday <= today).toBe(true);
    expect(week.habits.map((h) => h.name)).toEqual(["Run"]);
    expect(week.archivedHabits.map((h) => h.name)).toEqual(["Old"]);
    expect(week.ticks).toEqual([{ habitId: habit.id, date: today, status: "PARTIAL" }]);
  });

  it("upsert overwrites the status for the same day", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, today, "PARTIAL");
    const tick = await upsertTick(habit.id, today, "COMPLETE");
    expect(tick.status).toBe("COMPLETE");
    const week = await getWeek(today);
    expect(week.ticks).toHaveLength(1);
  });

  it("rejects future dates", async () => {
    const habit = await createHabit("Run");
    const tomorrow = addDays(todayString(), 1);
    await expect(upsertTick(habit.id, tomorrow, "PARTIAL")).rejects.toBeInstanceOf(FutureDateError);
  });

  it("removeTick deletes and tolerates absence", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, today, "COMPLETE");
    await removeTick(habit.id, today);
    await removeTick(habit.id, today); // second delete is a no-op
    const week = await getWeek(today);
    expect(week.ticks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test:integration -- src/systems/habits/services/ticks.integration.test.ts`
Expected: FAIL — cannot resolve `./ticks`.

- [ ] **Step 3: Implement `src/systems/habits/services/ticks.ts`**

```ts
import { prisma } from "@/platform/db/client";
import type { HabitTickStatus } from "@/generated/prisma/client";
import { mondayOf, weekDates, toUtcDate, toDateString, todayString } from "../lib/dates";

export class FutureDateError extends Error {
  constructor(date: string) {
    super(`Cannot tick ${date} — it hasn't happened yet.`);
    this.name = "FutureDateError";
  }
}

export interface TickDto {
  habitId: string;
  date: string;
  status: HabitTickStatus;
}

export interface HabitDto {
  id: string;
  name: string;
  quote: string | null;
  position: number;
  journalTopicId: string | null;
  createdOn: string;
}

export interface WeekData {
  monday: string;
  habits: HabitDto[];
  archivedHabits: Array<{ id: string; name: string }>;
  ticks: TickDto[];
}

export async function getWeek(startRaw: string): Promise<WeekData> {
  const monday = mondayOf(startRaw);
  const dates = weekDates(monday);
  const [habits, archivedHabits, ticks] = await Promise.all([
    prisma.habit.findMany({ where: { archived: false }, orderBy: { position: "asc" } }),
    prisma.habit.findMany({
      where: { archived: true }, orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.habitTick.findMany({
      where: { date: { gte: toUtcDate(dates[0]), lte: toUtcDate(dates[6]) } },
    }),
  ]);
  return {
    monday,
    habits: habits.map((h) => ({
      id: h.id, name: h.name, quote: h.quote, position: h.position,
      journalTopicId: h.journalTopicId, createdOn: toDateString(h.createdAt),
    })),
    archivedHabits,
    ticks: ticks.map((t) => ({
      habitId: t.habitId, date: toDateString(t.date), status: t.status,
    })),
  };
}

export async function upsertTick(
  habitId: string, date: string, status: HabitTickStatus
): Promise<TickDto> {
  if (date > todayString()) throw new FutureDateError(date);
  const tick = await prisma.habitTick.upsert({
    where: { habitId_date: { habitId, date: toUtcDate(date) } },
    update: { status },
    create: { habitId, date: toUtcDate(date), status },
  });
  return { habitId: tick.habitId, date: toDateString(tick.date), status: tick.status };
}

export async function removeTick(habitId: string, date: string): Promise<void> {
  await prisma.habitTick.deleteMany({
    where: { habitId, date: toUtcDate(date) },
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun run test:integration -- src/systems/habits/services/ticks.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/services/ticks.ts src/systems/habits/services/ticks.integration.test.ts
git commit -m "feat(habits): week query and tick upsert/delete"
```

---

### Task 6: Row detail — `services/detail.ts`

**Files:**
- Create: `src/systems/habits/services/detail.ts`
- Test: `src/systems/habits/services/detail.integration.test.ts`

**Interfaces:**
- Consumes: `mondayOf`, `addDays`, `toUtcDate`, `toDateString`, `todayString` from `../lib/dates`.
- Produces:

```ts
interface DetailEntry { id: string; title: string | null; excerpt: string; createdAt: string /* ISO */ }
interface HabitDetail {
  last30: Array<{ date: string; status: "PARTIAL" | "COMPLETE" }>;
  entries: DetailEntry[];
  topicState: "ok" | "archived" | "missing";
  topicName: string;
  summary: null;
}
getHabitDetail(id: string, weekRaw: string): Promise<HabitDetail | null>  // null if habit missing
```

- [ ] **Step 1: Write the failing integration tests**

Create `src/systems/habits/services/detail.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { addDays, todayString } from "../lib/dates";
import { archiveHabit, createHabit } from "./habits";
import { upsertTick } from "./ticks";
import { getHabitDetail } from "./detail";

describe("habit detail", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("returns the last-30 window, entries, and topic state", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, today, "COMPLETE");
    await upsertTick(habit.id, addDays(today, -29), "PARTIAL");

    await prisma.journalEntry.create({
      data: { topicId: habit.journalTopicId!, title: "Felt strong", body: "5k in the rain" },
    });
    await prisma.journalEntry.create({
      data: { topicId: habit.journalTopicId!, title: null, body: "Short one.\nMore detail here." },
    });

    const detail = (await getHabitDetail(habit.id, today))!;
    expect(detail.topicState).toBe("ok");
    expect(detail.topicName).toBe("Run");
    expect(detail.summary).toBeNull();
    expect(detail.last30).toHaveLength(2);
    expect(detail.entries).toHaveLength(2);
    const untitled = detail.entries.find((e) => e.title === null)!;
    expect(untitled.excerpt).toBe("Short one.");
  });

  it("excludes soft-deleted entries and ticks outside the window", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, addDays(today, -30), "COMPLETE"); // one day too old
    await prisma.journalEntry.create({
      data: { topicId: habit.journalTopicId!, body: "gone", deletedAt: new Date() },
    });
    const detail = (await getHabitDetail(habit.id, today))!;
    expect(detail.last30).toEqual([]);
    expect(detail.entries).toEqual([]);
  });

  it("reports archived and missing topics", async () => {
    const habit = await createHabit("Run");
    await archiveHabit(habit.id);
    let detail = (await getHabitDetail(habit.id, todayString()))!;
    expect(detail.topicState).toBe("archived");

    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: null, archived: false } });
    detail = (await getHabitDetail(habit.id, todayString()))!;
    expect(detail.topicState).toBe("missing");
    expect(detail.entries).toEqual([]);
  });

  it("returns null for an unknown habit", async () => {
    expect(await getHabitDetail("nope", todayString())).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test:integration -- src/systems/habits/services/detail.integration.test.ts`
Expected: FAIL — cannot resolve `./detail`.

- [ ] **Step 3: Implement `src/systems/habits/services/detail.ts`**

```ts
import { prisma } from "@/platform/db/client";
import { addDays, mondayOf, toDateString, toUtcDate, todayString } from "../lib/dates";
import type { TickDto } from "./ticks";

export interface DetailEntry {
  id: string;
  title: string | null;
  excerpt: string;
  createdAt: string; // ISO timestamp — the client groups into local days
}

export interface HabitDetail {
  last30: Array<Omit<TickDto, "habitId">>;
  entries: DetailEntry[];
  topicState: "ok" | "archived" | "missing";
  topicName: string;
  summary: null; // reserved for the AI-summary increment
}

function excerptOf(body: string): string {
  const line = body.split("\n", 1)[0].trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

export async function getHabitDetail(
  id: string, weekRaw: string
): Promise<HabitDetail | null> {
  const habit = await prisma.habit.findUnique({ where: { id } });
  if (!habit) return null;

  const today = todayString();
  const monday = mondayOf(weekRaw);
  const topic = habit.journalTopicId
    ? await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId } })
    : null;
  const topicState = topic ? (topic.archived ? "archived" : "ok") : "missing";

  const [ticks, entries] = await Promise.all([
    prisma.habitTick.findMany({
      where: {
        habitId: id,
        date: { gte: toUtcDate(addDays(today, -29)), lte: toUtcDate(today) },
      },
      orderBy: { date: "asc" },
    }),
    topic && !topic.archived
      ? prisma.journalEntry.findMany({
          where: {
            topicId: topic.id,
            deletedAt: null,
            // Week padded ±1 day (UTC) so client-local grouping keeps edge entries.
            createdAt: {
              gte: toUtcDate(addDays(monday, -1)),
              lt: toUtcDate(addDays(monday, 8)),
            },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true, title: true, body: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    last30: ticks.map((t) => ({ date: toDateString(t.date), status: t.status })),
    entries: entries.map((e) => ({
      id: e.id, title: e.title, excerpt: excerptOf(e.body),
      createdAt: e.createdAt.toISOString(),
    })),
    topicState,
    topicName: topic?.name ?? habit.name,
    summary: null,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun run test:integration -- src/systems/habits/services/detail.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/services/detail.ts src/systems/habits/services/detail.integration.test.ts
git commit -m "feat(habits): row detail service"
```

---

### Task 7: Schemas, routes, manifest, and registration

**Files:**
- Create: `src/systems/habits/schemas/habits.ts`
- Create: `src/systems/habits/routes/habits.ts`
- Create: `src/systems/habits/routes/ticks.ts`
- Create: `src/systems/habits/routes/detail.ts`
- Create: `src/systems/habits/manifest.ts`
- Modify: `src/systems/index.ts`
- Test: `src/systems/habits/routes/routes.integration.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4–6; `apiError`, `badRequest`, `notFound` from `@/platform/api/errors`; `RouteHandler` from `@/systems/types`.
- Produces: manifest `name: "habits"` with routes reachable at `/api/systems/habits/...`; nav `{ label: "Habits", icon: "repeat", href: "/habits" }`. Route table (exact keys — `PATCH /reorder` is deliberately NOT under `/habits/:id` so the `:id` pattern can't swallow it):

```
GET    /week?start=yyyy-mm-dd
POST   /habits
PATCH  /reorder
PATCH  /habits/:id
POST   /habits/:id/archive
POST   /habits/:id/unarchive
POST   /habits/:id/recreate-topic
GET    /habits/:id/detail?week=yyyy-mm-dd
PUT    /habits/:id/ticks/:date
DELETE /habits/:id/ticks/:date
```

- [ ] **Step 1: Write `src/systems/habits/schemas/habits.ts`**

```ts
import { z } from "zod";

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected yyyy-mm-dd");

export const createHabitSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const updateHabitSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    quote: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" });

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const tickBodySchema = z.object({
  status: z.enum(["PARTIAL", "COMPLETE"]),
});

export const weekQuerySchema = z.object({ start: dateStringSchema });
export const detailQuerySchema = z.object({ week: dateStringSchema });
```

- [ ] **Step 2: Write the failing route tests**

Create `src/systems/habits/routes/routes.integration.test.ts` (same direct-handler style as `src/systems/journal/routes/topics.integration.test.ts`):

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { addDays, todayString } from "../lib/dates";
import { createHabit as createHabitRoute, updateHabit, reorderRoute, archiveRoute, unarchiveRoute, recreateTopicRoute } from "./habits";
import { getWeekRoute, putTick, deleteTick } from "./ticks";
import { getDetailRoute } from "./detail";

function req(method: string, body?: unknown, url = "http://localhost/api/systems/habits/x") {
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("habits routes", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  async function makeHabit(name = "Run") {
    const res = await createHabitRoute(req("POST", { name }), {});
    expect(res.status).toBe(201);
    return (await res.json()).habit as { id: string; name: string };
  }

  it("POST /habits creates; duplicate name 409s", async () => {
    await makeHabit("Run");
    const dup = await createHabitRoute(req("POST", { name: "Run" }), {});
    expect(dup.status).toBe(409);
  });

  it("GET /week returns the tracker payload", async () => {
    const habit = await makeHabit();
    const today = todayString();
    await putTick(req("PUT", { status: "PARTIAL" }), { id: habit.id, date: today });
    const res = await getWeekRoute(
      req("GET", undefined, `http://localhost/api/systems/habits/week?start=${today}`), {}
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.habits).toHaveLength(1);
    expect(json.ticks).toHaveLength(1);
  });

  it("GET /week without a valid start 400s", async () => {
    const res = await getWeekRoute(
      req("GET", undefined, "http://localhost/api/systems/habits/week?start=nope"), {}
    );
    expect(res.status).toBe(400);
  });

  it("PUT tick rejects future dates with 400", async () => {
    const habit = await makeHabit();
    const res = await putTick(
      req("PUT", { status: "COMPLETE" }), { id: habit.id, date: addDays(todayString(), 1) }
    );
    expect(res.status).toBe(400);
  });

  it("DELETE tick returns 204", async () => {
    const habit = await makeHabit();
    const res = await deleteTick(req("DELETE"), { id: habit.id, date: todayString() });
    expect(res.status).toBe(204);
  });

  it("PATCH /habits/:id renames and 409s on topic collision", async () => {
    const a = await makeHabit("A");
    await makeHabit("B");
    const collide = await updateHabit(req("PATCH", { name: "B" }), { id: a.id });
    expect(collide.status).toBe(409);
    const ok = await updateHabit(req("PATCH", { name: "C", quote: "Daily." }), { id: a.id });
    expect(ok.status).toBe(200);
    expect((await ok.json()).habit.quote).toBe("Daily.");
  });

  it("PATCH /reorder validates the id list", async () => {
    const a = await makeHabit("A");
    const b = await makeHabit("B");
    const ok = await reorderRoute(req("PATCH", { ids: [b.id, a.id] }), {});
    expect(ok.status).toBe(200);
    const bad = await reorderRoute(req("PATCH", { ids: [a.id] }), {});
    expect(bad.status).toBe(400);
  });

  it("archive/unarchive/recreate-topic round-trip", async () => {
    const habit = await makeHabit();
    expect((await archiveRoute(req("POST"), { id: habit.id })).status).toBe(200);
    expect((await unarchiveRoute(req("POST"), { id: habit.id })).status).toBe(200);
    expect((await recreateTopicRoute(req("POST"), { id: habit.id })).status).toBe(200);
    expect((await archiveRoute(req("POST"), { id: "nope" })).status).toBe(404);
  });

  it("GET detail 404s on unknown habit and 200s otherwise", async () => {
    const habit = await makeHabit();
    const today = todayString();
    const ok = await getDetailRoute(
      req("GET", undefined, `http://localhost/x?week=${today}`), { id: habit.id }
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).topicState).toBe("ok");
    const gone = await getDetailRoute(
      req("GET", undefined, `http://localhost/x?week=${today}`), { id: "nope" }
    );
    expect(gone.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `bun run test:integration -- src/systems/habits/routes/routes.integration.test.ts`
Expected: FAIL — cannot resolve `./habits` / `./ticks` / `./detail`.

- [ ] **Step 4: Implement the route handlers**

Create `src/systems/habits/routes/habits.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { createHabitSchema, reorderSchema, updateHabitSchema } from "../schemas/habits";
import {
  archiveHabit, createHabit as createHabitService, getHabitById, recreateTopic,
  renameHabit, reorderHabits, setQuote, TopicNameCollisionError, unarchiveHabit,
} from "../services/habits";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const createHabit: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createHabitSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid habit", err.flatten());
    throw err;
  }
  try {
    const habit = await createHabitService(parsed.name);
    return NextResponse.json({ habit }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(409, `A habit named "${parsed.name}" already exists`);
    }
    throw err;
  }
};

export const updateHabit: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateHabitSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid update", err.flatten());
    throw err;
  }
  const existing = await getHabitById(params.id);
  if (!existing) return notFound(`Habit ${params.id} not found`);
  try {
    let habit = existing;
    if (parsed.name !== undefined && parsed.name !== habit.name) {
      habit = await renameHabit(habit.id, parsed.name);
    }
    if (parsed.quote !== undefined) {
      habit = await setQuote(habit.id, parsed.quote === "" ? null : parsed.quote);
    }
    return NextResponse.json({ habit });
  } catch (err) {
    if (err instanceof TopicNameCollisionError) return apiError(409, err.message);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(409, `A habit named "${parsed.name}" already exists`);
    }
    throw err;
  }
};

export const reorderRoute: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = reorderSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid order", err.flatten());
    throw err;
  }
  try {
    await reorderHabits(parsed.ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "reorder list mismatch") {
      return badRequest("Order list must contain every unarchived habit exactly once");
    }
    throw err;
  }
};

function archiveHandler(fn: (id: string) => Promise<unknown>): RouteHandler {
  return async (_req, params) => {
    const existing = await getHabitById(params.id);
    if (!existing) return notFound(`Habit ${params.id} not found`);
    const habit = await fn(params.id);
    return NextResponse.json({ habit });
  };
}

export const archiveRoute = archiveHandler(archiveHabit);
export const unarchiveRoute = archiveHandler(unarchiveHabit);
export const recreateTopicRoute = archiveHandler(recreateTopic);
```

Create `src/systems/habits/routes/ticks.ts`:

```ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { dateStringSchema, tickBodySchema, weekQuerySchema } from "../schemas/habits";
import { getHabitById } from "../services/habits";
import { FutureDateError, getWeek, removeTick, upsertTick } from "../services/ticks";

export const getWeekRoute: RouteHandler = async (req) => {
  const search = Object.fromEntries(req.nextUrl.searchParams);
  let parsed;
  try {
    parsed = weekQuerySchema.parse(search);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid week", err.flatten());
    throw err;
  }
  return NextResponse.json(await getWeek(parsed.start));
};

export const putTick: RouteHandler = async (req, params) => {
  let body;
  let date;
  try {
    body = tickBodySchema.parse(await req.json().catch(() => null));
    date = dateStringSchema.parse(params.date);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid tick", err.flatten());
    throw err;
  }
  const habit = await getHabitById(params.id);
  if (!habit) return notFound(`Habit ${params.id} not found`);
  try {
    const tick = await upsertTick(params.id, date, body.status);
    return NextResponse.json({ tick });
  } catch (err) {
    if (err instanceof FutureDateError) return badRequest(err.message);
    throw err;
  }
};

export const deleteTick: RouteHandler = async (_req, params) => {
  let date;
  try {
    date = dateStringSchema.parse(params.date);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid date", err.flatten());
    throw err;
  }
  await removeTick(params.id, date);
  return new NextResponse(null, { status: 204 });
};
```

Create `src/systems/habits/routes/detail.ts`:

```ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { detailQuerySchema } from "../schemas/habits";
import { getHabitDetail } from "../services/detail";

export const getDetailRoute: RouteHandler = async (req, params) => {
  const search = Object.fromEntries(req.nextUrl.searchParams);
  let parsed;
  try {
    parsed = detailQuerySchema.parse(search);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid week", err.flatten());
    throw err;
  }
  const detail = await getHabitDetail(params.id, parsed.week);
  if (!detail) return notFound(`Habit ${params.id} not found`);
  return NextResponse.json(detail);
};
```

- [ ] **Step 5: Write `src/systems/habits/manifest.ts` and register it**

```ts
import { SystemManifest } from "../types";
import * as palette from "./palette";
import * as habits from "./routes/habits";
import * as ticks from "./routes/ticks";
import * as detail from "./routes/detail";

export const manifest: SystemManifest = {
  name: "habits",
  displayName: "Habit Tracker",
  description: "Weekly habit tracking with three-state ticks and journal-backed logs",

  routes: {
    "GET /week":                        ticks.getWeekRoute,
    "POST /habits":                     habits.createHabit,
    "PATCH /reorder":                   habits.reorderRoute,
    "PATCH /habits/:id":                habits.updateHabit,
    "POST /habits/:id/archive":         habits.archiveRoute,
    "POST /habits/:id/unarchive":       habits.unarchiveRoute,
    "POST /habits/:id/recreate-topic":  habits.recreateTopicRoute,
    "GET /habits/:id/detail":           detail.getDetailRoute,
    "PUT /habits/:id/ticks/:date":      ticks.putTick,
    "DELETE /habits/:id/ticks/:date":   ticks.deleteTick,
  },

  nav: {
    label: "Habits",
    icon: "repeat",
    href: "/habits",
  },

  palette: {
    layers: [palette.habitsLayer],
  },
};
```

For this task, create a placeholder `src/systems/habits/palette.ts` (finished in Task 15):

```ts
import type { PaletteLayer } from "@/platform/palette/types";

export const habitsLayer: PaletteLayer = {
  name: "habits",
  singular: "habit",
  search: async () => [],
};
```

Modify `src/systems/index.ts`:

```ts
import { SystemManifest } from "./types";
import { manifest as journalManifest } from "./journal/manifest";
import { manifest as expensesManifest } from "./expenses/manifest";
import { manifest as habitsManifest } from "./habits/manifest";

export const manifests: SystemManifest[] = [
  journalManifest,
  expensesManifest,
  habitsManifest,
];
```

- [ ] **Step 6: Run to verify pass**

Run: `bun run test:integration -- src/systems/habits/routes/routes.integration.test.ts`
Expected: PASS (9 tests).
Also run: `bun run test` — the existing `src/systems/registry.test.ts` must still pass with three manifests.

- [ ] **Step 7: Commit**

```bash
git add src/systems/habits src/systems/index.ts
git commit -m "feat(habits): API routes, manifest, and registration"
```

---

### Task 8: Icons, shell registration, tabs, and page skeletons

**Files:**
- Create: `public/icons/repeat.svg`, `public/icons/diamond.svg`
- Modify: `src/app/_components/Icon.tsx` (PATHS map)
- Modify: `src/app/(systems)/layout.tsx` and `src/app/(platform)/layout.tsx` (ALLOWED_ICONS)
- Create: `src/app/(systems)/habits/layout.tsx`
- Create: `src/app/(systems)/habits/page.tsx`
- Create: `src/app/(systems)/habits/charts/page.tsx`

**Interfaces:**
- Consumes: `getWeek` from Task 5, manifest registration from Task 7.
- Produces: `/habits` and `/habits/charts` render inside the shell with a "Habits" sidebar item (repeat icon) and a Tracker | Charts tab strip. Icons `repeat`, `diamond`, `chevron-left` available via `<Icon name=... />`.

- [ ] **Step 1: Add the Lucide SVG sources**

Run:
```bash
curl -s https://unpkg.com/lucide-static@latest/icons/repeat.svg -o public/icons/repeat.svg
curl -s https://unpkg.com/lucide-static@latest/icons/diamond.svg -o public/icons/diamond.svg
```
Open both files and confirm they contain `<path>` elements (not an error page).

- [ ] **Step 2: Extend the `PATHS` map in `src/app/_components/Icon.tsx`**

Add three entries (paths below match current Lucide; if the downloaded SVGs differ, copy from the files):

```tsx
  repeat: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  diamond: (
    <path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z" />
  ),
  "chevron-left": <path d="m15 18-6-6 6-6" />,
```

- [ ] **Step 3: Allow the nav icon in both group layouts**

In `src/app/(systems)/layout.tsx` and `src/app/(platform)/layout.tsx`, append `"repeat"` to the `ALLOWED_ICONS` array (after `"receipt"`).

- [ ] **Step 4: Create the habits layout with tabs**

`src/app/(systems)/habits/layout.tsx`:

```tsx
import { TabStrip } from "@/app/_components/TabStrip";

export default function HabitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TabStrip
        label="Habits sections"
        items={[
          { label: "Tracker", href: "/habits", exact: true },
          { label: "Charts", href: "/habits/charts" },
        ]}
      />
      {children}
    </>
  );
}
```

- [ ] **Step 5: Create the page skeletons**

`src/app/(systems)/habits/page.tsx` (temporary body — Task 9 swaps in the island):

```tsx
import { getWeek } from "@/systems/habits/services/ticks";
import { todayString } from "@/systems/habits/lib/dates";
import { formatWeekRange } from "@/systems/habits/lib/dates";

export default async function HabitsPage() {
  const week = await getWeek(todayString());
  return (
    <article className="doc">
      <h1>Habits</h1>
      <p className="lead">{formatWeekRange(week.monday)} — {week.habits.length} habits</p>
    </article>
  );
}
```

`src/app/(systems)/habits/charts/page.tsx` (temporary body — Task 14 fills it):

```tsx
export default async function HabitsChartsPage() {
  return (
    <article className="doc">
      <h1>Charts</h1>
      <p className="lead">Nothing to chart yet.</p>
      <p className="caption">Tick a few days on the tracker first.</p>
    </article>
  );
}
```

- [ ] **Step 6: Verify in the browser**

```bash
bun run dev &   # wait for "Ready"
node shot.mjs /habits .superpowers/sdd/smoke/habits-shell.png
```
(`shot.mjs` sits at the repo root; it forges the auth cookie from `.env` — if it reads `ALLOWED_EMAIL` and only `ALLOWED_EMAILS` exists, pass the first address. If Turbopack serves stale CSS, `rm -rf .next` and restart.)

View the PNG. Expected: "Habits" in the sidebar Systems section with the repeat icon, Tracker | Charts tabs with Tracker active, Fraunces h1 "Habits".

- [ ] **Step 7: Commit**

```bash
git add public/icons/repeat.svg public/icons/diamond.svg src/app/_components/Icon.tsx \
  "src/app/(systems)/layout.tsx" "src/app/(platform)/layout.tsx" "src/app/(systems)/habits"
git commit -m "feat(habits): shell registration, tabs, and page skeletons"
```

---

### Task 9: Tick circles and the tracker island

**Files:**
- Create: `src/systems/habits/components/TickCircle.tsx`
- Create: `src/systems/habits/components/HabitTracker.tsx`
- Create: `src/systems/habits/lib/sounds.ts` (no-op stub — real engine in Task 13)
- Modify: `src/app/globals.css` (append habits section)
- Modify: `src/app/(systems)/habits/page.tsx`

**Interfaces:**
- Consumes: `WeekData`/`TickDto` types (via `import type` from `../services/ticks` — type-only imports are erased, so no Prisma leaks into the client bundle); `weekDates`, `formatWeekRange`, `localTodayString` from `../lib/dates`.
- Produces:
  - `TickCircle` props: `{ state: TickState; disabled?: boolean; label: string; onChange: (next: TickState) => void }` with `type TickState = "off" | "partial" | "complete"`.
  - `HabitTracker` props: `{ initialWeek: WeekData }`.
  - `lib/sounds.ts`: `type SoundSlot = "partial" | "complete" | "off"`, `initSounds(): void`, `playSound(slot: SoundSlot): void`.
  - Extension points later tasks rely on: `cache` ref (`Map<string, WeekData>`), `mutateTick`, `handleTick`, `setWeek`, `setError`, and the `habit-head` header block.

- [ ] **Step 1: Create the sounds stub `src/systems/habits/lib/sounds.ts`**

```ts
// Sound engine lands in a later task; these no-ops keep call sites stable.
export type SoundSlot = "partial" | "complete" | "off";

export function initSounds(): void {}

export function playSound(_slot: SoundSlot): void {}
```

- [ ] **Step 2: Create `src/systems/habits/components/TickCircle.tsx`**

Interaction contract (from the spec): click cycles off → partial and partial/complete → off; press-and-hold ≥ 450 ms sets complete (fires at the threshold, while still pressed, with a radial fill affordance); hold on complete does nothing; pointer leaving cancels; future days disabled; keyboard Space/Enter cycles off → partial → complete → off.

```tsx
"use client";

import { useRef, useState } from "react";

export type TickState = "off" | "partial" | "complete";

const HOLD_MS = 450;

interface TickCircleProps {
  state: TickState;
  disabled?: boolean;
  label: string;
  onChange: (next: TickState) => void;
}

export function TickCircle({ state, disabled, label, onChange }: TickCircleProps) {
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const firedHold = useRef(false);

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setHolding(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    firedHold.current = false;
    if (state !== "complete") {
      setHolding(true);
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        firedHold.current = true;
        setHolding(false);
        onChange("complete");
      }, HOLD_MS);
    }
  };

  const onPointerUp = () => {
    if (disabled) return;
    const wasHolding = holdTimer.current !== null;
    clearHold();
    if (firedHold.current) return; // the hold already completed this press
    if (state === "off" && wasHolding) onChange("partial");
    else if (state !== "off") onChange("off");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || (e.key !== " " && e.key !== "Enter")) return;
    e.preventDefault();
    onChange(state === "off" ? "partial" : state === "partial" ? "complete" : "off");
  };

  return (
    <button
      type="button"
      className={`tick tick-${state}${holding ? " tick-holding" : ""}`}
      disabled={disabled}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
        <circle className="tick-ring" cx="11" cy="11" r="9" />
        {holding && <circle className="tick-hold-ring" cx="11" cy="11" r="9" />}
        {state === "partial" && <path className="tick-half" d="M2.5 11a8.5 8.5 0 0 0 17 0Z" />}
        {state === "complete" && (
          <>
            <circle className="tick-disc" cx="11" cy="11" r="8.5" />
            <path className="tick-check" d="m7.2 11.4 2.6 2.6 5-5.4" />
          </>
        )}
      </svg>
    </button>
  );
}
```

(Note: `state === "off" && wasHolding` — for an off circle the hold timer always starts, so a short press reads as `wasHolding` and yields partial; a press on complete never starts the timer and any release turns it off.)

- [ ] **Step 3: Create `src/systems/habits/components/HabitTracker.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import type { WeekData } from "../services/ticks";
import { formatWeekRange, localTodayString, weekDates } from "../lib/dates";
import { initSounds, playSound } from "../lib/sounds";
import { TickCircle, type TickState } from "./TickCircle";

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

function tickKey(habitId: string, date: string): string {
  return `${habitId}|${date}`;
}

function stateOf(status: "PARTIAL" | "COMPLETE" | undefined): TickState {
  if (status === "COMPLETE") return "complete";
  if (status === "PARTIAL") return "partial";
  return "off";
}

export function HabitTracker({ initialWeek }: { initialWeek: WeekData }) {
  const cache = useRef<Map<string, WeekData>>(new Map([[initialWeek.monday, initialWeek]]));
  const [week, setWeek] = useState<WeekData>(initialWeek);
  const [error, setError] = useState<string | null>(null);
  const today = localTodayString();
  const dates = weekDates(week.monday);
  const ticks = new Map(week.ticks.map((t) => [tickKey(t.habitId, t.date), t.status]));

  const mutateTick = (habitId: string, date: string, state: TickState) => {
    setWeek((w) => {
      const others = w.ticks.filter((t) => !(t.habitId === habitId && t.date === date));
      const next = {
        ...w,
        ticks:
          state === "off"
            ? others
            : [...others, {
                habitId, date,
                status: state === "partial" ? ("PARTIAL" as const) : ("COMPLETE" as const),
              }],
      };
      cache.current.set(w.monday, next);
      return next;
    });
  };

  const handleTick = (habitId: string, date: string, next: TickState) => {
    const prev = stateOf(ticks.get(tickKey(habitId, date)));
    if (prev === next) return;
    playSound(next === "off" ? "off" : next);
    mutateTick(habitId, date, next);
    setError(null);
    const url = `/api/systems/habits/habits/${habitId}/ticks/${date}`;
    const request =
      next === "off"
        ? fetch(url, { method: "DELETE" })
        : fetch(url, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: next === "partial" ? "PARTIAL" : "COMPLETE" }),
          });
    request
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
      })
      .catch(() => {
        mutateTick(habitId, date, prev);
        setError("Could not save that tick — reverted. Check your connection.");
      });
  };

  return (
    <section className="paper-card habit-card" onPointerDownCapture={initSounds}>
      <header className="habit-head">
        <span className="habit-range">{formatWeekRange(week.monday)}</span>
      </header>
      <div className="habit-grid" role="table" aria-label="Habit tracker">
        <div className="habit-grid-row habit-grid-head" role="row">
          <span className="habit-name" />
          {dates.map((d, i) => (
            <span key={d} className={`habit-day${d === today ? " is-today" : ""}`}>
              {DAY_INITIALS[i]}
            </span>
          ))}
        </div>
        {week.habits.map((h) => (
          <div key={h.id} className="habit-grid-row" role="row">
            <span className="habit-name">{h.name}</span>
            {dates.map((d) => (
              <span key={d} className={`habit-cell${d === today ? " is-today" : ""}`}>
                <TickCircle
                  state={stateOf(ticks.get(tickKey(h.id, d)))}
                  disabled={d > today}
                  label={`${h.name} — ${d}`}
                  onChange={(next) => handleTick(h.id, d, next)}
                />
              </span>
            ))}
          </div>
        ))}
      </div>
      {week.habits.length === 0 && (
        <div className="habit-empty">
          <p>No habits yet.</p>
          <p className="caption">Add one below to start tracking.</p>
        </div>
      )}
      {error && <p className="habit-error">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Swap the page body — `src/app/(systems)/habits/page.tsx`**

```tsx
import { getWeek } from "@/systems/habits/services/ticks";
import { todayString } from "@/systems/habits/lib/dates";
import { HabitTracker } from "@/systems/habits/components/HabitTracker";

export default async function HabitsPage() {
  const week = await getWeek(todayString());
  return (
    <article className="doc">
      <h1>Habits</h1>
      <HabitTracker initialWeek={week} />
    </article>
  );
}
```

- [ ] **Step 5: Append the habits section to `src/app/globals.css`**

At the end of the file:

```css
/* ── Habits system ─────────────────────────────────────────────────────── */

.habit-card { padding: var(--sp-4); }

.habit-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding-bottom: var(--sp-3);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--sp-3);
}

.habit-range { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--fg-muted); }

.habit-grid-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) repeat(7, 44px);
  align-items: center;
  min-height: 36px;
}

.habit-grid-head { min-height: 24px; }

.habit-day {
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--fg-faint);
}

.habit-day.is-today { color: var(--accent); }

.habit-name { font-size: var(--fs-md); color: var(--fg); padding-right: var(--sp-2); }

.habit-cell { display: flex; justify-content: center; }
.habit-cell.is-today { background: var(--bg-hover); border-radius: var(--r-md); }

.habit-empty { padding: var(--sp-6) 0 var(--sp-2); text-align: center; }
.habit-error { color: var(--danger); font-size: var(--fs-sm); margin-top: var(--sp-2); }

/* Tick circles */
.tick {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; padding: 0;
  border-radius: var(--r-full);
  color: var(--success);
  cursor: pointer;
  touch-action: none;
}
.tick:hover:not(:disabled) { background: var(--bg-hover); }
.tick:disabled { cursor: default; }
.tick svg { transition: transform var(--dur-fast) var(--ease-out); }
.tick-ring { fill: none; stroke: var(--border-strong); stroke-width: 1; }
.tick:disabled .tick-ring { stroke: var(--border); }
.tick-half, .tick-disc { fill: var(--success); }
.tick-check {
  fill: none; stroke: var(--paper-0);
  stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
}
.tick-hold-ring {
  fill: none; stroke: var(--success); stroke-width: 2;
  stroke-dasharray: 56.5; stroke-dashoffset: 56.5;
  transform: rotate(-90deg); transform-origin: center;
  animation: tick-hold 450ms linear forwards;
}
.tick-partial svg { animation: tick-pop var(--dur-fast) var(--ease-out); }
.tick-complete svg { animation: tick-burst 300ms var(--ease-spring); }

@keyframes tick-hold { to { stroke-dashoffset: 0; } }
@keyframes tick-pop { 50% { transform: scale(1.15); } }
@keyframes tick-burst { 0% { transform: scale(0.8); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }

@media (prefers-reduced-motion: reduce) {
  .tick svg, .tick-partial svg, .tick-complete svg { animation: none; transition: none; }
  .tick-hold-ring { animation: none; stroke-dashoffset: 0; }
}
```

- [ ] **Step 6: Verify interactions in the browser**

With the dev server running, seed a habit through the API shape used by the UI (or temporarily via `bunx prisma studio`), then:

```bash
node shot.mjs /habits .superpowers/sdd/smoke/habits-grid.png
```

View the PNG: grid with 7 circles per habit, today's column washed, future circles faint. Then interactively verify (a quick playwright-core script mirroring `shot.mjs`, or by hand in a browser): click → half-disc appears; click again → off; press-and-hold ~0.5 s → filling ring, then full green disc with check; click a completed circle → off; refresh the page → states persisted.

- [ ] **Step 7: Commit**

```bash
git add src/systems/habits/components src/systems/habits/lib/sounds.ts src/app/globals.css "src/app/(systems)/habits/page.tsx"
git commit -m "feat(habits): tick circles and optimistic tracker island"
```

---

### Task 10: Week navigation — header, month popover, cache and prefetch

**Files:**
- Create: `src/systems/habits/components/WeekHeader.tsx`
- Modify: `src/systems/habits/components/HabitTracker.tsx`

**Interfaces:**
- Consumes: `cache`, `setWeek`, `setError` from Task 9's island; date helpers.
- Produces: `WeekHeader` props `{ monday: string; onNavigate: (dateStr: string) => void }` — `onNavigate` accepts ANY date string; the island normalizes to its Monday.

- [ ] **Step 1: Create `src/systems/habits/components/WeekHeader.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/_components/Icon";
import { addDays, formatWeekRange, localTodayString, mondayOf, toUtcDate } from "../lib/dates";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface WeekHeaderProps {
  monday: string;
  onNavigate: (dateStr: string) => void;
}

export function WeekHeader({ monday, onNavigate }: WeekHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="habit-head">
      <button
        type="button" className="btn btn-ghost habit-nav" aria-label="Previous week"
        onClick={() => onNavigate(addDays(monday, -7))}
      >
        <Icon name="chevron-left" size={16} />
      </button>
      <span className="habit-range-wrap">
        <button
          type="button" className="habit-range" aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {formatWeekRange(monday)}
        </button>
        {open && (
          <MonthPopover
            anchor={monday}
            onPick={(d) => { setOpen(false); onNavigate(d); }}
            onClose={() => setOpen(false)}
          />
        )}
      </span>
      <button
        type="button" className="btn btn-ghost habit-nav" aria-label="Next week"
        onClick={() => onNavigate(addDays(monday, 7))}
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </header>
  );
}

function MonthPopover({
  anchor, onPick, onClose,
}: {
  anchor: string;
  onPick: (dateStr: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [first, setFirst] = useState(`${anchor.slice(0, 7)}-01`);
  const today = localTodayString();

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const d = toUtcDate(first);
  const title = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const gridStart = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const month = first.slice(0, 7);

  const shiftMonth = (n: number) => {
    const next = new Date(toUtcDate(first));
    next.setUTCMonth(next.getUTCMonth() + n);
    setFirst(next.toISOString().slice(0, 8) + "01");
  };

  return (
    <div className="habit-popover" ref={ref} role="dialog" aria-label="Jump to week">
      <div className="habit-popover-head">
        <button type="button" className="btn btn-ghost habit-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <Icon name="chevron-left" size={14} />
        </button>
        <span className="habit-popover-title">{title}</span>
        <button type="button" className="btn btn-ghost habit-nav" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
      <div className="habit-popover-grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((c, i) => (
          <span key={`h${i}`} className="habit-popover-dow">{c}</span>
        ))}
        {cells.map((c) => (
          <button
            key={c}
            type="button"
            className={
              "habit-popover-day" +
              (c.slice(0, 7) === month ? "" : " is-outside") +
              (c === today ? " is-today" : "")
            }
            onClick={() => onPick(c)}
          >
            {Number(c.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire navigation into `HabitTracker.tsx`**

Add to the imports:

```tsx
import { useCallback, useEffect } from "react";
import { addDays, mondayOf } from "../lib/dates";
import { WeekHeader } from "./WeekHeader";
```

(merge with the existing `react` and `../lib/dates` import lines). Then add below `const [error, setError] = useState...`:

```tsx
  const fetchWeek = useCallback(async (monday: string): Promise<WeekData | null> => {
    const cached = cache.current.get(monday);
    if (cached) return cached;
    try {
      const res = await fetch(`/api/systems/habits/week?start=${monday}`);
      if (!res.ok) return null;
      const data: WeekData = await res.json();
      cache.current.set(monday, data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const goToWeek = useCallback(async (target: string) => {
    const monday = mondayOf(target);
    const data = await fetchWeek(monday);
    if (!data) {
      setError("Could not load that week. Check your connection.");
      return;
    }
    setError(null);
    setWeek(data);
    void fetchWeek(addDays(monday, -7));
    void fetchWeek(addDays(monday, 7));
  }, [fetchWeek]);

  useEffect(() => {
    void fetchWeek(addDays(initialWeek.monday, -7));
    void fetchWeek(addDays(initialWeek.monday, 7));
  }, [fetchWeek, initialWeek.monday]);
```

Replace the static header block

```tsx
      <header className="habit-head">
        <span className="habit-range">{formatWeekRange(week.monday)}</span>
      </header>
```

with

```tsx
      <WeekHeader monday={week.monday} onNavigate={goToWeek} />
```

and remove `formatWeekRange` from the island's imports (now only used by `WeekHeader`).

- [ ] **Step 3: Append popover styles to the habits section of `globals.css`**

```css
/* Week header + month popover */
.habit-nav { padding: var(--sp-1); min-width: 0; }
.habit-range-wrap { position: relative; }
button.habit-range { background: none; border: none; cursor: pointer; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-md); }
button.habit-range:hover { background: var(--bg-hover); }

.habit-popover {
  position: absolute; top: calc(100% + var(--sp-1)); left: 50%; transform: translateX(-50%);
  z-index: 30; min-width: 240px;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--r-lg); box-shadow: var(--shadow-md); padding: var(--sp-3);
}
.habit-popover-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-2); }
.habit-popover-title { font-size: var(--fs-sm); font-weight: 600; }
.habit-popover-grid { display: grid; grid-template-columns: repeat(7, 28px); gap: 2px; }
.habit-popover-dow { text-align: center; font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--fg-faint); }
.habit-popover-day {
  height: 26px; background: none; border: none; cursor: pointer;
  border-radius: var(--r-md); font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--fg);
}
.habit-popover-day:hover { background: var(--bg-hover); }
.habit-popover-day.is-outside { color: var(--fg-faint); }
.habit-popover-day.is-today { box-shadow: inset 0 0 0 1px var(--accent); }
```

- [ ] **Step 4: Verify**

Dev server + browser: arrows step weeks with no visible delay after first paint (neighbors prefetch); clicking the range opens the month grid; clicking a date jumps to its week; ticks made in a past week survive navigating away and back (cache patch). Screenshot:

```bash
node shot.mjs /habits .superpowers/sdd/smoke/habits-weeknav.png
```

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/components src/app/globals.css
git commit -m "feat(habits): week navigation with month popover and prefetch"
```

---

### Task 11: Row management — add, rename, move, archive, unarchive

**Files:**
- Create: `src/systems/habits/components/AddHabitRow.tsx`
- Create: `src/systems/habits/components/RowMenu.tsx`
- Create: `src/systems/habits/components/ArchivedDisclosure.tsx`
- Modify: `src/systems/habits/components/HabitTracker.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: routes from Task 7; `cache`/`refresh` pattern from Tasks 9–10.
- Produces: `AddHabitRow` props `{ autoFocus: boolean; onAdd: (name: string) => Promise<boolean> }` (true = added); `RowMenu` props `{ canMoveUp: boolean; canMoveDown: boolean; onRename/onMoveUp/onMoveDown/onArchive: () => void }`; `ArchivedDisclosure` props `{ archived: Array<{id: string; name: string}>; onUnarchive: (id: string) => void }`.
- Error payload note: server errors come from `@/platform/api/errors` — check that file for the JSON shape (assumed `{ error: string }` below; adjust the one extraction helper if it differs).

- [ ] **Step 1: Create `src/systems/habits/components/AddHabitRow.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface AddHabitRowProps {
  autoFocus: boolean;
  onAdd: (name: string) => Promise<boolean>;
}

export function AddHabitRow({ autoFocus, onAdd }: AddHabitRowProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const added = await onAdd(trimmed);
    setBusy(false);
    if (added) setName("");
  };

  return (
    <div className="habit-add-row">
      <input
        ref={inputRef}
        className="habit-add-input"
        placeholder="Add a habit"
        aria-label="Add a habit"
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/systems/habits/components/RowMenu.tsx`**

```tsx
"use client";

import { Icon } from "@/app/_components/Icon";

interface RowMenuProps {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onArchive: () => void;
}

export function RowMenu({ canMoveUp, canMoveDown, onRename, onMoveUp, onMoveDown, onArchive }: RowMenuProps) {
  const close = (e: React.MouseEvent) => {
    const details = (e.currentTarget as HTMLElement).closest("details");
    if (details) details.open = false;
  };
  return (
    <details className="habit-menu">
      <summary className="habit-menu-btn" aria-label="Habit actions">
        <Icon name="more-horizontal" size={14} />
      </summary>
      <div className="habit-menu-list" onClick={close}>
        <button type="button" onClick={onRename}>Rename</button>
        <button type="button" onClick={onMoveUp} disabled={!canMoveUp}>Move up</button>
        <button type="button" onClick={onMoveDown} disabled={!canMoveDown}>Move down</button>
        <button type="button" onClick={onArchive}>Archive</button>
      </div>
    </details>
  );
}
```

- [ ] **Step 3: Create `src/systems/habits/components/ArchivedDisclosure.tsx`**

```tsx
"use client";

interface ArchivedDisclosureProps {
  archived: Array<{ id: string; name: string }>;
  onUnarchive: (id: string) => void;
}

export function ArchivedDisclosure({ archived, onUnarchive }: ArchivedDisclosureProps) {
  if (archived.length === 0) return null;
  return (
    <details className="habit-archived">
      <summary>{archived.length} archived</summary>
      <ul>
        {archived.map((h) => (
          <li key={h.id}>
            <span>{h.name}</span>
            <button type="button" className="btn btn-ghost" onClick={() => onUnarchive(h.id)}>
              Unarchive
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

- [ ] **Step 4: Wire management into `HabitTracker.tsx`**

Add imports:

```tsx
import { useSearchParams } from "next/navigation";
import { AddHabitRow } from "./AddHabitRow";
import { RowMenu } from "./RowMenu";
import { ArchivedDisclosure } from "./ArchivedDisclosure";
```

Add state + helpers below `goToWeek` (exact code):

```tsx
  const searchParams = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);

  const errorOf = async (res: Response | null, fallback: string): Promise<string> => {
    if (!res) return `${fallback} Check your connection.`;
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return typeof body?.error === "string" ? body.error : fallback;
  };

  const refresh = useCallback(async () => {
    cache.current.clear();
    try {
      const res = await fetch(`/api/systems/habits/week?start=${week.monday}`);
      if (!res.ok) throw new Error(String(res.status));
      const data: WeekData = await res.json();
      cache.current.set(data.monday, data);
      setWeek(data);
    } catch {
      setError("Could not refresh — reload the page.");
    }
  }, [week.monday]);

  const addHabit = async (name: string): Promise<boolean> => {
    const res = await fetch("/api/systems/habits/habits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError(await errorOf(res, "Could not add the habit."));
      return false;
    }
    setError(null);
    await refresh();
    return true;
  };

  const saveRename = async (id: string, rawName: string) => {
    setEditingId(null);
    const habit = week.habits.find((h) => h.id === id);
    const name = rawName.trim();
    if (!habit || !name || name === habit.name) return;
    const res = await fetch(`/api/systems/habits/habits/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError(await errorOf(res, "Could not rename the habit."));
      return;
    }
    setError(null);
    await refresh();
  };

  const moveHabit = async (id: string, dir: -1 | 1) => {
    const idx = week.habits.findIndex((h) => h.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= week.habits.length) return;
    const ids = week.habits.map((h) => h.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    setWeek((w) => {
      const habits = [...w.habits];
      const [moved] = habits.splice(idx, 1);
      habits.splice(target, 0, moved);
      const next = { ...w, habits };
      cache.current.set(w.monday, next);
      return next;
    });
    const res = await fetch("/api/systems/habits/reorder", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError("Could not save the order — reloading.");
      await refresh();
    }
  };

  const setArchived = async (id: string, archive: boolean) => {
    const res = await fetch(
      `/api/systems/habits/habits/${id}/${archive ? "archive" : "unarchive"}`,
      { method: "POST" }
    ).catch(() => null);
    if (!res || !res.ok) {
      setError(await errorOf(res, archive ? "Could not archive the habit." : "Could not unarchive the habit."));
      return;
    }
    setError(null);
    await refresh();
  };
```

Replace the habit-name span in the row markup with (rename-in-place + menu):

```tsx
            <span className="habit-name">
              {editingId === h.id ? (
                <input
                  className="habit-rename-input"
                  defaultValue={h.name}
                  autoFocus
                  aria-label={`Rename ${h.name}`}
                  onBlur={(e) => void saveRename(h.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveRename(h.id, e.currentTarget.value);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <>
                  <span className="habit-name-text">{h.name}</span>
                  <RowMenu
                    canMoveUp={week.habits[0]?.id !== h.id}
                    canMoveDown={week.habits[week.habits.length - 1]?.id !== h.id}
                    onRename={() => setEditingId(h.id)}
                    onMoveUp={() => void moveHabit(h.id, -1)}
                    onMoveDown={() => void moveHabit(h.id, 1)}
                    onArchive={() => void setArchived(h.id, true)}
                  />
                </>
              )}
            </span>
```

After the grid `</div>` (before the empty state), add:

```tsx
      <AddHabitRow autoFocus={searchParams.get("new") === "1"} onAdd={addHabit} />
```

After the closing `</section>` of the card, wrap the return in a fragment and add:

```tsx
      <ArchivedDisclosure
        archived={week.archivedHabits}
        onUnarchive={(id) => void setArchived(id, false)}
      />
```

(so the component returns `<> <section …>…</section> <ArchivedDisclosure … /> </>`).

- [ ] **Step 5: Append styles to the habits section of `globals.css`**

```css
/* Row management */
.habit-name { display: flex; align-items: center; gap: var(--sp-1); min-width: 0; }
.habit-name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.habit-rename-input, .habit-add-input {
  font: inherit; color: var(--fg);
  background: var(--bg-sunken); border: 1px solid var(--border-strong);
  border-radius: var(--r-md); padding: var(--sp-1) var(--sp-2); width: 100%;
}
.habit-rename-input:focus-visible, .habit-add-input:focus-visible {
  outline: none; border-color: var(--accent); box-shadow: var(--ring);
}
.habit-add-row { margin-top: var(--sp-3); max-width: 280px; }

.habit-menu { position: relative; }
.habit-menu-btn {
  list-style: none; display: inline-flex; padding: var(--sp-1);
  border-radius: var(--r-md); cursor: pointer; color: var(--fg-faint);
  opacity: 0; /* revealed on row hover below — visibility, not interactive state */
}
.habit-grid-row:hover .habit-menu-btn, .habit-menu[open] .habit-menu-btn { opacity: 1; }
.habit-menu-btn:hover { background: var(--bg-hover); color: var(--fg); }
.habit-menu-btn::-webkit-details-marker { display: none; }
.habit-menu-list {
  position: absolute; left: 0; top: calc(100% + 2px); z-index: 20; min-width: 130px;
  background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: var(--r-md); box-shadow: var(--shadow-md); padding: var(--sp-1);
  display: flex; flex-direction: column;
}
.habit-menu-list button {
  text-align: left; background: none; border: none; cursor: pointer;
  font-size: var(--fs-sm); color: var(--fg);
  padding: var(--sp-1) var(--sp-2); border-radius: var(--r-md);
}
.habit-menu-list button:hover:not(:disabled) { background: var(--bg-hover); }
.habit-menu-list button:disabled { color: var(--fg-faint); cursor: default; }

.habit-archived { margin-top: var(--sp-3); }
.habit-archived summary { cursor: pointer; font-size: var(--fs-sm); color: var(--fg-muted); }
.habit-archived ul { list-style: none; padding: var(--sp-2) 0 0; margin: 0; }
.habit-archived li {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--sp-1) 0; color: var(--fg-muted); font-size: var(--fs-sm);
}
```

- [ ] **Step 6: Verify**

In the browser: add "Morning run" via the add row (check a Journal topic "Morning run" now exists at `/journal/topics`); rename it; add a second habit named the same as an existing journal-only topic (links instead of failing); move rows up/down; archive one and unarchive it from the disclosure; visit `/habits?new=1` and confirm the add input is focused. Screenshot:

```bash
node shot.mjs /habits .superpowers/sdd/smoke/habits-rows.png
```

- [ ] **Step 7: Commit**

```bash
git add src/systems/habits/components src/app/globals.css
git commit -m "feat(habits): add, rename, reorder, and archive rows"
```

---

### Task 12: Row dropdown — diamonds, quote, 30-day calendar, summary placeholder

**Files:**
- Create: `src/systems/habits/components/RowDropdown.tsx`
- Modify: `src/systems/habits/components/HabitTracker.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `GET /habits/:id/detail?week=` from Task 6/7; `HabitDetail` type (`import type` from `../services/detail`); `HabitDto` (`import type` from `../services/ticks`).
- Produces: `RowDropdown` props `{ habit: HabitDto; dates: string[]; detail: HabitDetail | null; onSaveQuote: (quote: string) => void; onRecreateTopic: () => void }`.

- [ ] **Step 1: Create `src/systems/habits/components/RowDropdown.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/app/_components/Icon";
import type { HabitDetail } from "../services/detail";
import type { HabitDto } from "../services/ticks";
import { addDays, localTodayString, mondayOf } from "../lib/dates";

/** Group an ISO timestamp into the browser's local calendar day. */
function localDayOf(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface RowDropdownProps {
  habit: HabitDto;
  dates: string[];
  detail: HabitDetail | null;
  onSaveQuote: (quote: string) => void;
  onRecreateTopic: () => void;
}

export function RowDropdown({ habit, dates, detail, onSaveQuote, onRecreateTopic }: RowDropdownProps) {
  if (!detail) {
    return (
      <div className="habit-dropdown">
        <p className="caption">Loading…</p>
      </div>
    );
  }

  const topicHref = `/journal/topics/${encodeURIComponent(detail.topicName)}`;
  const byDay = new Map<string, HabitDetail["entries"]>();
  for (const e of detail.entries) {
    const day = localDayOf(e.createdAt);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }

  return (
    <div className="habit-dropdown">
      {detail.topicState === "ok" && (
        <div className="habit-diamonds" aria-label="Journal logs this week">
          <span />
          {dates.map((d) => (
            <span key={d} className="habit-diamond-cell">
              {(byDay.get(d) ?? []).map((e) => (
                <Link
                  key={e.id}
                  href={`${topicHref}#entry-${e.id}`}
                  className="habit-diamond"
                  title={e.title ?? e.excerpt}
                  aria-label={`Open log: ${e.title ?? e.excerpt}`}
                >
                  <Icon name="diamond" size={14} />
                </Link>
              ))}
            </span>
          ))}
        </div>
      )}
      {detail.topicState === "archived" && (
        <p className="habit-topic-note">
          Journal topic is archived — <Link href={topicHref}>unarchive it</Link> to keep logging.
        </p>
      )}
      {detail.topicState === "missing" && (
        <p className="habit-topic-note">
          Journal topic is missing.
          <button type="button" className="btn btn-ghost" onClick={onRecreateTopic}>
            Recreate topic
          </button>
        </p>
      )}
      <div className="habit-dropdown-cols">
        <QuoteBox quote={habit.quote} onSave={onSaveQuote} />
        <MiniCalendar last30={detail.last30} createdOn={habit.createdOn} />
        <section className="habit-summary">
          <span className="overline">Summary</span>
          <p>No summary yet.</p>
          <p className="caption">Summaries will read your journal logs in a coming increment.</p>
        </section>
      </div>
    </div>
  );
}

function QuoteBox({ quote, onSave }: { quote: string | null; onSave: (q: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(quote ?? "");

  if (editing) {
    return (
      <section className="habit-quote">
        <span className="overline">Quote</span>
        <textarea
          className="habit-quote-input"
          value={draft}
          autoFocus
          rows={4}
          aria-label="Quote, goal, or tip"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onSave(draft.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              setEditing(false);
              onSave(draft.trim());
            }
            if (e.key === "Escape") {
              setDraft(quote ?? "");
              setEditing(false);
            }
          }}
        />
      </section>
    );
  }
  return (
    <section className="habit-quote">
      <span className="overline">Quote</span>
      <button
        type="button"
        className="habit-quote-view"
        onClick={() => {
          setDraft(quote ?? "");
          setEditing(true);
        }}
      >
        {quote ? <blockquote>{quote}</blockquote> : <p className="caption">Add a quote, goal, or tip.</p>}
      </button>
    </section>
  );
}

function MiniCalendar({ last30, createdOn }: { last30: HabitDetail["last30"]; createdOn: string }) {
  const today = localTodayString();
  const start = addDays(today, -29);
  const gridStart = mondayOf(start);
  const byDate = new Map(last30.map((t) => [t.date, t.status]));
  const cells: string[] = [];
  for (let d = gridStart; d <= today; d = addDays(d, 1)) cells.push(d);

  return (
    <section className="habit-minical">
      <span className="overline">Past 30 days</span>
      <div className="habit-minical-grid">
        {cells.map((d) => {
          const inWindow = d >= start && d >= createdOn;
          const status = byDate.get(d);
          const cls = !inWindow
            ? "is-blank"
            : status === "COMPLETE"
              ? "is-complete"
              : status === "PARTIAL"
                ? "is-partial"
                : "is-missed";
          return <span key={d} className={`habit-minical-dot ${cls}`} title={d} />;
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire expansion into `HabitTracker.tsx`**

Add imports:

```tsx
import type { HabitDetail } from "../services/detail";
import { Icon } from "@/app/_components/Icon";
import { RowDropdown } from "./RowDropdown";
```

Add state + handlers below `setArchived`:

```tsx
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, HabitDetail>>({});

  const detailKey = (habitId: string) => `${habitId}|${week.monday}`;

  const prefetchDetail = async (habitId: string) => {
    const key = detailKey(habitId);
    if (details[key]) return;
    try {
      const res = await fetch(`/api/systems/habits/habits/${habitId}/detail?week=${week.monday}`);
      if (!res.ok) return;
      const data: HabitDetail = await res.json();
      setDetails((d) => ({ ...d, [key]: data }));
    } catch {
      // detail loads lazily; expansion shows the loading state until a retry
    }
  };

  const saveQuote = async (habitId: string, quote: string) => {
    const res = await fetch(`/api/systems/habits/habits/${habitId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quote }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError("Could not save the quote.");
      return;
    }
    setError(null);
    setWeek((w) => {
      const habits = w.habits.map((h) => (h.id === habitId ? { ...h, quote: quote || null } : h));
      const next = { ...w, habits };
      cache.current.set(w.monday, next);
      return next;
    });
  };

  const recreateTopic = async (habitId: string) => {
    const res = await fetch(`/api/systems/habits/habits/${habitId}/recreate-topic`, {
      method: "POST",
    }).catch(() => null);
    if (!res || !res.ok) {
      setError("Could not recreate the topic.");
      return;
    }
    setError(null);
    setDetails({});
    await refresh();
  };
```

In the row markup: change the habit row container to prefetch on hover and add the expand chevron as the first element inside `.habit-name` (before the rename/menu block):

```tsx
          <div
            key={h.id}
            className="habit-row-wrap"
            onPointerEnter={() => void prefetchDetail(h.id)}
          >
            <div className="habit-grid-row" role="row">
              <span className="habit-name">
                <button
                  type="button"
                  className={`habit-expand${expandedId === h.id ? " is-open" : ""}`}
                  aria-expanded={expandedId === h.id}
                  aria-label={`Details for ${h.name}`}
                  onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}
                >
                  <Icon name="chevron-right" size={14} />
                </button>
                {/* …existing rename-input / name-text + RowMenu block unchanged… */}
              </span>
              {/* …existing 7 tick cells unchanged… */}
            </div>
            {expandedId === h.id && (
              <RowDropdown
                habit={h}
                dates={dates}
                detail={details[detailKey(h.id)] ?? null}
                onSaveQuote={(q) => void saveQuote(h.id, q)}
                onRecreateTopic={() => void recreateTopic(h.id)}
              />
            )}
          </div>
```

(The `key` moves from the grid row to the wrapper. Keep the fragment/JSX structure otherwise identical.)

- [ ] **Step 3: Append styles to the habits section of `globals.css`**

```css
/* Row dropdown */
.habit-expand {
  background: none; border: none; padding: 2px; cursor: pointer;
  color: var(--fg-faint); border-radius: var(--r-md);
  display: inline-flex; transition: transform var(--dur-fast) var(--ease-out);
}
.habit-expand:hover { background: var(--bg-hover); color: var(--fg); }
.habit-expand.is-open { transform: rotate(90deg); }

.habit-dropdown {
  border-top: 1px solid var(--border);
  padding: var(--sp-2) 0 var(--sp-4);
  animation: habit-drop var(--dur-med) var(--ease-out);
}
@keyframes habit-drop {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}

.habit-diamonds {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) repeat(7, 44px);
  align-items: center;
  min-height: 20px;
  margin-bottom: var(--sp-2);
}
.habit-diamond-cell { display: flex; justify-content: center; gap: 2px; }
.habit-diamond { color: var(--link); display: inline-flex; border-radius: var(--r-xs); }
.habit-diamond:hover { color: var(--link-hover); }

.habit-topic-note {
  font-size: var(--fs-sm); color: var(--fg-muted);
  display: flex; align-items: center; gap: var(--sp-2);
  margin: 0 0 var(--sp-2);
}

.habit-dropdown-cols {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--sp-4);
}
@media (max-width: 720px) {
  .habit-dropdown-cols { grid-template-columns: 1fr; }
}

.habit-quote-view { background: none; border: none; padding: 0; cursor: pointer; text-align: left; width: 100%; }
.habit-quote-view:hover blockquote, .habit-quote-view:hover p { background: var(--bg-hover); border-radius: var(--r-md); }
.habit-quote blockquote {
  font-family: var(--font-serif); font-style: italic; font-size: var(--fs-lg);
  color: var(--fg); margin: var(--sp-1) 0 0; padding: var(--sp-1) var(--sp-2);
  border-left: 2px solid var(--heading);
}
.habit-quote-input {
  font: inherit; width: 100%; color: var(--fg);
  background: var(--bg-sunken); border: 1px solid var(--border-strong);
  border-radius: var(--r-md); padding: var(--sp-2); resize: vertical;
}
.habit-quote-input:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--ring); }

.habit-minical-grid { display: grid; grid-template-columns: repeat(7, 14px); gap: 3px; margin-top: var(--sp-2); }
.habit-minical-dot { width: 12px; height: 12px; border-radius: var(--r-full); }
.habit-minical-dot.is-blank { background: transparent; }
.habit-minical-dot.is-missed { box-shadow: inset 0 0 0 1px var(--border-strong); }
.habit-minical-dot.is-partial { background: linear-gradient(to top, var(--success) 50%, transparent 50%); box-shadow: inset 0 0 0 1px var(--border-strong); }
.habit-minical-dot.is-complete { background: var(--success); }

.habit-summary p { margin: var(--sp-1) 0 0; font-size: var(--fs-sm); }

@media (prefers-reduced-motion: reduce) {
  .habit-dropdown { animation: none; }
  .habit-expand { transition: none; }
}
```

- [ ] **Step 4: Verify**

In the browser: expand a habit — dropdown slides open with the three sections; add a journal entry to the habit's topic (via `/journal`), reopen `/habits`, expand, and confirm a diamond sits under the day it was written, its tooltip shows the title, and clicking lands on the entry anchor in the Journal. Edit the quote in place (Enter saves, Escape cancels, renders as an italic Fraunces blockquote). Archive the topic from the Journal side and confirm the dropdown shows the archived note; point `journalTopicId` at a bogus id (prisma studio) and confirm the missing note + working Recreate topic button. Screenshot:

```bash
node shot.mjs /habits .superpowers/sdd/smoke/habits-dropdown.png
```

- [ ] **Step 5: Commit**

```bash
git add src/systems/habits/components src/app/globals.css
git commit -m "feat(habits): row dropdown with diamonds, quote, and 30-day calendar"
```

---

### Task 13: Sound engine

**Files:**
- Modify: `src/systems/habits/lib/sounds.ts` (replace the stub)
- Create: `public/sounds/README.md`

**Interfaces:**
- Consumes: the call sites wired in Task 9 (`initSounds` on first pointerdown in the card, `playSound` in `handleTick`). No component changes needed.
- Produces: the same exported API — `initSounds(): void`, `playSound(slot: SoundSlot): void`.

- [ ] **Step 1: Replace `src/systems/habits/lib/sounds.ts`**

```ts
// Low-latency tick sounds. An AudioContext is created on the first pointer
// interaction (autoplay policy), buffers decode once, playback is synchronous.
// Real files drop into public/sounds/{partial,complete,off}.ogg; until they
// exist, tiny synthesized placeholders play instead.
export type SoundSlot = "partial" | "complete" | "off";

const SLOTS: SoundSlot[] = ["partial", "complete", "off"];

let ctx: AudioContext | null = null;
const buffers = new Map<SoundSlot, AudioBuffer>();

function synth(audio: AudioContext, slot: SoundSlot): AudioBuffer {
  const sr = audio.sampleRate;
  const dur = slot === "off" ? 0.14 : slot === "complete" ? 0.09 : 0.03;
  const buf = audio.createBuffer(1, Math.ceil(sr * dur), sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t * (slot === "off" ? 30 : 90));
    if (slot === "partial") {
      data[i] = Math.sin(2 * Math.PI * 1800 * t) * env * 0.6;
    } else if (slot === "complete") {
      const f = 520 + 380 * Math.min(1, t / 0.04); // short upward blip
      data[i] = Math.sin(2 * Math.PI * f * t) * env * 0.8;
    } else {
      data[i] = (Math.random() * 2 - 1) * env * 0.35; // noise swoosh
    }
  }
  return buf;
}

export function initSounds(): void {
  if (ctx || typeof window === "undefined") return;
  ctx = new AudioContext();
  for (const slot of SLOTS) {
    void fetch(`/sounds/${slot}.ogg`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing"))))
      .then((ab) => ctx!.decodeAudioData(ab))
      .then((buf) => {
        buffers.set(slot, buf);
      })
      .catch(() => {
        buffers.set(slot, synth(ctx!, slot));
      });
  }
}

export function playSound(slot: SoundSlot): void {
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const buf = buffers.get(slot);
  if (!buf) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 0.3;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
}
```

- [ ] **Step 2: Create `public/sounds/README.md`**

```markdown
# Habit tick sounds

Drop three files here and they replace the synthesized placeholders on next load:

- `partial.ogg` — a plain click (plays on a partial tick)
- `complete.ogg` — the Switch-style click (plays on a complete tick)
- `off.ogg` — a short swoosh (plays on toggle-off)

Master format to hand over: mono WAV or FLAC, 44.1 kHz, at most 0.4 s, with
leading silence trimmed — the trim is what makes playback feel instant.
Transcode to OGG Vorbis around 48 kbps (a few KB per file); decoding happens
once at load, so compression never affects click latency.

`ffmpeg -i master.wav -ac 1 -c:a libvorbis -b:a 48k partial.ogg`
```

- [ ] **Step 3: Verify**

Browser with sound on: first click is silent-to-instant (context boots on that same pointerdown, placeholder buffers are synthesized synchronously enough for the next tick); partial click → short click; hold to complete → upward blip exactly at the fill threshold; toggling off → swoosh. Ticks still work with the tab muted (sound must never block the mutation).

- [ ] **Step 4: Commit**

```bash
git add src/systems/habits/lib/sounds.ts public/sounds/README.md
git commit -m "feat(habits): web audio tick sounds with synthesized placeholders"
```

---

### Task 14: Charts tab

**Files:**
- Modify: `src/systems/habits/lib/dates.ts` + `dates.test.ts` (add `formatDayShort`)
- Create: `src/systems/habits/services/charts.ts`
- Test: `src/systems/habits/services/charts.integration.test.ts`
- Create: `src/systems/habits/components/charts/ConsistencyTrend.tsx`
- Create: `src/systems/habits/components/charts/StreakTiles.tsx`
- Create: `src/systems/habits/components/charts/DayOfWeekHeatmap.tsx`
- Create: `src/systems/habits/components/charts/CalendarHeatmap.tsx`
- Modify: `src/app/(systems)/habits/charts/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `lib/stats` (Task 3), `lib/dates` (Task 2), recharts conventions from `src/systems/expenses/components/TrendsChart.tsx`.
- Produces: `getChartsData(): Promise<ChartsData>` with

```ts
interface ChartsData {
  weeks: Array<{ label: string; complete: number; partial: number }>;    // percentages 0–100
  streaks: Array<{ id: string; name: string; current: number; longest: number; lapses90: number }>;
  weekday: Array<{ id: string; name: string; means: number[] }>;         // 7 means, Monday first
  calendar: Array<{ date: string; intensity: number }>;                  // 91 days ending today
  hasTicks: boolean;
}
```

- [ ] **Step 1: Add `formatDayShort` to `lib/dates.ts` (TDD)**

Add to `dates.test.ts`:

```ts
  it("formats a short day label", () => {
    expect(formatDayShort("2026-07-20")).toBe("Jul 20");
  });
```

(import it too). Run `bun run test -- src/systems/habits/lib/dates.test.ts` — FAIL. Then add to `dates.ts`:

```ts
export function formatDayShort(s: string): string {
  const d = toUtcDate(s);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
```

Re-run — PASS.

- [ ] **Step 2: Write the failing charts service test**

Create `src/systems/habits/services/charts.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { addDays, todayString } from "../lib/dates";
import { createHabit } from "./habits";
import { upsertTick } from "./ticks";
import { getChartsData } from "./charts";

describe("charts service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("is empty-safe", async () => {
    const data = await getChartsData();
    expect(data.hasTicks).toBe(false);
    expect(data.weeks).toHaveLength(12);
    expect(data.calendar).toHaveLength(91);
    expect(data.streaks).toEqual([]);
  });

  it("computes streaks, weekday means, and calendar intensity", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, today, "COMPLETE");
    await upsertTick(habit.id, addDays(today, -1), "PARTIAL");

    const data = await getChartsData();
    expect(data.hasTicks).toBe(true);
    const s = data.streaks.find((x) => x.id === habit.id)!;
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
    expect(data.calendar.at(-1)).toEqual({ date: today, intensity: 1 });
    expect(data.calendar.at(-2)!.intensity).toBe(0.5);
    // this week's bar includes 1 complete + 0.5 partial credit of 7 days
    const last = data.weeks.at(-1)!;
    expect(last.complete).toBe(Math.round((1 / 7) * 100));
    expect(last.partial).toBe(Math.round((0.5 / 7) * 100));
  });
});
```

Run: `bun run test:integration -- src/systems/habits/services/charts.integration.test.ts` — FAIL (no `./charts`).

- [ ] **Step 3: Implement `src/systems/habits/services/charts.ts`**

```ts
import { prisma } from "@/platform/db/client";
import { addDays, formatDayShort, mondayOf, toDateString, toUtcDate, todayString } from "../lib/dates";
import {
  countLapses, creditOf, currentStreak, dayOfWeekMeans, isEligibleWeek,
  longestStreak, type TickStatus,
} from "../lib/stats";

export interface ChartsData {
  weeks: Array<{ label: string; complete: number; partial: number }>;
  streaks: Array<{ id: string; name: string; current: number; longest: number; lapses90: number }>;
  weekday: Array<{ id: string; name: string; means: number[] }>;
  calendar: Array<{ date: string; intensity: number }>;
  hasTicks: boolean;
}

const maxDate = (a: string, b: string): string => (a > b ? a : b);

export async function getChartsData(): Promise<ChartsData> {
  const today = todayString();
  const thisMonday = mondayOf(today);
  const firstMonday = addDays(thisMonday, -77); // 12 weeks including the current one
  const calStart = addDays(today, -90);         // 91 calendar days
  const windowStart = calStart < firstMonday ? calStart : firstMonday;

  const [habits, ticks] = await Promise.all([
    prisma.habit.findMany(), // archived habits still count for the weeks they lived
    prisma.habitTick.findMany({ where: { date: { gte: toUtcDate(windowStart) } } }),
  ]);

  const byHabit = new Map<string, Map<string, TickStatus>>();
  for (const t of ticks) {
    const m = byHabit.get(t.habitId) ?? new Map<string, TickStatus>();
    m.set(toDateString(t.date), t.status);
    byHabit.set(t.habitId, m);
  }
  const windows = habits.map((h) => ({
    id: h.id,
    name: h.name,
    archived: h.archived,
    createdOn: toDateString(h.createdAt),
    archivedOn: h.archivedAt ? toDateString(h.archivedAt) : null,
    ticks: byHabit.get(h.id) ?? new Map<string, TickStatus>(),
  }));

  const weeks: ChartsData["weeks"] = [];
  for (let m = firstMonday; m <= thisMonday; m = addDays(m, 7)) {
    const eligible = windows.filter((h) => isEligibleWeek(h.createdOn, h.archivedOn, m));
    let complete = 0;
    let partial = 0;
    for (const h of eligible) {
      for (let d = m; d <= addDays(m, 6); d = addDays(d, 1)) {
        const s = h.ticks.get(d);
        if (s === "COMPLETE") complete += 1;
        else if (s === "PARTIAL") partial += 0.5;
      }
    }
    const denom = 7 * eligible.length;
    weeks.push({
      label: formatDayShort(m),
      complete: denom ? Math.round((complete / denom) * 100) : 0,
      partial: denom ? Math.round((partial / denom) * 100) : 0,
    });
  }

  const active = windows.filter((h) => !h.archived);
  const streaks = active.map((h) => ({
    id: h.id,
    name: h.name,
    current: currentStreak(h.ticks, today),
    longest: longestStreak(h.ticks),
    lapses90: countLapses(
      h.ticks, maxDate(addDays(today, -89), h.createdOn), addDays(today, -1)
    ),
  }));

  const weekday = active.map((h) => ({
    id: h.id,
    name: h.name,
    means: dayOfWeekMeans(h.ticks, maxDate(addDays(today, -89), h.createdOn), today),
  }));

  const calendar: ChartsData["calendar"] = [];
  for (let d = calStart; d <= today; d = addDays(d, 1)) {
    const existing = windows.filter(
      (h) => h.createdOn <= d && (h.archivedOn === null || h.archivedOn >= d)
    );
    const sum = existing.reduce((acc, h) => acc + creditOf(h.ticks.get(d)), 0);
    calendar.push({ date: d, intensity: existing.length ? sum / existing.length : 0 });
  }

  return { weeks, streaks, weekday, calendar, hasTicks: ticks.length > 0 };
}
```

Run the test again — PASS (2 tests).

- [ ] **Step 4: Create the chart components**

`src/systems/habits/components/charts/ConsistencyTrend.tsx` (client — recharts):

```tsx
"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const TICK_STYLE = {
  fill: "var(--fg-faint)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

export function ConsistencyTrend({
  weeks,
}: {
  weeks: Array<{ label: string; complete: number; partial: number }>;
}) {
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weeks} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tick={TICK_STYLE} />
          <YAxis
            tickLine={false} axisLine={false} width={40} tick={TICK_STYLE}
            domain={[0, 100]} tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            formatter={(v: number, name: string) => [`${v}%`, name]}
            cursor={{ fill: "var(--bg-sunken)" }}
            contentStyle={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              fontSize: "var(--fs-sm)",
              fontFamily: "var(--font-sans)",
              boxShadow: "var(--shadow-md)",
            }}
            labelStyle={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}
          />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: "var(--fs-sm)" }} />
          <Bar dataKey="complete" name="Complete" stackId="a" fill="var(--chart-4)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="partial" name="Partial" stackId="a" fill="var(--chart-5)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

`src/systems/habits/components/charts/StreakTiles.tsx` (server component — no interactivity):

```tsx
export function StreakTiles({
  streaks,
}: {
  streaks: Array<{ id: string; name: string; current: number; longest: number; lapses90: number }>;
}) {
  return (
    <div className="habit-streak-tiles">
      {streaks.map((s) => (
        <div key={s.id} className="paper-card habit-streak-tile">
          <span className="overline">{s.name}</span>
          <p className="habit-streak-current">{s.current}</p>
          <p className="caption">
            day streak · longest {s.longest} · {s.lapses90} {s.lapses90 === 1 ? "lapse" : "lapses"} in 90 days
          </p>
        </div>
      ))}
    </div>
  );
}
```

`src/systems/habits/components/charts/DayOfWeekHeatmap.tsx` (server component):

```tsx
import { Fragment } from "react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function cellColor(mean: number): string {
  const step = Math.round(mean * 4) / 4; // 5-step intensity
  return `color-mix(in oklab, var(--success) ${Math.round(step * 100)}%, var(--paper-2))`;
}

export function DayOfWeekHeatmap({
  weekday,
}: {
  weekday: Array<{ id: string; name: string; means: number[] }>;
}) {
  return (
    <div className="habit-dow-heatmap">
      <span />
      {DAY_LABELS.map((d) => (
        <span key={d} className="habit-dow-label">{d}</span>
      ))}
      {weekday.map((h) => (
        <Fragment key={h.id}>
          <span className="habit-dow-name">{h.name}</span>
          {h.means.map((mean, i) => (
            <span
              key={i}
              className="habit-dow-cell"
              style={{ background: cellColor(mean) }}
              title={`${h.name}, ${DAY_LABELS[i]}: ${Math.round(mean * 100)}%`}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
```

`src/systems/habits/components/charts/CalendarHeatmap.tsx` (server component):

```tsx
import { toUtcDate } from "../../lib/dates";

function cellColor(intensity: number): string {
  const step = Math.round(intensity * 4) / 4;
  return `color-mix(in oklab, var(--success) ${Math.round(step * 100)}%, var(--paper-2))`;
}

export function CalendarHeatmap({
  calendar,
}: {
  calendar: Array<{ date: string; intensity: number }>;
}) {
  if (calendar.length === 0) return null;
  // Pad so the first column starts on a Monday (grid flows column-first, 7 rows).
  const pad = (toUtcDate(calendar[0].date).getUTCDay() + 6) % 7;
  return (
    <div className="habit-cal-heatmap">
      {Array.from({ length: pad }, (_, i) => (
        <span key={`pad${i}`} className="habit-cal-cell is-blank" />
      ))}
      {calendar.map((c) => (
        <span
          key={c.date}
          className="habit-cal-cell"
          style={{ background: cellColor(c.intensity) }}
          title={`${c.date}: ${Math.round(c.intensity * 100)}%`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Fill in `src/app/(systems)/habits/charts/page.tsx`**

```tsx
import { getChartsData } from "@/systems/habits/services/charts";
import { ConsistencyTrend } from "@/systems/habits/components/charts/ConsistencyTrend";
import { StreakTiles } from "@/systems/habits/components/charts/StreakTiles";
import { DayOfWeekHeatmap } from "@/systems/habits/components/charts/DayOfWeekHeatmap";
import { CalendarHeatmap } from "@/systems/habits/components/charts/CalendarHeatmap";

export default async function HabitsChartsPage() {
  const data = await getChartsData();

  if (!data.hasTicks) {
    return (
      <article className="doc">
        <h1>Charts</h1>
        <p className="lead">Nothing to chart yet.</p>
        <p className="caption">Tick a few days on the tracker first.</p>
      </article>
    );
  }

  return (
    <article className="doc">
      <h1>Charts</h1>

      <section className="habit-chart-block">
        <h2>Consistency</h2>
        <p className="caption">Weekly completion — repetition consistency is what builds automaticity.</p>
        <ConsistencyTrend weeks={data.weeks} />
      </section>

      <section className="habit-chart-block">
        <h2>Streaks and recovery</h2>
        <p className="caption">One missed day doesn't break a habit — two in a row is the signal.</p>
        <StreakTiles streaks={data.streaks} />
      </section>

      <section className="habit-chart-block">
        <h2>Day-of-week patterns</h2>
        <p className="caption">Habits are context-cued — weak days point at missing cues, not weak will.</p>
        <DayOfWeekHeatmap weekday={data.weekday} />
      </section>

      <section className="habit-chart-block">
        <h2>Past 90 days</h2>
        <CalendarHeatmap calendar={data.calendar} />
      </section>
    </article>
  );
}
```

- [ ] **Step 6: Append chart styles to the habits section of `globals.css`**

```css
/* Charts tab */
.habit-chart-block { margin-top: var(--sp-8); }
.habit-chart-block .caption { margin-bottom: var(--sp-3); }

.habit-streak-tiles {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--sp-3);
}
.habit-streak-tile { padding: var(--sp-3); }
.habit-streak-current {
  font-family: var(--font-mono); font-size: var(--fs-2xl); font-weight: 600;
  margin: var(--sp-1) 0 0;
}

.habit-dow-heatmap {
  display: grid; grid-template-columns: minmax(120px, max-content) repeat(7, 32px);
  gap: 3px; align-items: center;
}
.habit-dow-label, .habit-dow-name { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--fg-faint); }
.habit-dow-label { text-align: center; }
.habit-dow-name { color: var(--fg); padding-right: var(--sp-2); }
.habit-dow-cell { height: 24px; border-radius: var(--r-xs); }

.habit-cal-heatmap {
  display: grid; grid-template-rows: repeat(7, 12px);
  grid-auto-flow: column; grid-auto-columns: 12px; gap: 3px;
}
.habit-cal-cell { border-radius: var(--r-xs); }
.habit-cal-cell.is-blank { background: transparent; }
```

(If `--fs-2xl` doesn't exist in `globals.css`, use the largest `--fs-*` token that does — check the token list; do not invent a raw size.)

- [ ] **Step 7: Verify**

`bun run test && bun run test:integration` — all green. Browser: `/habits/charts` shows the four modules against real ticks; empty DB shows the empty state.

```bash
node shot.mjs /habits/charts .superpowers/sdd/smoke/habits-charts.png
```

- [ ] **Step 8: Commit**

```bash
git add src/systems/habits "src/app/(systems)/habits/charts/page.tsx" src/app/globals.css
git commit -m "feat(habits): charts tab with consistency, streaks, and heatmaps"
```

---

### Task 15: Dashboard widget, palette, env, and final sweep

**Files:**
- Create: `src/systems/habits/dashboard.tsx`
- Modify: `src/systems/dashboards.ts`
- Modify: `src/systems/habits/palette.ts` (replace the Task 7 placeholder)
- Modify: `.env` and `.env.example` (if present) — add `POLARIS_TZ`

**Interfaces:**
- Consumes: `SystemDashboard` type; `PaletteLayer` type; the journal dashboard (`src/systems/journal/dashboard.tsx`) as the pattern.
- Produces: habits on the day-start dashboard and in the command palette.

- [ ] **Step 1: Create `src/systems/habits/dashboard.tsx`**

```tsx
import { cache } from "react";
import Link from "next/link";
import { prisma } from "@/platform/db/client";
import type { SystemDashboard } from "../types";
import { todayString, toUtcDate } from "./lib/dates";

const load = cache(async () => {
  const today = todayString();
  const [habits, ticks] = await Promise.all([
    prisma.habit.findMany({ where: { archived: false }, orderBy: { position: "asc" } }),
    prisma.habitTick.findMany({ where: { date: toUtcDate(today) } }),
  ]);
  return { habits, tickedIds: new Set(ticks.map((t) => t.habitId)) };
});

async function summary(): Promise<string | null> {
  const { habits, tickedIds } = await load();
  if (habits.length === 0) return null;
  return `${tickedIds.size} of ${habits.length} habits ticked today`;
}

async function Widget() {
  const { habits, tickedIds } = await load();
  const open = habits.filter((h) => !tickedIds.has(h.id));
  return (
    <section className="paper-card dash-card">
      <span className="overline">Habits</span>
      <p className="dash-card-stat">
        {habits.length === 0
          ? "No habits yet"
          : `${tickedIds.size} of ${habits.length} ticked today`}
      </p>
      {habits.length > 0 && (
        <p className="dash-card-detail">
          {open.length === 0
            ? "All ticked for today."
            : `Still open: ${open.map((h) => h.name).join(", ")}`}
        </p>
      )}
      <div className="dash-card-actions">
        <Link className="btn btn-secondary" href="/habits">
          Open tracker
        </Link>
      </div>
    </section>
  );
}

export const dashboard: SystemDashboard = { name: "habits", summary, Widget };
```

- [ ] **Step 2: Register in `src/systems/dashboards.ts`**

Open the file — it imports each system's `dashboard` and exports them in an array (same shape as `src/systems/index.ts`). Append the habits equivalent:

```ts
import { dashboard as habitsDashboard } from "./habits/dashboard";
```

and add `habitsDashboard` to the exported array, after the expenses entry.

- [ ] **Step 3: Replace `src/systems/habits/palette.ts`**

```ts
import type { PaletteLayer } from "@/platform/palette/types";
import { prisma } from "@/platform/db/client";

export const habitsLayer: PaletteLayer = {
  name: "habits",
  singular: "habit",
  search: async (query) => {
    const trimmed = query.trim();
    const habits = await prisma.habit.findMany({
      where: {
        archived: false,
        ...(trimmed ? { name: { contains: trimmed, mode: "insensitive" as const } } : {}),
      },
      take: 10,
      orderBy: { position: "asc" },
    });
    const items = habits.map((h) => ({
      id: h.id,
      label: h.name,
      icon: "repeat" as const,
      href: "/habits",
      drillable: false,
    }));
    if (!trimmed) {
      items.unshift({
        id: "add-habit",
        label: "Add habit",
        icon: "plus" as const,
        href: "/habits?new=1",
        drillable: false,
      });
    }
    return items;
  },
};
```

(Check `PaletteLayer`'s item type in `@/platform/palette/types` — if `icon` is a narrower union, this compiles only because `repeat`/`plus` are in `Icon.tsx`; adjust if the type disagrees.)

- [ ] **Step 4: Document the timezone anchor**

Add to `.env` (and `.env.example` if the repo has one):

```
# Local calendar day for server-side "today" (habits system). IANA name.
POLARIS_TZ="Asia/Manila"
```

Restart the dev server after editing `.env`.

- [ ] **Step 5: Final verification sweep**

```bash
bunx tsc --noEmit          # clean
bun run lint               # clean
bun run test               # all unit tests pass
bun run test:integration   # all integration tests pass
bun run build              # production build succeeds
```

Browser pass (dev server):
- `/dashboard` shows the Habits card with the correct today counts and the daily summary line.
- Command palette: typing a habit name surfaces it; empty query shows "Add habit".
- `/habits` full interaction loop: add → tick (click, hold, off, sounds) → navigate weeks → expand dropdown → quote → diamonds → archive/unarchive.
- `/habits/charts` renders all four modules.
- Dark mode spot-check (`prefers-color-scheme: dark` or the app's theme toggle): tick circles, heatmaps, and popover all readable — they use tokens, so this is a check, not a fix.

Final screenshots for the record:

```bash
node shot.mjs /habits .superpowers/sdd/smoke/habits-final-tracker.png
node shot.mjs /habits/charts .superpowers/sdd/smoke/habits-final-charts.png
node shot.mjs /dashboard .superpowers/sdd/smoke/habits-final-dashboard.png
```

- [ ] **Step 6: Commit**

```bash
git add src/systems/habits src/systems/dashboards.ts
git add .env.example 2>/dev/null || true   # only if the repo has one
git commit -m "feat(habits): dashboard widget, palette layer, and timezone anchor"
```

(`.env` itself is gitignored — never commit it.)

---

## Spec coverage map

| Spec section | Tasks |
|---|---|
| Data model, date discipline, POLARIS_TZ | 1, 2, 15 |
| API surface | 5, 6, 7 |
| Tracker grid, tick states/semantics, optimistic updates | 9 |
| Week header, month popover, cache/prefetch | 10 |
| Add/rename/reorder/archive + archived disclosure | 4, 11 |
| Dropdown: diamonds, quote, 30-day calendar, AI placeholder, degraded topic states | 6, 12 |
| Journal topic sync + failure handling | 4, 7, 11, 12 |
| Sounds | 13 |
| Animation (tokens, reduced-motion) | 9, 10, 12 |
| Charts (4 modules, credit math) | 3, 14 |
| Dashboard widget + palette | 15 |
| Testing (unit + integration) | 2, 3, 4, 5, 6, 7, 14 |
| Out of scope (AI wiring, real sound files, drag reorder, schedules) | — deliberately absent |




