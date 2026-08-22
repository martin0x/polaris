# Phase 2 — Expenses on Convex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the expenses system — schema, services, capture UI, trends, dashboard widget, palette layer — from REST+Prisma to Convex, retire `SyncQueue`, run the data-import playbook end to end for the first real system, and replace the live-Postgres integration tests with `convex-test`.

**Architecture:** Three Convex tables (`expenseActivityTypes`, `expenseActivities`, `expenseItems`) join the schema next to the feedback tables, with `legacyId` import keys and ms-number timestamps. Services port to `convex/expenses/{types,activities,trends,dashboard}.ts` returning plain DTOs; Zod route schemas collapse into argument validators plus in-handler checks; feedback metrics move to `ctx.scheduler.runAfter(0, …)` so they can never fail a user action. The web splits by need: the capture and list/types pages become reactive (`preloadQuery` on the server, `usePreloadedQuery`/`useMutation` with optimistic updates in the client — the first `useQuery`-family usage in the codebase), while trends, dashboard, and the palette layer stay server-side over `fetchQuery`. Items keep their client-generated ids as an indexed `clientId` field, preserving idempotent-upsert and cross-activity-conflict semantics. Trends and the dashboard's Manila-time SQL become TypeScript over an indexed `startedAt` range, using new Intl-free helpers in `@polaris/core/months` (safe in Convex's runtime, and later Hermes on mobile).

**Tech Stack:** Bun 1.3.x (toolchain only), Next.js 16.2.4 (pinned), Convex ^1.44.0, `@convex-dev/auth` 0.0.95 (exact pin), convex-test ^0.0.55, Vitest 4.1.x (edge-runtime env in backend), Prisma 7 (export source only; expense tables stay as frozen archive).

**Spec:** `docs/replatform.md` — §05 "Phase 2 — Expenses on Convex", §06 data migration playbook, §07 improvements (scheduler metrics, one validation layer, tags/join N/A here), §08 risk row "Offline capture: Convex's queue doesn't survive a page reload".

## Global Constraints

- Work on branch `phase-2-expenses` in worktree `.claude/worktrees/phase-2-expenses`, branched from `replatform`. Merge back to `replatform` only. **Never commit to `main` or push `main`.**
- Bun is toolchain only: `bun install/add/run`, `bunx`. **Never `bun test`** (that's Bun's own runner; tests run via `bun run test` → Vitest).
- Next.js 16.2.4 pinned; before touching web conventions, consult `apps/web/node_modules/next/dist/docs/` (AGENTS.md rule — this Next differs from training data).
- UI work obeys `docs/design/polaris-design-system.md`: tokens never hex, sentence case, error copy names the failure and the recovery, no new icon sets. Existing expenses copy is already compliant — preserve it verbatim unless a task says otherwise.
- Data-shape rules: Postgres cuids → indexed `legacyId` string; `DateTime` → ms numbers; imports idempotent by `legacyId` upsert (`ctx.db.replace`); parents imported before children.
- **Prisma expense models are NOT dropped** — `ExpenseActivityType`/`ExpenseActivity`/`ExpenseItem` stay in `apps/web/prisma/schema.prisma` as the frozen archive until Phase 5. Do not run `prisma migrate`. (Known drift on `journal_entries.search_vector` is Phase 3's — leave it alone.)
- Backend commit ritual: `bunx convex codegen && bun run test` (in `packages/backend`), then `bunx convex dev --once` (pushes to dev deployment `dev:exciting-wolf-282`) before committing backend changes.
- Conventional commits, scoped (`feat(expenses): …`, `feat(backend): …`, `test(expenses): …`, `chore(expenses): …`); commit at the end of every task.
- Convex function conventions (from Phase 1): errors are `throw new ConvexError("<sentence>")`; auth gate is `await ctx.auth.getUserIdentity()` → `ConvexError("Unauthorized")` when only "signed in?" matters; **no per-row userId** (single-user system); reads go through `.withIndex(…)`, never `.filter()`, never unbounded `.collect()` except in internal verification queries; table names camelCase plural; index names `by_<snake_case_fields>`; timestamps `v.number()` named `<verb>At`.
- `bunx convex run` stdout mixes log lines with pretty-printed JSON — always parse with the `parseConvexRunResult` helper (Phase 1 bugfix), never `.split("\n").at(-1)`.
- Bun 1.3.14 does not forward `.env` to node-shebang children: `bun run test:integration` (web) needs `DATABASE_URL` exported in the shell first.

## Deliberate deviations (decision log — reviewers read this first)

1. **Zero-call-site reads are not ported** (Phase 1 YAGNI rule): `GET /activities`' `cursor` + `typeId` params and `getTypeById` have no client callers — `expenses.list` takes only `limit`.
2. **`createdAt`/`updatedAt` are carried only where consumed:** types keep `createdAt` (ordering tie-break); activities keep `startedAt` only; items carry neither. Postgres archive retains everything until Phase 5.
3. **`remove`/`removeItem` are tolerant of already-deleted targets** (old REST 404'd on missing activity): under a reactive UI, double-fires are expected; idempotent delete is safer. The cross-activity item conflict (old 409) is preserved as `ConvexError`.
4. **The types reorder swap becomes one atomic `swap` mutation** (old client issued two sequential PATCHes with a bail-out guard).
5. **The capture badge simplifies:** `pending` = in-flight mutation count (Convex retries transient failures itself); the old `failing`/backoff state goes away. A rejected mutation rolls back its optimistic update. Accepted risk (spec §08): Convex's offline queue does not survive a page reload — the localStorage journal is the named escape hatch if it bites, not built now.
6. **`activities.get` accepts a string id with a `legacyId` fallback**, so pre-migration bookmark URLs (`/expenses/<cuid>`) keep resolving after the flip.
7. **Trends/dashboard/palette stay server-rendered over `fetchQuery`** (no reactivity needed); index, types, and capture pages become reactive via `preloadQuery`/`usePreloadedQuery`.

## File Structure

```
packages/core/src/months.ts                     # + Intl-free Manila helpers (Task 1)
packages/core/src/months.test.ts                # + equivalence tests
packages/backend/convex/schema.ts               # + 3 expense tables (Task 2)
packages/backend/convex/expenses/types.ts       # list/create/update/swap (Task 2)
packages/backend/convex/expenses/activities.ts  # start/get/list/update/remove/search (Task 3)
packages/backend/convex/expenses/items.ts       # putItem/removeItem + metric snapshots (Task 4)
packages/backend/convex/expenses/trends.ts      # trends aggregation (Task 5)
packages/backend/convex/expenses/dashboard.ts   # dashboard summary (Task 5)
packages/backend/convex/feedback.ts             # + internal `record` mutation (Task 3)
packages/backend/convex/migrations.ts           # + importExpense* + expenseStats (Task 6)
packages/backend/test/expenses-{types,activities,items,trends,migrations}.test.ts
apps/web/scripts/export-expenses.ts             # Prisma → JSONL (Task 7)
apps/web/scripts/verify-expenses-import.ts      # checksums vs expenseStats (Task 7)
packages/backend/scripts/import-expenses.ts     # batched convex run driver (Task 7)
apps/web/src/app/(systems)/expenses/*           # 4 pages repointed (Tasks 8–11)
apps/web/src/systems/expenses/components/*      # TypesManager/StartButtons/ActivityList/CapturePage rewired
apps/web/src/systems/expenses/{palette.ts,dashboard.tsx}  # fetchQuery repoint (Task 9)
apps/web/src/systems/expenses/{routes,services,schemas,lib}/  # DELETED (Tasks 11–12)
apps/web/src/systems/{types.ts,expenses/manifest.ts}      # routes table optional/removed (Task 12)
docs/replatform.md §06 + docs/superpowers/plans/2026-08-22-phase-2-cutover-runbook.md (Task 13)
```

## Worktree setup (before Task 1)

- [ ] From the main checkout (`/Users/raymartvillos/Projects/polaris`, on `replatform`, clean):

```bash
git worktree add .claude/worktrees/phase-2-expenses -b phase-2-expenses replatform
cd .claude/worktrees/phase-2-expenses
bun install
# gitignored env files don't travel with the worktree — copy them:
for f in packages/backend/.env.local apps/web/.env apps/web/.env.local; do
  [ -f "/Users/raymartvillos/Projects/polaris/$f" ] && cp "/Users/raymartvillos/Projects/polaris/$f" "$f"
done
```

- [ ] Baseline: `bun run test` from the worktree root — all green before any change. (Integration tests need Docker Postgres up and `DATABASE_URL_TEST` set inline, e.g. `DATABASE_URL_TEST=postgresql://polaris:polaris@localhost:5440/polaris_test bun run test:integration` — Bun 1.3.14 doesn't forward `.env` to node-shebang children. `DATABASE_URL` is for the playbook scripts, `DATABASE_URL_TEST` for the test suite.)
- [ ] Commit the plan doc if it isn't already on the branch: `git add docs/superpowers/plans/2026-08-22-phase-2-expenses.md && git commit -m "docs: phase 2 expenses implementation plan"`

---

### Task 1: Intl-free Manila month/day helpers in `@polaris/core`

Convex's runtime (and later Hermes on mobile) can't be trusted with `Intl` + named time zones. Manila is fixed UTC+8, no DST, so pure arithmetic is exact. The existing Intl-based helpers stay (web uses them); the new ones must agree with them.

**Files:**
- Modify: `packages/core/src/months.ts`
- Test: `packages/core/src/months.test.ts`

**Interfaces:**
- Produces: `manilaMonthKeyFromMs(ms: number): string` ("YYYY-MM"), `manilaDayKeyFromMs(ms: number): string` ("YYYY-MM-DD"), `lastNMonthKeysFromMs(n: number, nowMs: number): MonthBucket[]`, `manilaMonthStartMs(key: string): number`. Existing `MonthBucket { key: string; label: string }` unchanged.

- [ ] **Step 1: Write the failing tests** — append to `packages/core/src/months.test.ts`:

```ts
describe("Intl-free Manila helpers", () => {
  // Sample instants that cross Manila boundaries: late-night UTC rolls into
  // the next Manila day/month.
  const samples = [
    Date.UTC(2026, 5, 30, 15, 59, 59), // 2026-06-30 23:59:59 Manila
    Date.UTC(2026, 5, 30, 16, 0, 0),   // 2026-07-01 00:00:00 Manila
    Date.UTC(2026, 0, 31, 20, 0, 0),   // 2026-02-01 Manila
    Date.UTC(2025, 11, 31, 15, 0, 0),  // 2025-12-31 23:00 Manila
    Date.UTC(2025, 11, 31, 17, 30, 0), // 2026-01-01 01:30 Manila
  ];

  it("manilaMonthKeyFromMs matches manilaMonthKey", () => {
    for (const ms of samples) {
      expect(manilaMonthKeyFromMs(ms)).toBe(manilaMonthKey(new Date(ms)));
    }
  });

  it("manilaDayKeyFromMs formats the Manila calendar day", () => {
    expect(manilaDayKeyFromMs(Date.UTC(2026, 5, 30, 15, 59, 59))).toBe("2026-06-30");
    expect(manilaDayKeyFromMs(Date.UTC(2026, 5, 30, 16, 0, 0))).toBe("2026-07-01");
  });

  it("lastNMonthKeysFromMs matches lastNMonthKeys", () => {
    for (const ms of samples) {
      for (const n of [3, 6, 12]) {
        expect(lastNMonthKeysFromMs(n, ms)).toEqual(lastNMonthKeys(n, new Date(ms)));
      }
    }
  });

  it("manilaMonthStartMs matches manilaMonthStart", () => {
    for (const key of ["2026-01", "2026-06", "2025-12"]) {
      expect(manilaMonthStartMs(key)).toBe(manilaMonthStart(key).getTime());
    }
  });
});
```

Add the new names to the import at the top of the test file.

- [ ] **Step 2: Run to verify failure** — `cd packages/core && bun run test` (or `bunx vitest run src/months.test.ts`). Expected: FAIL, functions not exported.

- [ ] **Step 3: Implement** — append to `packages/core/src/months.ts`:

```ts
// ── Intl-free variants ──────────────────────────────────────────────────────
// Manila is UTC+8 with no DST, so calendar math is a fixed offset. These are
// safe in runtimes without full ICU (Convex functions, Hermes on mobile).

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function manilaMonthKeyFromMs(ms: number): string {
  const d = new Date(ms + MANILA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function manilaDayKeyFromMs(ms: number): string {
  const d = new Date(ms + MANILA_OFFSET_MS);
  return `${manilaMonthKeyFromMs(ms)}-${pad2(d.getUTCDate())}`;
}

export function lastNMonthKeysFromMs(n: number, nowMs: number): MonthBucket[] {
  const [year, month] = manilaMonthKeyFromMs(nowMs).split("-").map(Number);
  const out: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push({
      key: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`,
      label: MONTH_LABELS[d.getUTCMonth()],
    });
  }
  return out;
}

