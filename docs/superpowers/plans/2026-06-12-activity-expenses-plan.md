# Activity Expenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Activity Expenses system — in-store expense capture with a running total, Enter-driven item entry, optimistic offline-tolerant sync, and Recharts trends by activity type.

**Architecture:** A Polaris system module (`src/systems/expenses/`) following the journal blueprint: Prisma models → pure services → Zod-validated route handlers mounted via the system manifest → server-component pages under `src/app/(systems)/expenses/` with thin client components. Money is always integer centavos. Item ids are client-generated so sync retries are idempotent.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 (Postgres), Zod 4, Vitest 4, Recharts 2.15.x. Package manager is **bun** (`bun.lock`).

**Spec:** `docs/superpowers/specs/2026-06-12-activity-expenses-design.md`

**Conventions to honor (verified against the codebase):**
- Route handlers: `RouteHandler = (req: NextRequest, params: Record<string, string>) => Promise<NextResponse>`, registered on the manifest as `"METHOD /path"` strings. `matchRoute` supports multiple `:params`.
- Pages: `params`/`searchParams` are **Promises** — always `await params`.
- Client components call `/api/systems/expenses/...` with fetch, then `router.refresh()`.
- Design system: tokens only, sentence case, no emoji, mono for numbers/timestamps, Lucide icons via `Icon.tsx`. Error copy names failure + recovery, never apologizes.
- Tests: unit in `*.test.ts` (node env), integration in `*.integration.test.ts` (needs `DATABASE_URL_TEST`). Run with `bun run test` / `bun run test:integration`.

---

### Task 1: Prisma models, migration, seed, test helper

**Files:**
- Modify: `prisma/schema.prisma` (append after the journal models)
- Create: `prisma/migrations/<generated>_expenses_init/migration.sql` (generated, then seed appended)
- Modify: `src/test/db.ts`

- [ ] **Step 1: Append models to `prisma/schema.prisma`**

```prisma
model ExpenseActivityType {
  id         String    @id @default(cuid())
  name       String    @unique
  position   Int       @default(0)
  archived   Boolean   @default(false)
  archivedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  activities ExpenseActivity[]

  @@index([archived])
  @@map("expense_activity_types")
}

model ExpenseActivity {
  id        String   @id @default(cuid())
  typeId    String
  type      ExpenseActivityType @relation(fields: [typeId], references: [id])
  title     String?
  startedAt DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  items     ExpenseItem[]

  @@index([typeId])
  @@index([startedAt(sort: Desc)])
  @@map("expense_activities")
}

model ExpenseItem {
  id             String   @id
  activityId     String
  activity       ExpenseActivity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  name           String
  amountCentavos Int
  position       Int
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([activityId])
  @@map("expense_items")
}
```

Note: `ExpenseItem.id` has **no `@default`** — ids are client-generated (`crypto.randomUUID()`), which is what makes sync retries idempotent.

- [ ] **Step 2: Create the migration without applying it**

Run: `bunx prisma migrate dev --name expenses_init --create-only`
Expected: a new folder `prisma/migrations/<timestamp>_expenses_init/` containing `migration.sql` with the three `CREATE TABLE` statements. (Requires the dev DB: `docker compose -f docker/docker-compose.yml up -d` if not running.)

- [ ] **Step 3: Append the type seed to the generated `migration.sql`**

