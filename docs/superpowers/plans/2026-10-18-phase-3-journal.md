# Phase 3 — Journal on Convex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the journal — topics, entries, tags, search, the nightly active-topics job, dashboard card, palette layers, and every journal page — from REST+Prisma+Postgres to Convex; give habits (still on Postgres until Phase 4) a bridge into the Convex journal; delete the Vercel cron and `CRON_SECRET`; build and rehearse the data copy and the search acceptance check.

**Architecture:** Three Convex tables — `journalTopics`, `journalEntries`, `entryTags` — with `legacyId` import keys and ms-number timestamps. Entries keep a denormalized `tags` array (display) plus `entryTags` rows for live entries (tag pages and counts), and a `searchText` field (title + body) behind a Convex search index filtered by topic and deletion. Search keeps the old every-word semantics by post-filtering the index's any-word matches with `@polaris/core/search`. Feedback metrics go through `ctx.scheduler.runAfter(0, internal.feedback.record, …)`. The nightly job becomes `convex/crons.ts` at 15:00 UTC. The web splits by need: the Today, topic, and tag feeds become reactive (`preloadQuery` + `usePreloadedQuery` over one `journal.entries.list` query); the topics index, tags index, search page, dashboard card, and palette layers stay server-rendered over `fetchQuery`. Habits reaches journal only through `apps/web/src/systems/habits/services/journalBridge.ts` → `convex/journal/habitBridge.ts` (signed-in public functions that Phase 4 turns internal).

**Tech Stack:** Bun 1.3.x (toolchain only), Next.js 16.2.4 (pinned), Convex ^1.44.0, `@convex-dev/auth` 0.0.95 (exact pin), convex-test ^0.0.55, Vitest 4.1.x (edge-runtime env in backend), Prisma 7 (export source only; journal tables stay as a frozen archive), Tiptap 3 (untouched).

**Spec:** `docs/replatform.md` — §05 "Phase 3 — Journal on Convex (L)", §06 data migration playbook, §07 improvements (scheduler metrics, one validation layer, tags become a join table, tests stop needing infrastructure), §08 risk row "Search regression vs Postgres FTS". Handoff with the lessons this plan carries: `docs/superpowers/handoffs/2026-10-18-replatform-next-step.md`.

## Global Constraints

- Work on branch `phase-3-journal` in worktree `.claude/worktrees/phase-3-journal`, branched from `replatform`. Merge back to `replatform` only. **Never commit to `main` or push `main`.**
- Bun is toolchain only: `bun install/add/run`, `bunx`. **Never `bun test`** (that's Bun's own runner; tests run via `bun run test` → Vitest).
- Next.js 16.2.4 pinned; before relying on a web API you haven't seen used in this repo, check `node_modules/.bun/next@16.2.4*/node_modules/next/dist/docs/` (AGENTS.md rule — this Next differs from training data).
- UI work obeys `docs/design/polaris-design-system.md` (read it and `docs/design/README.md` first): tokens never hex, sentence case, error copy names the failure and the recovery, never apologizes, no new icon sets. Existing journal copy is compliant — preserve it verbatim unless a task says otherwise.
- Data-shape rules: Postgres cuids → indexed `legacyId` string; `DateTime` → ms numbers; imports idempotent by `legacyId` upsert (`ctx.db.replace`); parents imported before children; a missing parent throws `ConvexError` (aborts the batch).
- **Prisma journal models are NOT dropped** — `JournalTopic`/`JournalEntry` stay in `apps/web/prisma/schema.prisma` as the frozen archive until Phase 5. Do not run `prisma migrate` and do not edit the Prisma schema.
- Backend commit ritual: `bunx convex codegen && bun run test` (in `packages/backend`), then `bunx convex dev --once` (pushes to dev deployment `dev:exciting-wolf-282`) before committing backend changes.
- Web checks before committing web changes: `bun run test` (in `apps/web`), and for any task touching pages/components `bun run build && bun run lint` (in `apps/web`). Integration suite: `DATABASE_URL_TEST=postgresql://polaris:polaris@localhost:5440/polaris_test bun run test:integration` (in `apps/web`; Docker Postgres on 5440 must be up — Bun 1.3.14 doesn't forward `.env` to node-shebang children, so the variable goes inline).
- Conventional commits, scoped (`feat(journal): …`, `feat(backend): …`, `test(journal): …`, `refactor(backend): …`, `chore(journal): …`, `docs: …`); commit at the end of every task. End every commit message with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Convex function conventions (Phases 1–2): errors are `throw new ConvexError("<sentence>")`; the auth gate is `await assertSignedIn(ctx)` from `convex/lib/auth.ts` (Task 2 creates it); **no per-row userId** (single-user system); reads go through `.withIndex(…)` / `.withSearchIndex(…)`, never the query `.filter()` method; table-wide reads use `.take(<named constant>)`; `.collect()` only over one parent's children (an entry's tag rows) or inside internal verification queries; table names camelCase plural; index names `by_<snake_case_fields>`; timestamps `v.number()` named `<verb>At`.
- Metrics are recorded with `ctx.scheduler.runAfter(0, internal.feedback.record, { system, name, value })` so they can never fail a user action. Tests that assert on scheduled work use `vi.useFakeTimers()` then `await t.finishAllScheduledFunctions(vi.runAllTimers)`.
- Convex code never uses `Intl` with named time zones; Manila day/month math goes through the Intl-free helpers in `@polaris/core/months` (Manila is fixed UTC+8).
- `bunx convex run` stdout mixes log lines with pretty-printed JSON — parse it with `parseConvexRunResult` (Task 8 puts it in `packages/backend/scripts/lib/convexRun.ts`), never `.split("\n").at(-1)`. Its JSON argument rides on the command line: macOS `ARG_MAX` is 1 MiB, so import batches are capped by bytes as well as rows.
- Palette layers are called with an empty query when the user browses a layer — return the newest N, never `[]`.
- Web tests that mock `@convex-dev/auth/nextjs/server` must also stub `convexAuthNextjsToken`.

## Deliberate deviations (decision log — reviewers read this first)