export function manilaMonthStartMs(key: string): number {
  return Date.parse(`${key}-01T00:00:00+08:00`);
}
```

- [ ] **Step 4: Run tests** — same command. Expected: PASS (all months.test.ts cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/months.ts packages/core/src/months.test.ts
git commit -m "feat(core): Intl-free Manila month/day helpers for Convex and Hermes"
```

---

### Task 2: Schema — three expense tables + the types module

**Files:**
- Modify: `packages/backend/convex/schema.ts` (insert at the `// … system tables in phase 2.` comment's schema, after the feedback tables)
- Create: `packages/backend/convex/expenses/types.ts`
- Test: `packages/backend/test/expenses-types.test.ts`

**Interfaces:**
- Produces (schema): tables `expenseActivityTypes`, `expenseActivities`, `expenseItems` as defined below.
- Produces (functions): `api.expenses.types.list({ includeArchived?: boolean }) → TypeRow[]` where `TypeRow = { id: Id<"expenseActivityTypes">; name: string; position: number; archived: boolean }`; `api.expenses.types.create({ name }) → TypeRow`; `api.expenses.types.update({ id, name?, archived?, position? }) → TypeRow`; `api.expenses.types.swap({ first, second }) → null`. All gate on a signed-in identity.

- [ ] **Step 1: Add the tables** to `packages/backend/convex/schema.ts`, after `systemIterations`:

```ts
  // Expenses (phase 2). startedAt/createdAt/archivedAt are ms since epoch;
  // legacyId carries the Postgres cuid (items: the client-generated uuid).
  expenseActivityTypes: defineTable({
    name: v.string(),
    position: v.number(),
    archived: v.boolean(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(), // kept: ordering tie-break when positions collide
    legacyId: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_legacy_id", ["legacyId"]),
  expenseActivities: defineTable({
    typeId: v.id("expenseActivityTypes"),
    title: v.optional(v.string()),
    startedAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_type", ["typeId"])
    .index("by_started_at", ["startedAt"])
    .index("by_legacy_id", ["legacyId"]),
  expenseItems: defineTable({
    activityId: v.id("expenseActivities"),
    // Client-generated uuid — the idempotent-upsert key for capture syncs.
    // For imported rows it equals legacyId (the old Prisma primary key).
    clientId: v.string(),
    name: v.string(),
    amountCentavos: v.number(),
    position: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_activity", ["activityId"])
    .index("by_client_id", ["clientId"])
    .index("by_legacy_id", ["legacyId"]),
```

- [ ] **Step 2: Write the failing tests** — `packages/backend/test/expenses-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// Tests live outside convex/ so the CLI never bundles them; that means
// convex-test needs the module map passed explicitly.
const modules = import.meta.glob("../convex/**/*.*s");

describe("expenses types", () => {
  it("rejects unauthenticated reads and writes", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.expenses.types.list, {})).rejects.toThrow();
    await expect(t.mutation(api.expenses.types.create, { name: "Groceries" })).rejects.toThrow();
  });

  it("creates types with incrementing position", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const a = await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
    const b = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  it("trims names and rejects empty or over-40-char names", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const created = await asUser.mutation(api.expenses.types.create, { name: "  Dining  " });
    expect(created.name).toBe("Dining");
    await expect(asUser.mutation(api.expenses.types.create, { name: "   " })).rejects.toThrow();
    await expect(
      asUser.mutation(api.expenses.types.create, { name: "x".repeat(41) })
    ).rejects.toThrow();
  });

  it("rejects a duplicate name on create and rename", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
    const other = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
    await expect(asUser.mutation(api.expenses.types.create, { name: "Groceries" })).rejects.toThrow();
    await expect(
      asUser.mutation(api.expenses.types.update, { id: other.id, name: "Groceries" })
    ).rejects.toThrow();
  });

  it("lists non-archived by position, includes archived on request", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const a = await asUser.mutation(api.expenses.types.create, { name: "A" });
    await asUser.mutation(api.expenses.types.create, { name: "B" });
    await asUser.mutation(api.expenses.types.update, { id: a.id, archived: true });
    const active = await asUser.query(api.expenses.types.list, {});
    expect(active.map((x) => x.name)).toEqual(["B"]);
    const all = await asUser.query(api.expenses.types.list, { includeArchived: true });
    expect(all.map((x) => x.name)).toEqual(["A", "B"]);
  });

  it("archive sets archivedAt; unarchive clears it", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const created = await asUser.mutation(api.expenses.types.create, { name: "A" });
    await asUser.mutation(api.expenses.types.update, { id: created.id, archived: true });
    let doc = await t.run(async (ctx) => ctx.db.get(created.id));
    expect(doc!.archived).toBe(true);
    expect(typeof doc!.archivedAt).toBe("number");
    await asUser.mutation(api.expenses.types.update, { id: created.id, archived: false });
    doc = await t.run(async (ctx) => ctx.db.get(created.id));
    expect(doc!.archived).toBe(false);
    expect(doc!.archivedAt).toBeUndefined();
  });

  it("update requires at least one field", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const created = await asUser.mutation(api.expenses.types.create, { name: "A" });
    await expect(asUser.mutation(api.expenses.types.update, { id: created.id })).rejects.toThrow();
  });

  it("swap exchanges the positions of two types atomically", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user1|session1" });
    const a = await asUser.mutation(api.expenses.types.create, { name: "A" });
    const b = await asUser.mutation(api.expenses.types.create, { name: "B" });
    await asUser.mutation(api.expenses.types.swap, { first: a.id, second: b.id });
    const list = await asUser.query(api.expenses.types.list, {});
    expect(list.map((x) => x.name)).toEqual(["B", "A"]);
  });
});
```

- [ ] **Step 3: Run to verify failure** — `cd packages/backend && bunx convex codegen && bun run test`. Expected: the new file fails (`api.expenses` undefined); existing suites stay green. (Codegen may need the module file to exist first — if it errors, create `convex/expenses/types.ts` with a placeholder `export {}`, codegen, then proceed.)

- [ ] **Step 4: Implement** `packages/backend/convex/expenses/types.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

async function assertSignedIn(ctx: QueryCtx | MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new ConvexError("Unauthorized");
}

function assertTypeName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > 40) {
    throw new ConvexError("Type name must be 1-40 characters");
  }
  return name;
}

async function assertNameFree(ctx: MutationCtx, name: string): Promise<void> {
  const existing = await ctx.db
    .query("expenseActivityTypes")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (existing !== null) throw new ConvexError(`Type "${name}" already exists`);
}

function toRow(doc: Doc<"expenseActivityTypes">) {
  return { id: doc._id, name: doc.name, position: doc.position, archived: doc.archived };
}

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const all = await ctx.db.query("expenseActivityTypes").collect(); // small table
    return all
      .filter((t) => args.includeArchived || !t.archived)
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
      .map(toRow);
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = assertTypeName(args.name);
    await assertNameFree(ctx, name);
    const all = await ctx.db.query("expenseActivityTypes").collect();
    const position = all.reduce((max, t) => Math.max(max, t.position), -1) + 1;
    const id = await ctx.db.insert("expenseActivityTypes", {
      name,
      position,
      archived: false,
      createdAt: Date.now(),
    });
    return toRow((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    id: v.id("expenseActivityTypes"),
    name: v.optional(v.string()),
    archived: v.optional(v.boolean()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if (args.name === undefined && args.archived === undefined && args.position === undefined) {
      throw new ConvexError("At least one field required");
    }
    const doc = await ctx.db.get(args.id);
    if (doc === null) throw new ConvexError("Type not found");
    const patch: Partial<Doc<"expenseActivityTypes">> = {};
    if (args.name !== undefined) {
      const name = assertTypeName(args.name);
      if (name !== doc.name) await assertNameFree(ctx, name);
      patch.name = name;
    }
    if (args.position !== undefined) patch.position = args.position;
    if (args.archived !== undefined) {
      patch.archived = args.archived;
      patch.archivedAt = args.archived ? Date.now() : undefined;
    }
    await ctx.db.patch(args.id, patch);
    return toRow((await ctx.db.get(args.id))!);
  },
});

// Atomic replacement for the old two-PATCH reorder swap: two rows can never
// be left sharing a position by a half-applied swap.
export const swap = mutation({
  args: { first: v.id("expenseActivityTypes"), second: v.id("expenseActivityTypes") },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const [a, b] = await Promise.all([ctx.db.get(args.first), ctx.db.get(args.second)]);
    if (a === null || b === null) throw new ConvexError("Type not found");
    await ctx.db.patch(a._id, { position: b.position });
    await ctx.db.patch(b._id, { position: a.position });
    return null;
  },
});
```

Note: `ctx.db.patch` with an explicit `undefined` value removes the field — that is how unarchive clears `archivedAt`.

- [ ] **Step 5: Run tests** — `bunx convex codegen && bun run test`. Expected: PASS (all backend suites).

- [ ] **Step 6: Push schema to dev and commit**

```bash
bunx convex dev --once
git add convex/schema.ts convex/expenses/types.ts convex/_generated test/expenses-types.test.ts
git commit -m "feat(backend): expense tables and types module on Convex"
```

---

### Task 3: Activities module + internal feedback record

**Files:**
- Create: `packages/backend/convex/expenses/activities.ts`
- Modify: `packages/backend/convex/feedback.ts` (add `record` internalMutation)
- Test: `packages/backend/test/expenses-activities.test.ts`

**Interfaces:**
- Consumes: schema tables (Task 2), `internal.feedback.record`.
- Produces:
  - `internal.feedback.record({ system, name, value }) → void` — trusted internal metric insert, no serviceKey.
  - `api.expenses.activities.start({ typeId: Id<"expenseActivityTypes">, title?: string }) → Id<"expenseActivities">`
  - `api.expenses.activities.get({ id: string }) → ActivityDetail | null` where `ActivityDetail = { id: Id<"expenseActivities">; title: string | null; typeId: Id<"expenseActivityTypes">; typeName: string; startedAt: number; items: Array<{ clientId: string; name: string; amountCentavos: number; position: number }> }`
  - `api.expenses.activities.list({ limit?: number }) → { activities: ActivitySummary[] }` where `ActivitySummary = { id; typeId; typeName; title: string | null; startedAt: number; itemCount: number; totalCentavos: number }`
  - `api.expenses.activities.update({ id: Id<"expenseActivities">, title?: string | null, typeId?: Id<"expenseActivityTypes"> }) → null`
  - `api.expenses.activities.remove({ id: Id<"expenseActivities"> }) → null` (cascades items; tolerant of missing)
  - `api.expenses.activities.search({ query: string }) → Array<{ id; title: string | null; typeName: string; startedAt: number }>` (top 10, newest first)
  - Module-local export `loadItems(ctx, activityId)` used by Task 4.

- [ ] **Step 1: Add the internal metric mutation** to `packages/backend/convex/feedback.ts`, after `recordMetric`:

```ts
// Internal twin of recordMetric for calls that originate inside Convex
// (scheduled from other modules' mutations) — no service key needed.
export const record = internalMutation({
  args: { system: v.string(), name: v.string(), value: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("systemMetrics", {
      system: args.system,
      name: args.name,
      value: args.value,
      recordedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Write the failing tests** — `packages/backend/test/expenses-activities.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const type = await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
  return { t, asUser, type };
}