```sql
-- Seed the starter activity types (fixed-but-adjustable list per the spec).
INSERT INTO "expense_activity_types" ("id", "name", "position", "updatedAt") VALUES
  ('seed-groceries',  'Groceries',  0, CURRENT_TIMESTAMP),
  ('seed-dining-out', 'Dining out', 1, CURRENT_TIMESTAMP),
  ('seed-night-out',  'Night out',  2, CURRENT_TIMESTAMP),
  ('seed-shopping',   'Shopping',   3, CURRENT_TIMESTAMP),
  ('seed-transport',  'Transport',  4, CURRENT_TIMESTAMP),
  ('seed-errands',    'Errands',    5, CURRENT_TIMESTAMP);
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `bunx prisma migrate dev`
Expected: migration applied, `prisma generate` runs, `ExpenseActivityType` etc. appear in `src/generated/prisma/`.

- [ ] **Step 5: Add the test-table helper to `src/test/db.ts`**

```ts
export async function withCleanExpenseTables(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "expense_items", "expense_activities", "expense_activity_types" RESTART IDENTITY CASCADE'
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `bunx tsc --noEmit` (or `bun run lint` if tsc isn't a script)
Expected: no new errors.

```bash
git add prisma/ src/test/db.ts src/generated
git commit -m "feat(expenses): add expense tables, seed starter types"
```
(If `src/generated` is gitignored, commit without it.)

---

### Task 2: Money helpers (TDD)

**Files:**
- Create: `src/systems/expenses/lib/money.ts`
- Test: `src/systems/expenses/lib/money.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { formatCentavos, parsePesoInput } from "./money";

describe("parsePesoInput", () => {
  it("parses whole pesos", () => expect(parsePesoInput("123")).toBe(12300));
  it("parses one decimal", () => expect(parsePesoInput("12.5")).toBe(1250));
  it("parses two decimals", () => expect(parsePesoInput("12.34")).toBe(1234));
  it("strips commas", () => expect(parsePesoInput("1,234.50")).toBe(123450));
  it("trims whitespace", () => expect(parsePesoInput(" 99 ")).toBe(9900));
  it("accepts zero", () => expect(parsePesoInput("0")).toBe(0));
  it("rejects three decimals", () => expect(parsePesoInput("12.345")).toBeNull());
  it("rejects empty", () => expect(parsePesoInput("")).toBeNull());
  it("rejects non-numeric", () => expect(parsePesoInput("abc")).toBeNull());
  it("rejects bare dot-fraction", () => expect(parsePesoInput(".5")).toBeNull());
  it("rejects negatives", () => expect(parsePesoInput("-5")).toBeNull());
});

describe("formatCentavos", () => {
  it("formats with peso sign and two decimals", () =>
    expect(formatCentavos(123450)).toBe("₱1,234.50"));
  it("formats zero", () => expect(formatCentavos(0)).toBe("₱0.00"));
  it("formats sub-peso amounts", () => expect(formatCentavos(5)).toBe("₱0.05"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/systems/expenses/lib/money.test.ts`
Expected: FAIL — cannot resolve `./money`.

- [ ] **Step 3: Implement**

```ts
/** Parse user price input ("123", "12.5", "1,234.50") to integer centavos.
 *  Returns null for anything that isn't a non-negative peso amount with at
 *  most two decimals. Money is never a float anywhere in this system. */
export function parsePesoInput(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return parseInt(whole, 10) * 100 + (frac ? parseInt(frac.padEnd(2, "0"), 10) : 0);
}

export function formatCentavos(centavos: number): string {
  return (
    "₱" +
    (centavos / 100).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/systems/expenses/lib/money.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/expenses/lib/money.ts src/systems/expenses/lib/money.test.ts
git commit -m "feat(expenses): add centavo money helpers"
```

---

### Task 3: Month bucketing helpers (TDD)

**Files:**
- Create: `src/systems/expenses/lib/months.ts`
- Test: `src/systems/expenses/lib/months.test.ts`

Polaris is single-user in Manila; all month bucketing happens in `Asia/Manila` (UTC+8, no DST).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { lastNMonthKeys, manilaMonthKey } from "./months";

describe("manilaMonthKey", () => {
  it("formats YYYY-MM in Manila time", () => {
    expect(manilaMonthKey(new Date("2026-06-12T03:00:00Z"))).toBe("2026-06");
  });
  it("rolls into the next month across the UTC boundary", () => {
    // 2026-05-31 17:00 UTC is 2026-06-01 01:00 in Manila
    expect(manilaMonthKey(new Date("2026-05-31T17:00:00Z"))).toBe("2026-06");
  });
});

describe("lastNMonthKeys", () => {
  const now = new Date("2026-06-12T03:00:00Z");
  it("returns n buckets ending at the current Manila month", () => {
    const keys = lastNMonthKeys(3, now);
    expect(keys.map((k) => k.key)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(keys.map((k) => k.label)).toEqual(["Apr", "May", "Jun"]);
  });
  it("wraps across a year boundary", () => {
    const keys = lastNMonthKeys(6, new Date("2026-02-10T03:00:00Z"));
    expect(keys[0].key).toBe("2025-09");
    expect(keys[5].key).toBe("2026-02");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/systems/expenses/lib/months.test.ts`
Expected: FAIL — cannot resolve `./months`.

- [ ] **Step 3: Implement**

```ts
/** All month bucketing is done in Asia/Manila (single-user system; UTC+8, no DST). */
export const MANILA_TZ = "Asia/Manila";

export interface MonthBucket {
  key: string; // "2026-06"
  label: string; // "Jun"
}

const KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "2-digit",
});

export function manilaMonthKey(d: Date): string {
  return KEY_FORMAT.format(d); // en-CA yields "YYYY-MM"
}

export function lastNMonthKeys(n: number, now: Date): MonthBucket[] {
  const [year, month] = manilaMonthKey(now).split("-").map(Number);
  const out: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    out.push({ key, label });
  }
  return out;
}

/** Start of the given "YYYY-MM" bucket as an absolute instant (Manila is UTC+8). */
export function manilaMonthStart(key: string): Date {
  return new Date(`${key}-01T00:00:00+08:00`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/systems/expenses/lib/months.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/expenses/lib/months.ts src/systems/expenses/lib/months.test.ts
git commit -m "feat(expenses): add Manila month bucketing helpers"
```

---

### Task 4: Zod schemas

**Files:**
- Create: `src/systems/expenses/schemas/expenses.ts`

(Validated through route integration tests in Task 8 — no separate unit tests.)

- [ ] **Step 1: Write the schemas**

```ts
import { z } from "zod";

export const createTypeSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export const updateTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    archived: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" });

export const listTypesQuerySchema = z.object({
  archived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export const createActivitySchema = z.object({
  typeId: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
});

export const updateActivitySchema = z
  .object({
    title: z.string().trim().max(120).nullable().optional(),
    typeId: z.string().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" });

export const listActivitiesQuerySchema = z.object({
  typeId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 50;
      return Number.isNaN(n) ? 50 : Math.min(Math.max(n, 1), 100);
    }),
});

export const putItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amountCentavos: z.number().int().min(0).max(100_000_000),
  position: z.number().int().min(0),
});

export const trendsQuerySchema = z.object({
  months: z
    .enum(["3", "6", "12"])
    .optional()
    .transform((v) => (v ? (Number(v) as 3 | 6 | 12) : 6)),
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: clean.

```bash
git add src/systems/expenses/schemas/expenses.ts
git commit -m "feat(expenses): add request schemas"
```

---

### Task 5: Type and activity services (TDD, integration)

**Files:**
- Create: `src/systems/expenses/services/types.ts`
- Create: `src/systems/expenses/services/activities.ts`
- Test: `src/systems/expenses/services/expenses.integration.test.ts`

- [ ] **Step 1: Write the failing integration tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { requireTestDatabase, withCleanExpenseTables } from "@/test/db";
import { createType, listTypes, updateType } from "./types";
import {
  deleteActivity,
  getActivityWithItems,
  listActivities,
  startActivity,
  updateActivity,
} from "./activities";
import { prisma } from "@/platform/db/client";

requireTestDatabase();

beforeEach(withCleanExpenseTables);

describe("types service", () => {
  it("creates types with incrementing position", async () => {
    const a = await createType("Groceries");
    const b = await createType("Dining out");
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  it("lists non-archived by position, includes archived on request", async () => {
    const a = await createType("Groceries");
    await createType("Dining out");
    await updateType(a.id, { archived: true });
    const visible = await listTypes({});
    expect(visible.map((t) => t.name)).toEqual(["Dining out"]);
    const all = await listTypes({ includeArchived: true });
    expect(all).toHaveLength(2);
  });

  it("archive sets archivedAt; unarchive clears it", async () => {
    const t = await createType("Errands");
    const archived = await updateType(t.id, { archived: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    const restored = await updateType(t.id, { archived: false });
    expect(restored.archivedAt).toBeNull();
  });
});

describe("activities service", () => {
  it("starts an activity and reads it back with its type", async () => {
    const t = await createType("Groceries");
    const a = await startActivity({ typeId: t.id, title: "SM North run" });
    const fetched = await getActivityWithItems(a.id);
    expect(fetched?.title).toBe("SM North run");
    expect(fetched?.type.name).toBe("Groceries");
    expect(fetched?.items).toEqual([]);
  });

  it("lists with item counts and centavo totals, newest first", async () => {
    const t = await createType("Groceries");
    const a = await startActivity({ typeId: t.id });
    await prisma.expenseItem.createMany({
      data: [
        { id: "i1", activityId: a.id, name: "Eggs", amountCentavos: 21500, position: 0 },
        { id: "i2", activityId: a.id, name: "Milk", amountCentavos: 9800, position: 1 },
      ],
    });
    const { activities } = await listActivities({ limit: 10 });
    expect(activities).toHaveLength(1);
    expect(activities[0].itemCount).toBe(2);
    expect(activities[0].totalCentavos).toBe(31300);
    expect(activities[0].typeName).toBe("Groceries");
  });

  it("paginates with a cursor", async () => {
    const t = await createType("Groceries");
    for (let i = 0; i < 3; i++) await startActivity({ typeId: t.id });
    const page1 = await listActivities({ limit: 2 });
    expect(page1.activities).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await listActivities({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.activities).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("updates title and deletes with item cascade", async () => {
    const t = await createType("Groceries");
    const a = await startActivity({ typeId: t.id });
    await updateActivity(a.id, { title: "Weekly run" });
    expect((await getActivityWithItems(a.id))?.title).toBe("Weekly run");
    await prisma.expenseItem.create({
      data: { id: "i1", activityId: a.id, name: "Eggs", amountCentavos: 100, position: 0 },
    });
    await deleteActivity(a.id);
    expect(await getActivityWithItems(a.id)).toBeNull();
    expect(await prisma.expenseItem.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:integration src/systems/expenses/services/expenses.integration.test.ts`
Expected: FAIL — cannot resolve `./types` / `./activities`. (Requires `DATABASE_URL_TEST`; see `vitest.integration.config.ts`.)

- [ ] **Step 3: Implement `services/types.ts`**

```ts
import { prisma } from "@/platform/db/client";
import type { ExpenseActivityType } from "@/generated/prisma/client";

export async function createType(name: string): Promise<ExpenseActivityType> {
  const max = await prisma.expenseActivityType.aggregate({ _max: { position: true } });
  return prisma.expenseActivityType.create({
    data: { name, position: (max._max.position ?? -1) + 1 },
  });
}

export async function listTypes(opts: {
  includeArchived?: boolean;
}): Promise<ExpenseActivityType[]> {
  return prisma.expenseActivityType.findMany({
    where: opts.includeArchived ? {} : { archived: false },
    orderBy: { position: "asc" },
  });
}

export async function getTypeById(id: string): Promise<ExpenseActivityType | null> {
  return prisma.expenseActivityType.findUnique({ where: { id } });
}

export interface UpdateTypeInput {
  name?: string;
  archived?: boolean;
  position?: number;
}

export async function updateType(
  id: string,
  input: UpdateTypeInput
): Promise<ExpenseActivityType> {
  return prisma.expenseActivityType.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.archived !== undefined
        ? { archived: input.archived, archivedAt: input.archived ? new Date() : null }
        : {}),
    },
  });
}
```

- [ ] **Step 4: Implement `services/activities.ts`**

```ts
import { prisma } from "@/platform/db/client";
import { feedback } from "@/platform/feedback";
import type { Prisma } from "@/generated/prisma/client";

export type ActivityWithDetails = Prisma.ExpenseActivityGetPayload<{
  include: { type: true; items: true };
}>;

export interface ActivitySummary {
  id: string;
  typeId: string;
  typeName: string;
  title: string | null;
  startedAt: Date;
  itemCount: number;
  totalCentavos: number;
}

export async function startActivity(input: { typeId: string; title?: string }) {
  const activity = await prisma.expenseActivity.create({
    data: { typeId: input.typeId, title: input.title ?? null },
    include: { type: true },
  });
  await feedback.recordMetric("expenses", "activity_started", 1);
  return activity;
}

export async function listActivities(opts: {
  typeId?: string;
  cursor?: string;
  limit: number;
}): Promise<{ activities: ActivitySummary[]; nextCursor: string | null }> {
  const rows = await prisma.expenseActivity.findMany({
    where: opts.typeId ? { typeId: opts.typeId } : {},
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { type: true, items: { select: { amountCentavos: true } } },
  });
  const page = rows.slice(0, opts.limit);
  return {
    activities: page.map((a) => ({
      id: a.id,
      typeId: a.typeId,
      typeName: a.type.name,
      title: a.title,
      startedAt: a.startedAt,
      itemCount: a.items.length,
      totalCentavos: a.items.reduce((sum, i) => sum + i.amountCentavos, 0),
    })),
    nextCursor: rows.length > opts.limit ? page[page.length - 1].id : null,
  };
}

export async function getActivityWithItems(id: string): Promise<ActivityWithDetails | null> {
  return prisma.expenseActivity.findUnique({
    where: { id },
    include: { type: true, items: { orderBy: { position: "asc" } } },
  });
}

export async function updateActivity(
  id: string,
  input: { title?: string | null; typeId?: string }
) {
  return prisma.expenseActivity.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title || null } : {}),
      ...(input.typeId !== undefined ? { typeId: input.typeId } : {}),
    },
    include: { type: true },
  });
}

export async function deleteActivity(id: string): Promise<void> {
  await prisma.expenseActivity.delete({ where: { id } });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test:integration src/systems/expenses/services/expenses.integration.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/systems/expenses/services/ src/systems/expenses/services/expenses.integration.test.ts
git commit -m "feat(expenses): add type and activity services"
```

---

### Task 6: Item service with idempotent upsert (TDD, integration)

**Files:**
- Create: `src/systems/expenses/services/items.ts`
- Test: `src/systems/expenses/services/items.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { requireTestDatabase, withCleanExpenseTables } from "@/test/db";
import { createType } from "./types";
import { startActivity } from "./activities";
import { ItemConflictError, deleteItem, upsertItem } from "./items";
import { prisma } from "@/platform/db/client";

requireTestDatabase();

beforeEach(withCleanExpenseTables);

async function fixture() {
  const t = await createType("Groceries");
  return startActivity({ typeId: t.id });
}

describe("upsertItem", () => {
  it("creates an item with a client id", async () => {
    const a = await fixture();
    const item = await upsertItem(a.id, "client-id-1", {
      name: "Eggs",
      amountCentavos: 21500,
      position: 0,
    });
    expect(item.id).toBe("client-id-1");
    expect(item.amountCentavos).toBe(21500);
  });

  it("is idempotent — the same PUT twice does not duplicate", async () => {
    const a = await fixture();
    const body = { name: "Eggs", amountCentavos: 21500, position: 0 };
    await upsertItem(a.id, "client-id-1", body);
    await upsertItem(a.id, "client-id-1", body);
    expect(await prisma.expenseItem.count()).toBe(1);
  });

  it("updates name and amount on replay with new values", async () => {
    const a = await fixture();
    await upsertItem(a.id, "client-id-1", { name: "Eggs", amountCentavos: 21500, position: 0 });
    const updated = await upsertItem(a.id, "client-id-1", {
      name: "Eggs (dozen)",
      amountCentavos: 22000,
      position: 0,
    });
    expect(updated.name).toBe("Eggs (dozen)");
    expect(updated.amountCentavos).toBe(22000);
  });

  it("rejects an id that belongs to a different activity", async () => {
    const a = await fixture();
    const b = await fixture();
    await upsertItem(a.id, "client-id-1", { name: "Eggs", amountCentavos: 100, position: 0 });
    await expect(
      upsertItem(b.id, "client-id-1", { name: "Eggs", amountCentavos: 100, position: 0 })
    ).rejects.toBeInstanceOf(ItemConflictError);
  });
});

describe("deleteItem", () => {
  it("deletes an item", async () => {
    const a = await fixture();
    await upsertItem(a.id, "client-id-1", { name: "Eggs", amountCentavos: 100, position: 0 });
    await deleteItem(a.id, "client-id-1");
    expect(await prisma.expenseItem.count()).toBe(0);
  });

  it("succeeds when the item is already gone", async () => {
    const a = await fixture();
    await expect(deleteItem(a.id, "never-existed")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:integration src/systems/expenses/services/items.integration.test.ts`
Expected: FAIL — cannot resolve `./items`.

- [ ] **Step 3: Implement `services/items.ts`**

```ts
import { prisma } from "@/platform/db/client";
import { feedback } from "@/platform/feedback";
import type { ExpenseItem } from "@/generated/prisma/client";

/** A PUT replayed an id that exists under a different activity — client ids
 *  are scoped to one activity, so this is a 409, not an upsert. */
export class ItemConflictError extends Error {
  constructor(itemId: string) {
    super(`Item ${itemId} belongs to a different activity`);
    this.name = "ItemConflictError";
  }
}

export interface PutItemInput {
  name: string;
  amountCentavos: number;
  position: number;
}

export async function upsertItem(
  activityId: string,
  itemId: string,
  input: PutItemInput
): Promise<ExpenseItem> {
  const existing = await prisma.expenseItem.findUnique({ where: { id: itemId } });
  if (existing && existing.activityId !== activityId) {
    throw new ItemConflictError(itemId);
  }
  const item = await prisma.expenseItem.upsert({
    where: { id: itemId },
    create: { id: itemId, activityId, ...input },
    update: {
      name: input.name,
      amountCentavos: input.amountCentavos,
      position: input.position,
    },
  });
  await recordActivityMetrics(activityId);
  return item;
}

export async function deleteItem(activityId: string, itemId: string): Promise<void> {
  // deleteMany so deleting an already-deleted item is a success (sync replays).
  await prisma.expenseItem.deleteMany({ where: { id: itemId, activityId } });
  await recordActivityMetrics(activityId);
}

async function recordActivityMetrics(activityId: string): Promise<void> {
  const agg = await prisma.expenseItem.aggregate({
    where: { activityId },
    _count: true,
    _sum: { amountCentavos: true },
  });
  await feedback.recordMetric("expenses", "items_per_activity", agg._count);
  await feedback.recordMetric("expenses", "activity_total_centavos", agg._sum.amountCentavos ?? 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:integration src/systems/expenses/services/items.integration.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/expenses/services/items.ts src/systems/expenses/services/items.integration.test.ts
git commit -m "feat(expenses): add idempotent item upsert service"
```

---

### Task 7: Trends aggregation service (TDD, integration)

**Files:**
- Create: `src/systems/expenses/services/trends.ts`
- Test: `src/systems/expenses/services/trends.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { requireTestDatabase, withCleanExpenseTables } from "@/test/db";
import { prisma } from "@/platform/db/client";
import { createType } from "./types";
import { getTrends } from "./trends";

requireTestDatabase();

beforeEach(withCleanExpenseTables);

const NOW = new Date("2026-06-15T04:00:00Z"); // June in Manila

async function seedActivity(typeId: string, startedAt: string, amounts: number[]) {
  const a = await prisma.expenseActivity.create({
    data: { typeId, startedAt: new Date(startedAt) },
  });
  await prisma.expenseItem.createMany({
    data: amounts.map((amountCentavos, i) => ({
      id: `${a.id}-i${i}`,
      activityId: a.id,
      name: `Item ${i}`,
      amountCentavos,
      position: i,
    })),
  });
  return a;
}

describe("getTrends", () => {
  it("buckets totals by Manila month and type", async () => {
    const groceries = await createType("Groceries");
    const dining = await createType("Dining out");
    await seedActivity(groceries.id, "2026-06-02T04:00:00Z", [10000, 5000]);
    await seedActivity(groceries.id, "2026-05-10T04:00:00Z", [20000]);
    await seedActivity(dining.id, "2026-06-05T04:00:00Z", [7500]);

    const trends = await getTrends(3, NOW);
    expect(trends.months.map((m) => m.key)).toEqual(["2026-04", "2026-05", "2026-06"]);
    const june = trends.byMonth.filter((r) => r.month === "2026-06");
    expect(june).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ typeName: "Groceries", totalCentavos: 15000 }),
        expect.objectContaining({ typeName: "Dining out", totalCentavos: 7500 }),
      ])
    );
  });

  it("computes per-type stats: this month, last month, average, count", async () => {
    const groceries = await createType("Groceries");
    await seedActivity(groceries.id, "2026-06-02T04:00:00Z", [10000]);
    await seedActivity(groceries.id, "2026-06-09T04:00:00Z", [30000]);
    await seedActivity(groceries.id, "2026-05-10T04:00:00Z", [20000]);

    const trends = await getTrends(6, NOW);
    const stats = trends.byType.find((s) => s.typeName === "Groceries")!;
    expect(stats.thisMonthCentavos).toBe(40000);
    expect(stats.lastMonthCentavos).toBe(20000);
    expect(stats.activityCount).toBe(3);
    expect(stats.avgPerActivityCentavos).toBe(20000);
  });

  it("excludes activities older than the window", async () => {
    const groceries = await createType("Groceries");
    await seedActivity(groceries.id, "2025-01-10T04:00:00Z", [99999]);
    const trends = await getTrends(3, NOW);
    expect(trends.byMonth).toHaveLength(0);
    expect(trends.byType).toHaveLength(0);
  });

  it("assigns a late-night UTC activity to the next Manila month", async () => {
    const groceries = await createType("Groceries");
    // 2026-05-31 17:30 UTC = 2026-06-01 01:30 Manila
    await seedActivity(groceries.id, "2026-05-31T17:30:00Z", [5000]);
    const trends = await getTrends(3, NOW);
    expect(trends.byMonth[0]).toMatchObject({ month: "2026-06", totalCentavos: 5000 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:integration src/systems/expenses/services/trends.integration.test.ts`
Expected: FAIL — cannot resolve `./trends`.

- [ ] **Step 3: Implement `services/trends.ts`**

```ts
import { prisma } from "@/platform/db/client";
import { lastNMonthKeys, manilaMonthStart, type MonthBucket } from "../lib/months";

export interface MonthTotal {
  month: string; // "2026-06"
  typeId: string;
  typeName: string;
  totalCentavos: number;
}

export interface TypeStats {
  typeId: string;
  typeName: string;
  thisMonthCentavos: number;
  lastMonthCentavos: number;
  avgPerActivityCentavos: number;
  activityCount: number;
}

export interface Trends {
  months: MonthBucket[];
  byMonth: MonthTotal[];
  byType: TypeStats[];
}

export async function getTrends(months: 3 | 6 | 12, now: Date = new Date()): Promise<Trends> {
  const buckets = lastNMonthKeys(months, now);
  const since = manilaMonthStart(buckets[0].key);

  const rows = await prisma.$queryRaw<
    Array<{ month: string; typeId: string; typeName: string; total: bigint; activities: bigint }>
  >`
    SELECT to_char(a."startedAt" AT TIME ZONE 'Asia/Manila', 'YYYY-MM') AS month,
           a."typeId" AS "typeId",
           t.name AS "typeName",
           COALESCE(SUM(i."amountCentavos"), 0)::bigint AS total,
           COUNT(DISTINCT a.id)::bigint AS activities
    FROM expense_activities a
    JOIN expense_activity_types t ON t.id = a."typeId"
    LEFT JOIN expense_items i ON i."activityId" = a.id
    WHERE a."startedAt" >= ${since}
    GROUP BY 1, 2, 3
    ORDER BY 1;
  `;

  const byMonth: MonthTotal[] = rows.map((r) => ({
    month: r.month,
    typeId: r.typeId,
    typeName: r.typeName,
    totalCentavos: Number(r.total),
  }));

  const thisKey = buckets[buckets.length - 1].key;
  const lastKey = buckets.length > 1 ? buckets[buckets.length - 2].key : null;

  const statsByType = new Map<string, TypeStats & { totalAll: number }>();
  for (const r of rows) {
    let s = statsByType.get(r.typeId);
    if (!s) {
      s = {
        typeId: r.typeId,
        typeName: r.typeName,
        thisMonthCentavos: 0,
        lastMonthCentavos: 0,
        avgPerActivityCentavos: 0,
        activityCount: 0,
        totalAll: 0,
      };
      statsByType.set(r.typeId, s);
    }
    const total = Number(r.total);
    s.totalAll += total;
    s.activityCount += Number(r.activities);
    if (r.month === thisKey) s.thisMonthCentavos = total;
    if (lastKey && r.month === lastKey) s.lastMonthCentavos = total;
  }

  const byType: TypeStats[] = [...statsByType.values()].map(({ totalAll, ...s }) => ({
    ...s,
    avgPerActivityCentavos: s.activityCount > 0 ? Math.round(totalAll / s.activityCount) : 0,
  }));

  return { months: buckets, byMonth, byType };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:integration src/systems/expenses/services/trends.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/expenses/services/trends.ts src/systems/expenses/services/trends.integration.test.ts
git commit -m "feat(expenses): add trends aggregation service"
```

---

### Task 8: Route handlers (TDD, integration)

**Files:**
- Create: `src/systems/expenses/routes/types.ts`
- Create: `src/systems/expenses/routes/activities.ts`
- Create: `src/systems/expenses/routes/trends.ts`
- Test: `src/systems/expenses/routes/routes.integration.test.ts`

Handlers follow `src/systems/journal/routes/topics.ts`: parse JSON, Zod-validate (ZodError → `badRequest`), map Prisma errors (`P2002` → 409, `P2025`/missing → 404), return `NextResponse.json`.

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requireTestDatabase, withCleanExpenseTables } from "@/test/db";
import { createType as createTypeService } from "../services/types";
import { startActivity } from "../services/activities";
import * as typeRoutes from "./types";
import * as activityRoutes from "./activities";
import * as trendRoutes from "./trends";

requireTestDatabase();

beforeEach(withCleanExpenseTables);

function jsonReq(method: string, body?: unknown, url = "http://test/api"): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("type routes", () => {
  it("POST /types creates; duplicate name is 409", async () => {
    const res = await typeRoutes.createType(jsonReq("POST", { name: "Groceries" }), {});
    expect(res.status).toBe(201);
    const dup = await typeRoutes.createType(jsonReq("POST", { name: "Groceries" }), {});
    expect(dup.status).toBe(409);
  });

  it("POST /types rejects an empty name", async () => {
    const res = await typeRoutes.createType(jsonReq("POST", { name: " " }), {});
    expect(res.status).toBe(400);
  });

  it("PATCH /types/:id archives; unknown id is 404", async () => {
    const t = await createTypeService("Errands");
    const res = await typeRoutes.updateType(jsonReq("PATCH", { archived: true }), { id: t.id });
    expect(res.status).toBe(200);
    const missing = await typeRoutes.updateType(jsonReq("PATCH", { archived: true }), {
      id: "nope",
    });
    expect(missing.status).toBe(404);
  });
});

describe("activity routes", () => {
  it("POST /activities starts one; unknown typeId is 400", async () => {
    const t = await createTypeService("Groceries");
    const res = await activityRoutes.createActivity(jsonReq("POST", { typeId: t.id }), {});
    expect(res.status).toBe(201);
    const bad = await activityRoutes.createActivity(jsonReq("POST", { typeId: "nope" }), {});
    expect(bad.status).toBe(400);
  });

  it("GET /activities/:id returns items; unknown id is 404", async () => {
    const t = await createTypeService("Groceries");
    const a = await startActivity({ typeId: t.id });
    const res = await activityRoutes.getActivity(jsonReq("GET"), { id: a.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activity.items).toEqual([]);
    const missing = await activityRoutes.getActivity(jsonReq("GET"), { id: "nope" });
    expect(missing.status).toBe(404);
  });

  it("PUT item is idempotent over HTTP; cross-activity id is 409", async () => {
    const t = await createTypeService("Groceries");
    const a = await startActivity({ typeId: t.id });
    const b = await startActivity({ typeId: t.id });
    const body = { name: "Eggs", amountCentavos: 21500, position: 0 };
    const r1 = await activityRoutes.putItem(jsonReq("PUT", body), { id: a.id, itemId: "c1" });
    expect(r1.status).toBe(200);
    const r2 = await activityRoutes.putItem(jsonReq("PUT", body), { id: a.id, itemId: "c1" });
    expect(r2.status).toBe(200);
    const conflict = await activityRoutes.putItem(jsonReq("PUT", body), {
      id: b.id,
      itemId: "c1",
    });
    expect(conflict.status).toBe(409);
  });

  it("PUT item on a missing activity is 404", async () => {
    const body = { name: "Eggs", amountCentavos: 21500, position: 0 };
    const res = await activityRoutes.putItem(jsonReq("PUT", body), { id: "nope", itemId: "c1" });
    expect(res.status).toBe(404);
  });

  it("DELETE item succeeds even when already gone", async () => {
    const t = await createTypeService("Groceries");
    const a = await startActivity({ typeId: t.id });
    const res = await activityRoutes.deleteItem(jsonReq("DELETE"), {
      id: a.id,
      itemId: "never-existed",
    });
    expect(res.status).toBe(204);
  });

  it("DELETE /activities/:id removes it", async () => {
    const t = await createTypeService("Groceries");
    const a = await startActivity({ typeId: t.id });
    const res = await activityRoutes.deleteActivity(jsonReq("DELETE"), { id: a.id });
    expect(res.status).toBe(204);
    const gone = await activityRoutes.getActivity(jsonReq("GET"), { id: a.id });
    expect(gone.status).toBe(404);
  });
});

describe("trends route", () => {
  it("GET /trends returns buckets and stats; bad months is 400", async () => {
    const res = await trendRoutes.getTrends(
      new NextRequest("http://test/api?months=3", { method: "GET" }),
      {}
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.months).toHaveLength(3);
    const bad = await trendRoutes.getTrends(
      new NextRequest("http://test/api?months=7", { method: "GET" }),
      {}
    );
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:integration src/systems/expenses/routes/routes.integration.test.ts`
Expected: FAIL — cannot resolve `./types` etc.

- [ ] **Step 3: Implement `routes/types.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { createTypeSchema, listTypesQuerySchema, updateTypeSchema } from "../schemas/expenses";
import {
  createType as createTypeService,
  listTypes as listTypesService,
  updateType as updateTypeService,
} from "../services/types";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const listTypes: RouteHandler = async (req) => {
  const parsed = listTypesQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const types = await listTypesService({ includeArchived: parsed.archived });
  return NextResponse.json({ types });
};

export const createType: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createTypeSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid type", err.flatten());
    throw err;
  }
  try {
    const type = await createTypeService(parsed.name);
    return NextResponse.json({ type }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return apiError(409, `Type "${parsed.name}" already exists`);
    }
    throw err;
  }
};

export const updateType: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateTypeSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid update", err.flatten());
    throw err;
  }
  try {
    const type = await updateTypeService(params.id, parsed);
    return NextResponse.json({ type });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return notFound(`Type ${params.id} not found`);
      if (err.code === "P2002") return apiError(409, "A type with that name already exists");
    }
    throw err;
  }
};
```

- [ ] **Step 4: Implement `routes/activities.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { apiError, badRequest, notFound } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import {
  createActivitySchema,
  listActivitiesQuerySchema,
  putItemSchema,
  updateActivitySchema,
} from "../schemas/expenses";
import {
  deleteActivity as deleteActivityService,
  getActivityWithItems,
  listActivities as listActivitiesService,
  startActivity,
  updateActivity as updateActivityService,
} from "../services/activities";
import { ItemConflictError, deleteItem as deleteItemService, upsertItem } from "../services/items";

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const listActivities: RouteHandler = async (req) => {
  const parsed = listActivitiesQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const result = await listActivitiesService(parsed);
  return NextResponse.json(result);
};

export const createActivity: RouteHandler = async (req) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = createActivitySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid activity", err.flatten());
    throw err;
  }
  try {
    const activity = await startActivity(parsed);
    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return badRequest(`Unknown type ${parsed.typeId}`);
    }
    throw err;
  }
};

export const getActivity: RouteHandler = async (_req, params) => {
  const activity = await getActivityWithItems(params.id);
  if (!activity) return notFound(`Activity ${params.id} not found`);
  return NextResponse.json({ activity });
};

export const updateActivity: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = updateActivitySchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid update", err.flatten());
    throw err;
  }
  try {
    const activity = await updateActivityService(params.id, parsed);
    return NextResponse.json({ activity });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return notFound(`Activity ${params.id} not found`);
    }
    throw err;
  }
};

export const deleteActivity: RouteHandler = async (_req, params) => {
  try {
    await deleteActivityService(params.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return notFound(`Activity ${params.id} not found`);
    }
    throw err;
  }
};

export const putItem: RouteHandler = async (req, params) => {
  const raw = await readJson(req);
  let parsed;
  try {
    parsed = putItemSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid item", err.flatten());
    throw err;
  }
  const activity = await getActivityWithItems(params.id);
  if (!activity) return notFound(`Activity ${params.id} not found`);
  try {
    const item = await upsertItem(params.id, params.itemId, parsed);
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof ItemConflictError) return apiError(409, err.message);
    throw err;
  }
};

export const deleteItem: RouteHandler = async (_req, params) => {
  await deleteItemService(params.id, params.itemId);
  return new NextResponse(null, { status: 204 });
};
```

- [ ] **Step 5: Implement `routes/trends.ts`**

```ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { badRequest } from "@/platform/api/errors";
import { RouteHandler } from "@/systems/types";
import { trendsQuerySchema } from "../schemas/expenses";
import { getTrends as getTrendsService } from "../services/trends";

export const getTrends: RouteHandler = async (req) => {
  let parsed;
  try {
    parsed = trendsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  } catch (err) {
    if (err instanceof ZodError) return badRequest("Invalid trends query", err.flatten());
    throw err;
  }
  const trends = await getTrendsService(parsed.months);
  return NextResponse.json(trends);
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test:integration src/systems/expenses/routes/routes.integration.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add src/systems/expenses/routes/
git commit -m "feat(expenses): add route handlers"
```

---

### Task 9: Manifest, icon, palette, registration

**Files:**
- Create: `src/systems/expenses/palette.ts`
- Create: `src/systems/expenses/manifest.ts`
- Create: `public/icons/receipt.svg`
- Modify: `src/app/_components/Icon.tsx` (add `receipt` to `PATHS`)
- Modify: `src/systems/index.ts` (register manifest)

- [ ] **Step 1: Add the Lucide receipt icon**

Save to `public/icons/receipt.svg` (Lucide source, stroke 1.5 applied by the Icon component):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 17V7" />
  <path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8" />
  <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" />
</svg>
```

Then add to the `PATHS` map in `src/app/_components/Icon.tsx` (alphabetical position is fine; match the existing fragment style):

```tsx
  receipt: (
    <>
      <path d="M12 17V7" />
      <path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8" />
      <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" />
    </>
  ),
```

- [ ] **Step 2: Write `palette.ts`**

```ts
import type { PaletteLayer } from "@/platform/palette/types";
import { prisma } from "@/platform/db/client";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export const activitiesLayer: PaletteLayer = {
  name: "activities",
  singular: "activity",
  search: async (query, _parentId) => {
    const trimmed = query.trim();
    const activities = await prisma.expenseActivity.findMany({
      where: trimmed
        ? {
            OR: [
              { title: { contains: trimmed, mode: "insensitive" as const } },
              { type: { name: { contains: trimmed, mode: "insensitive" as const } } },
            ],
          }
        : {},
      take: 10,
      orderBy: { startedAt: "desc" },
      include: { type: true },
    });
    return activities.map((a) => ({
      id: a.id,
      label: a.title ?? a.type.name,
      sublabel: `${a.type.name} · ${DATE_FORMAT.format(a.startedAt)}`,
      icon: "receipt" as const,
      href: `/expenses/${a.id}`,
      drillable: false,
    }));
  },
};
```

(Check `@/platform/palette/types` — if `icon` is a closed union of icon names, add `"receipt"` to it; if it's `string`, nothing to do.)

- [ ] **Step 3: Write `manifest.ts`**

```ts
import { SystemManifest } from "../types";
import * as palette from "./palette";
import * as types from "./routes/types";
import * as activities from "./routes/activities";
import * as trends from "./routes/trends";

export const manifest: SystemManifest = {
  name: "expenses",
  displayName: "Activity Expenses",
  description: "Track what an activity costs while it happens",

  routes: {
    "GET /types":                          types.listTypes,
    "POST /types":                         types.createType,
    "PATCH /types/:id":                    types.updateType,
    "GET /activities":                     activities.listActivities,
    "POST /activities":                    activities.createActivity,
    "GET /activities/:id":                 activities.getActivity,
    "PATCH /activities/:id":               activities.updateActivity,
    "DELETE /activities/:id":              activities.deleteActivity,
    "PUT /activities/:id/items/:itemId":   activities.putItem,
    "DELETE /activities/:id/items/:itemId": activities.deleteItem,
    "GET /trends":                         trends.getTrends,
  },

  nav: {
    label: "Expenses",
    icon: "receipt",
    href: "/expenses",
  },

  palette: {
    layers: [palette.activitiesLayer],
  },
};
```

- [ ] **Step 4: Register in `src/systems/index.ts`**

Add the import and append to the exported `manifests` array, mirroring how journal is registered:

```ts
import { manifest as expensesManifest } from "./expenses/manifest";
// ...
export const manifests = [journalManifest, expensesManifest];
```

(Match the file's actual export shape — read it first; only the registration line is new.)

- [ ] **Step 5: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: clean.

```bash
git add src/systems/expenses/manifest.ts src/systems/expenses/palette.ts src/systems/index.ts src/app/_components/Icon.tsx public/icons/receipt.svg
git commit -m "feat(expenses): register expenses system manifest"
```

---

### Task 10: Sync queue (TDD, unit)

**Files:**
- Create: `src/systems/expenses/lib/syncQueue.ts`
- Test: `src/systems/expenses/lib/syncQueue.test.ts`

Behavior: serial drain, exponential backoff (1s → 30s cap), localStorage persistence keyed per activity, 4xx responses drop the op (they will never succeed — a retry loop would poison the queue), network errors and 5xx retry forever.

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncQueue, type QueueOp } from "./syncQueue";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

function putOp(itemId: string): QueueOp {
  return {
    kind: "put",
    itemId,
    body: { name: "Eggs", amountCentavos: 100, position: 0 },
  };
}

const ok = () => Promise.resolve(new Response(null, { status: 200 }));
const serverError = () => Promise.resolve(new Response(null, { status: 500 }));

describe("SyncQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("drains an enqueued put with a PUT to the item url", async () => {
    const fetchFn = vi.fn(ok);
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue(putOp("i1"));
    await vi.runAllTimersAsync();
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/systems/expenses/activities/a1/items/i1",
      expect.objectContaining({ method: "PUT" })
    );
    expect(q.pending()).toBe(0);
  });

  it("retries with backoff on 500 and reports failing", async () => {
    const fetchFn = vi.fn(serverError);
    const onChange = vi.fn();
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage(), onChange });
    q.enqueue(putOp("i1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(q.pending()).toBe(1);
    expect(onChange).toHaveBeenLastCalledWith(1, true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    fetchFn.mockImplementation(ok);
    await vi.advanceTimersByTimeAsync(2000);
    expect(q.pending()).toBe(0);
    expect(onChange).toHaveBeenLastCalledWith(0, false);
  });

  it("drops the op on a 4xx instead of retrying forever", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 409 })));
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue(putOp("i1"));
    await vi.runAllTimersAsync();
    expect(q.pending()).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("coalesces a second put for the same item", async () => {
    const fetchFn = vi.fn(serverError);
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue(putOp("i1"));
    await vi.advanceTimersByTimeAsync(0);
    q.enqueue({ ...putOp("i1"), body: { name: "Eggs", amountCentavos: 999, position: 0 } });
    expect(q.pending()).toBe(1);
  });

  it("persists pending ops and restores them", async () => {
    const storage = memoryStorage();
    const fetchFn = vi.fn(serverError);
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage });
    q.enqueue(putOp("i1"));
    await vi.advanceTimersByTimeAsync(0);
    // Simulate a refresh: a new queue over the same storage.
    const fetchFn2 = vi.fn(ok);
    const q2 = new SyncQueue({ activityId: "a1", fetchFn: fetchFn2, storage });
    expect(q2.pending()).toBe(1);
    q2.flush();
    await vi.runAllTimersAsync();
    expect(q2.pending()).toBe(0);
  });

  it("sends a DELETE for delete ops", async () => {
    const fetchFn = vi.fn(ok);
    const q = new SyncQueue({ activityId: "a1", fetchFn, storage: memoryStorage() });
    q.enqueue({ kind: "delete", itemId: "i1" });
    await vi.runAllTimersAsync();
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/systems/expenses/activities/a1/items/i1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/systems/expenses/lib/syncQueue.test.ts`
Expected: FAIL — cannot resolve `./syncQueue`.

- [ ] **Step 3: Implement `lib/syncQueue.ts`**

```ts
/** Optimistic sync queue for the capture page. Framework-free so it unit-tests
 *  without a DOM. Ops drain serially; failures back off 1s → 30s; the pending
 *  list is mirrored to storage so a refresh inside a dead zone replays it. */

export interface QueueOp {
  kind: "put" | "delete";
  itemId: string;
  body?: { name: string; amountCentavos: number; position: number };
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface SyncQueueOptions {
  activityId: string;
  fetchFn?: typeof fetch;
  storage?: StorageLike;
  /** (pendingCount, failing) — fired on every queue state change. */
  onChange?: (pending: number, failing: boolean) => void;
}

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export class SyncQueue {
  private ops: QueueOp[] = [];
  private draining = false;
  private failing = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly fetchFn: typeof fetch;
  private readonly storage: StorageLike | null;
  private readonly key: string;

  constructor(private readonly opts: SyncQueueOptions) {
    this.fetchFn = opts.fetchFn ?? fetch.bind(globalThis);
    this.storage = opts.storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    this.key = `expenses:queue:${opts.activityId}`;
    this.restore();
  }

  enqueue(op: QueueOp): void {
    // Coalesce: the latest op for an item supersedes any earlier one.
    this.ops = this.ops.filter((o) => o.itemId !== op.itemId);
    this.ops.push(op);
    this.persist();
    this.notify();
    void this.drain();
  }

  /** Pending ops not yet confirmed by the server (for merge-on-mount). */
  pendingOps(): QueueOp[] {
    return [...this.ops];
  }

  pending(): number {
    return this.ops.length;
  }

  /** Reset backoff and try again now (online / visibilitychange events). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.attempt = 0;
    void this.drain();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private url(op: QueueOp): string {
    return `/api/systems/expenses/activities/${this.opts.activityId}/items/${op.itemId}`;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    while (this.ops.length > 0) {
      const op = this.ops[0];
      let res: Response;
      try {
        res = await this.fetchFn(
          this.url(op),
          op.kind === "put"
            ? {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(op.body),
              }
            : { method: "DELETE" }
        );
      } catch {
        this.scheduleRetry();
        return;
      }
      if (res.ok) {
        this.ops.shift();
        this.attempt = 0;
        this.failing = false;
        this.persist();
        this.notify();
      } else if (res.status >= 400 && res.status < 500) {
        // A validation/conflict response will never succeed on retry — drop it
        // rather than poison the queue. The item stays visible locally.
        console.error(`expenses sync: dropping ${op.kind} ${op.itemId} (${res.status})`);
        this.ops.shift();
        this.persist();
        this.notify();
      } else {
        this.scheduleRetry();
        return;
      }
    }
    this.draining = false;
  }

  private scheduleRetry(): void {
    this.failing = true;
    this.notify();
    const delay = Math.min(BASE_DELAY_MS * 2 ** this.attempt, MAX_DELAY_MS);
    this.attempt += 1;
    this.draining = false;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, delay);
  }

  private persist(): void {
    if (!this.storage) return;
    if (this.ops.length === 0) this.storage.removeItem(this.key);
    else this.storage.setItem(this.key, JSON.stringify(this.ops));
  }

  private restore(): void {
    if (!this.storage) return;
    const raw = this.storage.getItem(this.key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.ops = parsed;
    } catch {
      this.storage.removeItem(this.key);
    }
  }

  private notify(): void {
    this.opts.onChange?.(this.ops.length, this.failing);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/systems/expenses/lib/syncQueue.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/expenses/lib/syncQueue.ts src/systems/expenses/lib/syncQueue.test.ts
git commit -m "feat(expenses): add optimistic sync queue"
```

---

### Task 11: Chart tokens and expenses CSS

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add chart tokens inside the `:root` token block**

```css
  /* Chart series palette — multi-series charts need more than the single
     accent. Derived from existing semantic colors; first consumer is the
     expenses trends chart. */
  --chart-1: var(--accent);
  --chart-2: var(--heading);
  --chart-3: var(--link);
  --chart-4: var(--success);
  --chart-5: var(--warning);
  --chart-6: var(--tag-ink);
```

- [ ] **Step 2: Add the expenses component classes (near the other component classes like `.task-row`)**

```css
/* Expenses — in-store capture surface */
.exp-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.exp-total {
  font-family: var(--font-mono);
  font-size: var(--fs-xl);
  font-weight: 500;
  white-space: nowrap;
}
.exp-composer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  gap: var(--sp-2);
  padding: var(--sp-3) 0;
  background: var(--bg);
  border-top: 1px solid var(--border);
}
.exp-composer input {
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-md); /* 16px floor stops iOS zoom-on-focus */
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  background: var(--bg-raised);
  color: var(--fg);
}
.exp-composer input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--ring, 0 0 0 3px rgba(124, 108, 240, 0.25));
}
.exp-composer input[data-invalid="true"] {
  border-color: var(--danger);
}
.exp-composer .exp-name {
  flex: 1 1 60%;
}
.exp-composer .exp-price {
  flex: 1 1 32%;
  font-family: var(--font-mono);
  text-align: right;
}
.exp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-2);
  border-radius: var(--r-md);
}
.exp-row:hover {
  background: var(--bg-hover);
}
.exp-row .amount {
  font-family: var(--font-mono);
  white-space: nowrap;
}
.exp-unsynced {
  font-size: var(--fs-xs);
  font-family: var(--font-mono);
  color: var(--fg-muted);
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  border-radius: var(--r-full, 999px);
  padding: 2px var(--sp-2);
  white-space: nowrap;
}
```

(Before committing, confirm `--ring` and `--r-full` exist in `globals.css` — they're listed in the design doc; if names differ, use the file's actual token names and drop the fallbacks.)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(expenses): add chart tokens and capture styles"
```

---

### Task 12: Expenses layout and index page (start buttons + history)

**Files:**
- Create: `src/app/(systems)/expenses/layout.tsx`
- Create: `src/app/(systems)/expenses/page.tsx`
- Create: `src/systems/expenses/components/StartButtons.tsx`
- Create: `src/systems/expenses/components/ActivityList.tsx`

- [ ] **Step 1: Write `layout.tsx`** (mirrors the journal tab strip)

```tsx
import Link from "next/link";

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="tab-strip" aria-label="Expenses sections">
        <Link href="/expenses">Activities</Link>
        <Link href="/expenses/trends">Trends</Link>
        <Link href="/expenses/types">Types</Link>
      </nav>
      {children}
    </>
  );
}
```

- [ ] **Step 2: Write `StartButtons.tsx`** (client)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StartButtonsProps {
  types: Array<{ id: string; name: string }>;
}

export function StartButtons({ types }: StartButtonsProps) {
  const router = useRouter();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(typeId: string) {
    setStartingId(typeId);
    setError(null);
    try {
      const res = await fetch("/api/systems/expenses/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { activity } = await res.json();
      router.push(`/expenses/${activity.id}`);
    } catch {
      setError("Could not start the activity. Check your connection and try again.");
      setStartingId(null);
    }
  }

  if (types.length === 0) {
    return (
      <p className="lead">
        No activity types yet. Add one on the types tab.
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn btn-secondary"
            disabled={startingId !== null}
            onClick={() => start(t.id)}
          >
            {startingId === t.id ? "Starting…" : t.name}
          </button>
        ))}
      </div>
      {error ? (
        <p className="caption" style={{ color: "var(--danger)", marginTop: "var(--sp-2)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Write `ActivityList.tsx`** (client — rows link to capture, delete with confirm)

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/app/_components/Icon";
import { formatCentavos } from "../lib/money";

export interface ActivityRow {
  id: string;
  typeName: string;
  title: string | null;
  startedAt: string; // ISO
  itemCount: number;
  totalCentavos: number;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function ActivityList({ activities }: { activities: ActivityRow[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Delete this activity and all its items?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/systems/expenses/activities/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) router.refresh();
  }

  if (activities.length === 0) {
    return (
      <p className="lead">
        No activities yet. Tap a type above to start one.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: "var(--sp-4)" }}>
      {activities.map((a) => (
        <div key={a.id} className="exp-row">
          <Link
            href={`/expenses/${a.id}`}
            style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: "var(--sp-3)", color: "inherit", textDecoration: "none" }}
          >
            <span style={{ fontWeight: 500 }}>{a.title ?? a.typeName}</span>
            <span className="caption" style={{ color: "var(--fg-muted)" }}>
              {a.title ? `${a.typeName} · ` : ""}
              {DATE_FORMAT.format(new Date(a.startedAt))} · {a.itemCount}{" "}
              {a.itemCount === 1 ? "item" : "items"}
            </span>
          </Link>
          <span className="amount">{formatCentavos(a.totalCentavos)}</span>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={`Delete ${a.title ?? a.typeName}`}
            disabled={deletingId === a.id}
            onClick={() => remove(a.id)}
          >
            <Icon name="trash-2" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
```

(Check `Icon.tsx`'s actual prop names — if it takes `name`/`size` differently, match it.)

- [ ] **Step 4: Write `page.tsx`** (server)

```tsx
import { listTypes } from "@/systems/expenses/services/types";
import { listActivities } from "@/systems/expenses/services/activities";
import { StartButtons } from "@/systems/expenses/components/StartButtons";
import { ActivityList } from "@/systems/expenses/components/ActivityList";

export default async function ExpensesPage() {
  const [types, { activities }] = await Promise.all([
    listTypes({}),
    listActivities({ limit: 30 }),
  ]);

  return (
    <article className="doc">
      <h1>Expenses</h1>
      <p className="overline" style={{ marginTop: "var(--sp-4)" }}>Start an activity</p>
      <StartButtons types={types.map((t) => ({ id: t.id, name: t.name }))} />
      <p className="overline" style={{ marginTop: "var(--sp-8)" }}>Recent</p>
      <ActivityList
        activities={activities.map((a) => ({
          id: a.id,
          typeName: a.typeName,
          title: a.title,
          startedAt: a.startedAt.toISOString(),
          itemCount: a.itemCount,
          totalCentavos: a.totalCentavos,
        }))}
      />
    </article>
  );
}
```

- [ ] **Step 5: Verify in the dev server**

Run: `bun run dev`, sign in, open `http://localhost:3000/expenses`.
Expected: "Expenses" in the sidebar with the receipt icon; six seeded type buttons; empty state under Recent. Tapping "Groceries" creates an activity and routes to `/expenses/<id>` (404 page until Task 13 — the redirect itself is the check).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(systems\)/expenses/ src/systems/expenses/components/
git commit -m "feat(expenses): add index page with start buttons and history"
```

---

### Task 13: Capture page

**Files:**
- Create: `src/app/(systems)/expenses/[id]/page.tsx`
- Create: `src/systems/expenses/components/CapturePage.tsx`
- Create: `src/systems/expenses/components/ItemComposer.tsx`
- Create: `src/systems/expenses/components/ItemRow.tsx`

- [ ] **Step 1: Write `[id]/page.tsx`** (server; `params` is a Promise)

```tsx
import { notFound } from "next/navigation";
import { getActivityWithItems } from "@/systems/expenses/services/activities";
import { CapturePage } from "@/systems/expenses/components/CapturePage";

export default async function ExpenseActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const activity = await getActivityWithItems(id);
  if (!activity) notFound();

  return (
    <CapturePage
      activity={{
        id: activity.id,
        title: activity.title,
        typeName: activity.type.name,
        startedAt: activity.startedAt.toISOString(),
      }}
      initialItems={activity.items.map((i) => ({
        id: i.id,
        name: i.name,
        amountCentavos: i.amountCentavos,
        position: i.position,
      }))}
    />
  );
}
```

- [ ] **Step 2: Write `ItemComposer.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { parsePesoInput } from "../lib/money";

interface ItemComposerProps {
  onAdd: (name: string, amountCentavos: number) => void;
}

export function ItemComposer({ onAdd }: ItemComposerProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [invalidPrice, setInvalidPrice] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (name.trim()) priceRef.current?.focus();
    }
  }

  function submit() {
    const centavos = parsePesoInput(price);
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    if (centavos === null) {
      setInvalidPrice(true);
      priceRef.current?.focus();
      return;
    }
    onAdd(name.trim(), centavos);
    setName("");
    setPrice("");
    setInvalidPrice(false);
    nameRef.current?.focus();
  }

  return (
    <form
      className="exp-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        ref={nameRef}
        className="exp-name"
        type="text"
        value={name}
        placeholder="Item"
        aria-label="Item name"
        enterKeyHint="next"
        autoComplete="off"
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleNameKeyDown}
      />
      <input
        ref={priceRef}
        className="exp-price"
        type="text"
        inputMode="decimal"
        value={price}
        placeholder="0.00"
        aria-label="Price in pesos"
        enterKeyHint="done"
        autoComplete="off"
        data-invalid={invalidPrice}
        onChange={(e) => {
          setPrice(e.target.value);
          if (invalidPrice) setInvalidPrice(false);
        }}
      />
      <button type="submit" className="btn btn-primary" aria-label="Add item">
        Add
      </button>
    </form>
  );
}
```

The price input is `type="text"` with `inputMode="decimal"` (not `type="number"`) so commas parse and the mobile keypad still shows. Enter in the price field submits the form — that's the Enter-Enter rhythm. `enterKeyHint="done"`'s mobile "done"/"go" key triggers form submit.

- [ ] **Step 3: Write `ItemRow.tsx`** (display + tap-to-edit)

```tsx
"use client";

import { useState } from "react";
import { formatCentavos, parsePesoInput } from "../lib/money";

export interface CaptureItem {
  id: string;
  name: string;
  amountCentavos: number;
  position: number;
}

interface ItemRowProps {
  item: CaptureItem;
  onEdit: (id: string, name: string, amountCentavos: number) => void;
  onDelete: (id: string) => void;
}

export function ItemRow({ item, onEdit, onDelete }: ItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState((item.amountCentavos / 100).toFixed(2));
  const [invalid, setInvalid] = useState(false);

  function save() {
    const centavos = parsePesoInput(price);
    if (!name.trim() || centavos === null) {
      setInvalid(true);
      return;
    }
    onEdit(item.id, name.trim(), centavos);
    setEditing(false);
    setInvalid(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="exp-row"
        style={{ width: "100%", border: "none", background: "none", font: "inherit", textAlign: "left", cursor: "pointer" }}
        onClick={() => {
          setName(item.name);
          setPrice((item.amountCentavos / 100).toFixed(2));
          setEditing(true);
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.name}
        </span>
        <span className="amount">{formatCentavos(item.amountCentavos)}</span>
      </button>
    );
  }

  return (
    <div className="exp-row" style={{ flexWrap: "wrap" }}>
      <input
        type="text"
        value={name}
        aria-label="Item name"
        style={{ flex: "1 1 50%", minWidth: 0, padding: "var(--sp-1) var(--sp-2)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--bg-raised)", font: "inherit" }}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="text"
        inputMode="decimal"
        value={price}
        aria-label="Price in pesos"
        data-invalid={invalid}
        style={{ flex: "0 1 90px", padding: "var(--sp-1) var(--sp-2)", border: invalid ? "1px solid var(--danger)" : "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--bg-raised)", fontFamily: "var(--font-mono)", textAlign: "right" }}
        onChange={(e) => {
          setPrice(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
      />
      <button type="button" className="btn btn-secondary" onClick={save}>
        Save
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          if (window.confirm(`Delete "${item.name}"?`)) onDelete(item.id);
        }}
      >
        Delete
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write `CapturePage.tsx`** (owns state + the sync queue)

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCentavos } from "../lib/money";
import { SyncQueue } from "../lib/syncQueue";
import { ItemComposer } from "./ItemComposer";
import { ItemRow, type CaptureItem } from "./ItemRow";

interface CapturePageProps {
  activity: { id: string; title: string | null; typeName: string; startedAt: string };
  initialItems: CaptureItem[];
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function CapturePage({ activity, initialItems }: CapturePageProps) {
  const [items, setItems] = useState<CaptureItem[]>(initialItems);
  const [pending, setPending] = useState(0);
  const [failing, setFailing] = useState(false);
  const queueRef = useRef<SyncQueue | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const queue = new SyncQueue({
      activityId: activity.id,
      onChange: (count, isFailing) => {
        setPending(count);
        setFailing(isFailing);
      },
    });
    queueRef.current = queue;

    // Re-apply ops that survived a refresh on top of the server snapshot.
    setItems((current) => {
      let next = [...current];
      for (const op of queue.pendingOps()) {
        if (op.kind === "delete") {
          next = next.filter((i) => i.id !== op.itemId);
        } else if (op.body) {
          const existing = next.findIndex((i) => i.id === op.itemId);
          const restored = { id: op.itemId, ...op.body };
          if (existing >= 0) next[existing] = restored;
          else next.push(restored);
        }
      }
      return next.sort((a, b) => a.position - b.position);
    });
    queue.flush();

    const flush = () => queue.flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", flush);
      queue.dispose();
    };
  }, [activity.id]);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.amountCentavos, 0),
    [items]
  );

  function addItem(name: string, amountCentavos: number) {
    const id = crypto.randomUUID();
    const position = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const item = { id, name, amountCentavos, position };
    setItems((prev) => [...prev, item]);
    queueRef.current?.enqueue({ kind: "put", itemId: id, body: { name, amountCentavos, position } });
    requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ block: "nearest" }));
  }

  function editItem(id: string, name: string, amountCentavos: number) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name, amountCentavos } : i)));
    queueRef.current?.enqueue({
      kind: "put",
      itemId: id,
      body: { name, amountCentavos, position: item.position },
    });
  }

  function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    queueRef.current?.enqueue({ kind: "delete", itemId: id });
  }

  return (
    <article className="doc" style={{ display: "flex", flexDirection: "column", minHeight: "70vh" }}>
      <header className="exp-header">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>
            {activity.title ?? activity.typeName}
          </h1>
          <p className="caption" style={{ margin: 0, color: "var(--fg-muted)" }}>
            {activity.title ? `${activity.typeName} · ` : ""}
            {DATE_FORMAT.format(new Date(activity.startedAt))}
            {items.length > 0 ? ` · ${items.length} ${items.length === 1 ? "item" : "items"}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          {pending > 0 ? (
            <span className="exp-unsynced">
              {failing ? "Could not sync — retrying" : `${pending} unsynced`}
            </span>
          ) : null}
          <span className="exp-total">{formatCentavos(total)}</span>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, paddingTop: "var(--sp-3)" }}>
        {items.length === 0 ? (
          <p className="lead">No items yet. Type the first one below.</p>
        ) : (
          items.map((item) => (
            <ItemRow key={item.id} item={item} onEdit={editItem} onDelete={deleteItem} />
          ))
        )}
        <div ref={listEndRef} />
      </div>

      <ItemComposer onAdd={addItem} />
    </article>
  );
}
```

- [ ] **Step 5: Verify in the dev server**

Run: `bun run dev`, start a grocery activity, then:
- Type "Eggs", Enter → focus jumps to price. Type "215.50", Enter → row appears, total reads ₱215.50, focus is back on the name field, both fields cleared.
- Add a second item; total sums.
- Tap a row → inline edit; change the price, save → total updates.
- DevTools → Network → Offline: add an item → it appears, "1 unsynced" pill shows, then "Could not sync — retrying". Go back online → pill clears. Refresh while offline with pending ops → items reappear after reload (queue restore).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(systems\)/expenses/\[id\]/ src/systems/expenses/components/
git commit -m "feat(expenses): add in-store capture page with optimistic sync"
```

---

### Task 14: Trends page with Recharts

**Files:**
- Modify: `package.json` (add recharts)
- Create: `src/systems/expenses/components/TrendsChart.tsx`
- Create: `src/systems/expenses/components/StatCards.tsx`
- Create: `src/app/(systems)/expenses/trends/page.tsx`

- [ ] **Step 1: Install Recharts**

Run: `bun add recharts@^2.15.4`
Expected: installs cleanly (peer range includes React 19).

- [ ] **Step 2: Write `TrendsChart.tsx`** (the only file that imports recharts; token-themed exactly as validated in the side-by-side sample)

```tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCentavos } from "../lib/money";

export interface TrendsChartProps {
  months: Array<{ key: string; label: string }>;
  byMonth: Array<{ month: string; typeName: string; totalCentavos: number }>;
}

const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const TICK_STYLE = {
  fill: "var(--fg-faint)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

export function TrendsChart({ months, byMonth }: TrendsChartProps) {
  const typeNames = [...new Set(byMonth.map((r) => r.typeName))];
  const data = months.map((m) => {
    const row: Record<string, string | number> = { month: m.label };
    for (const t of typeNames) {
      row[t] =
        (byMonth.find((r) => r.month === m.key && r.typeName === t)?.totalCentavos ?? 0) / 100;
    }
    return row;
  });

  if (typeNames.length === 0) {
    return <p className="lead">No activity in this range yet.</p>;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={3} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tick={TICK_STYLE} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={TICK_STYLE}
            tickFormatter={(v: number) => (v === 0 ? "0" : `₱${v >= 1000 ? `${v / 1000}k` : v}`)}
          />
          <Tooltip
            formatter={(v) => formatCentavos(Math.round(Number(v) * 100))}
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
          {typeNames.map((t, i) => (
            <Bar key={t} dataKey={t} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Write `StatCards.tsx`** (server-safe, no hooks)

```tsx
import { formatCentavos } from "../lib/money";

export interface TypeStatsRow {
  typeId: string;
  typeName: string;
  thisMonthCentavos: number;
  lastMonthCentavos: number;
  avgPerActivityCentavos: number;
  activityCount: number;
}

export function StatCards({ stats }: { stats: TypeStatsRow[] }) {
  if (stats.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "var(--sp-3)",
        marginBottom: "var(--sp-6)",
      }}
    >
      {stats.map((s) => (
        <div key={s.typeId} className="paper-card" style={{ padding: "var(--sp-4)" }}>
          <p className="overline" style={{ margin: 0 }}>{s.typeName}</p>
          <p style={{ margin: "var(--sp-1) 0 0", fontFamily: "var(--font-mono)", fontSize: "var(--fs-xl)", fontWeight: 500 }}>
            {formatCentavos(s.thisMonthCentavos)}
          </p>
          <p className="caption" style={{ margin: "var(--sp-1) 0 0", color: "var(--fg-muted)" }}>
            {formatCentavos(s.lastMonthCentavos)} last month ·{" "}
            {formatCentavos(s.avgPerActivityCentavos)} avg · {s.activityCount}{" "}
            {s.activityCount === 1 ? "activity" : "activities"}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `trends/page.tsx`** (server; range toggle via search param)

```tsx
import Link from "next/link";
import { getTrends } from "@/systems/expenses/services/trends";
import { TrendsChart } from "@/systems/expenses/components/TrendsChart";
import { StatCards } from "@/systems/expenses/components/StatCards";

const RANGES = [3, 6, 12] as const;

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const { months: monthsParam } = await searchParams;
  const months = RANGES.includes(Number(monthsParam) as 3 | 6 | 12)
    ? (Number(monthsParam) as 3 | 6 | 12)
    : 6;
  const trends = await getTrends(months);

  return (
    <article className="doc">
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--sp-4)" }}>
        <h1>Trends</h1>
        <nav aria-label="Range" style={{ display: "flex", gap: "var(--sp-1)" }}>
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/expenses/trends?months=${r}`}
              className={r === months ? "btn btn-secondary" : "btn btn-ghost"}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {r}m
            </Link>
          ))}
        </nav>
      </header>
      <StatCards stats={trends.byType} />
      <TrendsChart months={trends.months} byMonth={trends.byMonth} />
    </article>
  );
}
```

- [ ] **Step 5: Verify in the dev server**

Run: `bun run dev`, add a few items across two activities of different types, open `/expenses/trends`.
Expected: stat cards with peso amounts; the bar chart bucketing this month; range toggle re-renders with 3/6/12 months; empty state when a range has no data.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/app/\(systems\)/expenses/trends/ src/systems/expenses/components/TrendsChart.tsx src/systems/expenses/components/StatCards.tsx
git commit -m "feat(expenses): add trends page with recharts chart and stat cards"
```

---

### Task 15: Types settings page

**Files:**
- Create: `src/systems/expenses/components/TypesManager.tsx`
- Create: `src/app/(systems)/expenses/types/page.tsx`

- [ ] **Step 1: Write `TypesManager.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/_components/Icon";

export interface TypeRow {
  id: string;
  name: string;
  position: number;
  archived: boolean;
}

export function TypesManager({ types }: { types: TypeRow[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const active = types.filter((t) => !t.archived);
  const archived = types.filter((t) => t.archived);

  async function call(path: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(`/api/systems/expenses${path}`, {
      method,
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "The change did not save. Try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function addType() {
    if (!newName.trim()) return;
    if (await call("/types", "POST", { name: newName.trim() })) setNewName("");
  }

  async function rename(id: string) {
    if (!editName.trim()) return;
    if (await call(`/types/${id}`, "PATCH", { name: editName.trim() })) setEditingId(null);
  }

  async function move(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (other < 0 || other >= active.length) return;
    // Swap positions of the two adjacent rows.
    await call(`/types/${active[index].id}`, "PATCH", { position: active[other].position });
    await call(`/types/${active[other].id}`, "PATCH", { position: active[index].position });
  }

  return (
    <div>
      {error ? (
        <p className="caption" style={{ color: "var(--danger)" }}>{error}</p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {active.map((t, i) => (
          <div key={t.id} className="exp-row">
            {editingId === t.id ? (
              <>
                <input
                  type="text"
                  value={editName}
                  aria-label="Type name"
                  autoFocus
                  style={{ flex: 1, minWidth: 0, padding: "var(--sp-1) var(--sp-2)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--bg-raised)", font: "inherit" }}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void rename(t.id);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => rename(t.id)}>
                  Save
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}>{t.name}</span>
                <button type="button" className="btn btn-ghost" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <Icon name="chevron-down" size={14} style={{ transform: "rotate(180deg)" }} />
                </button>
                <button type="button" className="btn btn-ghost" aria-label={`Move ${t.name} down`} disabled={i === active.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="chevron-down" size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingId(t.id);
                    setEditName(t.name);
                  }}
                >
                  Rename
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => call(`/types/${t.id}`, "PATCH", { archived: true })}>
                  Archive
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <form
        style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-4)" }}
        onSubmit={(e) => {
          e.preventDefault();
          void addType();
        }}
      >
        <input
          type="text"
          value={newName}
          placeholder="New type"
          aria-label="New type name"
          style={{ flex: 1, minWidth: 0, padding: "var(--sp-2) var(--sp-3)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--bg-raised)", font: "inherit" }}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn btn-primary">
          Add type
        </button>
      </form>

      {archived.length > 0 ? (
        <details style={{ marginTop: "var(--sp-6)" }}>
          <summary className="overline" style={{ cursor: "pointer" }}>
            Archived
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: "var(--sp-2)" }}>
            {archived.map((t) => (
              <div key={t.id} className="exp-row">
                <span style={{ flex: 1, color: "var(--fg-muted)" }}>{t.name}</span>
                <button type="button" className="btn btn-ghost" onClick={() => call(`/types/${t.id}`, "PATCH", { archived: false })}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
```

(If `Icon` doesn't accept a `style` prop, wrap the up-arrow button's icon in a span with the rotate transform.)

- [ ] **Step 2: Write `types/page.tsx`**

```tsx
import { listTypes } from "@/systems/expenses/services/types";
import { TypesManager } from "@/systems/expenses/components/TypesManager";

export default async function TypesPage() {
  const types = await listTypes({ includeArchived: true });
  return (
    <article className="doc">
      <h1>Types</h1>
      <p className="lead">
        The fixed list behind the start buttons. Archive a type to hide it without losing its history.
      </p>
      <TypesManager
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          position: t.position,
          archived: t.archived,
        }))}
      />
    </article>
  );
}
```

- [ ] **Step 3: Verify in the dev server**

Run: `bun run dev`, open `/expenses/types`.
Expected: six seeded types in order; add/rename/reorder/archive all work and reflect on the index page's start buttons; archived types sit in the collapsed section with restore.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(systems\)/expenses/types/ src/systems/expenses/components/TypesManager.tsx
git commit -m "feat(expenses): add types settings page"
```

---

### Task 16: Final verification

- [ ] **Step 1: Full test suites**

Run: `bun run test`
Expected: all unit tests pass (money, months, syncQueue + existing suites).

Run: `bun run test:integration`
Expected: all integration tests pass (expenses services/routes + existing journal suites).

- [ ] **Step 2: Lint and typecheck**

Run: `bun run lint && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Production build**

Run: `bun run build`
Expected: builds without errors (catches server/client component boundary mistakes and the recharts import).

- [ ] **Step 4: Manual capture-flow checklist (dev server)**

1. Sidebar shows "Expenses" with the receipt icon.
2. Start → type → capture in two taps.
3. Enter-Enter rhythm: name → Enter → price (keypad on mobile) → Enter → next item, total updates, focus back on name.
4. Edit and delete items; totals follow.
5. Offline test: DevTools offline → add items → "n unsynced" → online → clears. Refresh while offline → items restored from the queue.
6. Trends: stat cards + chart with token colors; range toggle works.
7. Types: full CRUD; archive hides from start buttons, keeps trends.
8. Phone check (same LAN): open `http://<dev-machine-ip>:3000/expenses`, run one real capture session.

- [ ] **Step 5: Update the spec status and commit**

Change the spec's `**Status:**` line from `Approved` to `Shipped (implementation plan: 2026-06-12-activity-expenses-plan.md)`.

```bash
git add docs/superpowers/specs/2026-06-12-activity-expenses-design.md
git commit -m "docs: mark activity expenses spec as shipped"
```

---

## Self-review notes

- **Spec coverage:** data model (Task 1), money/months helpers (2–3), schemas (4), services incl. metrics (5–7), routes incl. idempotency + conflict (8), manifest/icon/palette (9), sync queue (10), tokens/CSS (11), index + start flow (12), capture UX (13), trends with Recharts + stat cards + range toggle (14), types settings (15), verification incl. phone test (16). Feedback metrics ship inside `startActivity` and `recordActivityMetrics`. Out-of-scope items have no tasks, as intended.
- **Known judgment calls:** metrics are recorded on every item mutation (two `SystemMetric` rows per sync) — acceptable for a single user; revisit if it ever shows up in sync latency. `items_per_activity` and `activity_total_centavos` are recorded as running snapshots since activities have no "finish" event.
- **Executor cautions:** read `src/systems/index.ts` before editing (export shape), check `Icon.tsx` prop names, check `@/platform/palette/types` for the icon union, and confirm the exact token names in `globals.css` before relying on `--ring`/`--r-full`.