1. **Habits bridge for the Phase 3 → 4 window.** Habits stays on Postgres but creates, renames and archives journal topics, writes log entries, and reads a topic's entries. All of that now goes through `apps/web/src/systems/habits/services/journalBridge.ts` (the only habits file that talks to Convex) into `convex/journal/habitBridge.ts` — signed-in public functions, called from the Next server with the user's token. Phase 4 turns them into internal functions called by habits' own mutations. A habit's stored `journalTopicId` is left as is: the bridge resolves it as a Convex id or, failing that, as a `legacyId` — no Postgres writes to remap ids.
2. **Habit rename loses its cross-table transaction.** The topic is renamed first (a name clash stops there, nothing changed), then the habit row. If the habit update then fails (e.g. a duplicate habit name whose own topic is missing), the topic keeps the new name. Accepted: rare, visible, and fixable by renaming again.
3. **`CRON_SECRET` dies completely.** Its two uses were the cron route's bearer check and the `feedback.recordMetric` service key. The cron moves into Convex, journal metrics are recorded inside Convex mutations, and the habit-log journal metrics move into the bridge's `createLog` (same `insertEntry` helper as journal's own create). `feedback.recordMetric`, its service-key check, and the web adapter's `recordMetric` are deleted.
4. **Search semantics.** One Convex search index over `searchText` (= title + newline + body). Convex matches *any* term (the last as a prefix) and orders by relevance; the old Postgres search ANDed every term with English stemming and weighted the title. We pull up to 256 candidates, then keep only entries where *every* query term starts some word (`matchesAllTerms`), in Convex's relevance order. Lost: stemming ("tests" no longer finds "test") and title weighting. Gained: prefix matching on every term. The acceptance pass (Task 9 tooling, go-live checklist Stage 0) decides on the real corpus; the spec's fallback (a client-side index) is the escape hatch, not built now.
5. **Tags.** Entries keep a `tags` array (display, unchanged UI) and `entryTags` rows exist only for live entries — soft delete removes them — so tag pages and tag counts never see deleted entries. Tag counts and topic stats are read-time bounded scans (`AGGREGATE_SCAN_LIMIT` = 5000), the same personal-scale trade the expenses trends scan made.
6. **Journal keeps every timestamp** (`createdAt`, `updatedAt`, `archivedAt`, `deletedAt`) on topics and entries, unlike Phase 2's "only where consumed" rule: the journal is the user's record, and the Postgres archive goes away in Phase 5. `updatedAt` is consumed (palette topic order, the "Edited" caption).
7. **"Today" is the Asia/Manila calendar day**, computed server-side, for the Today page and the dashboard card. Before, it was server-local midnight — UTC on Vercel, so 00:00–08:00 Manila counted as yesterday. The Today header date is formatted in Manila too. Phase 4 moves "today" to the device everywhere.
8. **Reactive feeds, no optimistic updates.** Today/topic/tag pages subscribe through `usePreloadedQuery`; every `router.refresh()` after a journal write goes away. Journal writes aren't latency-sensitive, and the task checkbox already flips locally, so no optimistic-update code.
9. **`entries.list` takes one mode**: `tag`, or `topicId` (+ `sort`), or neither (+ optional `sinceMs`). Mixing `tag` with `topicId`, or `sinceMs` with either, throws. No call site combines them.
10. **`entries.remove` is idempotent** (reactive UIs double-fire; Phase 2 deviation 3 precedent). `entries.update` on a missing or deleted entry throws "Entry not found." like the old 404.
11. **Backdated habit logs get `updatedAt = createdAt`.** Prisma stamped `updatedAt = now()`, which put a spurious "Edited just now" under every backdated log.
12. **Topic names**: uniqueness is enforced in mutations through the `by_name` index (Convex has no unique constraints), case-sensitive like the old `@unique`. Lists sort by name case-insensitively in plain TypeScript (Postgres collation isn't reproducible, and `localeCompare` would pull `Intl` into Convex).
13. **Whitespace-only bodies are rejected** by create/update ("Write something before saving.", the compose box's own copy). Zod allowed `" "`. An empty title (`""`) is stored as absent.
14. **Compose box's remembered topic key bumps** from `journal:lastTopic` to `journal:lastTopic:v2`: the old key holds Postgres cuids that Convex validators reject. Cost: the user picks a topic once after the switch-over.
15. **`parentId` is imported but unread.** No code ever set or showed it; the import preserves any links in a second pass (`linkTopicParents`) because the spec requires the remap.
16. **The import refuses a topic whose name already exists in Convex under a different `legacyId`** (fails the batch loudly instead of creating a duplicate name).
17. **Old import/verify scripts are not refactored** onto the new shared driver. `import-expenses.ts`/`import-feedback.ts` and their verify scripts are finished and die with Prisma in Phase 5; the "missing JSONL file must fail" fix lands in the new driver.
18. **Prisma ↔ database drift on `journal_entries.search_vector` is left alone.** No Phase 3 change needs a Prisma migration, the journal tables become a frozen archive, and Phase 5 drops them — the drift dies with them.
19. **Palette notes search per keystroke reads up to 256 candidates.** Bounded by `SEARCH_CANDIDATE_LIMIT`; fine at personal scale.

## File Structure

```
packages/core/src/search.ts (+ .test.ts)          # searchTerms / matchesAllTerms (Task 1)
packages/core/src/months.ts (+ .test.ts)          # + manilaDayStartMs (Task 1)
packages/backend/convex/lib/auth.ts               # assertSignedIn, extracted (Task 2)
packages/backend/convex/expenses/*.ts             # import assertSignedIn (Task 2)
packages/backend/convex/schema.ts                 # + journalTopics, journalEntries, entryTags (Task 2)
packages/backend/convex/journal/model.ts          # shared helpers, no functions (Tasks 2–7)
packages/backend/convex/journal/topics.ts         # list/getByName/search/create/update (Task 2) + listWithStats (Task 5)
packages/backend/convex/journal/entries.ts        # list/create/update/remove (Task 3) + search (Task 4)
packages/backend/convex/journal/tags.ts           # list (Task 5)
packages/backend/convex/journal/dashboard.ts      # summary (Task 5)
packages/backend/convex/journal/activeTopics.ts   # compute (Task 5)
packages/backend/convex/crons.ts                  # daily 15:00 UTC (Task 5)
packages/backend/convex/journal/habitBridge.ts    # strangler-window bridge for habits (Task 6)
packages/backend/convex/journal/migrations.ts     # imports, stats, probes (Task 7)
packages/backend/convex/feedback.ts               # − recordMetric + service key (Task 13)
packages/backend/test/journal-*.test.ts           # one file per backend task
packages/backend/scripts/lib/{batching,convexRun}.ts  # shared copy plumbing (Task 8)
packages/backend/scripts/import-journal.ts        # JSONL → Convex (Task 8)
apps/web/scripts/{export-journal,verify-journal-import}.ts            # (Task 8)
apps/web/scripts/{journal-search-acceptance,seed-journal-rehearsal}.ts + scripts/lib/searchQueries.ts (Task 9)
apps/web/src/systems/journal/{palette.ts,dashboard.tsx}               # fetchQuery (Task 10)
apps/web/src/app/(systems)/journal/{search,topics,tags}/page.tsx      # fetchQuery (Task 10)
apps/web/src/systems/journal/components/*         # Convex hooks, EntryFeed (Task 11)
apps/web/src/app/(systems)/journal/{page,topics/[name]/page,tags/[tag]/page}.tsx  # preloadQuery (Task 11)
apps/web/src/systems/habits/services/journalBridge.ts (+ .test.ts)    # (Task 12)
apps/web/src/systems/habits/services/{habits,logs,detail}.ts, routes/logs.ts   # via the bridge (Task 12)
apps/web/src/test/fakeJournal.ts                  # in-memory bridge for habits tests (Task 12)
apps/web/src/systems/journal/{routes,services,schemas}/, app/api/cron/, vercel.json   # DELETED (Task 13)
docs/replatform.md §05/§06, docs/superpowers/plans/2026-10-18-phase-3-go-live-checklist.md (Task 14)
```

## Worktree setup (before Task 1)

Already done by the controller: worktree `.claude/worktrees/phase-3-journal` on branch `phase-3-journal` from `replatform` (33158d3), `bun install` run, `packages/backend/.env.local` and `apps/web/.env` copied in. Baseline: core 83 / backend 62 / web 60 unit tests, integration 14 files / 84 tests — all green.

- [ ] Commit this plan on the branch: `git add docs/superpowers/plans/2026-10-18-phase-3-journal.md && git commit -m "docs: phase 3 journal implementation plan"`

---

### Task 1: Search and Manila-day helpers in `@polaris/core`

The Convex search query and the web acceptance script must tokenize the same way Convex's search index does, and Convex code needs Manila midnight without `Intl`.

**Files:**
- Create: `packages/core/src/search.ts`
- Test: `packages/core/src/search.test.ts`
- Modify: `packages/core/src/months.ts` (append), `packages/core/src/months.test.ts` (append), `packages/core/package.json` (exports)

**Interfaces:**
- Produces: `searchTerms(text: string): string[]` (lowercased, split on non-letter/non-digit, deduplicated, first-seen order); `matchesAllTerms(text: string, terms: string[]): boolean` (every term is a prefix of some word of `text`; `[]` → `false`); `manilaDayStartMs(ms: number): number` (epoch ms of 00:00 Asia/Manila on the Manila day containing `ms`). Package export `@polaris/core/search`.

- [ ] **Step 1: Write the failing tests** — create `packages/core/src/search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchesAllTerms, searchTerms } from "./search";

describe("searchTerms", () => {
  it("lowercases and splits on anything that is not a letter or digit", () => {
    expect(searchTerms("  React-Hooks, #convex_test!  ")).toEqual(["react", "hooks", "convex", "test"]);
  });

  it("keeps accented letters and digits inside a word", () => {
    expect(searchTerms("Café v2")).toEqual(["café", "v2"]);
  });

  it("drops duplicates, keeping first-seen order", () => {
    expect(searchTerms("deploy Deploy ship")).toEqual(["deploy", "ship"]);
  });

  it("returns [] for blank or punctuation-only input", () => {
    expect(searchTerms("   ")).toEqual([]);
    expect(searchTerms("!!! --")).toEqual([]);
  });
});

describe("matchesAllTerms", () => {
  const text = "Shipped the #convex search index\nDeploying tomorrow";

  it("requires every term", () => {
    expect(matchesAllTerms(text, ["convex", "search"])).toBe(true);
    expect(matchesAllTerms(text, ["convex", "postgres"])).toBe(false);
  });

  it("matches each term as the start of a word", () => {
    expect(matchesAllTerms(text, ["deploy", "ship"])).toBe(true);
    expect(matchesAllTerms(text, ["hipped"])).toBe(false);
  });

  it("is case-insensitive through searchTerms, and an empty term list matches nothing", () => {
    expect(matchesAllTerms(text, searchTerms("CONVEX"))).toBe(true);
    expect(matchesAllTerms(text, [])).toBe(false);
  });
});
```

Append to `packages/core/src/months.test.ts` (add `manilaDayStartMs` to the existing import from `./months`):

```ts
describe("manilaDayStartMs", () => {
  it("returns 00:00 Manila for instants on either side of Manila midnight", () => {
    // 2026-06-30 23:59:59 Manila → that day's midnight, 2026-06-29 16:00 UTC
    expect(manilaDayStartMs(Date.UTC(2026, 5, 30, 15, 59, 59))).toBe(Date.UTC(2026, 5, 29, 16, 0, 0));
    // 2026-07-01 00:00:00 Manila is itself a midnight
    expect(manilaDayStartMs(Date.UTC(2026, 5, 30, 16, 0, 0))).toBe(Date.UTC(2026, 5, 30, 16, 0, 0));
    // 2026-01-01 11:00 Manila → 2025-12-31 16:00 UTC
    expect(manilaDayStartMs(Date.UTC(2026, 0, 1, 3, 0, 0))).toBe(Date.UTC(2025, 11, 31, 16, 0, 0));
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/core && bun run test`. Expected: FAIL (`./search` not found, `manilaDayStartMs` not exported).

- [ ] **Step 3: Implement** — create `packages/core/src/search.ts`:

```ts
// Journal search helpers shared by the Convex search query and the web
// acceptance script. Tokenizing mirrors Convex's search index (Tantivy's
// SimpleTokenizer): lowercase, split on anything that isn't a letter or digit.

const NON_WORD = /[^\p{L}\p{N}]+/u;

export function searchTerms(text: string): string[] {
  return [...new Set(text.toLowerCase().split(NON_WORD).filter((t) => t.length > 0))];
}

/** True when every term starts some word of `text`. The old Postgres search
 *  ANDed its terms; Convex's index matches any one of them, so the journal
 *  search query keeps only candidates that pass this. */
export function matchesAllTerms(text: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const words = searchTerms(text);
  return terms.every((term) => words.some((word) => word.startsWith(term)));
}
```

Append to `packages/core/src/months.ts` (after `manilaMonthStartMs`):

```ts
/** Epoch ms of 00:00 Asia/Manila on the Manila calendar day containing `ms`. */
export function manilaDayStartMs(ms: number): number {
  return Date.parse(`${manilaDayKeyFromMs(ms)}T00:00:00+08:00`);
}
```

In `packages/core/package.json` `exports`, add `"./search": "./src/search.ts"` after `"./highlight"`.

- [ ] **Step 4: Run to verify pass** — `cd packages/core && bun run test && bun run typecheck`. Expected: all pass (83 + 8 = 91 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): search term helpers and Manila day start"
```

---

### Task 2: Shared auth gate, journal schema, and topics

**Files:**
- Create: `packages/backend/convex/lib/auth.ts`, `packages/backend/convex/journal/model.ts`, `packages/backend/convex/journal/topics.ts`
- Modify: `packages/backend/convex/schema.ts`; `packages/backend/convex/expenses/{types,activities,items,trends,dashboard}.ts` (use the shared gate)
- Test: `packages/backend/test/journal-topics.test.ts`

**Interfaces:**
- Produces: `assertSignedIn(ctx: QueryCtx | MutationCtx): Promise<void>` in `convex/lib/auth.ts`.
- Produces (schema): tables `journalTopics`, `journalEntries` (with search index `search_text`), `entryTags` exactly as in Step 3 — later tasks rely on every field and index name.
- Produces (`convex/journal/model.ts`): `TOPIC_NAME_MAX = 80`, `TOPIC_DESCRIPTION_MAX = 280`, `TOPIC_SCAN_LIMIT = 1000`, `type TopicDoc`, `interface TopicDto { id: Id<"journalTopics">; name: string; description: string | null; archived: boolean }`, `topicDto(t)`, `byName(a, b)`, `cleanTopicName(raw): string`, `cleanDescription(raw): string | undefined`, `topicByName(ctx, name): Promise<TopicDoc | null>`, `insertTopic(ctx, name, description?): Promise<Id<"journalTopics">>`.
- Produces (`api.journal.topics`): `list({ includeArchived?: boolean }) → TopicDto[]`, `getByName({ name }) → TopicDto | null`, `search({ query }) → TopicDto[]`, `create({ name, description? }) → TopicDto`, `update({ id, name?, description?: string | null, archived? }) → TopicDto`.

- [ ] **Step 1: Extract the auth gate** — create `packages/backend/convex/lib/auth.ts`:

```ts
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Single-user system: "signed in?" is the whole gate — the allowlist already
 *  ran when the account was created (convex/auth.ts). */
export async function assertSignedIn(ctx: QueryCtx | MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new ConvexError("Unauthorized");
}
```

In `convex/expenses/types.ts`, `activities.ts`, and `items.ts`, delete the local `assertSignedIn` function and add `import { assertSignedIn } from "../lib/auth";`. In `convex/expenses/trends.ts` and `convex/expenses/dashboard.ts`, replace each inline `const identity = await ctx.auth.getUserIdentity(); if (identity === null) throw new ConvexError("Unauthorized");` with `await assertSignedIn(ctx);` and add the same import. Remove `ConvexError` (and `MutationCtx`/`QueryCtx`) imports that become unused. Behavior is unchanged — run `cd packages/backend && bun run test` now: 62 tests still pass.

- [ ] **Step 2: Write the failing topic tests** — create `packages/backend/test/journal-topics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

function setup() {
  const t = convexTest(schema, modules);
  return { t, asUser: t.withIdentity({ subject: "user1|session1" }) };
}

describe("journal topics", () => {
  it("rejects anonymous callers", async () => {
    const { t } = setup();
    await expect(t.query(api.journal.topics.list, {})).rejects.toThrow("Unauthorized");
    await expect(t.mutation(api.journal.topics.create, { name: "X" })).rejects.toThrow("Unauthorized");
  });

  it("creates trimmed topics and lists them by name, case-insensitively", async () => {
    const { asUser } = setup();
    const created = await asUser.mutation(api.journal.topics.create, { name: "  polaris " });
    expect(created).toMatchObject({ name: "polaris", description: null, archived: false });
    await asUser.mutation(api.journal.topics.create, { name: "Alpha", description: " First " });
    await asUser.mutation(api.journal.topics.create, { name: "beta" });
    const topics = await asUser.query(api.journal.topics.list, {});
    expect(topics.map((t) => t.name)).toEqual(["Alpha", "beta", "polaris"]);
    expect(topics[0].description).toBe("First");
  });

  it("rejects duplicate names and out-of-range names or descriptions", async () => {
    const { asUser } = setup();
    await asUser.mutation(api.journal.topics.create, { name: "Polaris" });
    await expect(asUser.mutation(api.journal.topics.create, { name: "Polaris" })).rejects.toThrow(
      'Topic "Polaris" already exists'
    );
    await expect(asUser.mutation(api.journal.topics.create, { name: "   " })).rejects.toThrow(
      "Topic name must be 1-80 characters"
    );
    await expect(asUser.mutation(api.journal.topics.create, { name: "x".repeat(81) })).rejects.toThrow(
      "Topic name must be 1-80 characters"
    );
    await expect(
      asUser.mutation(api.journal.topics.create, { name: "Ok", description: "d".repeat(281) })
    ).rejects.toThrow("Description must be at most 280 characters");
  });

  it("getByName finds an exact name and returns null otherwise", async () => {
    const { asUser } = setup();
    await asUser.mutation(api.journal.topics.create, { name: "Polaris notes" });
    expect(await asUser.query(api.journal.topics.getByName, { name: "Polaris notes" })).toMatchObject({
      name: "Polaris notes",
    });
    expect(await asUser.query(api.journal.topics.getByName, { name: "polaris notes" })).toBeNull();
  });

  it("update renames, edits or clears the description, and archives", async () => {
    const { t, asUser } = setup();
    const topic = await asUser.mutation(api.journal.topics.create, { name: "Old", description: "d" });
    await asUser.mutation(api.journal.topics.create, { name: "Taken" });

    const renamed = await asUser.mutation(api.journal.topics.update, { id: topic.id, name: " New " });
    expect(renamed.name).toBe("New");
    await expect(asUser.mutation(api.journal.topics.update, { id: topic.id, name: "Taken" })).rejects.toThrow(
      'Topic "Taken" already exists'
    );
    expect((await asUser.mutation(api.journal.topics.update, { id: topic.id, name: "New" })).name).toBe("New");

    const cleared = await asUser.mutation(api.journal.topics.update, { id: topic.id, description: null });
    expect(cleared.description).toBeNull();

    const archived = await asUser.mutation(api.journal.topics.update, { id: topic.id, archived: true });
    expect(archived.archived).toBe(true);
    const doc = await t.run((ctx) => ctx.db.get(topic.id));
    expect(typeof doc!.archivedAt).toBe("number");
    expect((await asUser.query(api.journal.topics.list, {})).map((x) => x.name)).toEqual(["Taken"]);
    expect(await asUser.query(api.journal.topics.list, { includeArchived: true })).toHaveLength(2);

    await asUser.mutation(api.journal.topics.update, { id: topic.id, archived: false });
    expect((await t.run((ctx) => ctx.db.get(topic.id)))!.archivedAt).toBeUndefined();

    await expect(asUser.mutation(api.journal.topics.update, { id: topic.id })).rejects.toThrow(
      "At least one field required"
    );
  });

  it("update bumps updatedAt and rejects a deleted topic", async () => {
    const { t, asUser } = setup();
    const topic = await asUser.mutation(api.journal.topics.create, { name: "A" });
    await t.run((ctx) => ctx.db.patch(topic.id, { updatedAt: 1 }));
    await asUser.mutation(api.journal.topics.update, { id: topic.id, description: "x" });
    expect((await t.run((ctx) => ctx.db.get(topic.id)))!.updatedAt).toBeGreaterThan(1);
    await t.run((ctx) => ctx.db.delete(topic.id));
    await expect(asUser.mutation(api.journal.topics.update, { id: topic.id, archived: true })).rejects.toThrow(
      "Topic not found"
    );
  });

  it("search matches name substrings, skips archived, newest-updated first, at most 10", async () => {
    const { t, asUser } = setup();
    const ids = [];
    for (let i = 0; i < 12; i++) {
      ids.push((await asUser.mutation(api.journal.topics.create, { name: `Build ${i}` })).id);
    }
    await asUser.mutation(api.journal.topics.create, { name: "Reading" });
    await t.run(async (ctx) => {
      for (let i = 0; i < ids.length; i++) await ctx.db.patch(ids[i], { updatedAt: 1000 + i });
    });
    await asUser.mutation(api.journal.topics.update, { id: ids[11], archived: true });

    const hits = await asUser.query(api.journal.topics.search, { query: " BUILD " });
    expect(hits).toHaveLength(10);
    expect(hits[0].name).toBe("Build 10"); // Build 11 is archived
    expect(hits.some((h) => h.name === "Reading")).toBe(false);

    // Empty query = browsing the layer: newest-updated topics, not [].
    const browse = await asUser.query(api.journal.topics.search, { query: "" });
    expect(browse).toHaveLength(10);
  });
});
```

- [ ] **Step 3: Add the schema** — in `packages/backend/convex/schema.ts`, replace the header comment's last line (`// Feedback tables added in Task 6; system tables in phase 2.`) with `// Platform feedback (phase 1), expenses (phase 2), journal (phase 3).`, and append inside `defineSchema({ … })` after `expenseItems`:

```ts
  // Journal (phase 3). All timestamps are ms since epoch; legacyId carries the
  // Postgres cuid for idempotent import.
  journalTopics: defineTable({
    name: v.string(), // unique — enforced by the mutations through by_name
    description: v.optional(v.string()),
    parentId: v.optional(v.id("journalTopics")), // imported; nothing reads it yet
    archived: v.boolean(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(), // the palette lists recently changed topics first
    legacyId: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_legacy_id", ["legacyId"]),
  journalEntries: defineTable({
    topicId: v.id("journalTopics"),
    title: v.optional(v.string()),
    body: v.string(), // markdown
    tags: v.array(v.string()), // extractTags(body); entryTags mirrors it for live entries
    searchText: v.string(), // title + "\n" + body — the search index has one search field
    deletedAt: v.optional(v.number()), // soft delete
    createdAt: v.number(),
    updatedAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_deleted_at_created_at", ["deletedAt", "createdAt"])
    .index("by_topic_deleted_at_created_at", ["topicId", "deletedAt", "createdAt"])
    .index("by_legacy_id", ["legacyId"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["topicId", "deletedAt"],
    }),
  // One row per (live entry, tag). Soft-deleting an entry removes its rows.
  entryTags: defineTable({
    entryId: v.id("journalEntries"),
    tag: v.string(),
    entryCreatedAt: v.number(), // copy of the entry's createdAt — orders a tag's entries
  })
    .index("by_entry", ["entryId"])
    .index("by_tag_entry_created_at", ["tag", "entryCreatedAt"]),
```

- [ ] **Step 4: Add the topic helpers** — create `packages/backend/convex/journal/model.ts`:

```ts
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Shared journal helpers — no Convex functions live in this file. Limits match
// the old Zod route schemas (apps/web/src/systems/journal/schemas).

export const TOPIC_NAME_MAX = 80;
export const TOPIC_DESCRIPTION_MAX = 280;
// Topics are a small table; table-wide topic reads take at most this many.
export const TOPIC_SCAN_LIMIT = 1000;

type Ctx = QueryCtx | MutationCtx;
export type TopicDoc = Doc<"journalTopics">;

export interface TopicDto {
  id: Id<"journalTopics">;
  name: string;
  description: string | null;
  archived: boolean;
}

export function topicDto(t: TopicDoc): TopicDto {
  return { id: t._id, name: t.name, description: t.description ?? null, archived: t.archived };
}

/** Case-insensitive name order. A plain comparison rather than localeCompare,
 *  which keeps Intl out of the Convex runtime. */
export function byName(a: { name: string }, b: { name: string }): number {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

export function cleanTopicName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > TOPIC_NAME_MAX) {
    throw new ConvexError(`Topic name must be 1-${TOPIC_NAME_MAX} characters`);
  }
  return name;
}

/** Trimmed description; an empty one becomes undefined (field removed). */
export function cleanDescription(raw: string): string | undefined {
  const description = raw.trim();
  if (description.length > TOPIC_DESCRIPTION_MAX) {
    throw new ConvexError(`Description must be at most ${TOPIC_DESCRIPTION_MAX} characters`);
  }
  return description.length > 0 ? description : undefined;
}

export async function topicByName(ctx: Ctx, name: string): Promise<TopicDoc | null> {
  return ctx.db
    .query("journalTopics")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
}

/** Inserts a topic; `name` must already be cleaned. Throws on a taken name. */
export async function insertTopic(
  ctx: MutationCtx,
  name: string,
  description?: string
): Promise<Id<"journalTopics">> {
  if ((await topicByName(ctx, name)) !== null) {
    throw new ConvexError(`Topic "${name}" already exists`);
  }
  const now = Date.now();
  return ctx.db.insert("journalTopics", {
    name,
    ...(description ? { description } : {}),
    archived: false,
    createdAt: now,
    updatedAt: now,
  });
}
```

- [ ] **Step 5: Implement the topics module** — create `packages/backend/convex/journal/topics.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import {
  TOPIC_SCAN_LIMIT,
  byName,
  cleanDescription,
  cleanTopicName,
  insertTopic,
  topicByName,
  topicDto,
  type TopicDoc,
} from "./model";

export const list = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topics = await ctx.db.query("journalTopics").take(TOPIC_SCAN_LIMIT);
    return topics
      .filter((t) => args.includeArchived || !t.archived)
      .sort(byName)
      .map(topicDto);
  },
});

export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await topicByName(ctx, args.name);
    return topic === null ? null : topicDto(topic);
  },
});

const PALETTE_LIMIT = 10;

// Palette layer: active topics whose name contains the query, most recently
// changed first. An empty query (browsing the layer) lists the newest ones.
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const needle = args.query.trim().toLowerCase();
    const topics = await ctx.db.query("journalTopics").take(TOPIC_SCAN_LIMIT);
    return topics
      .filter((t) => !t.archived && (needle === "" || t.name.toLowerCase().includes(needle)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, PALETTE_LIMIT)
      .map(topicDto);
  },
});

export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = cleanTopicName(args.name);
    const description =
      args.description === undefined ? undefined : cleanDescription(args.description);
    const id = await insertTopic(ctx, name, description);
    return topicDto((await ctx.db.get(id))!);
  },
});

export const update = mutation({
  args: {
    id: v.id("journalTopics"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if (args.name === undefined && args.description === undefined && args.archived === undefined) {
      throw new ConvexError("At least one field required");
    }
    const topic = await ctx.db.get(args.id);
    if (topic === null) throw new ConvexError("Topic not found");

    const now = Date.now();
    const patch: Partial<Omit<TopicDoc, "_id" | "_creationTime">> = { updatedAt: now };
    if (args.name !== undefined) {
      const name = cleanTopicName(args.name);
      if (name !== topic.name) {
        if ((await topicByName(ctx, name)) !== null) {
          throw new ConvexError(`Topic "${name}" already exists`);
        }
        patch.name = name;
      }
    }
    if (args.description !== undefined) {
      // undefined in a patch removes the field
      patch.description = args.description === null ? undefined : cleanDescription(args.description);
    }
    if (args.archived !== undefined) {
      patch.archived = args.archived;
      patch.archivedAt = args.archived ? now : undefined;
    }
    await ctx.db.patch(args.id, patch);
    return topicDto((await ctx.db.get(args.id))!);
  },
});
```

- [ ] **Step 6: Run the ritual** — `cd packages/backend && bunx convex codegen && bun run test`. Expected: the new topic tests pass with the 62 existing ones. Then `bunx convex dev --once` (pushes schema + functions to dev; the search index builds on empty tables).

- [ ] **Step 7: Commit**

```bash
git add packages/backend
git commit -m "feat(journal): journal schema, topics module, shared auth gate"
```

---

### Task 3: Entries — list, create, update, remove

**Files:**
- Modify: `packages/backend/convex/journal/model.ts` (append entry helpers)
- Create: `packages/backend/convex/journal/entries.ts`
- Test: `packages/backend/test/journal-entries.test.ts`

**Interfaces:**
- Consumes: Task 2 schema, `topicDto`/model helpers, `assertSignedIn`; `extractTags`, `wordCount` from `@polaris/core/parser`; `internal.feedback.record` (existing internal mutation `{ system, name, value }`).
- Produces (model): `ENTRY_TITLE_MAX = 200`, `LIST_LIMIT_MAX = 100`, `type EntryDoc`, `interface EntryDto { id: Id<"journalEntries">; topicId: Id<"journalTopics">; topicName: string; title: string | null; body: string; tags: string[]; createdAt: number; updatedAt: number }`, `clampLimit(limit, fallback)`, `cleanTitle(raw?: string | null): string | undefined`, `checkBody(body)`, `searchTextOf(title, body)`, `writeEntryTags(ctx, entryId, tags, entryCreatedAt)`, `recordWordsMetric(ctx, body)`, `insertEntry(ctx, { topicId, title?, body, createdAt? }): Promise<Id<"journalEntries">>` (records `entry_created` + `words_per_entry`), `entryDtos(ctx, docs): Promise<EntryDto[]>`.
- Produces (`api.journal.entries`): `list({ topicId?, tag?, sinceMs?, sort?: "asc" | "desc", limit? }) → { entries: EntryDto[] }`, `create({ topicId, title?, body }) → Id<"journalEntries">`, `update({ id, topicId?, title?: string | null, body? }) → null`, `remove({ id }) → null`.

- [ ] **Step 1: Write the failing tests** — create `packages/backend/test/journal-entries.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const topic = await asUser.mutation(api.journal.topics.create, { name: "Polaris" });
  return { t, asUser, topic };
}

async function tagRows(t: ReturnType<typeof convexTest>, entryId: string) {
  return t.run(async (ctx) =>
    (await ctx.db.query("entryTags").collect()).filter((r) => r.entryId === entryId)
  );
}

describe("journal entries", () => {
  // Only Date is faked, so convex-test's scheduler keeps real timers.
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("creates an entry with tags, search text, and equal timestamps", async () => {
    const { t, asUser, topic } = await setup();
    vi.setSystemTime(5_000);
    const id = await asUser.mutation(api.journal.entries.create, {
      topicId: topic.id,
      title: " Ship day ",
      body: "Shipped #Convex and #search today",
    });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc).toMatchObject({
      title: "Ship day",
      tags: ["convex", "search"],
      searchText: "Ship day\nShipped #Convex and #search today",
      createdAt: 5_000,
      updatedAt: 5_000,
    });
    const rows = await tagRows(t, id);
    expect(rows.map((r) => r.tag).sort()).toEqual(["convex", "search"]);
    expect(rows.every((r) => r.entryCreatedAt === 5_000)).toBe(true);
  });

  it("stores an empty title as absent and lists DTOs newest first", async () => {
    const { asUser, topic } = await setup();
    vi.setSystemTime(1_000);
    const first = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, title: "  ", body: "one" });
    vi.setSystemTime(2_000);
    const second = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "two" });
    const { entries } = await asUser.query(api.journal.entries.list, {});
    expect(entries.map((e) => e.id)).toEqual([second, first]);
    expect(entries[1]).toEqual({
      id: first,
      topicId: topic.id,
      topicName: "Polaris",
      title: null,
      body: "one",
      tags: [],
      createdAt: 1_000,
      updatedAt: 1_000,
    });
  });

  it("rejects anonymous callers, unknown topics, blank bodies, and long titles", async () => {
    const { t, asUser, topic } = await setup();
    await expect(t.query(api.journal.entries.list, {})).rejects.toThrow("Unauthorized");
    await expect(
      asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "   " })
    ).rejects.toThrow("Write something before saving.");
    await expect(
      asUser.mutation(api.journal.entries.create, { topicId: topic.id, title: "x".repeat(201), body: "b" })
    ).rejects.toThrow("Titles can be at most 200 characters.");
    await t.run((ctx) => ctx.db.delete(topic.id));
    await expect(
      asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "b" })
    ).rejects.toThrow("Topic not found. Pick another topic.");
  });

  it("filters by sinceMs, by topic in both orders, and by tag", async () => {
    const { asUser, topic } = await setup();
    const other = await asUser.mutation(api.journal.topics.create, { name: "Other" });
    vi.setSystemTime(1_000);
    const a = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "a #x" });
    vi.setSystemTime(2_000);
    const b = await asUser.mutation(api.journal.entries.create, { topicId: other.id, body: "b #x" });
    vi.setSystemTime(3_000);
    const c = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "c" });

    type ListArgs = {
      topicId?: typeof topic.id;
      tag?: string;
      sinceMs?: number;
      sort?: "asc" | "desc";
      limit?: number;
    };
    const ids = async (args: ListArgs) =>
      (await asUser.query(api.journal.entries.list, args)).entries.map((e) => e.id);

    expect(await ids({ sinceMs: 2_000 })).toEqual([c, b]);
    expect(await ids({ topicId: topic.id })).toEqual([c, a]);
    expect(await ids({ topicId: topic.id, sort: "asc" })).toEqual([a, c]);
    expect(await ids({ tag: "x" })).toEqual([b, a]);
    expect(await ids({ limit: 1 })).toEqual([c]);
    expect(await ids({ limit: 0 })).toEqual([c]); // clamped to at least 1
  });

  it("rejects mixed list modes", async () => {
    const { asUser, topic } = await setup();
    await expect(asUser.query(api.journal.entries.list, { topicId: topic.id, tag: "x" })).rejects.toThrow(
      "Pass topicId or tag, not both"
    );
    await expect(asUser.query(api.journal.entries.list, { tag: "x", sinceMs: 1 })).rejects.toThrow(
      "sinceMs only works without topicId or tag"
    );
  });

  it("update recomputes tags and search text, clears the title, and moves topics", async () => {
    const { t, asUser, topic } = await setup();
    const other = await asUser.mutation(api.journal.topics.create, { name: "Other" });
    vi.setSystemTime(1_000);
    const id = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, title: "T", body: "old #a" });
    vi.setSystemTime(9_000);
    await asUser.mutation(api.journal.entries.update, { id, body: "new #b #c" });
    let doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc).toMatchObject({ body: "new #b #c", tags: ["b", "c"], searchText: "T\nnew #b #c", updatedAt: 9_000, createdAt: 1_000 });
    expect((await tagRows(t, id)).map((r) => r.tag).sort()).toEqual(["b", "c"]);

    await asUser.mutation(api.journal.entries.update, { id, title: null, topicId: other.id });
    doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc!.title).toBeUndefined();
    expect(doc!.searchText).toBe("new #b #c");
    expect(doc!.topicId).toBe(other.id);

    await expect(asUser.mutation(api.journal.entries.update, { id, body: " " })).rejects.toThrow(
      "Write something before saving."
    );
  });

  it("update rejects missing and deleted entries", async () => {
    const { t, asUser, topic } = await setup();
    const id = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "x" });
    await asUser.mutation(api.journal.entries.remove, { id });
    await expect(asUser.mutation(api.journal.entries.update, { id, body: "y" })).rejects.toThrow("Entry not found.");
    await t.run((ctx) => ctx.db.delete(id));
    await expect(asUser.mutation(api.journal.entries.update, { id, body: "y" })).rejects.toThrow("Entry not found.");
  });

  it("remove soft-deletes, hides the entry from every list, and is idempotent", async () => {
    const { t, asUser, topic } = await setup();
    const id = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "bye #x" });
    await asUser.mutation(api.journal.entries.remove, { id });
    await asUser.mutation(api.journal.entries.remove, { id }); // double-fire is fine
    expect(typeof (await t.run((ctx) => ctx.db.get(id)))!.deletedAt).toBe("number");
    expect((await asUser.query(api.journal.entries.list, {})).entries).toEqual([]);
    expect((await asUser.query(api.journal.entries.list, { topicId: topic.id })).entries).toEqual([]);
    expect((await asUser.query(api.journal.entries.list, { tag: "x" })).entries).toEqual([]);
    expect(await tagRows(t, id)).toEqual([]);
  });
});

describe("journal entry metrics", () => {
  it("create records entry_created and words_per_entry; update records words only for a new body", async () => {
    vi.useFakeTimers();
    const { t, asUser, topic } = await setup();
    const id = await asUser.mutation(api.journal.entries.create, { topicId: topic.id, body: "three little words" });
    await asUser.mutation(api.journal.entries.update, { id, title: "only a title" });
    await asUser.mutation(api.journal.entries.update, { id, body: "two words" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const metrics = await t.run((ctx) => ctx.db.query("systemMetrics").collect());
    const journal = metrics.filter((m) => m.system === "journal").map((m) => [m.name, m.value]);
    expect(journal).toEqual([
      ["entry_created", 1],
      ["words_per_entry", 3],
      ["words_per_entry", 2],
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/backend && bunx convex codegen; bun run test`. Expected: FAIL (`api.journal.entries` missing). (codegen may itself fail on the missing module — that's the expected red state.)

- [ ] **Step 3: Append the entry helpers** — add to the imports at the top of `convex/journal/model.ts`:

```ts
import { extractTags, wordCount } from "@polaris/core/parser";
import { internal } from "../_generated/api";
```

and append to the end of the file:

```ts
export const ENTRY_TITLE_MAX = 200;
export const LIST_LIMIT_MAX = 100;

export type EntryDoc = Doc<"journalEntries">;

export interface EntryDto {
  id: Id<"journalEntries">;
  topicId: Id<"journalTopics">;
  topicName: string;
  title: string | null;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export function clampLimit(limit: number | undefined, fallback: number): number {
  return Math.min(Math.max(Math.trunc(limit ?? fallback), 1), LIST_LIMIT_MAX);
}

/** Trimmed title; null, undefined, or blank becomes undefined (no title). */
export function cleanTitle(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const title = raw.trim();
  if (title.length > ENTRY_TITLE_MAX) {
    throw new ConvexError(`Titles can be at most ${ENTRY_TITLE_MAX} characters.`);
  }
  return title.length > 0 ? title : undefined;
}

export function checkBody(body: string): void {
  if (body.trim().length === 0) throw new ConvexError("Write something before saving.");
}

export function searchTextOf(title: string | undefined, body: string): string {
  return title ? `${title}\n${body}` : body;
}

/** Replaces an entry's tag rows. Pass [] to clear them (soft delete). */
export async function writeEntryTags(
  ctx: MutationCtx,
  entryId: Id<"journalEntries">,
  tags: string[],
  entryCreatedAt: number
): Promise<void> {
  const existing = await ctx.db
    .query("entryTags")
    .withIndex("by_entry", (q) => q.eq("entryId", entryId))
    .collect(); // one entry's tags
  for (const row of existing) await ctx.db.delete(row._id);
  for (const tag of tags) await ctx.db.insert("entryTags", { entryId, tag, entryCreatedAt });
}

// Metrics are scheduled so a failure can never fail or slow a journal write
// (docs/replatform.md §07).
export async function recordWordsMetric(ctx: MutationCtx, body: string): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.feedback.record, {
    system: "journal",
    name: "words_per_entry",
    value: wordCount(body),
  });
}

/** The one way entries are created — journal's own create and habit logs
 *  (convex/journal/habitBridge.ts) both come through here. `title` must
 *  already be cleaned and `body` checked. */
export async function insertEntry(
  ctx: MutationCtx,
  input: { topicId: Id<"journalTopics">; title?: string; body: string; createdAt?: number }
): Promise<Id<"journalEntries">> {
  const createdAt = input.createdAt ?? Date.now();
  const tags = extractTags(input.body);
  const id = await ctx.db.insert("journalEntries", {
    topicId: input.topicId,
    ...(input.title ? { title: input.title } : {}),
    body: input.body,
    tags,
    searchText: searchTextOf(input.title, input.body),
    createdAt,
    updatedAt: createdAt, // a backdated habit log hasn't been edited either
  });
  await writeEntryTags(ctx, id, tags, createdAt);
  await ctx.scheduler.runAfter(0, internal.feedback.record, {
    system: "journal",
    name: "entry_created",
    value: 1,
  });
  await recordWordsMetric(ctx, input.body);
  return id;
}

export async function entryDtos(ctx: Ctx, docs: EntryDoc[]): Promise<EntryDto[]> {
  const names = new Map<Id<"journalTopics">, string>();
  const out: EntryDto[] = [];
  for (const e of docs) {
    if (!names.has(e.topicId)) {
      names.set(e.topicId, (await ctx.db.get(e.topicId))?.name ?? "(unknown topic)");
    }
    out.push({
      id: e._id,
      topicId: e.topicId,
      topicName: names.get(e.topicId)!,
      title: e.title ?? null,
      body: e.body,
      tags: e.tags,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    });
  }
  return out;
}
```

- [ ] **Step 4: Implement the entries module** — create `packages/backend/convex/journal/entries.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { extractTags } from "@polaris/core/parser";
import { mutation, query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import {
  checkBody,
  clampLimit,
  cleanTitle,
  entryDtos,
  insertEntry,
  recordWordsMetric,
  searchTextOf,
  writeEntryTags,
  type EntryDoc,
} from "./model";

// One query, three modes (decision log 9): a tag's entries, a topic's entries,
// or every live entry (optionally since a moment — the Today page).
export const list = query({
  args: {
    topicId: v.optional(v.id("journalTopics")),
    tag: v.optional(v.string()),
    sinceMs: v.optional(v.number()),
    sort: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if (args.topicId !== undefined && args.tag !== undefined) {
      throw new ConvexError("Pass topicId or tag, not both");
    }
    if (args.sinceMs !== undefined && (args.topicId !== undefined || args.tag !== undefined)) {
      throw new ConvexError("sinceMs only works without topicId or tag");
    }
    const limit = clampLimit(args.limit, 50);
    const order = args.sort ?? "desc";
    const { tag, topicId, sinceMs } = args;

    let docs: EntryDoc[];
    if (tag !== undefined) {
      const rows = await ctx.db
        .query("entryTags")
        .withIndex("by_tag_entry_created_at", (q) => q.eq("tag", tag))
        .order(order)
        .take(limit);
      docs = [];
      for (const row of rows) {
        const entry = await ctx.db.get(row.entryId);
        if (entry !== null && entry.deletedAt === undefined) docs.push(entry);
      }
    } else if (topicId !== undefined) {
      docs = await ctx.db
        .query("journalEntries")
        .withIndex("by_topic_deleted_at_created_at", (q) =>
          q.eq("topicId", topicId).eq("deletedAt", undefined)
        )
        .order(order)
        .take(limit);
    } else {
      docs = await ctx.db
        .query("journalEntries")
        .withIndex("by_deleted_at_created_at", (q) =>
          sinceMs === undefined
            ? q.eq("deletedAt", undefined)
            : q.eq("deletedAt", undefined).gte("createdAt", sinceMs)
        )
        .order(order)
        .take(limit);
    }
    return { entries: await entryDtos(ctx, docs) };
  },
});

export const create = mutation({
  args: {
    topicId: v.id("journalTopics"),
    title: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    if ((await ctx.db.get(args.topicId)) === null) {
      throw new ConvexError("Topic not found. Pick another topic.");
    }
    checkBody(args.body);
    return insertEntry(ctx, { topicId: args.topicId, title: cleanTitle(args.title), body: args.body });
  },
});

export const update = mutation({
  args: {
    id: v.id("journalEntries"),
    topicId: v.optional(v.id("journalTopics")),
    title: v.optional(v.union(v.string(), v.null())),
    body: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const entry = await ctx.db.get(args.id);
    if (entry === null || entry.deletedAt !== undefined) throw new ConvexError("Entry not found.");

    const patch: Partial<Omit<EntryDoc, "_id" | "_creationTime">> = { updatedAt: Date.now() };
    if (args.topicId !== undefined) {
      if ((await ctx.db.get(args.topicId)) === null) {
        throw new ConvexError("Topic not found. Pick another topic.");
      }
      patch.topicId = args.topicId;
    }
    const title = args.title !== undefined ? cleanTitle(args.title) : entry.title;
    if (args.title !== undefined) patch.title = title; // undefined removes the field
    const body = args.body ?? entry.body;
    if (args.body !== undefined) {
      checkBody(args.body);
      patch.body = args.body;
      patch.tags = extractTags(args.body);
    }
    patch.searchText = searchTextOf(title, body);
    await ctx.db.patch(args.id, patch);

    if (args.body !== undefined) {
      await writeEntryTags(ctx, args.id, patch.tags!, entry.createdAt);
      await recordWordsMetric(ctx, args.body);
    }
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("journalEntries") },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const entry = await ctx.db.get(args.id);
    if (entry === null || entry.deletedAt !== undefined) return null; // reactive UIs double-fire
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
    await writeEntryTags(ctx, args.id, [], entry.createdAt);
    return null;
  },
});
```

- [ ] **Step 5: Run the ritual** — `cd packages/backend && bunx convex codegen && bun run test`, then `bunx convex dev --once`. Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/backend
git commit -m "feat(journal): entries list/create/update/remove with tag rows and metrics"
```

---

### Task 4: Search

**Files:**
- Modify: `packages/backend/convex/journal/model.ts` (append), `packages/backend/convex/journal/entries.ts` (add `search`)
- Test: `packages/backend/test/journal-search.test.ts`

**Interfaces:**
- Consumes: `searchTerms`, `matchesAllTerms` from `@polaris/core/search` (Task 1); Task 3's `entryDtos`, `clampLimit`.
- Produces (model): `SEARCH_CANDIDATE_LIMIT = 256`, `searchEntryDocs(ctx: QueryCtx, { q, topicId?, limit }): Promise<EntryDoc[]>` — Task 7's `searchProbe` reuses it.
- Produces (`api.journal.entries`): `search({ q, topicId?, limit? }) → { entries: EntryDto[] }` (limit default 20, max 100).

Note for the tests: convex-test's search stand-in splits documents on whitespace only, matches any query term as a word prefix, and returns matches in insertion order — so test bodies use plain words (no `#tag` as the only occurrence of a searched word), and tests compare result *sets*, never relevance order.

- [ ] **Step 1: Write the failing tests** — create `packages/backend/test/journal-search.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const polaris = await asUser.mutation(api.journal.topics.create, { name: "Polaris" });
  const other = await asUser.mutation(api.journal.topics.create, { name: "Other" });
  const make = async (topicId: typeof polaris.id, body: string, title?: string, at = Date.now()) => {
    vi.setSystemTime(at);
    return asUser.mutation(api.journal.entries.create, { topicId, body, ...(title ? { title } : {}) });
  };
  return { t, asUser, polaris, other, make };
}

const sorted = (ids: string[]) => [...ids].sort();

describe("journal search", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("keeps only entries containing every term", async () => {
    const { asUser, polaris, make } = await setup();
    const both = await make(polaris.id, "react hooks are neat");
    await make(polaris.id, "react only here");
    await make(polaris.id, "hooks only here");
    const { entries } = await asUser.query(api.journal.entries.search, { q: "react hooks" });
    expect(entries.map((e) => e.id)).toEqual([both]);
    expect(entries[0].topicName).toBe("Polaris");
  });

  it("matches terms as word prefixes, case-insensitively, including the title", async () => {
    const { asUser, polaris, make } = await setup();
    const deploy = await make(polaris.id, "deploying the app");
    const titled = await make(polaris.id, "nothing here", "Deploy notes");
    await make(polaris.id, "redeploy later");
    const { entries } = await asUser.query(api.journal.entries.search, { q: "DEPLO" });
    expect(sorted(entries.map((e) => e.id))).toEqual(sorted([deploy, titled]));
  });

  it("scopes to a topic and never returns deleted entries", async () => {
    const { asUser, polaris, other, make } = await setup();
    const keep = await make(polaris.id, "deploy ship note");
    await make(other.id, "deploy elsewhere");
    const gone = await make(polaris.id, "deploy removed");
    await asUser.mutation(api.journal.entries.remove, { id: gone });
    const { entries } = await asUser.query(api.journal.entries.search, { q: "deploy", topicId: polaris.id });
    expect(entries.map((e) => e.id)).toEqual([keep]);
  });

  it("an empty query lists the newest live entries (palette browse), topic-scoped too", async () => {
    const { asUser, polaris, other, make } = await setup();
    const a = await make(polaris.id, "first", undefined, 1_000);
    const b = await make(other.id, "second", undefined, 2_000);
    const c = await make(polaris.id, "third", undefined, 3_000);
    expect((await asUser.query(api.journal.entries.search, { q: "  " })).entries.map((e) => e.id)).toEqual([c, b, a]);
    expect(
      (await asUser.query(api.journal.entries.search, { q: "", topicId: polaris.id })).entries.map((e) => e.id)
    ).toEqual([c, a]);
  });

  it("a punctuation-only query matches nothing", async () => {
    const { asUser, polaris, make } = await setup();
    await make(polaris.id, "anything");
    expect((await asUser.query(api.journal.entries.search, { q: "!!! --" })).entries).toEqual([]);
  });

  it("respects the limit and requires sign-in", async () => {
    const { t, asUser, polaris, make } = await setup();
    for (let i = 0; i < 5; i++) await make(polaris.id, `deploy number ${i}`);
    expect((await asUser.query(api.journal.entries.search, { q: "deploy", limit: 2 })).entries).toHaveLength(2);
    await expect(t.query(api.journal.entries.search, { q: "deploy" })).rejects.toThrow("Unauthorized");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/backend && bun run test`. Expected: FAIL (`api.journal.entries.search` missing).

- [ ] **Step 3: Append the search helper** — add `import { matchesAllTerms, searchTerms } from "@polaris/core/search";` to the imports of `convex/journal/model.ts` and append:

```ts
// Candidates pulled from the search index before the every-term filter
// (decision log 4, 19). Convex caps one search at 1024 results.
export const SEARCH_CANDIDATE_LIMIT = 256;
const MAX_SEARCH_TERMS = 16; // Convex search limit

/** Journal search: an empty query lists the newest live entries; otherwise
 *  index candidates (any term matches, relevance order) filtered down to
 *  entries containing every term, like the old Postgres tsquery AND. */
export async function searchEntryDocs(
  ctx: QueryCtx,
  args: { q: string; topicId?: Id<"journalTopics">; limit: number }
): Promise<EntryDoc[]> {
  const { topicId, limit } = args;
  if (args.q.trim().length === 0) {
    return topicId === undefined
      ? ctx.db
          .query("journalEntries")
          .withIndex("by_deleted_at_created_at", (q) => q.eq("deletedAt", undefined))
          .order("desc")
          .take(limit)
      : ctx.db
          .query("journalEntries")
          .withIndex("by_topic_deleted_at_created_at", (q) =>
            q.eq("topicId", topicId).eq("deletedAt", undefined)
          )
          .order("desc")
          .take(limit);
  }
  const terms = searchTerms(args.q).slice(0, MAX_SEARCH_TERMS);
  if (terms.length === 0) return [];
  const candidates = await ctx.db
    .query("journalEntries")
    .withSearchIndex("search_text", (s) => {
      const live = s.search("searchText", terms.join(" ")).eq("deletedAt", undefined);
      return topicId === undefined ? live : live.eq("topicId", topicId);
    })
    .take(SEARCH_CANDIDATE_LIMIT);
  return candidates.filter((e) => matchesAllTerms(e.searchText, terms)).slice(0, limit);
}
```

- [ ] **Step 4: Add the query** — in `convex/journal/entries.ts`, add `searchEntryDocs` to the `./model` import and append:

```ts
export const search = query({
  args: {
    q: v.string(),
    topicId: v.optional(v.id("journalTopics")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const docs = await searchEntryDocs(ctx, {
      q: args.q,
      topicId: args.topicId,
      limit: clampLimit(args.limit, 20),
    });
    return { entries: await entryDtos(ctx, docs) };
  },
});
```

- [ ] **Step 5: Run the ritual** — `cd packages/backend && bunx convex codegen && bun run test`, then `bunx convex dev --once`. Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/backend
git commit -m "feat(journal): search over the Convex index with every-term filtering"
```

---

### Task 5: Aggregates — topic stats, tag counts, dashboard, nightly job

**Files:**
- Modify: `packages/backend/convex/journal/model.ts` (one constant), `packages/backend/convex/journal/topics.ts` (add `listWithStats`)
- Create: `packages/backend/convex/journal/tags.ts`, `packages/backend/convex/journal/dashboard.ts`, `packages/backend/convex/journal/activeTopics.ts`, `packages/backend/convex/crons.ts`
- Test: `packages/backend/test/journal-aggregates.test.ts`

**Interfaces:**
- Consumes: `manilaDayStartMs` (Task 1), `entryDtos`, `topicDto`, `byName`, `TOPIC_SCAN_LIMIT` (Tasks 2–3).
- Produces: `AGGREGATE_SCAN_LIMIT = 5000` (model); `api.journal.topics.listWithStats({ includeArchived? }) → Array<TopicDto & { entryCount: number; lastEntryAt: number | null }>`; `api.journal.tags.list({}) → Array<{ tag: string; count: number }>` (sorted by tag); `api.journal.dashboard.summary({ now? }) → { todayCount: number; yesterdayCount: number; lastEntry: EntryDto | null }`; `internal.journal.activeTopics.compute({ now? }) → number`; cron `"journal active topics"` daily at 15:00 UTC.

- [ ] **Step 1: Write the failing tests** — create `packages/backend/test/journal-aggregates.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import crons from "../convex/crons";

const modules = import.meta.glob("../convex/**/*.*s");
const DAY = 86_400_000;

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const polaris = await asUser.mutation(api.journal.topics.create, { name: "Polaris" });
  const other = await asUser.mutation(api.journal.topics.create, { name: "Other" });
  const make = async (topicId: typeof polaris.id, body: string, at: number) => {
    vi.setSystemTime(at);
    return asUser.mutation(api.journal.entries.create, { topicId, body });
  };
  return { t, asUser, polaris, other, make };
}

describe("journal aggregates", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("listWithStats counts live entries and the latest entry per topic", async () => {
    const { asUser, polaris, other, make } = await setup();
    await make(polaris.id, "a", 1_000);
    await make(polaris.id, "b", 3_000);
    const gone = await make(polaris.id, "c", 5_000);
    await asUser.mutation(api.journal.entries.remove, { id: gone });
    const archived = await asUser.mutation(api.journal.topics.create, { name: "Zed" });
    await asUser.mutation(api.journal.topics.update, { id: archived.id, archived: true });

    const stats = await asUser.query(api.journal.topics.listWithStats, {});
    expect(stats.map((s) => [s.name, s.entryCount, s.lastEntryAt])).toEqual([
      ["Other", 0, null],
      ["Polaris", 2, 3_000],
    ]);
    expect(stats[0].id).toBe(other.id);
    expect(await asUser.query(api.journal.topics.listWithStats, { includeArchived: true })).toHaveLength(3);
  });

  it("tags.list counts live entries per tag, sorted by tag", async () => {
    const { asUser, polaris, make } = await setup();
    await make(polaris.id, "#zeta #alpha", 1_000);
    const two = await make(polaris.id, "#alpha", 2_000);
    const gone = await make(polaris.id, "#beta", 3_000);
    await asUser.mutation(api.journal.entries.remove, { id: gone });
    expect(await asUser.query(api.journal.tags.list, {})).toEqual([
      { tag: "alpha", count: 2 },
      { tag: "zeta", count: 1 },
    ]);
    await asUser.mutation(api.journal.entries.update, { id: two, body: "#zeta" });
    expect(await asUser.query(api.journal.tags.list, {})).toEqual([
      { tag: "alpha", count: 1 },
      { tag: "zeta", count: 2 },
    ]);
  });

  it("dashboard counts entries in the Manila day and yesterday, with the last entry", async () => {
    const { asUser, polaris, make } = await setup();
    const now = Date.UTC(2026, 9, 18, 2, 0); // 10:00 Manila, Oct 18
    const todayStart = Date.UTC(2026, 9, 17, 16, 0); // 00:00 Manila, Oct 18
    await make(polaris.id, "two days ago", todayStart - DAY - 1);
    await make(polaris.id, "yesterday", todayStart - 1);
    await make(polaris.id, "today early", todayStart);
    const last = await make(polaris.id, "today late", now);
    const summary = await asUser.query(api.journal.dashboard.summary, { now });
    expect(summary.todayCount).toBe(2);
    expect(summary.yesterdayCount).toBe(1);
    expect(summary.lastEntry).toMatchObject({ id: last, topicName: "Polaris", body: "today late" });
  });

  it("dashboard is empty-safe", async () => {
    const { asUser } = await setup();
    expect(await asUser.query(api.journal.dashboard.summary, { now: Date.now() })).toEqual({
      todayCount: 0,
      yesterdayCount: 0,
      lastEntry: null,
    });
  });
});

describe("journal nightly job", () => {
  it("counts topics with live entries in the last 7 days and records the metric", async () => {
    vi.useFakeTimers();
    const { t, asUser, polaris, other, make } = await setup();
    const now = Date.UTC(2026, 9, 18, 15, 0);
    await make(polaris.id, "recent", now - DAY);
    await make(polaris.id, "recent too", now - 2 * DAY);
    await make(other.id, "too old", now - 8 * DAY);
    const deleted = await make(other.id, "deleted", now - DAY);
    await asUser.mutation(api.journal.entries.remove, { id: deleted });

    expect(await t.mutation(internal.journal.activeTopics.compute, { now })).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const metrics = await t.run((ctx) => ctx.db.query("systemMetrics").collect());
    expect(metrics.filter((m) => m.name === "active_topic_count").map((m) => m.value)).toEqual([1]);
  });

  it("runs daily at 15:00 UTC (23:00 Manila)", () => {
    const job = (crons as unknown as { crons: Record<string, { name: string; schedule: unknown }> }).crons[
      "journal active topics"
    ];
    expect(job.schedule).toEqual({ type: "daily", hourUTC: 15, minuteUTC: 0 });
    expect(job.name).toBe("journal/activeTopics:compute");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/backend && bun run test`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** — append to `convex/journal/model.ts`:

```ts
// Read-time aggregate scans (topic stats, tag counts, the dashboard's recent
// window, the nightly job) read at most this many rows — far above personal
// scale, far below Convex's 32k-document read limit (decision log 5).
export const AGGREGATE_SCAN_LIMIT = 5000;
```

Append to `convex/journal/topics.ts` (add `AGGREGATE_SCAN_LIMIT` to the `./model` import and `import type { Id } from "../_generated/dataModel";`):

```ts
// Topics index page: each topic with its live-entry count and latest entry.
export const listWithStats = query({
  args: { includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topics = (await ctx.db.query("journalTopics").take(TOPIC_SCAN_LIMIT))
      .filter((t) => args.includeArchived || !t.archived)
      .sort(byName);
    const live = await ctx.db
      .query("journalEntries")
      .withIndex("by_deleted_at_created_at", (q) => q.eq("deletedAt", undefined))
      .take(AGGREGATE_SCAN_LIMIT);
    const stats = new Map<Id<"journalTopics">, { count: number; lastAt: number }>();
    for (const e of live) {
      const s = stats.get(e.topicId);
      if (s) {
        s.count += 1;
        s.lastAt = Math.max(s.lastAt, e.createdAt);
      } else {
        stats.set(e.topicId, { count: 1, lastAt: e.createdAt });
      }
    }
    return topics.map((t) => ({
      ...topicDto(t),
      entryCount: stats.get(t._id)?.count ?? 0,
      lastEntryAt: stats.get(t._id)?.lastAt ?? null,
    }));
  },
});
```

Create `packages/backend/convex/journal/tags.ts`:

```ts
import { query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import { AGGREGATE_SCAN_LIMIT } from "./model";

// Tags index page. entryTags holds only live entries, and the index keeps
// rows grouped and sorted by tag, so one pass counts them in order.
export const list = query({
  args: {},
  handler: async (ctx) => {
    await assertSignedIn(ctx);
    const rows = await ctx.db
      .query("entryTags")
      .withIndex("by_tag_entry_created_at")
      .take(AGGREGATE_SCAN_LIMIT);
    const out: Array<{ tag: string; count: number }> = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.tag === row.tag) last.count += 1;
      else out.push({ tag: row.tag, count: 1 });
    }
    return out;
  },
});
```

Create `packages/backend/convex/journal/dashboard.ts`:

```ts
import { v } from "convex/values";
import { manilaDayStartMs } from "@polaris/core/months";
import { query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import { AGGREGATE_SCAN_LIMIT, entryDtos } from "./model";

const DAY_MS = 86_400_000;

// Day boundaries are the Asia/Manila calendar day (decision log 7).
export const summary = query({
  args: { now: v.optional(v.number()) }, // tests only; production omits
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const todayStart = manilaDayStartMs(args.now ?? Date.now());
    const yesterdayStart = todayStart - DAY_MS;
    const recent = await ctx.db
      .query("journalEntries")
      .withIndex("by_deleted_at_created_at", (q) =>
        q.eq("deletedAt", undefined).gte("createdAt", yesterdayStart)
      )
      .take(AGGREGATE_SCAN_LIMIT);
    const todayCount = recent.filter((e) => e.createdAt >= todayStart).length;
    const last = await ctx.db
      .query("journalEntries")
      .withIndex("by_deleted_at_created_at", (q) => q.eq("deletedAt", undefined))
      .order("desc")
      .first();
    return {
      todayCount,
      yesterdayCount: recent.length - todayCount,
      lastEntry: last === null ? null : (await entryDtos(ctx, [last]))[0],
    };
  },
});
```

Create `packages/backend/convex/journal/activeTopics.ts`:

```ts
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { AGGREGATE_SCAN_LIMIT } from "./model";

const WEEK_MS = 7 * 86_400_000;

// Nightly sample (convex/crons.ts): how many topics got a live entry in the
// rolling last 7 days. Replaces the Vercel cron route.
export const compute = internalMutation({
  args: { now: v.optional(v.number()) }, // tests only; the cron omits it
  handler: async (ctx, args) => {
    const since = (args.now ?? Date.now()) - WEEK_MS;
    const recent = await ctx.db
      .query("journalEntries")
      .withIndex("by_deleted_at_created_at", (q) =>
        q.eq("deletedAt", undefined).gte("createdAt", since)
      )
      .take(AGGREGATE_SCAN_LIMIT);
    const count = new Set(recent.map((e) => e.topicId)).size;
    await ctx.scheduler.runAfter(0, internal.feedback.record, {
      system: "journal",
      name: "active_topic_count",
      value: count,
    });
    return count;
  },
});
```

Create `packages/backend/convex/crons.ts`:

```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 15:00 UTC = 23:00 Manila, so each daily sample closes out the Manila day
// (docs/replatform.md §05 Phase 3). Harmless retime from the old 23:00 UTC
// Vercel cron: the job reads a rolling 7-day window.
crons.daily(
  "journal active topics",
  { hourUTC: 15, minuteUTC: 0 },
  internal.journal.activeTopics.compute,
  {}
);

export default crons;
```

- [ ] **Step 4: Run the ritual** — `cd packages/backend && bunx convex codegen && bun run test`, then `bunx convex dev --once`. Expected: all green; the dev push output lists the cron. If the cron-shape test fails because this Convex version stores the job differently, `console.log(crons)` once, assert against the actual field names (keep the 15:00 UTC daily assertion), and note the change in the report.

- [ ] **Step 5: Commit**

```bash
git add packages/backend
git commit -m "feat(journal): topic stats, tag counts, dashboard summary, nightly job on Convex crons"
```

---

### Task 6: The habits bridge on Convex

Habits (still Postgres until Phase 4) calls these from the Next server with the signed-in user's token (decision log 1).

**Files:**
- Modify: `packages/backend/convex/journal/model.ts` (append `resolveTopicRef`)
- Create: `packages/backend/convex/journal/habitBridge.ts`
- Test: `packages/backend/test/journal-habit-bridge.test.ts`

**Interfaces:**
- Consumes: `cleanTopicName`, `topicByName`, `insertTopic`, `cleanTitle`, `checkBody`, `insertEntry`, `LIST_LIMIT_MAX` (Tasks 2–3).
- Produces (model): `resolveTopicRef(ctx, ref: string): Promise<TopicDoc | null>` — a Convex id, else a `legacyId`.
- Produces (`api.journal.habitBridge`), every `ref` being a habit's stored `journalTopicId`:
  - `ensureTopic({ name }) → Id<"journalTopics">` — the same-name topic if it exists, else a new one.
  - `topicState({ ref }) → { id: Id<"journalTopics">; name: string; archived: boolean } | null`
  - `renameTopic({ ref, name }) → { ok: true } | { ok: false; reason: "collision" }` — a missing topic or unchanged name is `{ ok: true }`.
  - `setTopicArchived({ ref, archived }) → null` — a missing topic is a no-op.
  - `createLog({ ref, title?: string | null, body, createdAt?: number }) → { ok: true; entry: { id: Id<"journalEntries">; title: string | null; body: string; createdAt: number } } | { ok: false; reason: "missing" | "archived" }`
  - `topicEntries({ ref, fromMs, toMs }) → Array<{ id: Id<"journalEntries">; title: string | null; body: string; createdAt: number }>` — live entries with `fromMs <= createdAt < toMs`, oldest first, at most 100.

- [ ] **Step 1: Write the failing tests** — create `packages/backend/test/journal-habit-bridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

function setup() {
  const t = convexTest(schema, modules);
  return { t, asUser: t.withIdentity({ subject: "user1|session1" }) };
}

const bridge = api.journal.habitBridge;

describe("journal habit bridge", () => {
  it("requires sign-in", async () => {
    const { t } = setup();
    await expect(t.mutation(bridge.ensureTopic, { name: "Run" })).rejects.toThrow("Unauthorized");
    await expect(t.query(bridge.topicState, { ref: "x" })).rejects.toThrow("Unauthorized");
  });

  it("ensureTopic creates a topic once, then returns the same-name topic", async () => {
    const { asUser } = setup();
    const first = await asUser.mutation(bridge.ensureTopic, { name: " Run " });
    expect(await asUser.mutation(bridge.ensureTopic, { name: "Run" })).toBe(first);
    expect((await asUser.query(api.journal.topics.list, {})).map((t) => t.name)).toEqual(["Run"]);
    await expect(asUser.mutation(bridge.ensureTopic, { name: " " })).rejects.toThrow(
      "Topic name must be 1-80 characters"
    );
  });

  it("topicState resolves Convex ids and imported legacy cuids", async () => {
    const { t, asUser } = setup();
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    const legacy = await t.run((ctx) =>
      ctx.db.insert("journalTopics", {
        name: "Read", archived: true, createdAt: 1, updatedAt: 1, legacyId: "clegacy1",
      })
    );
    expect(await asUser.query(bridge.topicState, { ref: id })).toEqual({ id, name: "Run", archived: false });
    expect(await asUser.query(bridge.topicState, { ref: "clegacy1" })).toEqual({
      id: legacy, name: "Read", archived: true,
    });
    expect(await asUser.query(bridge.topicState, { ref: "gone" })).toBeNull();
  });

  it("renameTopic renames, reports a collision, and ignores missing or unchanged topics", async () => {
    const { asUser } = setup();
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    await asUser.mutation(bridge.ensureTopic, { name: "Taken" });
    expect(await asUser.mutation(bridge.renameTopic, { ref: id, name: "Jog" })).toEqual({ ok: true });
    expect((await asUser.query(bridge.topicState, { ref: id }))!.name).toBe("Jog");
    expect(await asUser.mutation(bridge.renameTopic, { ref: id, name: "Taken" })).toEqual({
      ok: false, reason: "collision",
    });
    expect((await asUser.query(bridge.topicState, { ref: id }))!.name).toBe("Jog");
    expect(await asUser.mutation(bridge.renameTopic, { ref: id, name: "Jog" })).toEqual({ ok: true });
    expect(await asUser.mutation(bridge.renameTopic, { ref: "gone", name: "Any" })).toEqual({ ok: true });
  });

  it("setTopicArchived archives and unarchives, and ignores a missing topic", async () => {
    const { t, asUser } = setup();
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    await asUser.mutation(bridge.setTopicArchived, { ref: id, archived: true });
    let doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc!.archived).toBe(true);
    expect(typeof doc!.archivedAt).toBe("number");
    await asUser.mutation(bridge.setTopicArchived, { ref: id, archived: false });
    doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc!.archived).toBe(false);
    expect(doc!.archivedAt).toBeUndefined();
    expect(await asUser.mutation(bridge.setTopicArchived, { ref: "gone", archived: true })).toBeNull();
  });

  it("createLog refuses missing and archived topics", async () => {
    const { asUser } = setup();
    expect(await asUser.mutation(bridge.createLog, { ref: "gone", body: "x" })).toEqual({
      ok: false, reason: "missing",
    });
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    await asUser.mutation(bridge.setTopicArchived, { ref: id, archived: true });
    expect(await asUser.mutation(bridge.createLog, { ref: id, body: "x" })).toEqual({
      ok: false, reason: "archived",
    });
  });

  it("createLog writes a backdated, unedited entry with tags and records journal metrics", async () => {
    vi.useFakeTimers();
    const { t, asUser } = setup();
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    const when = Date.UTC(2026, 9, 15, 4, 0); // noon Manila
    const result = await asUser.mutation(bridge.createLog, {
      ref: id, title: "Felt strong", body: "5k in the rain #cardio", createdAt: when,
    });
    expect(result).toMatchObject({ ok: true, entry: { title: "Felt strong", body: "5k in the rain #cardio", createdAt: when } });
    const entryId = (result as { entry: { id: string } }).entry.id;
    const doc = await t.run((ctx) => ctx.db.get(entryId as never));
    expect(doc).toMatchObject({ topicId: id, tags: ["cardio"], createdAt: when, updatedAt: when });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const names = (await t.run((ctx) => ctx.db.query("systemMetrics").collect())).map((m) => m.name);
    expect(names).toEqual(["entry_created", "words_per_entry"]);
  });

  it("topicEntries returns one topic's live entries in [fromMs, toMs), oldest first", async () => {
    const { t, asUser } = setup();
    const run = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    const read = await asUser.mutation(bridge.ensureTopic, { name: "Read" });
    await t.run(async (ctx) => {
      await ctx.db.patch(run, { legacyId: "crun" });
    });
    const at = async (ref: string, createdAt: number, body: string) =>
      (await asUser.mutation(bridge.createLog, { ref, body, createdAt })) as { ok: true; entry: { id: string } };
    const inside2 = await at(run, 2_000, "b");
    const inside1 = await at(run, 1_000, "a");
    await at(run, 3_000, "edge — excluded");
    await at(read, 1_500, "other topic");
    const gone = await at(run, 1_200, "deleted");
    await asUser.mutation(api.journal.entries.remove, { id: gone.entry.id as never });

    const rows = await asUser.query(bridge.topicEntries, { ref: "crun", fromMs: 1_000, toMs: 3_000 });
    expect(rows.map((r) => r.id)).toEqual([inside1.entry.id, inside2.entry.id]);
    expect(rows[0]).toEqual({ id: inside1.entry.id, title: null, body: "a", createdAt: 1_000 });
    expect(await asUser.query(bridge.topicEntries, { ref: "gone", fromMs: 0, toMs: 9 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/backend && bun run test`. Expected: FAIL (`api.journal.habitBridge` missing).

- [ ] **Step 3: Implement** — append to `convex/journal/model.ts`:

```ts
/** A habit's stored topic reference: a Convex id, or the Postgres cuid of a
 *  topic imported in phase 3 (resolved through legacyId). */
export async function resolveTopicRef(ctx: Ctx, ref: string): Promise<TopicDoc | null> {
  const id = ctx.db.normalizeId("journalTopics", ref);
  if (id !== null) return ctx.db.get(id);
  return ctx.db
    .query("journalTopics")
    .withIndex("by_legacy_id", (q) => q.eq("legacyId", ref))
    .unique();
}
```

Create `packages/backend/convex/journal/habitBridge.ts`:

```ts
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { assertSignedIn } from "../lib/auth";
import {
  LIST_LIMIT_MAX,
  checkBody,
  cleanTitle,
  cleanTopicName,
  insertEntry,
  insertTopic,
  resolveTopicRef,
  topicByName,
} from "./model";

// Strangler window (phase 3 → 4): habits still lives in Postgres and reaches
// the journal only through these functions, called from the Next server
// (apps/web/src/systems/habits/services/journalBridge.ts). Phase 4 turns them
// into internal functions called by habits' own mutations.
// `ref` is a habit's stored journalTopicId: a Convex id, or the Postgres cuid
// of a topic imported in phase 3.

export const ensureTopic = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = cleanTopicName(args.name);
    const existing = await topicByName(ctx, name);
    return existing !== null ? existing._id : insertTopic(ctx, name);
  },
});

export const topicState = query({
  args: { ref: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await resolveTopicRef(ctx, args.ref);
    return topic === null ? null : { id: topic._id, name: topic.name, archived: topic.archived };
  },
});

export const renameTopic = mutation({
  args: { ref: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const name = cleanTopicName(args.name);
    const topic = await resolveTopicRef(ctx, args.ref);
    if (topic === null || topic.name === name) return { ok: true as const };
    if ((await topicByName(ctx, name)) !== null) {
      return { ok: false as const, reason: "collision" as const };
    }
    await ctx.db.patch(topic._id, { name, updatedAt: Date.now() });
    return { ok: true as const };
  },
});

export const setTopicArchived = mutation({
  args: { ref: v.string(), archived: v.boolean() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await resolveTopicRef(ctx, args.ref);
    if (topic === null) return null; // a missing topic never blocks the habit action
    const now = Date.now();
    await ctx.db.patch(topic._id, {
      archived: args.archived,
      archivedAt: args.archived ? now : undefined,
      updatedAt: now,
    });
    return null;
  },
});

export const createLog = mutation({
  args: {
    ref: v.string(),
    title: v.optional(v.union(v.string(), v.null())),
    body: v.string(),
    createdAt: v.optional(v.number()), // past-day logs are backdated by habits
  },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await resolveTopicRef(ctx, args.ref);
    if (topic === null) return { ok: false as const, reason: "missing" as const };
    if (topic.archived) return { ok: false as const, reason: "archived" as const };
    checkBody(args.body);
    const id = await insertEntry(ctx, {
      topicId: topic._id,
      title: cleanTitle(args.title),
      body: args.body,
      createdAt: args.createdAt,
    });
    const entry = (await ctx.db.get(id))!;
    return {
      ok: true as const,
      entry: { id, title: entry.title ?? null, body: entry.body, createdAt: entry.createdAt },
    };
  },
});

export const topicEntries = query({
  args: { ref: v.string(), fromMs: v.number(), toMs: v.number() },
  handler: async (ctx, args) => {
    await assertSignedIn(ctx);
    const topic = await resolveTopicRef(ctx, args.ref);
    if (topic === null) return [];
    const docs = await ctx.db
      .query("journalEntries")
      .withIndex("by_topic_deleted_at_created_at", (q) =>
        q
          .eq("topicId", topic._id)
          .eq("deletedAt", undefined)
          .gte("createdAt", args.fromMs)
          .lt("createdAt", args.toMs)
      )
      .take(LIST_LIMIT_MAX);
    return docs.map((e) => ({ id: e._id, title: e.title ?? null, body: e.body, createdAt: e.createdAt }));
  },
});
```

- [ ] **Step 4: Run the ritual** — `cd packages/backend && bunx convex codegen && bun run test`, then `bunx convex dev --once`. Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend
git commit -m "feat(journal): bridge functions for habits during the strangler window"
```

---

### Task 7: Journal import, verification, and search probe

**Files:**
- Create: `packages/backend/convex/journal/migrations.ts`
- Test: `packages/backend/test/journal-migrations.test.ts`

**Interfaces:**
- Consumes: `topicByName`, `searchTextOf`, `writeEntryTags`, `searchEntryDocs`, `clampLimit` (Tasks 2–4).
- Produces (all internal; CLI path `journal/migrations:<name>`):
  - `importTopics({ rows: Array<{ legacyId; name; description?; archived; archivedAt?; createdAt; updatedAt }> }) → { inserted, updated }`
  - `linkTopicParents({ rows: Array<{ legacyId; legacyParentId }> }) → { linked }`
  - `importEntries({ rows: Array<{ legacyId; legacyTopicId; title?; body; tags: string[]; deletedAt?; createdAt; updatedAt }> }) → { inserted, updated }`
  - `stats({}) → { topicCount; archivedTopicCount; parentLinkCount; entryCount; deletedEntryCount; liveEntriesByTopic: Array<[topicKey, number]>; liveBodyCharsByTopic: Array<[topicKey, number]>; liveTagCounts: Array<[tag, number]> }` — `topicKey` = the topic's `legacyId`, else its Convex id. Pairs, not records: Convex objects cap field names and counts.
  - `entriesByLegacyIds({ legacyIds: string[] }) → Array<null | { legacyTopicId: string | null; title: string | null; body; tags; deletedAt: number | null; createdAt; updatedAt }>` (same order as the input)
  - `searchProbe({ q, limit? }) → string[]` — the journal search's results as `legacyId ?? _id`, limit default 50.

- [ ] **Step 1: Write the failing tests** — create `packages/backend/test/journal-migrations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");
const m = internal.journal.migrations;

const topicRows = [
  { legacyId: "ct1", name: "Builds", archived: false, createdAt: 1_000, updatedAt: 2_000 },
  { legacyId: "ct2", name: "Ops", description: "Infra", archived: true, archivedAt: 3_000, createdAt: 1_500, updatedAt: 3_000 },
];
const parentRows = [{ legacyId: "ct2", legacyParentId: "ct1" }];
const entryRows = [
  { legacyId: "ce1", legacyTopicId: "ct1", title: "Ship", body: "shipped convex #build", tags: ["build"], createdAt: 10_000, updatedAt: 11_000 },
  { legacyId: "ce2", legacyTopicId: "ct1", body: "convex deploy notes", tags: [], createdAt: 20_000, updatedAt: 20_000 },
  { legacyId: "ce3", legacyTopicId: "ct2", body: "old #build", tags: ["build"], deletedAt: 31_000, createdAt: 30_000, updatedAt: 31_000 },
];

async function importAll(t: ReturnType<typeof convexTest>) {
  return {
    topics: await t.mutation(m.importTopics, { rows: topicRows }),
    parents: await t.mutation(m.linkTopicParents, { rows: parentRows }),
    entries: await t.mutation(m.importEntries, { rows: entryRows }),
  };
}

describe("journal imports", () => {
  it("imports topics, parent links, and entries with remapped ids, tags, and search text", async () => {
    const t = convexTest(schema, modules);
    expect(await importAll(t)).toEqual({
      topics: { inserted: 2, updated: 0 },
      parents: { linked: 1 },
      entries: { inserted: 3, updated: 0 },
    });
    const [builds, ops] = await t.run(async (ctx) => [
      await ctx.db.query("journalTopics").withIndex("by_legacy_id", (q) => q.eq("legacyId", "ct1")).unique(),
      await ctx.db.query("journalTopics").withIndex("by_legacy_id", (q) => q.eq("legacyId", "ct2")).unique(),
    ]);
    expect(ops).toMatchObject({ name: "Ops", description: "Infra", archived: true, archivedAt: 3_000, parentId: builds!._id });
    const ship = await t.run((ctx) =>
      ctx.db.query("journalEntries").withIndex("by_legacy_id", (q) => q.eq("legacyId", "ce1")).unique()
    );
    expect(ship).toMatchObject({ topicId: builds!._id, title: "Ship", searchText: "Ship\nshipped convex #build", createdAt: 10_000, updatedAt: 11_000 });
    const tags = await t.run((ctx) => ctx.db.query("entryTags").collect());
    expect(tags.map((r) => [r.tag, r.entryId, r.entryCreatedAt])).toEqual([["build", ship!._id, 10_000]]); // ce3 is deleted
  });

  it("is idempotent — a rerun updates in place, and parent links come back after replace", async () => {
    const t = convexTest(schema, modules);
    await importAll(t);
    expect(await importAll(t)).toEqual({
      topics: { inserted: 0, updated: 2 },
      parents: { linked: 1 },
      entries: { inserted: 0, updated: 3 },
    });
    const stats = await t.query(m.stats, {});
    expect(stats).toMatchObject({ topicCount: 2, parentLinkCount: 1, entryCount: 3, deletedEntryCount: 1 });
    expect(await t.run(async (ctx) => (await ctx.db.query("entryTags").collect()).length)).toBe(1);
  });

  it("throws on an unknown topic or parent", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(m.importEntries, { rows: [entryRows[0]] })).rejects.toThrow("Unknown topic ct1");
    await t.mutation(m.importTopics, { rows: [topicRows[1]] });
    await expect(t.mutation(m.linkTopicParents, { rows: parentRows })).rejects.toThrow("Unknown topic ct1");
  });

  it("refuses a topic name already used in Convex under another id", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ subject: "u|s" }).mutation(api.journal.topics.create, { name: "Builds" });
    await expect(t.mutation(m.importTopics, { rows: [topicRows[0]] })).rejects.toThrow(
      'Topic "Builds" already exists in Convex under another id'
    );
  });

  it("stats counts live entries, body characters, and tags per topic key", async () => {
    const t = convexTest(schema, modules);
    await importAll(t);
    const stats = await t.query(m.stats, {});
    expect(stats.archivedTopicCount).toBe(1);
    expect(stats.liveEntriesByTopic).toEqual([["ct1", 2]]);
    expect(stats.liveBodyCharsByTopic).toEqual([["ct1", "shipped convex #build".length + "convex deploy notes".length]]);
    expect(stats.liveTagCounts).toEqual([["build", 1]]);
  });

  it("entriesByLegacyIds returns comparable fields in input order", async () => {
    const t = convexTest(schema, modules);
    await importAll(t);
    expect(await t.query(m.entriesByLegacyIds, { legacyIds: ["ce3", "missing", "ce2"] })).toEqual([
      { legacyTopicId: "ct2", title: null, body: "old #build", tags: ["build"], deletedAt: 31_000, createdAt: 30_000, updatedAt: 31_000 },
      null,
      { legacyTopicId: "ct1", title: null, body: "convex deploy notes", tags: [], deletedAt: null, createdAt: 20_000, updatedAt: 20_000 },
    ]);
  });

  it("searchProbe runs the journal search and returns legacy ids", async () => {
    const t = convexTest(schema, modules);
    await importAll(t);
    expect((await t.query(m.searchProbe, { q: "convex" })).sort()).toEqual(["ce1", "ce2"]);
    expect(await t.query(m.searchProbe, { q: "convex deploy" })).toEqual(["ce2"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/backend && bun run test`. Expected: FAIL (`internal.journal.migrations` missing).

- [ ] **Step 3: Implement** — create `packages/backend/convex/journal/migrations.ts`:

```ts
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { clampLimit, searchEntryDocs, searchTextOf, topicByName, writeEntryTags } from "./model";

// Data-copy playbook (docs/replatform.md §06), phase 3. Import order: topics →
// topic parents → entries. Idempotent: rows upsert by legacyId; nothing is
// ever deleted. Run through packages/backend/scripts/import-journal.ts.

async function topicByLegacyId(ctx: QueryCtx | MutationCtx, legacyId: string) {
  return ctx.db
    .query("journalTopics")
    .withIndex("by_legacy_id", (q) => q.eq("legacyId", legacyId))
    .unique();
}

export const importTopics = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        archived: v.boolean(),
        archivedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const sameName = await topicByName(ctx, row.name);
      if (sameName !== null && sameName.legacyId !== row.legacyId) {
        throw new ConvexError(
          `Topic "${row.name}" already exists in Convex under another id; rename one of them before importing ${row.legacyId}`
        );
      }
      const existing = await topicByLegacyId(ctx, row.legacyId);
      // replace drops parentId; linkTopicParents (run next) restores current links
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("journalTopics", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const linkTopicParents = internalMutation({
  args: { rows: v.array(v.object({ legacyId: v.string(), legacyParentId: v.string() })) },
  handler: async (ctx, args) => {
    let linked = 0;
    for (const row of args.rows) {
      const topic = await topicByLegacyId(ctx, row.legacyId);
      if (topic === null) throw new ConvexError(`Unknown topic ${row.legacyId}`);
      const parent = await topicByLegacyId(ctx, row.legacyParentId);
      if (parent === null) throw new ConvexError(`Unknown topic ${row.legacyParentId}`);
      await ctx.db.patch(topic._id, { parentId: parent._id });
      linked++;
    }
    return { linked };
  },
});

export const importEntries = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        legacyTopicId: v.string(),
        title: v.optional(v.string()),
        body: v.string(),
        tags: v.array(v.string()),
        deletedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const topic = await topicByLegacyId(ctx, row.legacyTopicId);
      if (topic === null) throw new ConvexError(`Unknown topic ${row.legacyTopicId}`);
      const doc = {
        topicId: topic._id,
        ...(row.title === undefined ? {} : { title: row.title }),
        body: row.body,
        tags: row.tags,
        searchText: searchTextOf(row.title, row.body),
        ...(row.deletedAt === undefined ? {} : { deletedAt: row.deletedAt }),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        legacyId: row.legacyId,
      };
      const existing = await ctx.db
        .query("journalEntries")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      let id: Id<"journalEntries">;
      if (existing !== null) {
        await ctx.db.replace(existing._id, doc);
        id = existing._id;
        updated++;
      } else {
        id = await ctx.db.insert("journalEntries", doc);
        inserted++;
      }
      await writeEntryTags(ctx, id, row.deletedAt === undefined ? row.tags : [], row.createdAt);
    }
    return { inserted, updated };
  },
});

function pairs(counts: Map<string, number>): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// Verification aggregate — intentionally full-scan (playbook §06 checksums).
export const stats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [topics, entries, tagRows] = await Promise.all([
      ctx.db.query("journalTopics").collect(),
      ctx.db.query("journalEntries").collect(),
      ctx.db.query("entryTags").collect(),
    ]);
    const keyOf = new Map<Id<"journalTopics">, string>(topics.map((t) => [t._id, t.legacyId ?? t._id]));
    const live = new Map<string, number>();
    const chars = new Map<string, number>();
    let deletedEntryCount = 0;
    for (const e of entries) {
      if (e.deletedAt !== undefined) {
        deletedEntryCount++;
        continue;
      }
      const key = keyOf.get(e.topicId) ?? "(unknown topic)";
      live.set(key, (live.get(key) ?? 0) + 1);
      chars.set(key, (chars.get(key) ?? 0) + e.body.length);
    }
    const tagCounts = new Map<string, number>();
    for (const row of tagRows) tagCounts.set(row.tag, (tagCounts.get(row.tag) ?? 0) + 1);
    return {
      topicCount: topics.length,
      archivedTopicCount: topics.filter((t) => t.archived).length,
      parentLinkCount: topics.filter((t) => t.parentId !== undefined).length,
      entryCount: entries.length,
      deletedEntryCount,
      liveEntriesByTopic: pairs(live),
      liveBodyCharsByTopic: pairs(chars),
      liveTagCounts: pairs(tagCounts),
    };
  },
});

export const entriesByLegacyIds = internalQuery({
  args: { legacyIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out = [];
    for (const legacyId of args.legacyIds) {
      const e = await ctx.db
        .query("journalEntries")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", legacyId))
        .unique();
      if (e === null) {
        out.push(null);
        continue;
      }
      const topic = await ctx.db.get(e.topicId);
      out.push({
        legacyTopicId: topic === null ? null : (topic.legacyId ?? topic._id),
        title: e.title ?? null,
        body: e.body,
        tags: e.tags,
        deletedAt: e.deletedAt ?? null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      });
    }
    return out;
  },
});

// The search acceptance script's view of journal search (no user identity
// under `convex run`, so the public query can't be called directly).
export const searchProbe = internalQuery({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const docs = await searchEntryDocs(ctx, { q: args.q, limit: clampLimit(args.limit, 50) });
    return docs.map((e) => e.legacyId ?? e._id);
  },
});
```

- [ ] **Step 4: Run the ritual** — `cd packages/backend && bunx convex codegen && bun run test`, then `bunx convex dev --once`. Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/backend
git commit -m "feat(journal): idempotent journal import, verification stats, search probe"
```

---

### Task 8: Copy scripts — shared driver, import, export, verify

**Files:**
- Create: `packages/backend/scripts/lib/batching.ts`, `packages/backend/scripts/lib/convexRun.ts`, `packages/backend/scripts/import-journal.ts`
- Modify: `packages/backend/package.json` (export the driver)
- Create: `apps/web/scripts/export-journal.ts`, `apps/web/scripts/verify-journal-import.ts`
- Test: `packages/backend/test/script-batching.test.ts`

**Interfaces:**
- Consumes: Task 7's `journal/migrations:*` functions.
- Produces (`batching.ts`, pure): `MAX_BATCH_ROWS = 200`, `MAX_BATCH_BYTES = 512 * 1024`, `chunkRows<T>(rows, maxRows?, maxBytes?): T[][]`, `parseConvexRunResult(stdout): unknown`, `parseJsonl(text): unknown[]`.
- Produces (`convexRun.ts`, Bun): `convexRun(fn, args, { prod }): unknown`, `readJsonl(path): Promise<unknown[]>` (throws on a missing file), `importJsonl(dir, files: Array<[file, fn]>, { prod }): Promise<void>`; re-exports `parseConvexRunResult`. Importable from web scripts as `@polaris/backend/scripts/convex-run`.
- Produces (files): `apps/web/scripts/out/journal-topics.jsonl`, `journal-topic-parents.jsonl` (always written, possibly empty), `journal-entries.jsonl`.

- [ ] **Step 1: Write the failing tests** — create `packages/backend/test/script-batching.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chunkRows, parseConvexRunResult, parseJsonl } from "../scripts/lib/batching";

describe("chunkRows", () => {
  it("splits by row count", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2, 1000)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("splits by encoded size", () => {
    const rows = ["a".repeat(40), "b".repeat(40), "c".repeat(40)]; // 42 bytes of JSON + 1 each
    expect(chunkRows(rows, 200, 100)).toEqual([[rows[0], rows[1]], [rows[2]]]);
  });

  it("counts multi-byte characters by their UTF-8 size", () => {
    const rows = ["é".repeat(20), "é".repeat(20)]; // 40 bytes + 2 quotes + 1 each
    expect(chunkRows(rows, 200, 60)).toEqual([[rows[0]], [rows[1]]]);
  });

  it("throws on one row over the byte limit, and returns no batches for no rows", () => {
    expect(() => chunkRows(["x".repeat(100)], 200, 50)).toThrow("over the 50-byte batch limit");
    expect(chunkRows([], 2, 10)).toEqual([]);
  });
});

describe("parseConvexRunResult", () => {
  it("parses a pretty-printed object after log lines", () => {
    const out = '[CONVEX Q] a log line\n{\n  "inserted": 2,\n  "nested": {\n    "a": 1\n  }\n}\n';
    expect(parseConvexRunResult(out)).toEqual({ inserted: 2, nested: { a: 1 } });
  });

  it("parses a pretty-printed array and a one-line value", () => {
    expect(parseConvexRunResult('note\n[\n  "a",\n  "b"\n]')).toEqual(["a", "b"]);
    expect(parseConvexRunResult("log\n42")).toBe(42);
  });

  it("throws when there is no JSON", () => {
    expect(() => parseConvexRunResult("just logs\nmore logs")).toThrow("No JSON result");
  });
});

describe("parseJsonl", () => {
  it("skips blank lines", () => {
    expect(parseJsonl('{"a":1}\n\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd packages/backend && bun run test`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement the pure helpers** — create `packages/backend/scripts/lib/batching.ts`:

```ts
// Pure helpers for the data-copy scripts (docs/replatform.md §06). No Bun APIs
// in this file, so the backend test suite can import it.

export const MAX_BATCH_ROWS = 200;
// Each batch rides on the `convex run` command line, and macOS caps arguments
// plus environment at 1 MiB (ARG_MAX).
export const MAX_BATCH_BYTES = 512 * 1024;

export function chunkRows<T>(
  rows: T[],
  maxRows: number = MAX_BATCH_ROWS,
  maxBytes: number = MAX_BATCH_BYTES
): T[][] {
  const encoder = new TextEncoder();
  const batches: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length + 1; // + separator
    if (size > maxBytes) {
      throw new Error(`A single row is ${size} bytes — over the ${maxBytes}-byte batch limit`);
    }
    if (current.length > 0 && (current.length === maxRows || bytes + size > maxBytes)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** `convex run` pretty-prints its result, and log lines may come first. Try
 *  the last line on its own, then every line that opens a top-level object or
 *  array, from the bottom up. */
export function parseConvexRunResult(stdout: string): unknown {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const head = lines[i].trimEnd();
    if (i === lines.length - 1 || head === "{" || head === "[") {
      try {
        return JSON.parse(lines.slice(i).join("\n"));
      } catch {
        // not the start of the result — keep scanning up
      }
    }
  }
  throw new Error(`No JSON result in convex run output:\n${stdout}`);
}

export function parseJsonl(text: string): unknown[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}
```

- [ ] **Step 4: Run to verify pass** — `cd packages/backend && bun run test`. Expected: all green.

- [ ] **Step 5: The Bun driver and the import script** — create `packages/backend/scripts/lib/convexRun.ts`:

```ts
import { chunkRows, parseConvexRunResult, parseJsonl } from "./batching";

export { parseConvexRunResult };

// packages/backend — where `convex run` finds the project and its .env.local.
const BACKEND_DIR = `${import.meta.dir}/../..`;

/** Runs one Convex function through the CLI and returns its parsed result. */
export function convexRun(fn: string, args: unknown, opts: { prod: boolean }): unknown {
  const argv = ["bunx", "convex", "run", fn, JSON.stringify(args)];
  if (opts.prod) argv.push("--prod");
  const proc = Bun.spawnSync(argv, { cwd: BACKEND_DIR });
  if (proc.exitCode !== 0) {
    throw new Error(`${fn} failed:\n${proc.stderr.toString()}`);
  }
  return parseConvexRunResult(proc.stdout.toString());
}

export async function readJsonl(path: string): Promise<unknown[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`Missing ${path} — run the export first`);
  return parseJsonl(await file.text());
}

/** Playbook step 2: each JSONL file, in order, batched into its internal
 *  import mutation. Prints the summed counts the mutations return. */
export async function importJsonl(
  dir: string,
  files: Array<[file: string, fn: string]>,
  opts: { prod: boolean }
): Promise<void> {
  for (const [file, fn] of files) {
    const rows = await readJsonl(`${dir}/${file}`);
    const totals: Record<string, number> = {};
    for (const batch of chunkRows(rows)) {
      const result = convexRun(fn, { rows: batch }, opts) as Record<string, number>;
      for (const [key, value] of Object.entries(result)) totals[key] = (totals[key] ?? 0) + value;
    }
    const counts = Object.entries(totals).map(([k, v]) => `${k}=${v}`).join(" ");
    console.log(`${file}: rows=${rows.length} ${counts}`.trimEnd());
  }
}
```

Create `packages/backend/scripts/import-journal.ts`:

```ts
import { importJsonl } from "./lib/convexRun";

// Playbook step 2 for the journal: topics, then parent links, then entries.
// Idempotent — rerunning re-upserts by legacyId.
const [dir, ...flags] = process.argv.slice(2);
if (!dir) {
  console.error("usage: bun scripts/import-journal.ts <jsonl-dir> [--prod]");
  process.exit(1);
}

await importJsonl(
  dir,
  [
    ["journal-topics.jsonl", "journal/migrations:importTopics"],
    ["journal-topic-parents.jsonl", "journal/migrations:linkTopicParents"],
    ["journal-entries.jsonl", "journal/migrations:importEntries"],
  ],
  { prod: flags.includes("--prod") }
);
```

In `packages/backend/package.json` `exports`, add after `"./convex/_generated/dataModel"`:

```json
    "./scripts/convex-run": "./scripts/lib/convexRun.ts"
```

- [ ] **Step 6: The export and verify scripts** — create `apps/web/scripts/export-journal.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/platform/db/client";

// Playbook step 1 for the journal: Postgres → JSONL, cuids kept, dates as ms.
const outDir = join(import.meta.dir, "out");
mkdirSync(outDir, { recursive: true });

function writeJsonl(file: string, rows: unknown[]): void {
  writeFileSync(join(outDir, file), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
}

const topics = await prisma.journalTopic.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "journal-topics.jsonl",
  topics.map((t) => ({
    legacyId: t.id,
    name: t.name,
    ...(t.description === null ? {} : { description: t.description }),
    archived: t.archived,
    ...(t.archivedAt === null ? {} : { archivedAt: t.archivedAt.getTime() }),
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
  }))
);

// Written even when empty: the import driver treats a missing file as an error.
const parents = topics.filter((t) => t.parentId !== null);
writeJsonl(
  "journal-topic-parents.jsonl",
  parents.map((t) => ({ legacyId: t.id, legacyParentId: t.parentId! }))
);

const entries = await prisma.journalEntry.findMany({
  orderBy: { createdAt: "asc" },
  select: {
    id: true, topicId: true, title: true, body: true, tags: true,
    deletedAt: true, createdAt: true, updatedAt: true,
  },
});
writeJsonl(
  "journal-entries.jsonl",
  entries.map((e) => ({
    legacyId: e.id,
    legacyTopicId: e.topicId,
    ...(e.title === null || e.title === "" ? {} : { title: e.title }),
    body: e.body,
    tags: e.tags,
    ...(e.deletedAt === null ? {} : { deletedAt: e.deletedAt.getTime() }),
    createdAt: e.createdAt.getTime(),
    updatedAt: e.updatedAt.getTime(),
  }))
);

console.log(
  `exported topics=${topics.length} parents=${parents.length} entries=${entries.length} → ${outDir}`
);
await prisma.$disconnect();
```

Create `apps/web/scripts/verify-journal-import.ts`:

```ts
import { convexRun } from "@polaris/backend/scripts/convex-run";
import { prisma } from "../src/platform/db/client";

// Playbook verification for the journal: row counts, live entries and body
// characters per topic, live entries per tag, then a field-by-field check of
// a sample of entries spread across the history. --prod targets production.
const prod = process.argv.includes("--prod");
const SAMPLE_SIZE = 20;

const [topics, entries] = await Promise.all([
  prisma.journalTopic.findMany(),
  prisma.journalEntry.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, topicId: true, title: true, body: true, tags: true,
      deletedAt: true, createdAt: true, updatedAt: true,
    },
  }),
]);
await prisma.$disconnect();

const liveByTopic = new Map<string, number>();
const charsByTopic = new Map<string, number>();
const tagCounts = new Map<string, number>();
let deleted = 0;
for (const e of entries) {
  if (e.deletedAt !== null) {
    deleted++;
    continue;
  }
  liveByTopic.set(e.topicId, (liveByTopic.get(e.topicId) ?? 0) + 1);
  charsByTopic.set(e.topicId, (charsByTopic.get(e.topicId) ?? 0) + e.body.length);
  for (const tag of e.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
}

type Pairs = Array<[string, number]>;
const stats = convexRun("journal/migrations:stats", {}, { prod }) as {
  topicCount: number;
  archivedTopicCount: number;
  parentLinkCount: number;
  entryCount: number;
  deletedEntryCount: number;
  liveEntriesByTopic: Pairs;
  liveBodyCharsByTopic: Pairs;
  liveTagCounts: Pairs;
};

let failed = false;
function check(label: string, want: unknown, got: unknown): void {
  const ok = JSON.stringify(want) === JSON.stringify(got);
  if (!ok) failed = true;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: postgres=${JSON.stringify(want)} convex=${JSON.stringify(got)}`);
}
function checkCounts(label: string, want: Map<string, number>, got: Pairs): void {
  const gotMap = new Map(got);
  for (const key of new Set([...want.keys(), ...gotMap.keys()])) {
    check(`${label} ${key}`, want.get(key) ?? 0, gotMap.get(key) ?? 0);
  }
}

check("topic rows", topics.length, stats.topicCount);
check("archived topics", topics.filter((t) => t.archived).length, stats.archivedTopicCount);
check("parent links", topics.filter((t) => t.parentId !== null).length, stats.parentLinkCount);
check("entry rows", entries.length, stats.entryCount);
check("deleted entries", deleted, stats.deletedEntryCount);
checkCounts("live entries in topic", liveByTopic, stats.liveEntriesByTopic);
checkCounts("body characters in topic", charsByTopic, stats.liveBodyCharsByTopic);
checkCounts("live entries tagged", tagCounts, stats.liveTagCounts);

// Side-by-side sample, evenly spaced from oldest to newest. Prints field
// names only, never entry text.
const step = Math.max(1, Math.floor(entries.length / SAMPLE_SIZE));
const sample = entries.filter((_, i) => i % step === 0).slice(0, SAMPLE_SIZE);
type Converted = {
  legacyTopicId: string | null; title: string | null; body: string; tags: string[];
  deletedAt: number | null; createdAt: number; updatedAt: number;
} | null;
const converted = convexRun(
  "journal/migrations:entriesByLegacyIds",
  { legacyIds: sample.map((e) => e.id) },
  { prod }
) as Converted[];
const FIELDS = ["legacyTopicId", "title", "body", "tags", "deletedAt", "createdAt", "updatedAt"] as const;
sample.forEach((e, i) => {
  const want = {
    legacyTopicId: e.topicId,
    title: e.title === "" ? null : e.title,
    body: e.body,
    tags: [...e.tags].sort(),
    deletedAt: e.deletedAt?.getTime() ?? null,
    createdAt: e.createdAt.getTime(),
    updatedAt: e.updatedAt.getTime(),
  };
  const row = converted[i];
  if (row === null) {
    check(`entry ${e.id}`, "present", "missing");
    return;
  }
  const got = { ...row, tags: [...row.tags].sort() };
  const diffs = FIELDS.filter((f) => JSON.stringify(want[f]) !== JSON.stringify(got[f]));
  check(`entry ${e.id}`, "same fields", diffs.length === 0 ? "same fields" : `differs in ${diffs.join(", ")}`);
});
process.exit(failed ? 1 : 0);
```

- [ ] **Step 7: Smoke the plumbing against dev** — from `apps/web` with local Docker Postgres up: `bun scripts/export-journal.ts`, then `cd ../../packages/backend && bun scripts/import-journal.ts ../../apps/web/scripts/out`, then `cd ../../apps/web && bun scripts/verify-journal-import.ts`. Expected: export prints the local counts (2 topics / 0 parents / 3 entries at the time of writing), import prints one line per file, verify prints only `OK` lines and exits 0. Run the import a second time: every count moves to `updated=`. Leave the copied rows on dev — Task 14's rehearsal builds on them. Confirm `apps/web/scripts/out/` is git-ignored (`git check-ignore apps/web/scripts/out/journal-topics.jsonl` prints the path).

- [ ] **Step 8: Commit**

```bash
git add packages/backend apps/web/scripts/export-journal.ts apps/web/scripts/verify-journal-import.ts
git commit -m "feat(journal): export, import, and verify scripts for the journal copy"
```

---

### Task 9: Search acceptance script and rehearsal seed

**Files:**
- Create: `apps/web/scripts/lib/searchQueries.ts`, `apps/web/scripts/lib/searchQueries.test.ts`
- Create: `apps/web/scripts/journal-search-acceptance.ts`, `apps/web/scripts/seed-journal-rehearsal.ts`

**Interfaces:**
- Consumes: `searchTerms` (Task 1), `convexRun` (Task 8), `journal/migrations:searchProbe` (Task 7).
- Produces: `buildQuerySet(entries: CorpusEntry[], extra?: string[]): string[]`, `compareResults(query, postgres: string[], convex: string[]): Comparison`, `overallRecall(rows: Comparison[]): number`; report file `apps/web/scripts/out/search-acceptance.md`.

The acceptance script prints counts only to the terminal; entry titles go only into the git-ignored report file (it is the user's private journal).

- [ ] **Step 1: Write the failing tests** — create `apps/web/scripts/lib/searchQueries.test.ts` (the web unit suite picks up `scripts/**/*.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { buildQuerySet, compareResults, overallRecall } from "./searchQueries";

const entries = [
  { id: "1", title: "Deploy day", body: "deploying convex search index", tags: ["ops"] },
  { id: "2", title: null, body: "convex search is fast; search again", tags: ["ops", "convex"] },
  { id: "3", title: null, body: "reading about postgres with coffee", tags: [] },
];

describe("buildQuerySet", () => {
  it("draws frequent words, tags, co-occurring pairs, prefixes, then extras, without duplicates", () => {
    const set = buildQuerySet(entries, ["  my query ", ""]);
    expect(set.slice(0, 2)).toEqual(["convex", "search"]); // the only words in two entries
    expect(set).toContain("ops");
    expect(set).toContain("convex search");
    expect(set).toContain("depl"); // 4-letter prefix of "deploying"
    expect(set.at(-1)).toBe("my query");
    expect(new Set(set).size).toBe(set.length);
    expect(set).not.toContain("about"); // stopword
    expect(set).not.toContain("day"); // under 4 letters
  });
});

describe("compareResults and overallRecall", () => {
  it("splits shared and one-sided hits and pools recall across queries", () => {
    const a = compareResults("q1", ["1", "2", "3"], ["2", "3", "4"]);
    expect(a).toMatchObject({ shared: 2, onlyPostgres: ["1"], onlyConvex: ["4"] });
    const b = compareResults("q2", [], ["5"]);
    expect(overallRecall([a, b])).toBeCloseTo(2 / 3);
    expect(overallRecall([b])).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd apps/web && bun run test`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement the pure lib** — create `apps/web/scripts/lib/searchQueries.ts`:

```ts
import { searchTerms } from "@polaris/core/search";

// Query set for the journal search acceptance pass, drawn from the corpus
// itself (there is no log of real searches) plus any queries the user adds.

export interface CorpusEntry {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
}

const STOPWORDS = new Set([
  "about", "after", "again", "also", "been", "before", "being", "both", "could", "does",
  "doing", "down", "each", "from", "have", "having", "here", "into", "just", "like",
  "more", "most", "much", "need", "only", "other", "over", "same", "should", "some",
  "such", "than", "that", "their", "them", "then", "there", "these", "they", "this",
  "those", "through", "very", "want", "were", "what", "when", "where", "which", "while",
  "will", "with", "would", "your",
]);

function byCount(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key]) => key);
}

export function buildQuerySet(entries: CorpusEntry[], extra: string[] = []): string[] {
  const wordFreq = new Map<string, number>(); // number of entries containing the word
  const wordsByEntry: Array<Set<string>> = [];
  for (const e of entries) {
    const words = new Set(
      searchTerms(`${e.title ?? ""} ${e.body}`).filter(
        (w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w)
      )
    );
    wordsByEntry.push(words);
    for (const w of words) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }
  const topWords = byCount(wordFreq).slice(0, 12);

  const tagFreq = new Map<string, number>();
  for (const e of entries) for (const tag of e.tags) tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
  const topTags = byCount(tagFreq).slice(0, 6);

  const pairFreq = new Map<string, number>();
  for (let i = 0; i < topWords.length; i++) {
    for (let j = i + 1; j < topWords.length; j++) {
      const n = wordsByEntry.filter((w) => w.has(topWords[i]) && w.has(topWords[j])).length;
      if (n >= 2) pairFreq.set(`${topWords[i]} ${topWords[j]}`, n);
    }
  }
  const pairs = byCount(pairFreq).slice(0, 6);

  // Partial words: where prefix matching (new) and stemming (old) differ most.
  const prefixes = topWords.filter((w) => w.length >= 7).slice(0, 6).map((w) => w.slice(0, 4));

  const extras = extra.map((q) => q.trim()).filter((q) => q.length > 0);
  return [...new Set([...topWords, ...topTags, ...pairs, ...prefixes, ...extras])];
}

export interface Comparison {
  query: string;
  postgres: string[];
  convex: string[];
  shared: number;
  onlyPostgres: string[];
  onlyConvex: string[];
}

export function compareResults(query: string, postgres: string[], convex: string[]): Comparison {
  const inConvex = new Set(convex);
  const inPostgres = new Set(postgres);
  return {
    query,
    postgres,
    convex,
    shared: postgres.filter((id) => inConvex.has(id)).length,
    onlyPostgres: postgres.filter((id) => !inConvex.has(id)),
    onlyConvex: convex.filter((id) => !inPostgres.has(id)),
  };
}

/** Share of Postgres hits Convex also returns, pooled across queries;
 *  1 when Postgres found nothing at all. */
export function overallRecall(rows: Comparison[]): number {
  const total = rows.reduce((n, r) => n + r.postgres.length, 0);
  return total === 0 ? 1 : rows.reduce((n, r) => n + r.shared, 0) / total;
}
```

- [ ] **Step 4: Run to verify pass** — `cd apps/web && bun run test`. Expected: all green.

- [ ] **Step 5: The acceptance script** — create `apps/web/scripts/journal-search-acceptance.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { convexRun } from "@polaris/backend/scripts/convex-run";
import { prisma } from "../src/platform/db/client";
import { buildQuerySet, compareResults, overallRecall, type Comparison } from "./lib/searchQueries";

// Search acceptance pass (docs/replatform.md §08): the same queries through
// the old Postgres full-text search and the new Convex search, side by side.
// Exits 0 — the verdict belongs to the person reading the report.
//   bun scripts/journal-search-acceptance.ts [--prod] [--queries <file, one per line>]
// The terminal gets counts only; titles go to the git-ignored report file.
const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const queriesAt = argv.indexOf("--queries");
const extra = queriesAt >= 0 ? readFileSync(argv[queriesAt + 1], "utf8").split("\n") : [];
const LIMIT = 50;

// The old apps/web/src/systems/journal/services/search.ts query, verbatim.
function tsQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((tok) => /^[a-zA-Z0-9_-]+$/.test(tok))
    .join(" & ");
}

async function postgresSearch(q: string): Promise<string[]> {
  const tsq = tsQuery(q.trim());
  if (!tsq) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT e.id
    FROM journal_entries e
    WHERE e."deletedAt" IS NULL
      AND e.search_vector @@ to_tsquery('english', ${tsq})
    ORDER BY ts_rank(e.search_vector, to_tsquery('english', ${tsq})) DESC
    LIMIT ${LIMIT};
  `;
  return rows.map((r) => r.id);
}

const corpus = await prisma.journalEntry.findMany({
  where: { deletedAt: null },
  select: { id: true, title: true, body: true, tags: true },
});
const queries = buildQuerySet(corpus, extra);
const rows: Comparison[] = [];
for (const q of queries) {
  const postgres = await postgresSearch(q);
  const convex = convexRun("journal/migrations:searchProbe", { q, limit: LIMIT }, { prod }) as string[];
  rows.push(compareResults(q, postgres, convex));
}
await prisma.$disconnect();

const label = new Map(corpus.map((e) => [e.id, e.title ?? e.body.split("\n", 1)[0].slice(0, 60)]));
const cell = (s: string) => s.replace(/\|/g, "\\|");
const titles = (ids: string[]) =>
  ids.slice(0, 3).map((id) => `"${cell(label.get(id) ?? id)}"`).join(", ") +
  (ids.length > 3 ? ` +${ids.length - 3} more` : "");

const missesNothing = rows.filter((r) => r.onlyPostgres.length === 0).length;
const summary =
  `${corpus.length} live entries, ${rows.length} queries (${prod ? "production" : "dev"} Convex). ` +
  `Convex found ${Math.round(overallRecall(rows) * 100)}% of what Postgres found; ` +
  `${missesNothing} of ${rows.length} queries miss nothing.`;
const countsTable = [
  "| Query | Postgres | Convex | Both |",
  "|---|---|---|---|",
  ...rows.map((r) => `| ${cell(r.query)} | ${r.postgres.length} | ${r.convex.length} | ${r.shared} |`),
];
const detailTable = [
  "| Query | Postgres | Convex | Both | Only Postgres finds | Only Convex finds |",
  "|---|---|---|---|---|---|",
  ...rows.map(
    (r) =>
      `| ${cell(r.query)} | ${r.postgres.length} | ${r.convex.length} | ${r.shared} | ${titles(r.onlyPostgres)} | ${titles(r.onlyConvex)} |`
  ),
];

const outDir = join(import.meta.dir, "out");
mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "search-acceptance.md");
writeFileSync(
  reportPath,
  [`# Journal search acceptance — ${new Date().toISOString().slice(0, 10)}`, "", summary, "", ...detailTable, ""].join("\n")
);
console.log([summary, "", ...countsTable, "", `Details with titles: ${reportPath}`].join("\n"));
```

- [ ] **Step 6: The rehearsal seed** — create `apps/web/scripts/seed-journal-rehearsal.ts`:

```ts
import { prisma } from "../src/platform/db/client";

// Real-shaped journal rows for the copy rehearsal, LOCAL Postgres only
// (playbook §06: an almost-empty table passes every checksum and proves
// nothing). Fixed ids, so reruns update in place instead of duplicating.
const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Refusing to seed: DATABASE_URL is not a localhost database.");
  process.exit(1);
}

const DAY = 86_400_000;
const now = Date.now();
const WORDS = [
  "deploy", "convex", "search", "index", "react", "hooks", "migration", "schema", "testing", "build",
  "vercel", "postgres", "journal", "habits", "palette", "refactor", "reading", "coffee", "notes", "shipping",
];
const TAGS = ["build", "ops", "reading", "bug"];

const topics = [
  { id: "rehearsal-topic-builds", name: "Rehearsal · Builds", archived: false, parentId: null },
  { id: "rehearsal-topic-ops", name: "Rehearsal · Ops", archived: false, parentId: "rehearsal-topic-builds" },
  { id: "rehearsal-topic-reading", name: "Rehearsal · Reading", archived: false, parentId: null },
  { id: "rehearsal-topic-archived", name: "Rehearsal · Archived", archived: true, parentId: null },
];
for (const t of topics) {
  const data = {
    name: t.name,
    description: "Seeded for the phase 3 rehearsal",
    archived: t.archived,
    archivedAt: t.archived ? new Date(now - 10 * DAY) : null,
    parentId: t.parentId,
  };
  await prisma.journalTopic.upsert({ where: { id: t.id }, create: { id: t.id, ...data }, update: data });
}

const ENTRY_COUNT = 48; // about four months, every 2.5 days
for (let i = 0; i < ENTRY_COUNT; i++) {
  const words = Array.from({ length: 6 + (i % 5) }, (_, k) => WORDS[(i * 7 + k * 3) % WORDS.length]);
  const tags =
    i % 3 === 0 ? [TAGS[i % TAGS.length]]
    : i % 5 === 0 ? [TAGS[i % TAGS.length], TAGS[(i + 1) % TAGS.length]]
    : [];
  const tasks = i % 7 === 0 ? "\n\n- [ ] follow up\n- [x] done" : "";
  const body = [words.join(" "), ...tags.map((t) => `#${t}`)].join(" ") + tasks;
  const createdAt = new Date(now - i * 2.5 * DAY);
  const data = {
    topicId: topics[i % topics.length].id,
    title: i % 4 === 0 ? `Rehearsal entry ${i}` : null,
    body,
    tags, // matches extractTags(body)
    deletedAt: i % 16 === 5 ? new Date(createdAt.getTime() + DAY) : null,
    createdAt,
  };
  const id = `rehearsal-entry-${String(i).padStart(2, "0")}`;
  await prisma.journalEntry.upsert({ where: { id }, create: { id, ...data }, update: data });
}

console.log(`seeded ${topics.length} topics and ${ENTRY_COUNT} entries into local Postgres`);
await prisma.$disconnect();
```

- [ ] **Step 7: Smoke both scripts locally** — from `apps/web` (Docker Postgres up, `DATABASE_URL` from `.env` is the local database): `bun scripts/seed-journal-rehearsal.ts` (prints the seeded counts), then `bun scripts/journal-search-acceptance.ts` (dev Convex holds only Task 8's tiny copy at this point, so expect low recall — this step only proves the script runs end to end and writes `scripts/out/search-acceptance.md`). Task 14 runs the real rehearsal.

- [ ] **Step 8: Commit**

```bash
git add apps/web/scripts
git commit -m "feat(journal): search acceptance script and rehearsal seed"
```

---

### Task 10: Server-rendered journal reads on Convex — palette, dashboard, search, topics, tags

**Files:**
- Modify: `apps/web/src/systems/journal/palette.ts`, `apps/web/src/systems/journal/dashboard.tsx`
- Modify: `apps/web/src/app/(systems)/journal/search/page.tsx`, `apps/web/src/app/(systems)/journal/topics/page.tsx`, `apps/web/src/app/(systems)/journal/tags/page.tsx`
- Modify (test): `apps/web/src/app/api/platform/palette/search/route.integration.test.ts`

**Interfaces:**
- Consumes: `api.journal.topics.search`, `api.journal.topics.listWithStats`, `api.journal.entries.search`, `api.journal.tags.list`, `api.journal.dashboard.summary` (Tasks 2–5). Pattern: `const token = await convexAuthNextjsToken(); await fetchQuery(ref, args, { token })` — as in `apps/web/src/systems/expenses/palette.ts`.
- Produces: none of these files import `@/systems/journal/services/*` or `@/platform/db/client` any more (Task 13 deletes the services).

Read `docs/design/README.md` and `docs/design/polaris-design-system.md` before editing (UI rule). Markup and copy stay exactly as they are; only the data source changes.

- [ ] **Step 1: Palette layers** — replace `apps/web/src/systems/journal/palette.ts` with:

```ts
import type { PaletteLayer } from "@/platform/palette/types";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";
import { firstLine, relativeTime } from "@polaris/core/format";

export const topicsLayer: PaletteLayer = {
  name: "topics",
  singular: "topic",
  async search(query, _parentId) {
    const token = await convexAuthNextjsToken();
    const topics = await fetchQuery(api.journal.topics.search, { query }, { token });
    return topics.map((t) => ({
      id: t.id,
      label: t.name,
      sublabel: t.description ?? undefined,
      icon: "spool" as const,
      href: `/journal/topics/${encodeURIComponent(t.name)}`,
      drillable: true,
    }));
  },
};

export const notesLayer: PaletteLayer = {
  name: "notes",
  singular: "note",
  async search(query, parentId) {
    const token = await convexAuthNextjsToken();
    // parentId is a topics-layer result id — a Convex topic id.
    const { entries } = await fetchQuery(
      api.journal.entries.search,
      { q: query, ...(parentId ? { topicId: parentId as Id<"journalTopics"> } : {}), limit: 20 },
      { token }
    );
    return entries.map((e) => ({
      id: e.id,
      label: e.title ?? firstLine(e.body, 80),
      sublabel: relativeTime(new Date(e.createdAt)),
      icon: "file-text" as const,
      href: `/journal/topics/${encodeURIComponent(e.topicName)}#entry-${e.id}`,
      drillable: false,
    }));
  },
};
```

- [ ] **Step 2: Dashboard card** — in `apps/web/src/systems/journal/dashboard.tsx`: replace the `prisma` import with

```ts
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
```

replace the `load` definition (and its doc comment) with

```ts
/** Day boundaries are the Asia/Manila calendar day, computed by the Convex
 *  query — the same rule as the journal's Today page. */
const load = cache(async () => {
  const token = await convexAuthNextjsToken();
  return fetchQuery(api.journal.dashboard.summary, {}, { token });
});
```

and in `Widget`, read `lastEntry.topicName` instead of `lastEntry.topic.name`, and `relativeTime(new Date(lastEntry.createdAt))` instead of `relativeTime(lastEntry.createdAt)`. `countPhrase`, `snippet`, `summary`, and all markup stay.

- [ ] **Step 3: Search page** — in `apps/web/src/app/(systems)/journal/search/page.tsx`: replace the `searchEntries` import with the three Convex imports from Step 2, replace the `results` line with

```ts
  const results = trimmed
    ? (
        await fetchQuery(
          api.journal.entries.search,
          { q: trimmed, limit: 50 },
          { token: await convexAuthNextjsToken() }
        )
      ).entries
    : [];
```

and use `entry.topicName` where the JSX reads `entry.topic.name` (twice: the link `href` and the `TopicChip`). Everything else stays.

- [ ] **Step 4: Topics index** — replace `apps/web/src/app/(systems)/journal/topics/page.tsx` with:

```tsx
import Link from "next/link";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { relativeTime } from "@polaris/core/format";

export default async function TopicsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const params = await searchParams;
  const includeArchived = params.archived === "true";
  const topics = await fetchQuery(
    api.journal.topics.listWithStats,
    { includeArchived },
    { token: await convexAuthNextjsToken() }
  );

  return (
    <article className="doc">
      <h1>Topics</h1>
      {topics.length === 0 ? (
        <p className="lead">
          No topics yet. Create one when you log your first entry.
        </p>
      ) : (
        <ul className="topic-grid">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`/journal/topics/${encodeURIComponent(topic.name)}`}
                className={topic.archived ? "topic-card archived" : "topic-card"}
              >
                <span className="topic-card-name">{topic.name}</span>
                {topic.description ? (
                  <span className="topic-card-desc">{topic.description}</span>
                ) : null}
                <span className="topic-card-meta">
                  {topic.entryCount > 0
                    ? `${topic.entryCount} ${topic.entryCount === 1 ? "entry" : "entries"}`
                    : "No entries yet"}
                  {topic.lastEntryAt !== null
                    ? ` · last entry ${relativeTime(new Date(topic.lastEntryAt))}`
                    : ""}
                  {topic.archived ? " · archived" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="caption" style={{ marginTop: "var(--sp-6)" }}>
        <Link href={`/journal/topics?archived=${includeArchived ? "false" : "true"}`}>
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </p>
    </article>
  );
}
```

- [ ] **Step 5: Tags index** — in `apps/web/src/app/(systems)/journal/tags/page.tsx`, replace the `listTags` import with the three Convex imports from Step 2 and the first line of the component with `const tags = await fetchQuery(api.journal.tags.list, {}, { token: await convexAuthNextjsToken() });`. Markup unchanged.

- [ ] **Step 6: Rewrite the palette route test** — the journal layers no longer touch Postgres, so the suite stops seeding journal rows and answers `fetchQuery` per function. It stays an integration test because the habits layer still reads Postgres. Replace `apps/web/src/app/api/platform/palette/search/route.integration.test.ts` with:

```ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";
import { requireTestDatabase } from "@/test/db";

vi.mock("@convex-dev/auth/nextjs/server", () => ({
  isAuthenticatedNextjs: vi.fn(),
  // Read by the journal and expenses palette layers; a fake token is enough
  // since fetchQuery itself is mocked below.
  convexAuthNextjsToken: vi.fn(async () => "test-token"),
}));

// The journal and expenses layers call Convex directly; this suite has no live
// deployment, so fetchQuery answers per function from the fixtures below.
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn() }));

import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { POST } from "./route";

const POLARIS = { id: "topic-polaris", name: "Polaris", description: null, archived: false };
const NOTE = {
  id: "entry-1",
  topicId: POLARIS.id,
  topicName: "Polaris",
  title: null,
  body: "polaris ship note",
  tags: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/palette/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockedIsAuthenticated = vi.mocked(isAuthenticatedNextjs);
const mockedFetchQuery = vi.mocked(fetchQuery);

describe("POST /api/platform/palette/search", () => {
  beforeAll(() => requireTestDatabase()); // the habits layer still reads Postgres
  beforeEach(() => {
    mockedIsAuthenticated.mockReset();
    mockedIsAuthenticated.mockResolvedValue(true);
    mockedFetchQuery.mockReset();
    mockedFetchQuery.mockImplementation((async (ref: unknown) => {
      switch (getFunctionName(ref as never)) {
        case "journal/topics:search":
          return [POLARIS];
        case "journal/entries:search":
          return { entries: [NOTE] };
        default:
          return []; // expenses
      }
    }) as never);
  });

  it("returns 401 when there is no session", async () => {
    mockedIsAuthenticated.mockResolvedValueOnce(false);
    const res = await POST(jsonRequest({ query: "" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing the query field", async () => {
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("happy path: top-level empty query lists matched systems with layers", async () => {
    const res = await POST(jsonRequest({ query: "" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const journal = json.matchedSystems.find((s: { name: string }) => s.name === "journal");
    expect(journal.layers).toEqual([
      { name: "topics", singular: "topic" },
      { name: "notes", singular: "note" },
    ]);
  });

  it("happy path: top-level query returns layered journal results", async () => {
    const res = await POST(jsonRequest({ query: "polaris" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const topicHit = json.results.find((r: { id: string }) => r.id === POLARIS.id);
    expect(topicHit).toMatchObject({
      systemName: "journal",
      layerIndex: 0,
      layerName: "topics",
      drillable: true,
      href: "/journal/topics/Polaris",
    });
    const noteHit = json.results.find((r: { id: string }) => r.id === NOTE.id);
    expect(noteHit).toMatchObject({ layerName: "notes", label: "polaris ship note" });
    expect(noteHit.href).toBe("/journal/topics/Polaris#entry-entry-1");
  });

  it("scoped query: passes the parent topic to journal search", async () => {
    const res = await POST(
      jsonRequest({
        query: "deploy",
        scope: { systemName: "journal", layerIndex: 1, parentId: POLARIS.id },
      })
    );
    const json = await res.json();
    expect(json.results.length).toBeGreaterThan(0);
    expect(json.results.every((r: { href: string }) => r.href.includes("/Polaris"))).toBe(true);
    const call = mockedFetchQuery.mock.calls.find(
      ([ref]) => getFunctionName(ref as never) === "journal/entries:search"
    );
    expect(call?.[1]).toEqual({ q: "deploy", topicId: POLARIS.id, limit: 20 });
  });
});
```

- [ ] **Step 7: Verify** — in `apps/web`: `bun run test` (unit), the integration suite (command in Global Constraints — the palette suite passes; journal's own integration suites still pass, their services are untouched until Task 13), `bun run build`, `bun run lint`. Expected: all green, build lists the journal pages as dynamic (ƒ).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "feat(journal): palette, dashboard, search, topics and tags pages read Convex"
```

---

### Task 11: Reactive journal feeds and writes through Convex

**Files:**
- Create: `apps/web/src/systems/journal/components/EntryFeed.tsx`
- Modify: `apps/web/src/systems/journal/components/{EntryCard,ComposeBox,EntryActions,TaskCheckbox,TopicPicker,TopicHeaderActions}.tsx`
- Modify: `apps/web/src/app/(systems)/journal/page.tsx`, `apps/web/src/app/(systems)/journal/topics/[name]/page.tsx`, `apps/web/src/app/(systems)/journal/tags/[tag]/page.tsx`

**Interfaces:**
- Consumes: `api.journal.entries.{list,create,update,remove}`, `api.journal.topics.{list,getByName,create,update}` (Tasks 2–3); `manilaDayStartMs`, `MANILA_TZ` from `@polaris/core/months`. Pattern for reactive pages: `preloadQuery` in the server page, `usePreloadedQuery` in a client component — as in `apps/web/src/app/(systems)/expenses/page.tsx` + `apps/web/src/systems/expenses/components/ActivityList.tsx`.
- Produces: `EntryFeed({ preloaded, emptyText, showCount?, spaceAbove? })`; `type EntryView` exported from `EntryCard.tsx`. After this task no journal component or page calls `fetch("/api/systems/journal/…")` or `router.refresh()`, and none imports `@/systems/journal/services/*`.

Read `docs/design/README.md` and `docs/design/polaris-design-system.md` first (UI rule). All existing copy stays verbatim; the only new copy is two error alerts (Steps 5 and 8), written to the design rule (name the failure and the recovery, no apology).

- [ ] **Step 1: `EntryFeed`** — create `apps/web/src/systems/journal/components/EntryFeed.tsx`:

```tsx
"use client";

import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "@polaris/backend/convex/_generated/api";
import { EntryCard } from "./EntryCard";

/** A live list of journal entries — Today, one topic, or one tag. Writes from
 *  anywhere (compose box, edits, deletes, task ticks) appear without a refresh. */
export function EntryFeed({
  preloaded,
  emptyText,
  showCount = false,
  spaceAbove = false,
}: {
  preloaded: Preloaded<typeof api.journal.entries.list>;
  emptyText: string;
  /** Tag pages: an "N entries" caption above the list. */
  showCount?: boolean;
  /** Pages with a compose box above the feed. */
  spaceAbove?: boolean;
}) {
  const { entries } = usePreloadedQuery(preloaded);
  return (
    <>
      {showCount ? (
        <p className="caption" style={{ marginTop: -8 }}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </p>
      ) : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-3)",
          ...(spaceAbove ? { marginTop: "var(--sp-6)" } : {}),
        }}
      >
        {entries.length === 0 ? (
          <p className="lead">{emptyText}</p>
        ) : (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: `EntryCard`** — in `EntryCard.tsx`, replace the `JournalEntryWithTopic` import with

```ts
import type { FunctionReturnType } from "convex/server";
import type { api } from "@polaris/backend/convex/_generated/api";
```

add below the imports

```ts
export type EntryView = FunctionReturnType<typeof api.journal.entries.list>["entries"][number];
```

change the signature to `export function EntryCard({ entry }: { entry: EntryView })`, the edited check to `const edited = entry.updatedAt > entry.createdAt + 1000;`, the `editingEntry` topic to `topic: { id: entry.topicId, name: entry.topicName }`, `<TopicChip name={entry.topicName} />`, and keep every `new Date(entry.createdAt)` / `new Date(entry.updatedAt)` call as is (they now take ms numbers). Markup unchanged.

- [ ] **Step 3: `ComposeBox`** — in `ComposeBox.tsx`:
  - Imports: drop `useRouter`; add
    ```ts
    import { useMutation } from "convex/react";
    import { ConvexError } from "convex/values";
    import { api } from "@polaris/backend/convex/_generated/api";
    import type { Id } from "@polaris/backend/convex/_generated/dataModel";
    ```
  - Replace the key constant with:
    ```ts
    // v2: the old key held Postgres topic ids, which Convex rejects
    // (phase 3 decision log 14). The user picks a topic once after the switch.
    const LAST_TOPIC_KEY = "journal:lastTopic:v2";
    ```
  - In `ComposeBoxProps`, type `editingEntry.id` as `Id<"journalEntries">`.
  - In the component, replace `const router = useRouter();` with
    ```ts
    const createEntry = useMutation(api.journal.entries.create);
    const updateEntry = useMutation(api.journal.entries.update);
    ```
  - Replace `handleSubmit` with:
    ```ts
    async function handleSubmit() {
      if (!topic) {
        setError("Pick a topic first.");
        return;
      }
      if (!body.trim()) {
        setError("Write something before saving.");
        return;
      }
      setSubmitting(true);
      setError(null);
      const topicId = topic.id as Id<"journalTopics">;
      const entryTitle = showTitle && title.trim() ? title.trim() : null;
      try {
        if (editingEntry) {
          await updateEntry({ id: editingEntry.id, topicId, title: entryTitle, body });
        } else {
          await createEntry({ topicId, body, ...(entryTitle ? { title: entryTitle } : {}) });
        }
        window.localStorage.setItem(LAST_TOPIC_KEY, JSON.stringify(topic));
        if (!editingEntry) {
          editorRef.current?.commands.clearContent();
          setBody("");
          setTitle("");
          setShowTitle(false);
        }
        onSubmitted?.();
      } catch (err) {
        setError(err instanceof ConvexError ? String(err.data) : "Could not save the entry. Try again.");
      } finally {
        setSubmitting(false);
      }
    }
    ```
  - `isEditing` is still used by the JSX; keep it. Nothing else changes.

- [ ] **Step 4: `TaskCheckbox`** — in `TaskCheckbox.tsx`: drop `useRouter`; add `useMutation` (`convex/react`), `ConvexError` (`convex/values`), `api`, and `type Id` imports as in Step 3; add `const updateEntry = useMutation(api.journal.entries.update);` in place of the router; replace `handleToggle` with:

```ts
  async function handleToggle() {
    if (busy) return;
    const next = !checked;
    setChecked(next);
    setBusy(true);
    setError(null);
    try {
      await updateEntry({
        id: entryId as Id<"journalEntries">,
        body: toggleTaskAtLine(body, lineNumber),
      });
    } catch (err) {
      setChecked(!next);
      const msg =
        err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err);
      setError(`Save failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 5: `EntryActions`** — replace `EntryActions.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@polaris/backend/convex/_generated/api";
import type { Id } from "@polaris/backend/convex/_generated/dataModel";
import { Icon } from "@/app/_components/Icon";

interface EntryActionsProps {
  entryId: Id<"journalEntries">;
  onEdit: () => void;
}

export function EntryActions({ entryId, onEdit }: EntryActionsProps) {
  const removeEntry = useMutation(api.journal.entries.remove);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this entry? It moves to trash.")) return;
    setBusy(true);
    try {
      await removeEntry({ id: entryId });
    } catch {
      window.alert("Could not delete the entry. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions" aria-label="Entry actions">
      <button type="button" onClick={onEdit} aria-label="Edit entry">
        <Icon name="edit-3" size={14} />
      </button>
      <button
        type="button"
        onClick={handleDelete}
        aria-label="Delete entry"
        disabled={busy}
      >
        <Icon name="trash-2" size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 6: `TopicPicker`** — in `TopicPicker.tsx`:
  - Imports: add `import { useMutation, useQuery } from "convex/react";`, `import { ConvexError } from "convex/values";`, `import { api } from "@polaris/backend/convex/_generated/api";`.
  - Replace `const [topics, setTopics] = useState<PickerTopic[]>([]);` with
    ```ts
    const liveTopics = useQuery(api.journal.topics.list, {}); // undefined while loading
    const topics: PickerTopic[] = liveTopics ?? [];
    const createTopic = useMutation(api.journal.topics.create);
    ```
  - Delete the `useEffect` that fetches `/api/systems/journal/topics`.
  - Replace the `try`/`catch` inside `handleCreate` with
    ```ts
    try {
      const topic = await createTopic({ name: trimmed });
      pick({ id: topic.id, name: topic.name });
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "Could not create topic. Try again.");
    } finally {
      setBusy(false);
    }
    ```
    (the reactive list picks the new topic up on its own — no `setTopics`).
  - In the listbox, render the empty message only once loaded: change the condition `filtered.length === 0 && !showCreate` to `liveTopics !== undefined && filtered.length === 0 && !showCreate`.

- [ ] **Step 7: `TopicHeaderActions`** — in `TopicHeaderActions.tsx`: add `useMutation`, `api`, and `type Id` imports; type the prop as `topic: { id: Id<"journalTopics">; name: string; archived: boolean }`; add `const updateTopic = useMutation(api.journal.topics.update);`; replace `handleRename` and `handleArchive` with:

```ts
  async function handleRename() {
    const next = window.prompt("New name", topic.name);
    if (!next || next === topic.name) return;
    setBusy(true);
    try {
      const renamed = await updateTopic({ id: topic.id, name: next });
      router.replace(`/journal/topics/${encodeURIComponent(renamed.name)}`);
    } catch {
      window.alert("Could not rename. Pick a name that isn't already in use.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!window.confirm(`Archive "${topic.name}"? It moves out of the active list.`)) return;
    setBusy(true);
    try {
      await updateTopic({ id: topic.id, archived: true });
      router.push("/journal/topics");
    } catch {
      window.alert("Could not archive the topic. Try again.");
    } finally {
      setBusy(false);
    }
  }
```

The sort toggle is unchanged.

- [ ] **Step 8: Today page** — replace `apps/web/src/app/(systems)/journal/page.tsx` with:

```tsx
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { MANILA_TZ, manilaDayStartMs } from "@polaris/core/months";
import { ComposeBox } from "@/systems/journal/components/ComposeBox";
import { EntryFeed } from "@/systems/journal/components/EntryFeed";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: MANILA_TZ,
});
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  timeZone: MANILA_TZ,
});

function formatHeader(d: Date): string {
  return `${DATE_FORMAT.format(d)} · ${WEEKDAY_FORMAT.format(d)}`;
}

// "Today" is the Asia/Manila calendar day (phase 3 decision log 7); phase 4
// moves it to the device.
export default async function JournalTodayPage() {
  const now = new Date();
  const preloaded = await preloadQuery(
    api.journal.entries.list,
    { sinceMs: manilaDayStartMs(now.getTime()), limit: 100 },
    { token: await convexAuthNextjsToken() }
  );

  return (
    <article className="doc">
      <h1 style={{ fontFamily: "var(--font-serif)" }}>{formatHeader(now)}</h1>
      <ComposeBox />
      <EntryFeed
        preloaded={preloaded}
        emptyText="No entries today. Pick a topic and start logging."
        spaceAbove
      />
    </article>
  );
}
```

- [ ] **Step 9: Topic page** — in `apps/web/src/app/(systems)/journal/topics/[name]/page.tsx`: replace the `getTopicByName`, `listEntries`, and `EntryCard` imports with

```ts
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { EntryFeed } from "@/systems/journal/components/EntryFeed";
```

replace the topic lookup and entries lines with

```ts
  const token = await convexAuthNextjsToken();
  const topic = await fetchQuery(
    api.journal.topics.getByName,
    { name: decodeURIComponent(name) },
    { token }
  );
  if (!topic) notFound();

  const sort = parseSortOrder(sortParam);
  const preloaded = await preloadQuery(
    api.journal.entries.list,
    { topicId: topic.id, sort, limit: 100 },
    { token }
  );
```

and replace the trailing `<div …>{entries.length === 0 ? … }</div>` block with

```tsx
      <EntryFeed
        preloaded={preloaded}
        emptyText={`No entries under ${topic.name} yet.`}
        spaceAbove
      />
```

The header, `HashAnchorScroll`, `SortRedirect`, `TopicHeaderActions`, and `ComposeBox` stay as they are.

- [ ] **Step 10: Tag page** — replace `apps/web/src/app/(systems)/journal/tags/[tag]/page.tsx` with:

```tsx
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { EntryFeed } from "@/systems/journal/components/EntryFeed";

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const preloaded = await preloadQuery(
    api.journal.entries.list,
    { tag, limit: 100 },
    { token: await convexAuthNextjsToken() }
  );

  return (
    <article className="doc">
      <h1>{`#${tag}`}</h1>
      <EntryFeed preloaded={preloaded} emptyText={`No entries with #${tag} yet.`} showCount />
    </article>
  );
}
```

- [ ] **Step 11: Verify** — `grep -rn "api/systems/journal\|router.refresh\|journal/services" apps/web/src/systems/journal/components "apps/web/src/app/(systems)/journal"` prints nothing. In `apps/web`: `bun run test`, `bun run build`, `bun run lint` — all green. If you can sign in locally (`bun run dev` in `apps/web`, Google sign-in against dev Convex), click through Today → write an entry → tick a task → edit → delete, and note what you saw in the report; if you can't sign in, say so in the report — the user smoke-tests at the end.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src
git commit -m "feat(journal): reactive Today, topic, and tag feeds; writes go through Convex"
```

---

### Task 12: Habits reaches the journal through the bridge

**Files:**
- Create: `apps/web/src/systems/habits/services/journalBridge.ts`, `apps/web/src/systems/habits/services/journalBridge.test.ts`, `apps/web/src/test/fakeJournal.ts`
- Modify: `apps/web/src/systems/habits/services/{habits,logs,detail}.ts`, `apps/web/src/systems/habits/routes/logs.ts`
- Modify (tests): `apps/web/src/systems/habits/services/{habits,logs,detail,ticks,charts}.integration.test.ts`, `apps/web/src/systems/habits/routes/routes.integration.test.ts`

**Interfaces:**
- Consumes: `api.journal.habitBridge.*` (Task 6).
- Produces: `journalBridge` with `ensureTopic(name): Promise<string>`, `topicState(ref): Promise<BridgeTopic | null>`, `renameTopic(ref, name): Promise<"ok" | "collision">`, `setTopicArchived(ref, archived): Promise<void>`, `createLog(ref, { title: string | null; body: string; createdAt?: number }): Promise<CreateLogResult>`, `topicEntries(ref, fromMs, toMs): Promise<BridgeEntry[]>`; types `BridgeTopic { id; name; archived }`, `BridgeEntry { id; title: string | null; body; createdAt: number }`, `CreateLogResult = { ok: true; entry: BridgeEntry } | { ok: false; reason: "missing" | "archived" }`. Test double: `@/test/fakeJournal` exports the same `journalBridge` plus `fakeJournal` helpers. After this task, nothing under `apps/web/src/systems/habits/` imports `@/systems/journal/*` or reads `prisma.journalTopic` / `prisma.journalEntry`.

- [ ] **Step 1: Write the bridge's failing unit test** — create `apps/web/src/systems/habits/services/journalBridge.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

vi.mock("convex/nextjs", () => ({ fetchMutation: vi.fn(), fetchQuery: vi.fn() }));
vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: vi.fn(async () => "tok"),
}));

import { journalBridge } from "./journalBridge";

const mockedMutation = vi.mocked(fetchMutation);
const mockedQuery = vi.mocked(fetchQuery);

describe("habits → journal bridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls with the user's token and maps rename results", async () => {
    mockedMutation.mockResolvedValueOnce({ ok: false, reason: "collision" } as never);
    expect(await journalBridge.renameTopic("t1", "Run")).toBe("collision");
    expect(mockedMutation).toHaveBeenCalledWith(
      api.journal.habitBridge.renameTopic,
      { ref: "t1", name: "Run" },
      { token: "tok" }
    );
    mockedMutation.mockResolvedValueOnce({ ok: true } as never);
    expect(await journalBridge.renameTopic("t1", "Run")).toBe("ok");
  });

  it("omits createdAt for today's logs and forwards it for backdated ones", async () => {
    mockedMutation.mockResolvedValue({
      ok: true, entry: { id: "e1", title: null, body: "b", createdAt: 5 },
    } as never);
    await journalBridge.createLog("t1", { title: null, body: "b" });
    expect(mockedMutation).toHaveBeenLastCalledWith(
      api.journal.habitBridge.createLog,
      { ref: "t1", title: null, body: "b" },
      { token: "tok" }
    );
    await journalBridge.createLog("t1", { title: "T", body: "b", createdAt: 42 });
    expect(mockedMutation).toHaveBeenLastCalledWith(
      api.journal.habitBridge.createLog,
      { ref: "t1", title: "T", body: "b", createdAt: 42 },
      { token: "tok" }
    );
  });

  it("reads topic state and a topic's entries in a range", async () => {
    mockedQuery.mockResolvedValueOnce(null as never);
    expect(await journalBridge.topicState("gone")).toBeNull();
    mockedQuery.mockResolvedValueOnce([] as never);
    await journalBridge.topicEntries("t1", 10, 20);
    expect(mockedQuery).toHaveBeenLastCalledWith(
      api.journal.habitBridge.topicEntries,
      { ref: "t1", fromMs: 10, toMs: 20 },
      { token: "tok" }
    );
  });
});
```

Run `cd apps/web && bun run test` — FAIL (module missing).

- [ ] **Step 2: The bridge** — create `apps/web/src/systems/habits/services/journalBridge.ts`:

```ts
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

// Strangler-window bridge (phase 3 → 4): habits lives in Postgres, the journal
// in Convex. Every habits → journal call goes through this one module, so the
// integration tests can swap in src/test/fakeJournal.ts and phase 4 can delete
// it whole. `ref` is a habit's stored journalTopicId.

export interface BridgeTopic {
  id: string;
  name: string;
  archived: boolean;
}

export interface BridgeEntry {
  id: string;
  title: string | null;
  body: string;
  createdAt: number; // ms
}

export type CreateLogResult =
  | { ok: true; entry: BridgeEntry }
  | { ok: false; reason: "missing" | "archived" };

async function auth() {
  return { token: await convexAuthNextjsToken() };
}

export const journalBridge = {
  async ensureTopic(name: string): Promise<string> {
    return fetchMutation(api.journal.habitBridge.ensureTopic, { name }, await auth());
  },

  async topicState(ref: string): Promise<BridgeTopic | null> {
    return fetchQuery(api.journal.habitBridge.topicState, { ref }, await auth());
  },

  async renameTopic(ref: string, name: string): Promise<"ok" | "collision"> {
    const result = await fetchMutation(api.journal.habitBridge.renameTopic, { ref, name }, await auth());
    return result.ok ? "ok" : "collision";
  },

  async setTopicArchived(ref: string, archived: boolean): Promise<void> {
    await fetchMutation(api.journal.habitBridge.setTopicArchived, { ref, archived }, await auth());
  },

  async createLog(
    ref: string,
    input: { title: string | null; body: string; createdAt?: number }
  ): Promise<CreateLogResult> {
    return fetchMutation(
      api.journal.habitBridge.createLog,
      {
        ref,
        title: input.title,
        body: input.body,
        ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
      },
      await auth()
    );
  },

  async topicEntries(ref: string, fromMs: number, toMs: number): Promise<BridgeEntry[]> {
    return fetchQuery(api.journal.habitBridge.topicEntries, { ref, fromMs, toMs }, await auth());
  },
};
```

Run `cd apps/web && bun run test` — the bridge test passes.

- [ ] **Step 3: The in-memory fake** — create `apps/web/src/test/fakeJournal.ts`:

```ts
import type {
  BridgeEntry,
  BridgeTopic,
  CreateLogResult,
} from "@/systems/habits/services/journalBridge";

// In-memory stand-in for the habits → journal bridge. Integration tests mock
// "@/systems/habits/services/journalBridge" with this module, then arrange
// and assert journal state through `fakeJournal`. Module state is shared, so
// call fakeJournal.reset() in beforeEach.

interface FakeEntry extends BridgeEntry {
  topicId: string;
  deleted: boolean;
}

const topics = new Map<string, BridgeTopic>();
const entries: FakeEntry[] = [];
let seq = 0;

function findByName(name: string): BridgeTopic | undefined {
  for (const t of topics.values()) if (t.name === name) return t;
  return undefined;
}

function addTopic(name: string, archived = false): string {
  const id = `topic-${++seq}`;
  topics.set(id, { id, name, archived });
  return id;
}

export const journalBridge = {
  async ensureTopic(name: string): Promise<string> {
    return findByName(name)?.id ?? addTopic(name);
  },
  async topicState(ref: string): Promise<BridgeTopic | null> {
    const t = topics.get(ref);
    return t ? { ...t } : null;
  },
  async renameTopic(ref: string, name: string): Promise<"ok" | "collision"> {
    const t = topics.get(ref);
    if (!t || t.name === name) return "ok";
    if (findByName(name)) return "collision";
    t.name = name;
    return "ok";
  },
  async setTopicArchived(ref: string, archived: boolean): Promise<void> {
    const t = topics.get(ref);
    if (t) t.archived = archived;
  },
  async createLog(
    ref: string,
    input: { title: string | null; body: string; createdAt?: number }
  ): Promise<CreateLogResult> {
    const t = topics.get(ref);
    if (!t) return { ok: false, reason: "missing" };
    if (t.archived) return { ok: false, reason: "archived" };
    const entry: FakeEntry = {
      id: `entry-${++seq}`,
      topicId: ref,
      title: input.title,
      body: input.body,
      createdAt: input.createdAt ?? Date.now(),
      deleted: false,
    };
    entries.push(entry);
    return { ok: true, entry: { id: entry.id, title: entry.title, body: entry.body, createdAt: entry.createdAt } };
  },
  async topicEntries(ref: string, fromMs: number, toMs: number): Promise<BridgeEntry[]> {
    return entries
      .filter((e) => e.topicId === ref && !e.deleted && e.createdAt >= fromMs && e.createdAt < toMs)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ id, title, body, createdAt }) => ({ id, title, body, createdAt }));
  },
};

export const fakeJournal = {
  reset(): void {
    topics.clear();
    entries.length = 0;
    seq = 0;
  },
  addTopic,
  addEntry(
    topicId: string,
    entry: { title?: string | null; body: string; createdAt?: number; deleted?: boolean }
  ): string {
    const id = `entry-${++seq}`;
    entries.push({
      id,
      topicId,
      title: entry.title ?? null,
      body: entry.body,
      createdAt: entry.createdAt ?? Date.now(),
      deleted: entry.deleted ?? false,
    });
    return id;
  },
  topic(id: string): BridgeTopic | undefined {
    return topics.get(id);
  },
  entry(id: string): FakeEntry | undefined {
    return entries.find((e) => e.id === id);
  },
  setArchived(id: string, archived: boolean): void {
    const t = topics.get(id);
    if (t) t.archived = archived;
  },
  removeTopic(id: string): void {
    topics.delete(id);
  },
};
```

- [ ] **Step 4: Rewire the habits services** — replace `apps/web/src/systems/habits/services/habits.ts` with:

```ts
import { prisma } from "@/platform/db/client";
import type { Habit } from "@/generated/prisma/client";
import { journalBridge } from "./journalBridge";

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

export async function createHabit(name: string, quote?: string | null): Promise<Habit> {
  const journalTopicId = await journalBridge.ensureTopic(name);
  const max = await prisma.habit.aggregate({ _max: { position: true } });
  return prisma.habit.create({
    data: { name, quote: quote || null, position: (max._max.position ?? 0) + 1, journalTopicId },
  });
}

/** Renames the topic first — a clash stops there with nothing changed — then
 *  the habit. The two live in different databases, so this is not one
 *  transaction (phase 3 decision log 2). */
export async function renameHabit(id: string, name: string): Promise<Habit> {
  const habit = await prisma.habit.findUniqueOrThrow({ where: { id } });
  if (habit.journalTopicId && (await journalBridge.renameTopic(habit.journalTopicId, name)) === "collision") {
    throw new TopicNameCollisionError(name);
  }
  return prisma.habit.update({ where: { id }, data: { name } });
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
  // A missing topic never blocks the habit action — the bridge ignores it.
  if (habit.journalTopicId) await journalBridge.setTopicArchived(habit.journalTopicId, archived);
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
  const journalTopicId = await journalBridge.ensureTopic(habit.name);
  return prisma.habit.update({ where: { id }, data: { journalTopicId } });
}
```

In `apps/web/src/systems/habits/services/logs.ts`: replace the `createEntry` import with `import { journalBridge } from "./journalBridge";`, and replace everything in `createLog` after `const habit = await prisma.habit.findUniqueOrThrow(…);` with:

```ts
  if (!habit.journalTopicId) throw new TopicMissingError();
  const result = await journalBridge.createLog(habit.journalTopicId, {
    title: input.title ?? null,
    body: input.body,
    ...(date === today ? {} : { createdAt: noonInTz(date).getTime() }),
  });
  if (!result.ok) {
    throw result.reason === "archived" ? new TopicArchivedError() : new TopicMissingError();
  }
  return {
    id: result.entry.id,
    title: result.entry.title,
    excerpt: excerptOf(result.entry.body),
    createdAt: new Date(result.entry.createdAt).toISOString(),
  };
```

In `apps/web/src/systems/habits/services/detail.ts`: add `import { journalBridge } from "./journalBridge";`, replace the `topic` lookup with

```ts
  const topic = habit.journalTopicId ? await journalBridge.topicState(habit.journalTopicId) : null;
```

replace the `prisma.journalEntry.findMany({ … })` branch of the `Promise.all` with

```ts
    topic && !topic.archived
      ? journalBridge.topicEntries(
          topic.id,
          // Week padded ±1 day (UTC) so client-local grouping keeps edge entries.
          toUtcDate(addDays(monday, -1)).getTime(),
          toUtcDate(addDays(monday, 8)).getTime()
        )
      : Promise.resolve([]),
```

and map entries with `createdAt: new Date(e.createdAt).toISOString()` (the rest of the mapping is unchanged).

In `apps/web/src/systems/habits/routes/logs.ts`: delete the `feedback` import, the `entryWordCount` import, and the `// Habit logs are journal entries…` comment with its `await Promise.allSettled([...])` block — the bridge's `createLog` now records `entry_created` and `words_per_entry` inside Convex. Nothing else in the route changes.

- [ ] **Step 5: Move the habits integration tests onto the fake** — every habits integration test file creates habits, so every one mocks the bridge. In **each** of `services/habits.integration.test.ts`, `services/logs.integration.test.ts`, `services/detail.integration.test.ts`, `services/ticks.integration.test.ts`, `services/charts.integration.test.ts`, and `routes/routes.integration.test.ts`:
  - add `vi` to the `vitest` import, and add
    ```ts
    import { fakeJournal } from "@/test/fakeJournal";

    // Habits reaches the journal (Convex) only through journalBridge; the
    // in-memory fake keeps these tests off the network.
    vi.mock("@/systems/habits/services/journalBridge", () => import("@/test/fakeJournal"));
    ```
  - make `beforeEach` reset the fake: `beforeEach(async () => { fakeJournal.reset(); await withCleanHabitTables(); });`
  - In `routes.integration.test.ts`, also delete the `vi.mock("@/platform/feedback", …)` block and its comment (no habits code imports feedback any more), and in "POST log on an archived topic 409s" replace the `prisma.journalTopic.update(…)` call with `fakeJournal.setArchived(habit.journalTopicId!, true);`.

  Then make these test-body replacements (everything else in the files stays):

  `habits.integration.test.ts` — drop the `createTopic` import; then:
  ```ts
  // "creates a habit and its same-name topic"
  expect(fakeJournal.topic(habit.journalTopicId!)?.name).toBe("Morning run");

  // "links an existing same-name topic instead of failing"
  const topicId = fakeJournal.addTopic("Reading");
  const habit = await createHabit("Reading");
  expect(habit.journalTopicId).toBe(topicId);

  // "rename syncs the topic atomically" → rename the test "rename syncs the topic"
  expect(fakeJournal.topic(habit.journalTopicId!)?.name).toBe("New name");

  // "rename collision with a foreign topic changes nothing"
  fakeJournal.addTopic("Taken");
  const habit = await createHabit("Mine");
  await expect(renameHabit(habit.id, "Taken")).rejects.toBeInstanceOf(TopicNameCollisionError);
  const fresh = await prisma.habit.findUnique({ where: { id: habit.id } });
  expect(fresh?.name).toBe("Mine");
  expect(fakeJournal.topic(habit.journalTopicId!)?.name).toBe("Mine");

  // "archive and unarchive sync the topic"
  await archiveHabit(habit.id);
  expect(fakeJournal.topic(habit.journalTopicId!)?.archived).toBe(true);
  await unarchiveHabit(habit.id);
  expect(fakeJournal.topic(habit.journalTopicId!)?.archived).toBe(false);

  // "archive survives a missing topic" — drop the prisma.journalEntry.deleteMany line
  const habit = await createHabit("Orphan");
  await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: "gone" } });
  expect((await archiveHabit(habit.id)).archived).toBe(true);

  // "recreates a lost topic"
  const habit = await createHabit("Meditate");
  fakeJournal.removeTopic(habit.journalTopicId!);
  await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: null } });
  const fixed = await recreateTopic(habit.id);
  expect(fakeJournal.topic(fixed.journalTopicId!)?.name).toBe("Meditate");
  ```
  The `Prisma` import stays (the orphaned-rename test still expects `PrismaClientKnownRequestError`).

  `logs.integration.test.ts` — drop the `prisma` import only if unused after the edits (the no-topic test still uses it); then:
  ```ts
  // "creates a today log under the habit's topic with a current timestamp"
  const habit = await createHabit("Run");
  const before = Date.now();
  const log = await createLog(habit.id, todayString(), { body: "Did 5k #cardio" });
  const entry = fakeJournal.entry(log.id)!;
  expect(entry.topicId).toBe(habit.journalTopicId);
  expect(entry.createdAt).toBeGreaterThanOrEqual(before - 1000);
  expect(entry.createdAt).toBeLessThanOrEqual(Date.now() + 1000);
  expect(log.excerpt).toBe("Did 5k #cardio");
  // (tag extraction is the journal's job now — covered by the Convex bridge tests)

  // "backdates a past-day log to noon POLARIS_TZ on that day"
  const entry = fakeJournal.entry(log.id)!;
  expect(entry.createdAt).toBe(noonInTz(date).getTime());
  expect(entry.title).toBe("Missed note");

  // "rejects when the topic is archived"
  fakeJournal.setArchived(habit.journalTopicId!, true);
  ```
  and add a test:
  ```ts
  it("rejects when the topic is gone", async () => {
    const habit = await createHabit("Run");
    fakeJournal.removeTopic(habit.journalTopicId!);
    await expect(
      createLog(habit.id, todayString(), { body: "Nope" })
    ).rejects.toBeInstanceOf(TopicMissingError);
  });
  ```

  `detail.integration.test.ts` — replace the `prisma.journalEntry.create(…)` calls:
  ```ts
  // "returns the last-30 window, entries, and topic state"
  fakeJournal.addEntry(habit.journalTopicId!, { title: "Felt strong", body: "5k in the rain" });
  fakeJournal.addEntry(habit.journalTopicId!, { title: null, body: "Short one.\nMore detail here." });

  // "excludes soft-deleted entries and ticks outside the window"
  fakeJournal.addEntry(habit.journalTopicId!, { body: "gone", deleted: true });
  ```

- [ ] **Step 6: Verify** — `grep -rn "systems/journal\|journalTopic\.\|journalEntry\." apps/web/src/systems/habits` prints nothing. In `apps/web`: `bun run test`, the integration suite (Global Constraints), `bun run build`, `bun run lint` — all green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(habits): reach the Convex journal through a bridge module"
```

---

### Task 13: Delete the Postgres journal code, the Vercel cron, and `CRON_SECRET`

**Files:**
- Delete: `apps/web/src/systems/journal/routes/`, `apps/web/src/systems/journal/services/`, `apps/web/src/systems/journal/schemas/`, `apps/web/src/app/api/cron/` (route + test), `apps/web/vercel.json`
- Modify: `apps/web/src/systems/journal/manifest.ts`, `apps/web/src/platform/feedback/index.ts` (+ `index.test.ts`), `packages/backend/convex/feedback.ts`, `packages/backend/test/feedback.test.ts`, `apps/web/src/test/db.ts`, `apps/web/src/proxy.ts`, `apps/web/.env.example`

**Interfaces:**
- Produces: no `routes` table in the journal manifest; no public `api.feedback.recordMetric`; web `feedback` exposes only `getAllFeedback()`; `withCleanHabitTables()` truncates only `habit_ticks` and `habits`; `withCleanJournalTables` is gone.

- [ ] **Step 1: Confirm nothing still needs the old code** — `grep -rln "systems/journal/services\|systems/journal/routes\|systems/journal/schemas\|withCleanJournalTables\|feedback.recordMetric\|api.feedback.recordMetric\|CRON_SECRET" apps/web/src packages/backend/convex packages/backend/test`. Expected hits: only the files this task deletes or edits. Anything else means an earlier task missed a call site — stop and report it (BLOCKED) rather than deleting.

- [ ] **Step 2: Delete** — `git rm -r apps/web/src/systems/journal/routes apps/web/src/systems/journal/services apps/web/src/systems/journal/schemas apps/web/src/app/api/cron apps/web/vercel.json`.

- [ ] **Step 3: Manifest** — replace `apps/web/src/systems/journal/manifest.ts` with:

```ts
import { SystemManifest } from "../types";
import * as palette from "./palette";

export const manifest: SystemManifest = {
  name: "journal",
  displayName: "Engineering Journal",
  description: "Daily micro-log of building, learning, and working",

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

- [ ] **Step 4: Feedback without the service key** — in `packages/backend/convex/feedback.ts`, delete the `assertServiceKey` function, its comment block, and the `recordMetric` mutation; update the comment above `record` to `// Records a metric. Internal only — scheduled from other modules' mutations so a metrics failure never fails a user action.`; drop `ConvexError`/`mutation` from the imports if now unused. In `packages/backend/test/feedback.test.ts`, delete the three `recordMetric` tests (the "bad service key", "CRON_SECRET is unset", and "inserts with a numeric recordedAt" ones) and any now-unused imports/env stubs; if the file has no test left for `record`, add:

```ts
test("record inserts a metric with a numeric recordedAt", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.feedback.record, { system: "journal", name: "entry_created", value: 1 });
  const rows = await t.run((ctx) => ctx.db.query("systemMetrics").collect());
  expect(rows).toHaveLength(1);
  expect(typeof rows[0].recordedAt).toBe("number");
});
```

(match the file's existing imports and `modules` glob; import `internal` from `../convex/_generated/api`).

In `apps/web/src/platform/feedback/index.ts`, delete `serviceKey()` and `recordMetric`, drop the `fetchMutation` import, and replace the header comment with `// Feedback reads for the dashboard. Metrics are written inside Convex (internal.feedback.record), never from the web app.`. In `index.test.ts`, delete the "records a metric with the service key" test, the `CRON_SECRET` stub, and the `fetchMutation` mock/import.

- [ ] **Step 5: Test helper, proxy, env example** —
  - `apps/web/src/test/db.ts`: delete `withCleanJournalTables`; make `withCleanHabitTables` run `'TRUNCATE TABLE "habit_ticks", "habits" RESTART IDENTITY CASCADE'`.
  - `apps/web/src/proxy.ts`: in the matcher, remove `api/cron|` from the negative lookahead, and delete the sentence `api/cron keeps its bearer secret.` from the comment above it.
  - `apps/web/.env.example`: delete the three-line `# Cron — …` comment and the `CRON_SECRET=` line.
  - Search living docs for leftovers: `grep -rn "CRON_SECRET\|compute-active-topics\|vercel.json" README.md apps/web/README.md docs/*.md 2>/dev/null`. In `docs/replatform.md` the "Vercel cron + `CRON_SECRET` route" row of the before/after table is history — leave it. Update any setup instructions elsewhere that tell the reader to set `CRON_SECRET`.

- [ ] **Step 6: Verify** — backend: `cd packages/backend && bunx convex codegen && bun run test && bunx convex dev --once`. Web (`apps/web`): `bun run test`, integration suite (journal's integration files are gone, so expect fewer files than the baseline's 14), `bun run build` (no `/api/cron` route in the route list), `bun run lint`. Then on the dev deployment only: `cd packages/backend && bunx convex env list | cut -d= -f1` — if `CRON_SECRET` is listed, run `bunx convex env remove CRON_SECRET` (dev; production is the go-live checklist's job). Never print env values.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web packages/backend
git commit -m "chore(journal): delete the Postgres journal code, the Vercel cron, and CRON_SECRET"
```

---

### Task 14: Rehearse the copy on dev, update the playbook, write the go-live checklist

**Files:**
- Modify: `docs/replatform.md` (§05 Phase 3, §06)
- Create: `docs/superpowers/plans/2026-10-18-phase-3-go-live-checklist.md`

**Interfaces:**
- Consumes: every script from Tasks 8–9; the dev Convex deployment `dev:exciting-wolf-282`; local Docker Postgres (`DATABASE_URL` in `apps/web/.env`).

- [ ] **Step 1: Rehearse on dev with real-shaped data** — from `apps/web`, in order, keeping each command's output for the report:
  1. `bun scripts/seed-journal-rehearsal.ts`
  2. `bun scripts/export-journal.ts` (expect ≈ 6 topics, 1 parent link, ≈ 51 entries)
  3. `cd ../../packages/backend && bun scripts/import-journal.ts ../../apps/web/scripts/out && cd ../../apps/web`
  4. `bun scripts/verify-journal-import.ts` — every line `OK`, exit 0. Count the `OK` lines.
  5. `bun scripts/journal-search-acceptance.ts` — record the summary line (recall %, queries missing nothing). Seeded text is synthetic, so this proves the tooling, not the search; the real-corpus pass is the checklist's Stage 0.
  6. Repeat 3 and 4: every import line reports `inserted=0` and verify is still all `OK` (idempotency).
  7. Clean-slate copy: write an empty file (`: > /tmp/empty.jsonl` is not allowed — use `scripts/out/empty.jsonl` via `printf '' > scripts/out/empty.jsonl`), then from `packages/backend` run, **on dev only (never add `--prod`)**, `bunx convex import --table entryTags --replace -y ../../apps/web/scripts/out/empty.jsonl`, then the same for `journalEntries` and `journalTopics`. If the CLI refuses an empty file, record the exact error and use the Convex dashboard instead (dev deployment → Data → each of the three tables → Clear table), noting that in the report. Then repeat 3 and 4 — import shows everything `inserted=`, verify all `OK`. Record which clearing method worked; the checklist's Stage 0 uses it.

  If any step fails, stop and report BLOCKED with the output — don't patch scripts in this task.

- [ ] **Step 2: Playbook corrections** — in `docs/replatform.md` §06, append after the "Rehearse with real-shaped data" paragraph:

```markdown
**Learned in phase 3 (journal):**

- **Batch by bytes, not just rows.** `bunx convex run` takes its JSON argument
  on the command line, and macOS caps arguments plus environment at 1 MiB.
  Journal bodies are large enough to cross that in 200 rows, so the shared
  driver (`packages/backend/scripts/lib/convexRun.ts`) caps each batch at
  512 KiB as well.
- **A missing export file is an error.** The new driver refuses to treat a
  missing JSONL file as zero rows; exports write every file, empty or not.
- **Join tables are rebuilt on import.** `entryTags` rows are rewritten for
  each imported entry (none for soft-deleted ones), so the verify step checks
  tag counts from the join table against Postgres's `tags` arrays.
- **Search needs a human verdict.** `apps/web/scripts/journal-search-acceptance.ts`
  runs the same queries through both systems and writes a side-by-side report;
  the person who uses the search decides whether the difference is acceptable.
- **Cross-system writers need a bridge.** When one system moves before another
  that writes into it (habits → journal), the writer gets a single bridge module
  on its side (`apps/web/src/systems/habits/services/journalBridge.ts`) calling
  signed-in functions on the new side (`convex/journal/habitBridge.ts`), so its
  tests swap one module and the next phase deletes one module.
```

In §05 "Phase 3 — Journal on Convex (L)", append one paragraph:

```markdown
While habits is still on Postgres (until phase 4), it reaches the journal
through `convex/journal/habitBridge.ts` — signed-in functions called from the
Next server — and a habit's stored `journalTopicId` may be a Convex id or an
imported topic's old cuid (resolved through `legacyId`). Phase 4 turns the
bridge into internal mutations and the import remaps the ids.
```

- [ ] **Step 3: The go-live checklist** — create `docs/superpowers/plans/2026-10-18-phase-3-go-live-checklist.md` with this content, filling the two bracketed rehearsal facts from Step 1:

```markdown
# Go-live checklist — journal on Convex (phase 3)

The journal moves from Postgres to Convex in one merge of `replatform` →
`main`. Habits stays on Postgres and writes into the journal through the
bridge until phase 4. This page is the order of work; it copies the shape of
`2026-10-17-switch-over-checklist.md`.

Production Convex is `rapid-lapwing-153`; dev is `exciting-wolf-282`.
Commands run from `apps/web` unless they say `packages/backend`.

## Secrets

The production database address goes in `~/.config/polaris/journal-switch.env`
(outside the repo, `chmod 600`), as `PROD_DATABASE_URL=…` — the direct Neon
address (the pooled host minus `-pooler`). Load it with
`set -a; . ~/.config/polaris/journal-switch.env; set +a`, pass it as
`DATABASE_URL="$PROD_DATABASE_URL"` to one command at a time, and never print
it. Delete the file when this checklist is done.

## Stage 0 — search check on the real entries (dev; nothing live changes)

Every command here only *reads* production Postgres.

- [ ] Clear dev's journal tables: [method that worked in the rehearsal].
- [ ] Copy production's journal into dev: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/export-journal.ts`,
      then from `packages/backend`: `bun scripts/import-journal.ts ../../apps/web/scripts/out`.
- [ ] Verify: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/verify-journal-import.ts` — every line `OK`.
- [ ] Search check: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/journal-search-acceptance.ts`
      (add `--queries <file>` with searches you actually make, one per line).
      Read `scripts/out/search-acceptance.md`. Expect misses where you
      searched a different form of a word ("tests" vs "test") — Convex matches
      word beginnings, not word stems. Decide: accept, or ask for the fallback
      (a search index in the browser over the whole journal) before going on.
- [ ] Optional: sign in on a local dev server (`bun run dev`) and use the
      journal against the copy — it's your real data on dev.

## Stage 1 — prepare (nothing live changes)

- [ ] `phase-3-journal` merged into `replatform`; every check green there
      (`bun run test`, the integration suite, `bun run build`, `bun run lint`).
- [ ] Back up production Postgres (Docker `postgres:17` image, `pg_dump`, as
      in the 2026-10-17 checklist) to `~/Backups/polaris/`.
- [ ] Push `replatform`; open the PR `replatform` → `main` (merge commit, not
      squash). Wait for the Vercel preview build to pass.

## Stage 2 — go live (don't write journal entries or habit logs from here until the smoke test)

- [ ] Pick a time away from 15:00 UTC (the new nightly job) and 23:00 UTC
      (the old Vercel cron, which fails once the next step removes the
      function it reports to — harmless, but noisy).
- [ ] From `packages/backend`: `bunx convex deploy --yes` — adds the journal
      tables, the bridge, and the nightly job to production; removes
      `feedback.recordMetric`. The live site keeps working on Postgres; its
      journal usage metrics stop being recorded until the merge.
- [ ] Copy: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/export-journal.ts`,
      then from `packages/backend`: `bun scripts/import-journal.ts ../../apps/web/scripts/out --prod`.
- [ ] Verify: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/verify-journal-import.ts --prod` — every line `OK`.
- [ ] Merge the PR. Vercel builds `main`; there is no database migration in
      this release.
- [ ] Top-up copy straight after the deploy is live: export → import `--prod`
      → verify `--prod` again (picks up anything written to Postgres between
      the copy and the merge). Every line `OK`. **No more copies after
      this** — a copy would overwrite edits made in Convex.

## Stage 3 — after it's live

- [ ] Smoke test: Today page shows today's entries; write an entry with a
      `#tag`; tick a task checkbox; edit the entry; delete it; open a topic,
      flip the sort; tags page and a tag page; search a word; ⌘K finds a
      topic and a note (and drills into a topic); dashboard journal card;
      habits: log from the tracker, see it under the habit's topic and as a
      diamond in the habit's row; rename a habit and see the topic renamed.
- [ ] Vercel → Settings → Cron Jobs: none left. Vercel → Environment
      Variables: delete `CRON_SECRET` (Production and Preview).
- [ ] From `packages/backend`: `bunx convex env remove CRON_SECRET --prod`.
- [ ] The day after: the dashboard's System health shows a new
      `active topic count` metric after 15:00 UTC.
- [ ] Delete `~/.config/polaris/journal-switch.env` and `apps/web/scripts/out/`.
      The backup stays.

## If something goes wrong

- **Before the merge:** the live site still runs on Postgres. Production
  Convex has extra journal tables, which is harmless; repeated copies are
  safe (keyed on the old ids). To bring back `feedback.recordMetric` for the
  old site, run `bunx convex deploy --yes` from a checkout of `main`.
- **After the merge:** Vercel → Deployments → the previous production
  deployment → Instant Rollback, then `bunx convex deploy --yes` from a
  checkout of the pre-merge `main` so the old site's metric calls work again.
  Postgres still has every journal row up to the top-up copy; entries written
  in Convex after the merge have to be copied back by hand (there will be few).

## Rehearsal record

Dev rehearsal on [date]: [counts and results from Task 14 Step 1 — verify
OK-line count, idempotent rerun, clean-slate copy, acceptance summary].
```

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: phase 3 playbook notes and go-live checklist"
```

---

## After the last task (controller)

- Final whole-branch review over `git merge-base replatform HEAD`..HEAD on the most capable model, pointed at the ledger's deferred minors.
- Then `superpowers:finishing-a-development-branch` (target: `replatform`; never `main`).
- The user runs the go-live checklist; Stage 0 needs their production database address.