describe("expenses activities", () => {
  it("starts an activity and reads it back with its type", async () => {
    const { asUser, type } = await setup();
    const id = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    const detail = await asUser.query(api.expenses.activities.get, { id });
    expect(detail).not.toBeNull();
    expect(detail!.typeName).toBe("Groceries");
    expect(detail!.title).toBeNull();
    expect(detail!.items).toEqual([]);
    expect(typeof detail!.startedAt).toBe("number");
  });

  it("start records an activity_started metric via the scheduler", async () => {
    vi.useFakeTimers();
    const { t, asUser, type } = await setup();
    await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    await t.finishInProgressScheduledFunctions();
    vi.useRealTimers();
    const metrics = await t.run(async (ctx) => ctx.db.query("systemMetrics").collect());
    expect(metrics).toContainEqual(
      expect.objectContaining({ system: "expenses", name: "activity_started", value: 1 })
    );
  });

  it("start rejects a deleted typeId", async () => {
    const { t, asUser, type } = await setup();
    await t.run(async (ctx) => ctx.db.delete(type.id));
    await expect(
      asUser.mutation(api.expenses.activities.start, { typeId: type.id })
    ).rejects.toThrow();
  });

  it("get returns null for an unknown id and resolves legacy ids", async () => {
    const { t, asUser, type } = await setup();
    expect(await asUser.query(api.expenses.activities.get, { id: "nonsense" })).toBeNull();
    await t.run(async (ctx) =>
      ctx.db.insert("expenseActivities", {
        typeId: type.id,
        startedAt: Date.now(),
        legacyId: "clegacy123",
      })
    );
    const detail = await asUser.query(api.expenses.activities.get, { id: "clegacy123" });
    expect(detail).not.toBeNull();
  });

  it("lists newest first with item counts and centavo totals, respecting limit", async () => {
    const { t, asUser, type } = await setup();
    const first = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    const second = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    await t.run(async (ctx) => {
      await ctx.db.patch(first, { startedAt: 1_000 });
      await ctx.db.patch(second, { startedAt: 2_000 });
      await ctx.db.insert("expenseItems", {
        activityId: first, clientId: "i1", name: "Milk", amountCentavos: 8950, position: 0,
      });
      await ctx.db.insert("expenseItems", {
        activityId: first, clientId: "i2", name: "Bread", amountCentavos: 6050, position: 1,
      });
    });
    const { activities } = await asUser.query(api.expenses.activities.list, {});
    expect(activities.map((a) => a.id)).toEqual([second, first]);
    expect(activities[1].itemCount).toBe(2);
    expect(activities[1].totalCentavos).toBe(15000);
    const limited = await asUser.query(api.expenses.activities.list, { limit: 1 });
    expect(limited.activities).toHaveLength(1);
  });

  it("updates and clears the title, and moves type", async () => {
    const { asUser, type } = await setup();
    const other = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
    const id = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    await asUser.mutation(api.expenses.activities.update, { id, title: "Weekly run" });
    expect((await asUser.query(api.expenses.activities.get, { id }))!.title).toBe("Weekly run");
    await asUser.mutation(api.expenses.activities.update, { id, title: null, typeId: other.id });
    const detail = await asUser.query(api.expenses.activities.get, { id });
    expect(detail!.title).toBeNull();
    expect(detail!.typeName).toBe("Transit");
  });

  it("remove cascades items and tolerates a repeat", async () => {
    const { t, asUser, type } = await setup();
    const id = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    await t.run(async (ctx) =>
      ctx.db.insert("expenseItems", {
        activityId: id, clientId: "i1", name: "Milk", amountCentavos: 100, position: 0,
      })
    );
    await asUser.mutation(api.expenses.activities.remove, { id });
    await asUser.mutation(api.expenses.activities.remove, { id }); // idempotent
    expect(await asUser.query(api.expenses.activities.get, { id })).toBeNull();
    const items = await t.run(async (ctx) => ctx.db.query("expenseItems").collect());
    expect(items).toEqual([]);
  });

  it("search matches title or type name, capped at 10, newest first", async () => {
    const { asUser, type } = await setup();
    const a = await asUser.mutation(api.expenses.activities.start, {
      typeId: type.id, title: "Costco run",
    });
    await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
    const byTitle = await asUser.query(api.expenses.activities.search, { query: "costco" });
    expect(byTitle.map((r) => r.id)).toEqual([a]);
    const byType = await asUser.query(api.expenses.activities.search, { query: "grocer" });
    expect(byType).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run to verify failure** — `bunx convex codegen && bun run test`. Expected: FAIL on the new suite only.

- [ ] **Step 4: Implement** `packages/backend/convex/expenses/activities.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

async function assertSignedIn(ctx: QueryCtx | MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new ConvexError("Unauthorized");
}

export async function loadItems(ctx: QueryCtx | MutationCtx, activityId: Id<"expenseActivities">) {
  const items = await ctx.db
    .query("expenseItems")
    .withIndex("by_activity", (q) => q.eq("activityId", activityId))
    .collect();
  return items.sort((a, b) => a.position - b.position);
}

async function typeName(
  ctx: QueryCtx | MutationCtx,
  typeId: Id<"expenseActivityTypes">
): Promise<string> {
  const type = await ctx.db.get(typeId);
  return type?.name ?? "(deleted type)";
}

export const start = mutation({
  args: { typeId: v.id("expenseActivityTypes"), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const type = await ctx.db.get(args.typeId);
    if (type === null) throw new ConvexError("Unknown type");
    const title = args.title?.trim();
    if (title !== undefined && (title.length < 1 || title.length > 120)) {
      throw new ConvexError("Title must be 1-120 characters");
    }
    const id = await ctx.db.insert("expenseActivities", {
      typeId: args.typeId,
      ...(title ? { title } : {}),
      startedAt: Date.now(),
    });
    // Scheduled so a metrics failure can never fail or slow starting an
    // activity (docs/replatform.md §07).
    await ctx.scheduler.runAfter(0, internal.feedback.record, {
      system: "expenses",
      name: "activity_started",
      value: 1,
    });
    return id;
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    // Accept both Convex ids and pre-migration cuid URLs.
    const normalized = ctx.db.normalizeId("expenseActivities", args.id);
    const doc = normalized
      ? await ctx.db.get(normalized)
      : await ctx.db
          .query("expenseActivities")
          .withIndex("by_legacy_id", (q) => q.eq("legacyId", args.id))
          .unique();
    if (doc === null) return null;
    const items = await loadItems(ctx, doc._id);
    return {
      id: doc._id,
      title: doc.title ?? null,
      typeId: doc.typeId,
      typeName: await typeName(ctx, doc.typeId),
      startedAt: doc.startedAt,
      items: items.map((i) => ({
        clientId: i.clientId,
        name: i.name,
        amountCentavos: i.amountCentavos,
        position: i.position,
      })),
    };
  },
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? 50), 1), 100);
    const rows = await ctx.db
      .query("expenseActivities")
      .withIndex("by_started_at")
      .order("desc")
      .take(limit);
    const names = new Map<Id<"expenseActivityTypes">, string>();
    const activities = [];
    for (const a of rows) {
      if (!names.has(a.typeId)) names.set(a.typeId, await typeName(ctx, a.typeId));
      const items = await loadItems(ctx, a._id);
      activities.push({
        id: a._id,
        typeId: a.typeId,
        typeName: names.get(a.typeId)!,
        title: a.title ?? null,
        startedAt: a.startedAt,
        itemCount: items.length,
        totalCentavos: items.reduce((sum, i) => sum + i.amountCentavos, 0),
      });
    }
    return { activities };
  },
});

export const update = mutation({
  args: {
    id: v.id("expenseActivities"),
    title: v.optional(v.union(v.string(), v.null())),
    typeId: v.optional(v.id("expenseActivityTypes")),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if (args.title === undefined && args.typeId === undefined) {
      throw new ConvexError("At least one field required");
    }
    const doc = await ctx.db.get(args.id);
    if (doc === null) throw new ConvexError("Activity not found");
    const patch: { title?: string | undefined; typeId?: Id<"expenseActivityTypes"> } = {};
    if (args.title !== undefined) {
      const title = args.title?.trim() ?? "";
      if (title.length > 120) throw new ConvexError("Title must be at most 120 characters");
      patch.title = title.length > 0 ? title : undefined; // undefined removes the field
    }
    if (args.typeId !== undefined) {
      if ((await ctx.db.get(args.typeId)) === null) throw new ConvexError("Unknown type");
      patch.typeId = args.typeId;
    }
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("expenseActivities") },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const doc = await ctx.db.get(args.id);
    if (doc === null) return null; // already gone — reactive UIs double-fire
    for (const item of await loadItems(ctx, args.id)) {
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(args.id);
    return null;
  },
});

// Palette layer search. Bounded scan of the newest activities — fine at
// personal scale (same trade the trends aggregation makes).
const SEARCH_SCAN_LIMIT = 500;

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const needle = args.query.trim().toLowerCase();
    if (needle.length === 0) return [];
    const recent = await ctx.db
      .query("expenseActivities")
      .withIndex("by_started_at")
      .order("desc")
      .take(SEARCH_SCAN_LIMIT);
    const names = new Map<Id<"expenseActivityTypes">, string>();
    const results = [];
    for (const a of recent) {
      if (!names.has(a.typeId)) names.set(a.typeId, await typeName(ctx, a.typeId));
      const name = names.get(a.typeId)!;
      if (a.title?.toLowerCase().includes(needle) || name.toLowerCase().includes(needle)) {
        results.push({ id: a._id, title: a.title ?? null, typeName: name, startedAt: a.startedAt });
        if (results.length === 10) break;
      }
    }
    return results;
  },
});
```

- [ ] **Step 5: Run tests** — `bunx convex codegen && bun run test`. Expected: PASS.

- [ ] **Step 6: Push to dev and commit**

```bash
bunx convex dev --once
git add convex/expenses/activities.ts convex/feedback.ts convex/_generated test/expenses-activities.test.ts
git commit -m "feat(backend): expense activities module with scheduled metrics"
```

---

### Task 4: Items module — idempotent upsert, conflict, metric snapshots

**Files:**
- Create: `packages/backend/convex/expenses/items.ts`
- Test: `packages/backend/test/expenses-items.test.ts`

**Interfaces:**
- Consumes: `loadItems` from `./activities`, `internal.feedback.record`.
- Produces: `api.expenses.items.put({ activityId: Id<"expenseActivities">, clientId: string, name: string, amountCentavos: number, position: number }) → null`; `api.expenses.items.remove({ activityId, clientId }) → null`. Put is idempotent by `clientId`; a `clientId` owned by another activity throws `ConvexError("Item belongs to a different activity")` (the old 409). Both schedule `items_per_activity` and `activity_total_centavos` metric snapshots.

- [ ] **Step 1: Write the failing tests** — `packages/backend/test/expenses-items.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const type = await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
  const activityId = await asUser.mutation(api.expenses.activities.start, { typeId: type.id });
  return { t, asUser, activityId };
}

const body = { name: "Milk", amountCentavos: 8950, position: 0 };

describe("expenses items", () => {
  it("creates an item with a client id", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    const detail = await asUser.query(api.expenses.activities.get, { id: activityId });
    expect(detail!.items).toEqual([{ clientId: "u1", ...body }]);
  });

  it("is idempotent — the same put twice does not duplicate", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    const detail = await asUser.query(api.expenses.activities.get, { id: activityId });
    expect(detail!.items).toHaveLength(1);
  });

  it("updates name and amount on replay with new values", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await asUser.mutation(api.expenses.items.put, {
      activityId, clientId: "u1", name: "Oat milk", amountCentavos: 12050, position: 0,
    });
    const detail = await asUser.query(api.expenses.activities.get, { id: activityId });
    expect(detail!.items).toEqual([
      { clientId: "u1", name: "Oat milk", amountCentavos: 12050, position: 0 },
    ]);
  });

  it("rejects a client id that belongs to a different activity", async () => {
    const { asUser, activityId } = await setup();
    const type2 = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
    const other = await asUser.mutation(api.expenses.activities.start, { typeId: type2.id });
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await expect(
      asUser.mutation(api.expenses.items.put, { activityId: other, clientId: "u1", ...body })
    ).rejects.toThrow();
  });

  it("rejects a put on a deleted activity", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.activities.remove, { id: activityId });
    await expect(
      asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body })
    ).rejects.toThrow();
  });

  it("validates name and amount bounds", async () => {
    const { asUser, activityId } = await setup();
    await expect(
      asUser.mutation(api.expenses.items.put, {
        activityId, clientId: "u1", name: "  ", amountCentavos: 100, position: 0,
      })
    ).rejects.toThrow();
    await expect(
      asUser.mutation(api.expenses.items.put, {
        activityId, clientId: "u1", name: "Milk", amountCentavos: -1, position: 0,
      })
    ).rejects.toThrow();
    await expect(
      asUser.mutation(api.expenses.items.put, {
        activityId, clientId: "u1", name: "Milk", amountCentavos: 100_000_001, position: 0,
      })
    ).rejects.toThrow();
  });

  it("remove deletes an item and succeeds when already gone", async () => {
    const { asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await asUser.mutation(api.expenses.items.remove, { activityId, clientId: "u1" });
    await asUser.mutation(api.expenses.items.remove, { activityId, clientId: "u1" });
    const detail = await asUser.query(api.expenses.activities.get, { id: activityId });
    expect(detail!.items).toEqual([]);
  });

  it("records snapshot metrics after a put", async () => {
    vi.useFakeTimers();
    const { t, asUser, activityId } = await setup();
    await asUser.mutation(api.expenses.items.put, { activityId, clientId: "u1", ...body });
    await t.finishInProgressScheduledFunctions();
    vi.useRealTimers();
    const metrics = await t.run(async (ctx) => ctx.db.query("systemMetrics").collect());
    expect(metrics).toContainEqual(
      expect.objectContaining({ system: "expenses", name: "items_per_activity", value: 1 })
    );
    expect(metrics).toContainEqual(
      expect.objectContaining({ system: "expenses", name: "activity_total_centavos", value: 8950 })
    );
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bunx convex codegen && bun run test`. Expected: FAIL on the new suite only.

- [ ] **Step 3: Implement** `packages/backend/convex/expenses/items.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { loadItems } from "./activities";

async function assertSignedIn(ctx: MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new ConvexError("Unauthorized");
}

// Telemetry snapshot, scheduled so a metrics failure can never fail or slow
// an item sync (docs/replatform.md §07).
async function scheduleSnapshot(ctx: MutationCtx, activityId: Id<"expenseActivities">) {
  const items = await loadItems(ctx, activityId);
  await ctx.scheduler.runAfter(0, internal.feedback.record, {
    system: "expenses",
    name: "items_per_activity",
    value: items.length,
  });
  await ctx.scheduler.runAfter(0, internal.feedback.record, {
    system: "expenses",
    name: "activity_total_centavos",
    value: items.reduce((sum, i) => sum + i.amountCentavos, 0),
  });
}

export const put = mutation({
  args: {
    activityId: v.id("expenseActivities"),
    clientId: v.string(),
    name: v.string(),
    amountCentavos: v.number(),
    position: v.number(),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = args.name.trim();
    if (name.length < 1 || name.length > 120) {
      throw new ConvexError("Item name must be 1-120 characters");
    }
    if (
      !Number.isInteger(args.amountCentavos) ||
      args.amountCentavos < 0 ||
      args.amountCentavos > 100_000_000
    ) {
      throw new ConvexError("Amount must be between 0 and 100,000,000 centavos");
    }
    if (!Number.isInteger(args.position) || args.position < 0) {
      throw new ConvexError("Position must be a non-negative integer");
    }
    if ((await ctx.db.get(args.activityId)) === null) {
      throw new ConvexError("Activity not found");
    }
    const existing = await ctx.db
      .query("expenseItems")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (existing !== null && existing.activityId !== args.activityId) {
      // Client ids are scoped to one activity — the old REST 409.
      throw new ConvexError("Item belongs to a different activity");
    }
    if (existing !== null) {
      await ctx.db.patch(existing._id, { name, amountCentavos: args.amountCentavos, position: args.position });
    } else {
      await ctx.db.insert("expenseItems", {
        activityId: args.activityId,
        clientId: args.clientId,
        name,
        amountCentavos: args.amountCentavos,
        position: args.position,
      });
    }
    await scheduleSnapshot(ctx, args.activityId);
    return null;
  },
});

export const remove = mutation({
  args: { activityId: v.id("expenseActivities"), clientId: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const existing = await ctx.db
      .query("expenseItems")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    // Deleting an already-deleted item is a success (offline replays).
    if (existing !== null && existing.activityId === args.activityId) {
      await ctx.db.delete(existing._id);
    }
    await scheduleSnapshot(ctx, args.activityId);
    return null;
  },
});
```

- [ ] **Step 4: Run tests** — `bunx convex codegen && bun run test`. Expected: PASS.

- [ ] **Step 5: Push to dev and commit**

```bash
bunx convex dev --once
git add convex/expenses/items.ts convex/_generated test/expenses-items.test.ts
git commit -m "feat(backend): expense items with idempotent client-id upsert"
```

---

### Task 5: Trends aggregation + dashboard summary queries

**Files:**
- Modify: `packages/backend/package.json` (add `"@polaris/core": "workspace:*"` to `dependencies`, then `bun install` from the repo root)
- Create: `packages/backend/convex/expenses/trends.ts`
- Create: `packages/backend/convex/expenses/dashboard.ts`
- Test: `packages/backend/test/expenses-trends.test.ts`

**Interfaces:**
- Consumes: `@polaris/core/months` Intl-free helpers (Task 1); `loadItems` (Task 3).
- Produces:
  - `api.expenses.trends.get({ months: 3 | 6 | 12, now?: number }) → { months: MonthBucket[]; byMonth: Array<{ month: string; typeId: string; typeName: string; totalCentavos: number }>; byType: Array<{ typeId: string; typeName: string; thisMonthCentavos: number; lastMonthCentavos: number; avgPerActivityCentavos: number; activityCount: number }> }` — same shape as the old `Trends` interface. `now` exists for tests; production callers omit it.
  - `api.expenses.dashboard.summary({ now?: number }) → { monthCentavos: number; todayActivity: { id; title: string | null; typeName: string; items: number; totalCentavos: number } | null; types: Array<{ id: string; name: string }> }`

- [ ] **Step 1: Add the dependency** — in `packages/backend/package.json` dependencies add `"@polaris/core": "workspace:*"`, then run `bun install` at the repo root. (Convex bundles the TS source through the package's `./months` subpath export — no build step; esbuild follows it directly.)

- [ ] **Step 2: Write the failing tests** — `packages/backend/test/expenses-trends.test.ts`. Fixture note: `2026-06-30T16:30:00Z` is `2026-07-01 00:30` in Manila — the late-night boundary case from the old suite.

```ts
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

const NOW = Date.UTC(2026, 6, 15); // 2026-07-15 UTC → Manila month 2026-07

async function seed() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const groceries = await asUser.mutation(api.expenses.types.create, { name: "Groceries" });
  const transit = await asUser.mutation(api.expenses.types.create, { name: "Transit" });
  async function activity(typeId: typeof groceries.id, startedAt: number, centavos: number[]) {
    return t.run(async (ctx) => {
      const id = await ctx.db.insert("expenseActivities", { typeId, startedAt });
      for (const [i, c] of centavos.entries()) {
        await ctx.db.insert("expenseItems", {
          activityId: id, clientId: `${id}-${i}`, name: `Item ${i}`, amountCentavos: c, position: i,
        });
      }
      return id;
    });
  }
  return { t, asUser, groceries, transit, activity };
}

describe("expenses trends", () => {
  it("buckets totals by Manila month and type", async () => {
    const { asUser, groceries, transit, activity } = await seed();
    await activity(groceries.id, Date.UTC(2026, 6, 2), [10_000, 5_000]); // Jul
    await activity(groceries.id, Date.UTC(2026, 5, 10), [2_000]);        // Jun
    await activity(transit.id, Date.UTC(2026, 6, 3), [1_500]);           // Jul
    const trends = await asUser.query(api.expenses.trends.get, { months: 3, now: NOW });
    expect(trends.months.map((m) => m.key)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(trends.byMonth).toContainEqual(
      expect.objectContaining({ month: "2026-07", typeName: "Groceries", totalCentavos: 15_000 })
    );
    expect(trends.byMonth).toContainEqual(
      expect.objectContaining({ month: "2026-06", typeName: "Groceries", totalCentavos: 2_000 })
    );
    expect(trends.byMonth).toContainEqual(
      expect.objectContaining({ month: "2026-07", typeName: "Transit", totalCentavos: 1_500 })
    );
  });

  it("computes per-type stats: this month, last month, average, count", async () => {
    const { asUser, groceries, activity } = await seed();
    await activity(groceries.id, Date.UTC(2026, 6, 2), [10_000]);
    await activity(groceries.id, Date.UTC(2026, 5, 10), [4_000]);
    const { byType } = await asUser.query(api.expenses.trends.get, { months: 3, now: NOW });
    const g = byType.find((s) => s.typeName === "Groceries")!;
    expect(g.thisMonthCentavos).toBe(10_000);
    expect(g.lastMonthCentavos).toBe(4_000);
    expect(g.activityCount).toBe(2);
    expect(g.avgPerActivityCentavos).toBe(7_000);
  });

  it("excludes activities older than the window", async () => {
    const { asUser, groceries, activity } = await seed();
    await activity(groceries.id, Date.UTC(2026, 1, 1), [9_999]); // Feb — outside 3-month window
    const trends = await asUser.query(api.expenses.trends.get, { months: 3, now: NOW });
    expect(trends.byMonth).toEqual([]);
  });

  it("assigns a late-night UTC activity to the next Manila month", async () => {
    const { asUser, groceries, activity } = await seed();
    await activity(groceries.id, Date.UTC(2026, 5, 30, 16, 30), [1_000]); // 2026-07-01 00:30 Manila
    const trends = await asUser.query(api.expenses.trends.get, { months: 3, now: NOW });
    expect(trends.byMonth).toEqual([
      expect.objectContaining({ month: "2026-07", totalCentavos: 1_000 }),
    ]);
  });
});

describe("expenses dashboard summary", () => {
  it("sums the Manila month and finds today's latest activity", async () => {
    const { asUser, groceries, activity } = await seed();
    const NOW_LOCAL = Date.UTC(2026, 6, 15, 4); // 2026-07-15 12:00 Manila
    await activity(groceries.id, Date.UTC(2026, 6, 14, 20), [3_000]); // Jul 15 Manila (today)
    await activity(groceries.id, Date.UTC(2026, 6, 2), [2_000]);      // Jul 2 (this month)
    await activity(groceries.id, Date.UTC(2026, 5, 1), [9_000]);      // June — excluded
    const s = await asUser.query(api.expenses.dashboard.summary, { now: NOW_LOCAL });
    expect(s.monthCentavos).toBe(5_000);
    expect(s.todayActivity).toEqual(
      expect.objectContaining({ typeName: "Groceries", items: 1, totalCentavos: 3_000 })
    );
    expect(s.types.map((x) => x.name)).toEqual(["Groceries", "Transit"]);
  });

  it("returns null todayActivity when nothing started today", async () => {
    const { asUser } = await seed();
    const s = await asUser.query(api.expenses.dashboard.summary, { now: Date.UTC(2026, 6, 15, 4) });
    expect(s.monthCentavos).toBe(0);
    expect(s.todayActivity).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure** — `bunx convex codegen && bun run test`. Expected: FAIL on the new suite only.

- [ ] **Step 4: Implement** `packages/backend/convex/expenses/trends.ts`:

```ts
import { ConvexError, v } from "convex/values";
import {
  lastNMonthKeysFromMs,
  manilaMonthKeyFromMs,
  manilaMonthStartMs,
} from "@polaris/core/months";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { loadItems } from "./activities";

// Replaces the Postgres `AT TIME ZONE 'Asia/Manila'` GROUP BY: a TypeScript
// aggregation over the indexed startedAt range — fine at personal scale.
export const get = query({
  args: {
    months: v.union(v.literal(3), v.literal(6), v.literal(12)),
    now: v.optional(v.number()), // tests only; production omits
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new ConvexError("Unauthorized");
    const nowMs = args.now ?? Date.now();
    const buckets = lastNMonthKeysFromMs(args.months, nowMs);
    const since = manilaMonthStartMs(buckets[0].key);
    const activities = await ctx.db
      .query("expenseActivities")
      .withIndex("by_started_at", (q) => q.gte("startedAt", since))
      .collect();

    const typeNames = new Map<Id<"expenseActivityTypes">, string>();
    // key `${month}|${typeId}` → { total, activities }
    const cells = new Map<string, { month: string; typeId: Id<"expenseActivityTypes">; total: number; activities: number }>();
    for (const a of activities) {
      if (!typeNames.has(a.typeId)) {
        typeNames.set(a.typeId, (await ctx.db.get(a.typeId))?.name ?? "(deleted type)");
      }
      const items = await loadItems(ctx, a._id);
      const month = manilaMonthKeyFromMs(a.startedAt);
      const key = `${month}|${a.typeId}`;
      const cell = cells.get(key) ?? { month, typeId: a.typeId, total: 0, activities: 0 };
      cell.total += items.reduce((sum, i) => sum + i.amountCentavos, 0);
      cell.activities += 1;
      cells.set(key, cell);
    }

    const sorted = [...cells.values()].sort((a, b) => a.month.localeCompare(b.month));
    const byMonth = sorted.map((c) => ({
      month: c.month,
      typeId: c.typeId as string,
      typeName: typeNames.get(c.typeId)!,
      totalCentavos: c.total,
    }));

    const thisKey = buckets[buckets.length - 1].key;
    const lastKey = buckets.length > 1 ? buckets[buckets.length - 2].key : null;
    const statsByType = new Map<
      string,
      { typeId: string; typeName: string; thisMonthCentavos: number; lastMonthCentavos: number; activityCount: number; totalAll: number }
    >();
    for (const c of sorted) {
      let s = statsByType.get(c.typeId);
      if (!s) {
        s = {
          typeId: c.typeId as string,
          typeName: typeNames.get(c.typeId)!,
          thisMonthCentavos: 0,
          lastMonthCentavos: 0,
          activityCount: 0,
          totalAll: 0,
        };
        statsByType.set(c.typeId, s);
      }
      s.totalAll += c.total;
      s.activityCount += c.activities;
      if (c.month === thisKey) s.thisMonthCentavos = c.total;
      if (lastKey && c.month === lastKey) s.lastMonthCentavos = c.total;
    }
    const byType = [...statsByType.values()].map(({ totalAll, ...s }) => ({
      ...s,
      avgPerActivityCentavos: s.activityCount > 0 ? Math.round(totalAll / s.activityCount) : 0,
    }));

    return { months: buckets, byMonth, byType };
  },
});
```

- [ ] **Step 5: Implement** `packages/backend/convex/expenses/dashboard.ts`:

```ts
import { ConvexError, v } from "convex/values";
import {
  manilaDayKeyFromMs,
  manilaMonthKeyFromMs,
  manilaMonthStartMs,
} from "@polaris/core/months";
import { query } from "../_generated/server";
import { loadItems } from "./activities";

export const summary = query({
  args: { now: v.optional(v.number()) }, // tests only; production omits
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new ConvexError("Unauthorized");
    const nowMs = args.now ?? Date.now();
    const monthStart = manilaMonthStartMs(manilaMonthKeyFromMs(nowMs));
    const today = manilaDayKeyFromMs(nowMs);

    const activities = await ctx.db
      .query("expenseActivities")
      .withIndex("by_started_at", (q) => q.gte("startedAt", monthStart))
      .order("desc")
      .collect();

    let monthCentavos = 0;
    let todayActivity: {
      id: string; title: string | null; typeName: string; items: number; totalCentavos: number;
    } | null = null;
    for (const a of activities) {
      const items = await loadItems(ctx, a._id);
      const total = items.reduce((sum, i) => sum + i.amountCentavos, 0);
      monthCentavos += total;
      if (todayActivity === null && manilaDayKeyFromMs(a.startedAt) === today) {
        const type = await ctx.db.get(a.typeId);
        todayActivity = {
          id: a._id as string,
          title: a.title ?? null,
          typeName: type?.name ?? "(deleted type)",
          items: items.length,
          totalCentavos: total,
        };
      }
    }

    const allTypes = await ctx.db.query("expenseActivityTypes").collect();
    const types = allTypes
      .filter((t) => !t.archived)
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
      .map((t) => ({ id: t._id as string, name: t.name }));

    return { monthCentavos, todayActivity, types };
  },
});
```

- [ ] **Step 6: Run tests** — `bunx convex codegen && bun run test`. Expected: PASS.

- [ ] **Step 7: Push to dev and commit**

```bash
bunx convex dev --once
git add package.json ../../bun.lock convex/expenses/trends.ts convex/expenses/dashboard.ts convex/_generated test/expenses-trends.test.ts
git commit -m "feat(backend): expense trends and dashboard queries in TypeScript"
```

---

### Task 6: Import mutations + verification stats

**Files:**
- Modify: `packages/backend/convex/migrations.ts`
- Test: `packages/backend/test/expenses-migrations.test.ts`

**Interfaces:**
- Produces (all internal):
  - `internal.migrations.importExpenseTypes({ rows: Array<{ legacyId: string; name: string; position: number; archived: boolean; archivedAt?: number; createdAt: number }> }) → { inserted: number; updated: number }`
  - `internal.migrations.importExpenseActivities({ rows: Array<{ legacyId: string; legacyTypeId: string; title?: string; startedAt: number }> }) → { inserted; updated }` — resolves `legacyTypeId` through `by_legacy_id`; throws on an unknown parent.
  - `internal.migrations.importExpenseItems({ rows: Array<{ legacyId: string; legacyActivityId: string; name: string; amountCentavos: number; position: number }> }) → { inserted; updated }` — sets `clientId = legacyId`.
  - `internal.migrations.expenseStats({}) → { typeCount: number; activityCount: number; itemCount: number; centavosByMonth: Record<string, number>; activitiesByType: Record<string, number> }` — months are Manila keys of the owning activity's `startedAt`; `activitiesByType` keys are type names.

- [ ] **Step 1: Write the failing tests** — `packages/backend/test/expenses-migrations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

const typeRow = { legacyId: "ct1", name: "Groceries", position: 0, archived: false, createdAt: 1_000 };
const activityRow = { legacyId: "ca1", legacyTypeId: "ct1", title: "Weekly run", startedAt: Date.UTC(2026, 6, 2) };
const itemRow = { legacyId: "ui1", legacyActivityId: "ca1", name: "Milk", amountCentavos: 8950, position: 0 };

describe("expense imports", () => {
  it("imports types, activities, items with remapped relations", async () => {
    const t = convexTest(schema, modules);
    const r1 = await t.mutation(internal.migrations.importExpenseTypes, { rows: [typeRow] });
    expect(r1).toEqual({ inserted: 1, updated: 0 });
    await t.mutation(internal.migrations.importExpenseActivities, { rows: [activityRow] });
    await t.mutation(internal.migrations.importExpenseItems, { rows: [itemRow] });
    const item = await t.run(async (ctx) =>
      ctx.db.query("expenseItems").withIndex("by_legacy_id", (q) => q.eq("legacyId", "ui1")).unique()
    );
    expect(item!.clientId).toBe("ui1");
    const activity = await t.run(async (ctx) => ctx.db.get(item!.activityId));
    expect(activity!.legacyId).toBe("ca1");
  });

  it("is idempotent — a rerun updates instead of duplicating", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.migrations.importExpenseTypes, { rows: [typeRow] });
    await t.mutation(internal.migrations.importExpenseActivities, { rows: [activityRow] });
    await t.mutation(internal.migrations.importExpenseItems, { rows: [itemRow] });
    const r2 = await t.mutation(internal.migrations.importExpenseTypes, { rows: [typeRow] });
    const r3 = await t.mutation(internal.migrations.importExpenseActivities, { rows: [activityRow] });
    const r4 = await t.mutation(internal.migrations.importExpenseItems, { rows: [itemRow] });
    expect(r2).toEqual({ inserted: 0, updated: 1 });
    expect(r3).toEqual({ inserted: 0, updated: 1 });
    expect(r4).toEqual({ inserted: 0, updated: 1 });
    const stats = await t.query(internal.migrations.expenseStats, {});
    expect(stats.typeCount).toBe(1);
    expect(stats.activityCount).toBe(1);
    expect(stats.itemCount).toBe(1);
  });

  it("throws on an unknown parent", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.migrations.importExpenseActivities, { rows: [activityRow] })
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.migrations.importExpenseItems, { rows: [itemRow] })
    ).rejects.toThrow();
  });

  it("expenseStats buckets centavos by Manila month and counts by type name", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.migrations.importExpenseTypes, { rows: [typeRow] });
    await t.mutation(internal.migrations.importExpenseActivities, {
      rows: [
        activityRow,
        { legacyId: "ca2", legacyTypeId: "ct1", startedAt: Date.UTC(2026, 5, 30, 16, 30) }, // 2026-07 Manila
      ],
    });
    await t.mutation(internal.migrations.importExpenseItems, {
      rows: [
        itemRow,
        { legacyId: "ui2", legacyActivityId: "ca2", name: "Fare", amountCentavos: 1050, position: 0 },
      ],
    });
    const stats = await t.query(internal.migrations.expenseStats, {});
    expect(stats.centavosByMonth).toEqual({ "2026-07": 10_000 });
    expect(stats.activitiesByType).toEqual({ Groceries: 2 });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bunx convex codegen && bun run test`. Expected: FAIL on the new suite only.

- [ ] **Step 3: Implement** — append to `packages/backend/convex/migrations.ts` (imports at top: add `manilaMonthKeyFromMs` from `@polaris/core/months`, plus `internalQuery` and `ConvexError` if not already imported):

```ts
// ── Expenses import (playbook §06, phase 2) ────────────────────────────────
// Import order: types → activities → items. Parents resolve by legacyId, so
// children throw (aborting the batch transaction) if a parent is missing.

export const importExpenseTypes = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        name: v.string(),
        position: v.number(),
        archived: v.boolean(),
        archivedAt: v.optional(v.number()),
        createdAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("expenseActivityTypes")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("expenseActivityTypes", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const importExpenseActivities = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        legacyTypeId: v.string(),
        title: v.optional(v.string()),
        startedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const type = await ctx.db
        .query("expenseActivityTypes")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyTypeId))
        .unique();
      if (type === null) throw new ConvexError(`Unknown type ${row.legacyTypeId}`);
      const doc = {
        typeId: type._id,
        ...(row.title === undefined ? {} : { title: row.title }),
        startedAt: row.startedAt,
        legacyId: row.legacyId,
      };
      const existing = await ctx.db
        .query("expenseActivities")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, doc);
        updated++;
      } else {
        await ctx.db.insert("expenseActivities", doc);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const importExpenseItems = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        legacyActivityId: v.string(),
        name: v.string(),
        amountCentavos: v.number(),
        position: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const activity = await ctx.db
        .query("expenseActivities")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyActivityId))
        .unique();
      if (activity === null) throw new ConvexError(`Unknown activity ${row.legacyActivityId}`);
      const doc = {
        activityId: activity._id,
        clientId: row.legacyId, // old Prisma PK was the client-generated uuid
        name: row.name,
        amountCentavos: row.amountCentavos,
        position: row.position,
        legacyId: row.legacyId,
      };
      const existing = await ctx.db
        .query("expenseItems")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, doc);
        updated++;
      } else {
        await ctx.db.insert("expenseItems", doc);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

// Verification aggregate — intentionally full-scan (playbook §06 checksums).
export const expenseStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [types, activities, items] = await Promise.all([
      ctx.db.query("expenseActivityTypes").collect(),
      ctx.db.query("expenseActivities").collect(),
      ctx.db.query("expenseItems").collect(),
    ]);
    const monthByActivity = new Map(activities.map((a) => [a._id, manilaMonthKeyFromMs(a.startedAt)]));
    const nameByType = new Map(types.map((t) => [t._id, t.name]));
    const centavosByMonth: Record<string, number> = {};
    for (const i of items) {
      const month = monthByActivity.get(i.activityId);
      if (month === undefined) continue;
      centavosByMonth[month] = (centavosByMonth[month] ?? 0) + i.amountCentavos;
    }
    const activitiesByType: Record<string, number> = {};
    for (const a of activities) {
      const name = nameByType.get(a.typeId) ?? "(unknown)";
      activitiesByType[name] = (activitiesByType[name] ?? 0) + 1;
    }
    return {
      typeCount: types.length,
      activityCount: activities.length,
      itemCount: items.length,
      centavosByMonth,
      activitiesByType,
    };
  },
});
```

- [ ] **Step 4: Run tests** — `bunx convex codegen && bun run test`. Expected: PASS.

- [ ] **Step 5: Push to dev and commit**

```bash
bunx convex dev --once
git add convex/migrations.ts convex/_generated test/expenses-migrations.test.ts
git commit -m "feat(backend): expense import mutations and verification stats"
```

---

### Task 7: Export / import / verify scripts + dev rehearsal

**Files:**
- Create: `apps/web/scripts/export-expenses.ts`
- Create: `packages/backend/scripts/import-expenses.ts`
- Create: `apps/web/scripts/verify-expenses-import.ts`

**Interfaces:**
- Consumes: Prisma client (`../src/platform/db/client`), the Task 6 mutations via `bunx convex run`, `manilaMonthKey` from `@polaris/core/months` (web side may use the Intl version).
- Produces: `apps/web/scripts/out/expense-{types,activities,items}.jsonl`; a verify script that exits 0 only when Postgres and Convex agree on row counts, per-Manila-month centavo sums, and per-type activity counts.

- [ ] **Step 1: Write `apps/web/scripts/export-expenses.ts`** (same shape as `export-feedback.ts`):

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/platform/db/client";

const outDir = join(import.meta.dir, "out");
mkdirSync(outDir, { recursive: true });

function writeJsonl(file: string, rows: unknown[]): void {
  writeFileSync(
    join(outDir, file),
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")
  );
}

const types = await prisma.expenseActivityType.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "expense-types.jsonl",
  types.map((t) => ({
    legacyId: t.id,
    name: t.name,
    position: t.position,
    archived: t.archived,
    ...(t.archivedAt === null ? {} : { archivedAt: t.archivedAt.getTime() }),
    createdAt: t.createdAt.getTime(),
  }))
);

const activities = await prisma.expenseActivity.findMany({ orderBy: { startedAt: "asc" } });
writeJsonl(
  "expense-activities.jsonl",
  activities.map((a) => ({
    legacyId: a.id,
    legacyTypeId: a.typeId,
    ...(a.title === null ? {} : { title: a.title }),
    startedAt: a.startedAt.getTime(),
  }))
);

const items = await prisma.expenseItem.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "expense-items.jsonl",
  items.map((i) => ({
    legacyId: i.id,
    legacyActivityId: i.activityId,
    name: i.name,
    amountCentavos: i.amountCentavos,
    position: i.position,
  }))
);

console.log(
  `exported types=${types.length} activities=${activities.length} items=${items.length} → ${outDir}`
);
await prisma.$disconnect();
```

- [ ] **Step 2: Write `packages/backend/scripts/import-expenses.ts`** — copy the structure of `import-feedback.ts` **verbatim including `parseConvexRunResult`**, changing only the file list (order matters — parents first):

```ts
const files: Array<[string, string]> = [
  ["expense-types.jsonl", "migrations:importExpenseTypes"],
  ["expense-activities.jsonl", "migrations:importExpenseActivities"],
  ["expense-items.jsonl", "migrations:importExpenseItems"],
];
```

Everything else (usage line `bun scripts/import-expenses.ts <jsonl-dir> [--prod]`, `BATCH = 200`, `Bun.spawnSync(["bunx", "convex", "run", …], { cwd: import.meta.dir + "/.." })`, per-file inserted/updated tally) is identical to `import-feedback.ts`.

- [ ] **Step 3: Write `apps/web/scripts/verify-expenses-import.ts`** (same skeleton as `verify-feedback-import.ts`, `--prod` flag passed through to `convex run`):

```ts
import { manilaMonthKey } from "@polaris/core/months";
import { prisma } from "../src/platform/db/client";

const prod = process.argv.includes("--prod");

const [types, activities, items] = await Promise.all([
  prisma.expenseActivityType.findMany(),
  prisma.expenseActivity.findMany(),
  prisma.expenseItem.findMany(),
]);
const monthByActivity = new Map(activities.map((a) => [a.id, manilaMonthKey(a.startedAt)]));
const nameByType = new Map(types.map((t) => [t.id, t.name]));
const centavosByMonth: Record<string, number> = {};
for (const i of items) {
  const month = monthByActivity.get(i.activityId);
  if (month === undefined) continue;
  centavosByMonth[month] = (centavosByMonth[month] ?? 0) + i.amountCentavos;
}
const activitiesByType: Record<string, number> = {};
for (const a of activities) {
  const name = nameByType.get(a.typeId) ?? "(unknown)";
  activitiesByType[name] = (activitiesByType[name] ?? 0) + 1;
}

const args = ["convex", "run", "migrations:expenseStats", "{}"];
if (prod) args.push("--prod");
const proc = Bun.spawnSync(["bunx", ...args], { cwd: import.meta.dir + "/../../../packages/backend" });
if (proc.exitCode !== 0) {
  console.error(proc.stderr.toString());
  process.exit(1);
}
// convex run pretty-prints; log lines may precede the JSON — parse the tail.
function parseConvexRunResult(stdout: string): unknown {
  const lines = stdout.trim().split("\n");
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    const start = lines.lastIndexOf("{");
    if (start === -1) throw new Error(`No JSON result in convex run output:\n${stdout}`);
    return JSON.parse(lines.slice(start).join("\n"));
  }
}
const stats = parseConvexRunResult(proc.stdout.toString()) as {
  typeCount: number;
  activityCount: number;
  itemCount: number;
  centavosByMonth: Record<string, number>;
  activitiesByType: Record<string, number>;
};

let failed = false;
function check(label: string, want: number, got: number): void {
  const ok = want === got;
  if (!ok) failed = true;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: postgres=${want} convex=${got}`);
}
check("type rows", types.length, stats.typeCount);
check("activity rows", activities.length, stats.activityCount);
check("item rows", items.length, stats.itemCount);
for (const month of new Set([...Object.keys(centavosByMonth), ...Object.keys(stats.centavosByMonth)])) {
  check(`centavos ${month}`, centavosByMonth[month] ?? 0, stats.centavosByMonth[month] ?? 0);
}
for (const name of new Set([...Object.keys(activitiesByType), ...Object.keys(stats.activitiesByType)])) {
  check(`activities "${name}"`, activitiesByType[name] ?? 0, stats.activitiesByType[name] ?? 0);
}
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
```

- [ ] **Step 4: Dev rehearsal** — from the worktree root, with Docker Postgres up and `DATABASE_URL` exported (Bun 1.3.14 quirk):

```bash
cd apps/web && bun scripts/export-expenses.ts
cd ../../packages/backend && bun scripts/import-expenses.ts ../../apps/web/scripts/out
cd ../../apps/web && bun scripts/verify-expenses-import.ts     # expect all OK, exit 0
cd ../../packages/backend && bun scripts/import-expenses.ts ../../apps/web/scripts/out  # rerun
cd ../../apps/web && bun scripts/verify-expenses-import.ts     # still OK — idempotency proven
```

Expected: second import reports `inserted=0 updated=N` per file; both verify runs print only `OK` lines and exit 0. If the local database is empty, run `apps/web`'s db-clone or seed first and note what was used.

- [ ] **Step 5: Commit** (scripts only — `apps/web/scripts/out/` is gitignored):

```bash
git add apps/web/scripts/export-expenses.ts apps/web/scripts/verify-expenses-import.ts packages/backend/scripts/import-expenses.ts
git commit -m "feat(expenses): data playbook scripts — export, import, verify"
```

---

### Task 8: Web — types page on Convex

**Files:**
- Modify: `apps/web/src/app/(systems)/expenses/types/page.tsx`
- Modify: `apps/web/src/systems/expenses/components/TypesManager.tsx`

**Interfaces:**
- Consumes: `api.expenses.types.{list,create,update,swap}` (Task 2 DTOs).
- Produces: `TypesManager({ preloaded: Preloaded<typeof api.expenses.types.list> })` — the old `types: TypeRow[]` prop is gone.

Before starting, skim `apps/web/node_modules/next/dist/docs/` for the current server/client component and `"use client"` guidance (AGENTS.md rule).

- [ ] **Step 1: Repoint the page** — `apps/web/src/app/(systems)/expenses/types/page.tsx` becomes:

```tsx
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { TypesManager } from "@/systems/expenses/components/TypesManager";

export default async function TypesPage() {
  const token = await convexAuthNextjsToken();
  const preloaded = await preloadQuery(
    api.expenses.types.list,
    { includeArchived: true },
    { token }
  );
  return (
    <div className="content">
      <h1>Activity types</h1>
      <TypesManager preloaded={preloaded} />
    </div>
  );
}
```

Keep the page's existing heading/wrapper JSX if it differs — only the data plumbing changes.

- [ ] **Step 2: Rewire `TypesManager`** — keep all JSX, state names, and copy; replace the data layer:

```tsx
"use client";

import { useState } from "react";
import { usePreloadedQuery, useMutation, type Preloaded } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@polaris/backend/convex/_generated/api";
```

Inside the component:

```tsx
export function TypesManager({ preloaded }: { preloaded: Preloaded<typeof api.expenses.types.list> }) {
  const types = usePreloadedQuery(preloaded);
  const createType = useMutation(api.expenses.types.create);
  const updateType = useMutation(api.expenses.types.update);
  const swapTypes = useMutation(api.expenses.types.swap);
  const active = types.filter((t) => !t.archived);
  const archived = types.filter((t) => t.archived);
  // …existing newName/editingId/editName/error state stays…

  // Replaces the REST call() helper: same error-copy contract, no refresh —
  // the query is reactive.
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(
        err instanceof ConvexError && typeof err.data === "string"
          ? err.data
          : "The change did not save. Try again."
      );
      return false;
    }
  }

  async function addType() {
    if (await run(() => createType({ name: newName }))) setNewName("");
  }
  async function rename(id: string) {
    if (await run(() => updateType({ id: id as Id<"expenseActivityTypes">, name: editName }))) setEditingId(null);
  }
  // archive/restore: run(() => updateType({ id, archived: true|false }))
  async function move(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (other < 0 || other >= active.length) return;
    await run(() => swapTypes({ first: active[index].id, second: active[other].id }));
  }
  // …JSX unchanged, TypeRow interface now derives from the query result…
}
```

Delete the old `call()` helper, the `router.refresh()` usage, and the `useRouter` import if nothing else uses it. Type the rows from the query result (`(typeof types)[number]`) instead of the old exported `TypeRow` interface, or keep `TypeRow` with `id: string` — either is fine, but remove any duplicate.

- [ ] **Step 3: Verify** — `cd apps/web && bun run build` (must compile; the dev deployment already serves the functions). Then `bun run test` at repo root (unit suites — expenses integration tests still pass because routes/services are untouched so far).

- [ ] **Step 4: Manual smoke** — `cd apps/web && bun run dev`, sign in, visit `/expenses/types`: add, rename, reorder, archive, restore. A duplicate name must surface `Type "x" already exists` inline.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(systems\)/expenses/types/page.tsx apps/web/src/systems/expenses/components/TypesManager.tsx
git commit -m "feat(expenses): types page on Convex with atomic reorder swap"
```

---

### Task 9: Web — index page, StartButtons, ActivityList, dashboard, palette

**Files:**
- Modify: `apps/web/src/app/(systems)/expenses/page.tsx`
- Modify: `apps/web/src/systems/expenses/components/StartButtons.tsx`
- Modify: `apps/web/src/systems/expenses/components/ActivityList.tsx`
- Modify: `apps/web/src/systems/expenses/dashboard.tsx`
- Modify: `apps/web/src/systems/expenses/palette.ts`

**Interfaces:**
- Consumes: `api.expenses.activities.{list,start,remove,search}`, `api.expenses.types.list`, `api.expenses.dashboard.summary`.
- Produces: `ActivityList({ preloaded: Preloaded<typeof api.expenses.activities.list> })`; `StartButtons({ types: Array<{ id: string; name: string }> })` (prop shape unchanged — only its write path changes); `ActivityRow.startedAt` becomes a **ms number** (was ISO string).

- [ ] **Step 1: Index page** — `apps/web/src/app/(systems)/expenses/page.tsx`:

```tsx
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
// …existing StartButtons/ActivityList imports and page JSX stay…

export default async function ExpensesPage() {
  const token = await convexAuthNextjsToken();
  const [types, preloadedActivities] = await Promise.all([
    fetchQuery(api.expenses.types.list, {}, { token }),
    preloadQuery(api.expenses.activities.list, { limit: 30 }, { token }),
  ]);
  return (
    /* same layout as today, with: */
    <>
      <StartButtons types={types.map((t) => ({ id: t.id, name: t.name }))} />
      <ActivityList preloaded={preloadedActivities} />
    </>
  );
}
```

- [ ] **Step 2: `StartButtons`** — replace the `fetch` POST with the mutation; everything else (state, copy, empty state) stays:

```tsx
import { useMutation } from "convex/react";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";
// inside the component:
const startActivity = useMutation(api.expenses.activities.start);
async function start(typeId: string) {
  setStartingId(typeId);
  setError(null);
  try {
    const id = await startActivity({ typeId: typeId as Id<"expenseActivityTypes"> });
    router.push(`/expenses/${id}`);
  } catch {
    setError("Could not start the activity. Check your connection and try again.");
  } finally {
    setStartingId(null);
  }
}
```

- [ ] **Step 3: `ActivityList`** — take the preloaded query instead of a prop array; `startedAt` is now ms:

```tsx
import { usePreloadedQuery, useMutation, type Preloaded } from "convex/react";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";

export function ActivityList({ preloaded }: { preloaded: Preloaded<typeof api.expenses.activities.list> }) {
  const { activities } = usePreloadedQuery(preloaded);
  const removeActivity = useMutation(api.expenses.activities.remove);
  // …deletingId state stays…
  async function remove(id: string) {
    if (!window.confirm("Delete this activity and all its items?")) return;
    setDeletingId(id);
    try {
      await removeActivity({ id: id as Id<"expenseActivities"> });
    } finally {
      setDeletingId(null);
    }
  }
  // groupByMonth/DATE_FORMAT/MONTH_FORMAT: change `new Date(a.startedAt)` from
  // ISO-string parsing to ms-number parsing — the Date constructor takes both,
  // so only the ActivityRow type annotation changes (startedAt: number).
}
```

Delete `router.refresh()` and the `useRouter` import; the list is reactive. Update the `ActivityRow` interface (or replace it with the query's inferred type) so `startedAt: number`.

- [ ] **Step 4: Dashboard** — in `apps/web/src/systems/expenses/dashboard.tsx`, replace the Prisma `load()` internals; `summary()` and `Widget()` render logic stays:

```tsx
import { cache } from "react";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

const load = cache(async () => {
  const token = await convexAuthNextjsToken();
  return fetchQuery(api.expenses.dashboard.summary, {}, { token });
});
```

`load()` returns `{ monthCentavos, todayActivity, types }` in the same shape the old code produced (`todayActivity.items` is the count). Remove the Prisma import, the raw SQL, and the `bigint` narrowing. `TodayActivity`'s `id` is now a Convex id — the `Continue:` link `/expenses/${id}` still works because `activities.get` accepts it.

- [ ] **Step 5: Palette layer** — `apps/web/src/systems/expenses/palette.ts`:

```ts
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
// keep PaletteLayer/PaletteResult imports and DATE_FORMAT

export const activitiesLayer: PaletteLayer = {
  name: "activities",
  singular: "activity",
  async search(query, _parentId) {
    const token = await convexAuthNextjsToken();
    const rows = await fetchQuery(api.expenses.activities.search, { query }, { token });
    return rows.map((a) => ({
      id: a.id,
      label: a.title ?? a.typeName,
      sublabel: `${a.typeName} · ${DATE_FORMAT.format(new Date(a.startedAt))}`,
      icon: "receipt" as const,
      href: `/expenses/${a.id}`,
      drillable: false,
    }));
  },
};
```

- [ ] **Step 6: Verify** — `cd apps/web && bun run build`; repo-root `bun run test`. Manual smoke on `bun run dev`: index page lists imported activities (from the Task 7 rehearsal data), starting an activity navigates to its capture page, deleting one removes it from the list without a reload, dashboard shows the month total and today line, ⌘K search finds an activity by title.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/\(systems\)/expenses/page.tsx apps/web/src/systems/expenses/components/StartButtons.tsx apps/web/src/systems/expenses/components/ActivityList.tsx apps/web/src/systems/expenses/dashboard.tsx apps/web/src/systems/expenses/palette.ts
git commit -m "feat(expenses): index, dashboard, and palette on Convex"
```

---

### Task 10: Web — trends page on Convex

**Files:**
- Modify: `apps/web/src/app/(systems)/expenses/trends/page.tsx`

**Interfaces:**
- Consumes: `api.expenses.trends.get` — its DTO matches the props `StatCards` and `TrendsChart` already take (`months: {key,label}[]`, `byMonth: {month,typeId,typeName,totalCentavos}[]`, `byType: TypeStatsRow[]`). **No component changes.**

- [ ] **Step 1: Repoint the page** — keep the `RANGES` validation and range-switcher `<Link>`s; swap the service call:

```tsx
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
// …
const token = await convexAuthNextjsToken();
const trends = await fetchQuery(api.expenses.trends.get, { months }, { token });
// <StatCards stats={trends.byType} /> and <TrendsChart months={trends.months} byMonth={trends.byMonth} /> unchanged
```

- [ ] **Step 2: Verify** — `cd apps/web && bun run build`; dev smoke: `/expenses/trends` renders the chart and cards for 3/6/12 ranges against the rehearsal data.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(systems\)/expenses/trends/page.tsx
git commit -m "feat(expenses): trends page reads Convex"
```

---

### Task 11: Web — capture page on optimistic mutations; SyncQueue retired

**Files:**
- Modify: `apps/web/src/app/(systems)/expenses/[id]/page.tsx`
- Modify: `apps/web/src/systems/expenses/components/CapturePage.tsx` (full data-layer rewrite; JSX and design classes stay)
- Delete: `apps/web/src/systems/expenses/lib/syncQueue.ts`, `apps/web/src/systems/expenses/lib/syncQueue.test.ts`
- Unchanged: `ItemRow.tsx`, `ItemComposer.tsx` (CapturePage maps `clientId → id` so `CaptureItem` keeps its shape)

**Interfaces:**
- Consumes: `api.expenses.activities.get` (subscribed with the **URL id string** — optimistic updates must use the same args), `api.expenses.activities.update`, `api.expenses.items.{put,remove}`.
- Produces: `CapturePage({ preloaded, urlId }: { preloaded: Preloaded<typeof api.expenses.activities.get>; urlId: string })`.

- [ ] **Step 1: Repoint the page** — `apps/web/src/app/(systems)/expenses/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { CapturePage } from "@/systems/expenses/components/CapturePage";

export default async function ExpenseActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const token = await convexAuthNextjsToken();
  const preloaded = await preloadQuery(api.expenses.activities.get, { id }, { token });
  if (preloadedQueryResult(preloaded) === null) notFound();
  return <CapturePage preloaded={preloaded} urlId={id} />;
}
```

- [ ] **Step 2: Rewrite `CapturePage`'s data layer.** Delete the `SyncQueue` import, `queueRef`, `applyQueuedOps`, the mount effect's queue construction and online/visibility listeners, and the local `items` state. Keep every design class (`exp-header`, `exp-total`, `exp-unsynced`, …), the title-editing JSX, `DATE_FORMAT`, `ItemRow`/`ItemComposer` usage, and the scroll sentinel. New data layer:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { usePreloadedQuery, useMutation, type Preloaded } from "convex/react";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";
import { formatCentavos } from "@polaris/core/money";
import { ItemComposer } from "./ItemComposer";
import { ItemRow, type CaptureItem } from "./ItemRow";

export function CapturePage({
  preloaded,
  urlId,
}: {
  preloaded: Preloaded<typeof api.expenses.activities.get>;
  urlId: string;
}) {
  const activity = usePreloadedQuery(preloaded);
  const [editingTitle, setEditingTitle] = useState(false);
  const [pending, setPending] = useState(0);
  const listEndRef = useRef<HTMLDivElement>(null);

  const getArgs = { id: urlId }; // subscription key — optimistic updates must match it

  const putItem = useMutation(api.expenses.items.put).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.expenses.activities.get, getArgs);
    if (!current) return;
    const items = current.items.filter((i) => i.clientId !== args.clientId);
    items.push({
      clientId: args.clientId,
      name: args.name,
      amountCentavos: args.amountCentavos,
      position: args.position,
    });
    items.sort((a, b) => a.position - b.position);
    store.setQuery(api.expenses.activities.get, getArgs, { ...current, items });
  });

  const removeItem = useMutation(api.expenses.items.remove).withOptimisticUpdate((store, args) => {
    const current = store.getQuery(api.expenses.activities.get, getArgs);
    if (!current) return;
    store.setQuery(api.expenses.activities.get, getArgs, {
      ...current,
      items: current.items.filter((i) => i.clientId !== args.clientId),
    });
  });

  const updateActivity = useMutation(api.expenses.activities.update).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.expenses.activities.get, getArgs);
      if (!current || args.title === undefined) return;
      store.setQuery(api.expenses.activities.get, getArgs, { ...current, title: args.title });
    }
  );

  // In-flight counter for the unsynced badge. A rejected mutation rolls its
  // optimistic write back on its own — console.error mirrors the old
  // SyncQueue drop log.
  function track(promise: Promise<unknown>): void {
    setPending((n) => n + 1);
    promise
      .catch((err) => console.error("expenses sync: change rejected", err))
      .finally(() => setPending((n) => n - 1));
  }

  if (activity === null) return null; // deleted mid-session; RSC 404s on load

  const items = activity.items; // already position-sorted by the query
  const total = useMemo(() => items.reduce((s, i) => s + i.amountCentavos, 0), [items]);

  function addItem(name: string, amountCentavos: number) {
    const clientId = crypto.randomUUID();
    const position = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    track(putItem({ activityId: activity.id, clientId, name, amountCentavos, position }));
    requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ block: "nearest" }));
  }
  function editItem(id: string, name: string, amountCentavos: number) {
    const existing = items.find((i) => i.clientId === id);
    if (!existing) return;
    track(
      putItem({
        activityId: activity.id,
        clientId: id,
        name,
        amountCentavos,
        position: existing.position,
      })
    );
  }
  function deleteItem(id: string) {
    track(removeItem({ activityId: activity.id, clientId: id }));
  }
  async function saveTitle(raw: string) {
    setEditingTitle(false);
    const next = raw.trim() || null;
    if (next === activity.title) return;
    track(updateActivity({ id: activity.id, title: next }));
  }

  // JSX: same as before, with these substitutions —
  //   header title/date read from `activity` (startedAt is ms: DATE_FORMAT.format(new Date(activity.startedAt)))
  //   badge: {pending > 0 && <span className="exp-unsynced">{pending} unsynced</span>}
  //   list:  {items.map((item) => (
  //            <ItemRow key={item.clientId}
  //                     item={{ id: item.clientId, name: item.name, amountCentavos: item.amountCentavos, position: item.position } satisfies CaptureItem}
  //                     onEdit={editItem} onDelete={deleteItem} />))}
}
```

Note the `activity.id` values are `Id<"expenseActivities">` from the query — no casts needed. The `useMemo` must not sit after an early return in the final code — hoist the `if (activity === null)` guard below the hooks or compute `total` without `useMemo`; keep hooks unconditional (React rule).

- [ ] **Step 3: Delete SyncQueue**

```bash
git rm apps/web/src/systems/expenses/lib/syncQueue.ts apps/web/src/systems/expenses/lib/syncQueue.test.ts
```

- [ ] **Step 4: Verify** — `cd apps/web && bun run build`; repo-root `bun run test` (the syncQueue unit suite is gone from the run). Dev smoke: add several items fast (they appear instantly, badge flickers through `N unsynced`), edit one, delete one, rename the title, open the same activity in a second tab and watch edits appear live. Offline check: DevTools → Network → Offline, add two items (badge holds at `2 unsynced`), go online, badge clears and items persist after reload.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/systems/expenses apps/web/src/app/\(systems\)/expenses
git commit -m "feat(expenses)!: capture page on Convex optimistic mutations, SyncQueue retired"
```

---

### Task 12: Legacy teardown + full verification

**Files:**
- Delete: `apps/web/src/systems/expenses/routes/` (4 files), `apps/web/src/systems/expenses/services/` (7 files), `apps/web/src/systems/expenses/schemas/expenses.ts`
- Modify: `apps/web/src/systems/types.ts` (`routes` becomes optional), `apps/web/src/systems/expenses/manifest.ts` (drop `routes`), `apps/web/src/app/api/systems/[system]/[...path]/route.ts` (tolerate a manifest without routes)

**Interfaces:**
- Consumes: nothing new. After this task no expenses code imports Prisma, `@/platform/feedback`, or the REST error helpers.
- Produces: `SystemManifest.routes?: Record<string, RouteHandler>` — journal and habits manifests are untouched and keep working.

- [ ] **Step 1: Confirm nothing still imports the doomed modules** (expect no hits outside the files being deleted):

```bash
grep -rn "systems/expenses/services\|systems/expenses/routes\|systems/expenses/schemas\|expenses/lib/syncQueue" apps/web/src --include="*.ts*" | grep -v "src/systems/expenses/\(services\|routes\|schemas\)/"
```

- [ ] **Step 2: Delete**

```bash
git rm -r apps/web/src/systems/expenses/routes apps/web/src/systems/expenses/services apps/web/src/systems/expenses/schemas
```

(This removes the four expenses integration test files with their directories.)

- [ ] **Step 3: Make the route table optional** — in `apps/web/src/systems/types.ts` change `routes: Record<string, RouteHandler>` to `routes?: Record<string, RouteHandler>` on `SystemManifest` (keep the comment style of the file). In the catch-all `apps/web/src/app/api/systems/[system]/[...path]/route.ts`, guard the lookup: where it iterates `manifest.routes`, use `manifest.routes ?? {}` so a system without routes 404s cleanly.

- [ ] **Step 4: Trim the manifest** — in `apps/web/src/systems/expenses/manifest.ts` delete the `routes` map and the `./routes/*` imports. `nav`, `palette`, `displayName`, `description` stay (spec §07: the manifest survives minus its route table).

- [ ] **Step 5: Full verification matrix** (Docker Postgres up; set `DATABASE_URL_TEST` inline for the integration run):

```bash
bun run test
DATABASE_URL_TEST=postgresql://polaris:polaris@localhost:5440/polaris_test bun run test:integration  # journal + habits suites — expenses files are gone
cd apps/web && bun run build && bun run lint
cd ../../packages/backend && bunx convex dev --once
```

Expected: all green; the integration run no longer lists any `systems/expenses` file; build succeeds with no unused-import errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(expenses)!: delete REST routes, services, and Zod schemas — expenses reads and writes only Convex"
```

---

### Task 13: Playbook correction + cutover runbook

**Files:**
- Modify: `docs/replatform.md` (§06)
- Create: `docs/superpowers/plans/2026-08-22-phase-2-cutover-runbook.md`

- [ ] **Step 1: Correct the playbook** (§06 of `docs/replatform.md`) with what Phase 2 actually taught — the exit criterion demands this. Cover at least, in the doc's terse voice: (a) the cuid→id remap is done per-batch via the `by_legacy_id` index on the parent, so **import order is parents first** and a child batch aborts atomically on a missing parent; (b) client-generated item ids become both `clientId` and `legacyId`; (c) `bunx convex run` output must be tail-parsed (`parseConvexRunResult`); (d) whatever actually surprised the executor during the Task 7 rehearsal (fill in from notes — do not invent).

- [ ] **Step 2: Write the cutover runbook**, modeled on `docs/superpowers/plans/2026-08-20-phase-1-cutover-runbook.md` (same guarded-secrets conventions — never inline real secrets; `bunx convex env set` values come from the password manager). Contents: prerequisites (phase 1 cutover done or bundled — production deploy `rapid-lapwing-153`); freeze window (stop capturing expenses); production export → import → verify commands from Task 7 with `--prod` and the prod Neon direct URL; `bunx convex deploy` from `packages/backend`; Vercel deploy of the web app; post-deploy smoke (capture an item, check trends, dashboard, palette); the §06 re-run of export/import/verify to catch gap rows; rollback = redeploy previous web build (Postgres is untouched and still frozen-complete).

- [ ] **Step 3: Commit**

```bash
git add docs/replatform.md docs/superpowers/plans/2026-08-22-phase-2-cutover-runbook.md
git commit -m "docs: phase 2 playbook corrections and cutover runbook"
```

---

## Exit criteria (spec §05)

1. Expenses reads and writes only Convex — no expenses code touches Prisma, REST routes, or `SyncQueue` (`grep -rn "prisma" apps/web/src/systems/expenses apps/web/src/app/\(systems\)/expenses` returns nothing).
2. Backend + unit + integration suites, build, and lint all green (Task 12 matrix).
3. Import rehearsed twice against dev with idempotency proven and all checksums OK (Task 7).
4. Playbook corrected; cutover runbook written (Task 13). Production cutover itself is user-run, per runbook, around the `replatform`→`main` merge.
5. Branch merges to `replatform` only (finishing-a-development-branch skill). **No pushes to `main`.**

## Self-review notes (kept for executors)

- Spec coverage: schema ✔ (Task 2), services→functions ✔ (2–5), trends-in-TS ✔ (5), capture→optimistic + SyncQueue retirement ✔ (11), playbook first real run ✔ (6–7), convex-test migration ✔ (2–6 + deletion in 12), scheduler metrics ✔ (3–4), one validation layer ✔ (validators + teardown in 12), playbook correction ✔ (13).
- Type consistency spot-checks: `clientId` is the item key everywhere (schema, put/remove args, DTO, optimistic updates, import `clientId = legacyId`); `startedAt` is ms in every DTO and both list/capture components adapt; `api.expenses.items.put/remove` (not `putItem` on activities) is the final naming — Tasks 9/11 use it as written.
- Known sharp edges for executors: keep React hooks above the `activity === null` early return in Task 11; `preloadedQueryResult` comes from `convex/nextjs`; convex-test scheduler tests need `vi.useFakeTimers()` before the mutation and `finishInProgressScheduledFunctions()` before asserting; `Doc`/`Id` types import from `../_generated/dataModel` (path depth: `expenses/*.ts` uses `../_generated`).
