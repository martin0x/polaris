# Phase 2 UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three post-smoke UX fixes on the expenses-on-Convex work: (1) move the flickery capture-page "N unsynced" badge into the TitleBar sync status beside the email, with a whole-loop spinner and a hover card listing pending changes; (2) live UI validation on the amount input, including the ₱1,000,000 backend cap; (3) eliminate the list flash when starting an activity — the click should feel like an immediate redirect.

**Architecture:** A `SyncStatusProvider` (client context, mounted once in the root layout, same shape as `SidebarChrome`'s provider-plus-titlebar-island pattern) collects in-flight mutations via `track(promise, label)`; a `SyncIndicator` client island replaces the TitleBar's static sync dot and shows: success dot when idle, a spinner while syncing that stops only on an `animationiteration` boundary (guaranteeing ≥1 full loop), a `{n} unsynced` label, and a hover card (modeled on `.habit-popover`, using the `--z-popover` token) listing pending labels. `CapturePage` drops its local counter/badge and registers ops with labels. Amount validation gains a pure `validatePesoInput` helper in `@polaris/core/money` (format + max cap) consumed live by `ItemComposer` and `ItemRow`. The start-flow flash dies via a small `ActivitiesHome` client coordinator: `StartButtons` reports the new id before navigating (and stays disabled through navigation), `ActivityList` hides that id until the route change unmounts the page.

**Tech Stack:** Next.js 16.2.4 (pinned), Convex ^1.44, React 19 client components, CSS tokens in `apps/web/src/app/globals.css`, Vitest (pure-logic tests only — no DOM test infra exists; do not add any).

**Spec:** The user's three fix requests (verbatim in this plan's task intros) + `docs/design/polaris-design-system.md` (motion: `--dur-*`/`--ease-*` tokens, "no ambient motion", capsules rule, popovers at `--shadow-md`; error copy: name the failure, name the recovery).

## Global Constraints

- Branch `phase-2-ux-fixes` in worktree `.claude/worktrees/phase-2-ux-fixes`, off `replatform`; merge back to `replatform` only. **Never commit to `main` or push anywhere.**
- Bun toolchain only (`bun run test`, never `bun test`). Next 16 docs live in `apps/web/node_modules/next/dist/docs/` — consult before touching page/layout conventions.
- Design system binds all UI: tokens never raw values, sentence case, no emoji, hover = `--bg-hover` never opacity, popover at `--shadow-md` + `--bg-raised` + `--r-lg`, new keyframes get a matching `@media (prefers-reduced-motion: reduce)` block (house pattern), capsules keep `--r-full` + wash/solid background.
- No new test infrastructure: web tests stay pure-logic / `renderToStaticMarkup`; interaction behavior is verified by build + review + user smoke.
- Verification gate per web task: `cd apps/web && bun run build` clean; repo-root `bun run test` green. Interactive browser smoke is the user's (no Google sign-in from agents).
- Conventional commits, one per task, ending with the Claude Co-Authored-By line.

## File Structure

```
packages/core/src/money.ts                       # + MAX_AMOUNT_CENTAVOS, validatePesoInput (Task 1)
packages/core/src/money.test.ts                  # + validation tests
apps/web/src/systems/expenses/components/ItemComposer.tsx  # live validation (Task 1)
apps/web/src/systems/expenses/components/ItemRow.tsx       # live validation (Task 1)
apps/web/src/app/_components/SyncStatus.tsx      # provider + hooks (Task 2)
apps/web/src/app/_components/SyncIndicator.tsx   # titlebar island (Task 2)
apps/web/src/app/_components/TitleBar.tsx        # swap static dot for island (Task 2)
apps/web/src/app/layout.tsx                      # mount provider (Task 2)
apps/web/src/app/(systems)/layout.tsx            # drop dead syncState prop (Task 2)
apps/web/src/app/(platform)/layout.tsx           # drop dead syncState prop (Task 2)
apps/web/src/app/globals.css                     # spinner + popover CSS, --dur-spin token; delete .exp-unsynced (Tasks 2–3)
apps/web/src/systems/expenses/components/CapturePage.tsx   # track via provider, badge gone (Task 3)
apps/web/src/systems/expenses/components/ActivitiesHome.tsx # new coordinator (Task 4)
apps/web/src/systems/expenses/components/StartButtons.tsx   # onStarted/onStartFailed, stay disabled (Task 4)
apps/web/src/systems/expenses/components/ActivityList.tsx   # hideId filter (Task 4)
apps/web/src/app/(systems)/expenses/page.tsx     # compose ActivitiesHome (Task 4)
```

## Worktree setup (before Task 1)

- [ ] From `/Users/raymartvillos/Projects/polaris` (on `replatform`, clean):

```bash
git worktree add .claude/worktrees/phase-2-ux-fixes -b phase-2-ux-fixes replatform
cd .claude/worktrees/phase-2-ux-fixes
bun install
for f in packages/backend/.env.local apps/web/.env; do
  cp "/Users/raymartvillos/Projects/polaris/$f" "$f"
done
```

- [ ] Baseline: `bun run test` green (core 80 / backend 62 / web 50). Commit this plan file on the branch.

---

### Task 1: Amount validation — pure helper + live UI

> User request: "Add UI number validation on the amount."

Today both amount inputs accept any text and only flag on submit, and there is **no upper-bound check**: an amount over the backend cap (100,000,000 centavos = ₱1,000,000) passes `parsePesoInput`'s regex, the mutation rejects, and the optimistic item silently vanishes. Fix: validate live as the user types, including the cap.

**Files:**
- Modify: `packages/core/src/money.ts`, `packages/core/src/money.test.ts`
- Modify: `apps/web/src/systems/expenses/components/ItemComposer.tsx`, `apps/web/src/systems/expenses/components/ItemRow.tsx`

**Interfaces:**
- Produces: `MAX_AMOUNT_CENTAVOS = 100_000_000`; `validatePesoInput(raw: string): { ok: true; centavos: number } | { ok: false; reason: "format" | "max" }`. `parsePesoInput` unchanged.

- [ ] **Step 1: Failing tests** — append to `packages/core/src/money.test.ts`:

```ts
describe("validatePesoInput", () => {
  it("accepts valid amounts", () => {
    expect(validatePesoInput("89.50")).toEqual({ ok: true, centavos: 8950 });
    expect(validatePesoInput("1,000")).toEqual({ ok: true, centavos: 100_000 });
    expect(validatePesoInput("1000000.00")).toEqual({ ok: true, centavos: 100_000_000 });
  });
  it("rejects malformed input as format errors", () => {
    for (const raw of ["", "abc", "1.234", "-5", "1..2"]) {
      expect(validatePesoInput(raw)).toEqual({ ok: false, reason: "format" });
    }
  });
  it("rejects amounts over the backend cap", () => {
    expect(validatePesoInput("1000000.01")).toEqual({ ok: false, reason: "max" });
    expect(validatePesoInput("9999999")).toEqual({ ok: false, reason: "max" });
  });
});
```

- [ ] **Step 2: Verify failure** — `cd packages/core && bun run test`. Expected: FAIL (not exported).

- [ ] **Step 3: Implement** — append to `packages/core/src/money.ts`:

```ts
/** Cap on a single expense item, matching the backend validator. */
export const MAX_AMOUNT_CENTAVOS = 100_000_000;

export function validatePesoInput(
  raw: string
): { ok: true; centavos: number } | { ok: false; reason: "format" | "max" } {
  const centavos = parsePesoInput(raw);
  if (centavos === null) return { ok: false, reason: "format" };
  if (centavos > MAX_AMOUNT_CENTAVOS) return { ok: false, reason: "max" };
  return { ok: true, centavos };
}
```

- [ ] **Step 4: Tests pass** — `bun run test` in packages/core.

- [ ] **Step 5: Wire `ItemComposer`** — replace the `invalidPrice` submit-time flag with live validation. Data layer only; JSX/classes/refs stay:

```tsx
import { validatePesoInput } from "@polaris/core/money";
// state: replace `invalidPrice` with:
const [submitted, setSubmitted] = useState(false);
const validation = validatePesoInput(price);
// live: red border while non-empty and invalid; after a failed submit, also when empty
const invalid = (price.trim() !== "" && !validation.ok) || (submitted && !validation.ok);

function submit() {
  if (!name.trim()) {
    nameRef.current?.focus();
    return;
  }
  if (!validation.ok) {
    setSubmitted(true);
    priceRef.current?.focus();
    return;
  }
  onAdd(name.trim(), validation.centavos);
  setName("");
  setPrice("");
  setSubmitted(false);
  nameRef.current?.focus();
}
```

On the price `<input>`: `data-invalid={invalid}`, `aria-invalid={invalid || undefined}`, and `title={!validation.ok && validation.reason === "max" ? "Amounts go up to ₱1,000,000.00" : undefined}`. `onChange` sets price and `setSubmitted(false)`.

- [ ] **Step 6: Wire `ItemRow`** edit mode the same way: derive `const validation = validatePesoInput(price)` and a live `invalid` (non-empty && !ok, or save attempted && !ok — reuse the existing `invalid` state as the "save attempted" flag: `setInvalid(true)` in `save()` when `!name.trim() || !validation.ok`, reset on change). Drive `data-invalid`, the existing conditional border style, `aria-invalid`, and the same `title` for the max reason. `save()` uses `validation.centavos`.

- [ ] **Step 7: Verify** — repo-root `bun run test`; `cd apps/web && bun run build`.

- [ ] **Step 8: Commit** — `feat(expenses): live amount validation with the ₱1,000,000 cap`

---

### Task 2: Global sync status in the TitleBar

> User request: "put everything unsynced under the sync status beside the email at the top … the animation between unsynced to sync be a loading circle while syncing and does at least one loop for a sync … unsynced data info will live inside the hover on the unsynced status."

The TitleBar's sync dot is currently cosmetic (`syncState="ok"` hardcoded in both layouts; the "offline" branch is dead). Replace it with a real indicator driven by a provider. Pattern precedent: `SidebarChrome.tsx` (client provider + client island inside the server-rendered TitleBar).

**Files:**
- Create: `apps/web/src/app/_components/SyncStatus.tsx`, `apps/web/src/app/_components/SyncIndicator.tsx`
- Modify: `apps/web/src/app/_components/TitleBar.tsx` (drop `syncState` prop + static dot/label spans, render `<SyncIndicator />` in their place — email/divider stay), `apps/web/src/app/layout.tsx` (mount `SyncStatusProvider` inside `ConvexClientProvider`, unconditionally — the island is provider-optional), `apps/web/src/app/(systems)/layout.tsx` + `apps/web/src/app/(platform)/layout.tsx` (stop passing `syncState`), `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: `SyncStatusProvider`, `useSyncStatus()` (throws outside provider), `useSyncStatusOptional()` (null-safe), `track(promise: Promise<unknown>, label: string): void`, `pending: Array<{ id: number; label: string }>`. Task 3 consumes `useSyncStatus`.

- [ ] **Step 1: `SyncStatus.tsx`** (provider — full file):

```tsx
"use client";

// Global sync registry: mutations register in-flight work here and the
// TitleBar indicator renders it. State lives here because the TitleBar and
// the page content sit in different branches of the server-rendered layout
// tree (same shape as SidebarChrome).

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export interface PendingOp {
  id: number;
  label: string;
}

interface SyncStatusValue {
  pending: PendingOp[];
  track: (promise: Promise<unknown>, label: string) => void;
}

const Ctx = createContext<SyncStatusValue | null>(null);

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingOp[]>([]);
  const nextId = useRef(0);

  const track = useCallback((promise: Promise<unknown>, label: string) => {
    const id = nextId.current++;
    setPending((ops) => [...ops, { id, label }]);
    promise
      // A rejected mutation rolls its optimistic write back on its own.
      .catch((err) => console.error("sync: change rejected", err))
      .finally(() => setPending((ops) => ops.filter((op) => op.id !== id)));
  }, []);

  const value = useMemo(() => ({ pending, track }), [pending, track]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSyncStatus(): SyncStatusValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSyncStatus must be used within SyncStatusProvider");
  return ctx;
}

/** Like useSyncStatus, but null outside a provider (e.g. signed-out chrome). */
export function useSyncStatusOptional(): SyncStatusValue | null {
  return useContext(Ctx);
}
```

- [ ] **Step 2: `SyncIndicator.tsx`** (island — full file):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSyncStatusOptional } from "./SyncStatus";

// The TitleBar's sync state. Idle: the success dot. While mutations are in
// flight: a spinner that only ever stops on an animation-iteration boundary,
// so even a fast sync shows at least one full loop instead of a flicker. The
// pending changes are listed in a hover card.
export function SyncIndicator() {
  const sync = useSyncStatusOptional();
  const pending = sync?.pending ?? [];
  const [spinning, setSpinning] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (pending.length > 0) setSpinning(true);
  }, [pending.length]);

  // Reduced motion and hidden tabs never fire animationiteration; a timer
  // fallback keeps the spinner state from sticking.
  useEffect(() => {
    if (!spinning || pending.length > 0) return;
    const t = setTimeout(() => setSpinning(false), 1000);
    return () => clearTimeout(t);
  }, [spinning, pending.length]);

  const syncing = pending.length > 0 || spinning;

  return (
    <span
      className="sync-status"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {syncing ? (
        <span
          className="sync-spinner"
          onAnimationIteration={() => {
            if (pending.length === 0) setSpinning(false);
          }}
        />
      ) : (
        <span className="sync-dot" />
      )}
      <span className="sync-label">
        {pending.length > 0 ? `${pending.length} unsynced` : syncing ? "syncing" : "synced"}
      </span>
      {hover && pending.length > 0 && (
        <span className="sync-popover" role="status">
          {pending.slice(0, 8).map((op) => (
            <span key={op.id} className="sync-popover-row">
              {op.label}
            </span>
          ))}
          {pending.length > 8 && (
            <span className="sync-popover-row">and {pending.length - 8} more</span>
          )}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 3: TitleBar swap.** In `TitleBar.tsx`, delete the `syncState` prop from the interface and the two spans (`.sync-dot` with its inline background + `.sync-label` ternary); render `<SyncIndicator />` in their position (before the email divider). TitleBar stays a server component — `SyncIndicator` is a client island exactly like `SidebarToggle`. In both group layouts, remove `syncState="ok"`.

- [ ] **Step 4: Mount the provider** in `apps/web/src/app/layout.tsx`: wrap children with `<SyncStatusProvider>` directly inside `<ConvexClientProvider>` (NOT gated on `isAuthenticated` — the island falls back to the static dot when idle either way).

- [ ] **Step 5: CSS** — in `globals.css`: add to the Motion token block:

```css
  --dur-spin: 800ms; /* sync spinner loop — the indicator stops only on whole loops */
```

Next to the `.titlebar .sync-dot` rule (which keeps its 7px `--success` styling and loses nothing — the inline background override is gone with the TitleBar edit), add:

```css
.titlebar .sync-status {
  position: relative;
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.titlebar .sync-spinner {
  width: 9px;
  height: 9px;
  border-radius: var(--r-full);
  border: 1.5px solid var(--border-strong);
  border-top-color: var(--accent);
  animation: sync-spin var(--dur-spin) linear infinite;
}
@keyframes sync-spin {
  to { transform: rotate(360deg); }
}
.sync-popover {
  position: absolute;
  top: calc(100% + var(--sp-1));
  right: 0;
  z-index: var(--z-popover);
  min-width: 200px;
  max-width: 280px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-md);
  padding: var(--sp-2) var(--sp-3);
}
.sync-popover-row {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (prefers-reduced-motion: reduce) {
  .titlebar .sync-spinner {
    animation: none;
    border-color: var(--accent);
  }
}
```

(The phone breakpoint already hides `.sync-label` and keeps the dot; the spinner inherits that behavior since only the label is hidden.)

- [ ] **Step 6: Verify** — `cd apps/web && bun run build`; repo-root `bun run test`.

- [ ] **Step 7: Commit** — `feat(web): global sync status in the titlebar with whole-loop spinner`

---

### Task 3: CapturePage registers with the global sync status

**Files:**
- Modify: `apps/web/src/systems/expenses/components/CapturePage.tsx`
- Modify: `apps/web/src/app/globals.css` (delete the now-dead `.exp-unsynced` rule, lines ~1004–1013)

**Interfaces:**
- Consumes: `useSyncStatus()` from Task 2 (`track(promise, label)`).

- [ ] **Step 1:** In `CapturePage.tsx`: delete the local `pending` state and the local `track()` helper; delete the `{pending > 0 && <span className="exp-unsynced">…}` badge from the header JSX. Add `const { track } = useSyncStatus();` (hook stays above the null guard with the others). Re-point the four call sites with labels (`formatCentavos` is already imported):

```tsx
// addItem:
track(putItem({ activityId: activity.id, clientId, name, amountCentavos, position }),
  `${name} — ${formatCentavos(amountCentavos)}`);
// editItem:
track(putItem({ … }), `${name} — ${formatCentavos(amountCentavos)}`);
// deleteItem (look up the name before tracking):
const target = items.find((i) => i.clientId === id);
track(removeItem({ activityId: activity.id, clientId: id }),
  `Delete ${target?.name ?? "item"}`);
// saveTitle:
track(updateActivity({ id: activity.id, title: next }), "Activity title");
```

The `console.error` on rejection now lives in the provider — remove the local `.catch`.

- [ ] **Step 2:** Delete the `.exp-unsynced` rule from `globals.css` and grep to confirm zero remaining users.

- [ ] **Step 3: Verify** — `cd apps/web && bun run build`; repo-root `bun run test`.

- [ ] **Step 4: Commit** — `feat(expenses): capture syncs report to the titlebar status`

---

### Task 4: Start flow — immediate redirect, no list flash

> User request: "Clicking an activity should redirect to the page immediately. The behavior now is that it adds it to the list first before redirection which looks bad."

Cause: `start` writes to the same `api.expenses.activities.list` subscription `ActivityList` holds, so the new row streams into the index list while `router.push` is still fetching the capture page. Fix: a client coordinator hides the just-started id until navigation unmounts the page; the start button stays disabled through the navigation (it currently re-enables in `finally` before the transition lands).

**Files:**
- Create: `apps/web/src/systems/expenses/components/ActivitiesHome.tsx`
- Modify: `apps/web/src/systems/expenses/components/StartButtons.tsx`, `apps/web/src/systems/expenses/components/ActivityList.tsx`, `apps/web/src/app/(systems)/expenses/page.tsx`

**Interfaces:**
- Produces: `ActivitiesHome({ types: Array<{ id: string; name: string }>, preloaded: Preloaded<typeof api.expenses.activities.list> })`; `StartButtons` gains optional `onStarted?: (id: string) => void` and `onStartFailed?: () => void`; `ActivityList` gains optional `hideId?: string`. The dashboard's `StartButtons` usage (no new props) is unchanged.

- [ ] **Step 1: `StartButtons`** — new props threaded into `start()`; error copy and empty state stay verbatim:

```tsx
async function start(typeId: string) {
  setStartingId(typeId);
  setError(null);
  try {
    const id = await startActivity({ typeId: typeId as Id<"expenseActivityTypes"> });
    onStarted?.(id);
    router.push(`/expenses/${id}`);
    // Stay disabled while the route transition lands; unmount resets state.
  } catch {
    setError("Could not start the activity. Check your connection and try again.");
    onStartFailed?.();
    setStartingId(null);
  }
}
```

(The `finally` block goes away — this also fixes the ledgered brief-re-enable nit.)

- [ ] **Step 2: `ActivityList`** — accept `hideId`, filter before grouping and before the empty-state check:

```tsx
export function ActivityList({ preloaded, hideId }: { preloaded: Preloaded<typeof api.expenses.activities.list>; hideId?: string }) {
  const { activities } = usePreloadedQuery(preloaded);
  const visible = hideId ? activities.filter((a) => a.id !== hideId) : activities;
  // …groupByMonth(visible), empty state on visible.length…
```

- [ ] **Step 3: `ActivitiesHome.tsx`** (full file):

```tsx
"use client";

// Coordinates the start flow: while a just-started activity is navigating,
// its row is hidden so the list doesn't flash before the redirect lands.

import { useState } from "react";
import type { Preloaded } from "convex/react";
import type { api } from "@polaris/backend/convex/_generated/api";
import { ActivityList } from "./ActivityList";
import { StartButtons } from "./StartButtons";

export function ActivitiesHome({
  types,
  preloaded,
}: {
  types: Array<{ id: string; name: string }>;
  preloaded: Preloaded<typeof api.expenses.activities.list>;
}) {
  const [pendingStartId, setPendingStartId] = useState<string | null>(null);
  return (
    <>
      <StartButtons
        types={types}
        onStarted={setPendingStartId}
        onStartFailed={() => setPendingStartId(null)}
      />
      <ActivityList preloaded={preloaded} hideId={pendingStartId ?? undefined} />
    </>
  );
}
```

- [ ] **Step 4: Page** — `apps/web/src/app/(systems)/expenses/page.tsx` replaces the two components with `<ActivitiesHome types={…} preloaded={preloadedActivities} />` (same props data; surrounding `article.doc` JSX stays).

- [ ] **Step 5: Full verification matrix** — repo-root `bun run test`; `DATABASE_URL_TEST=postgresql://polaris:polaris@localhost:5440/polaris_test bun run test:integration`; `cd apps/web && bun run build && bun run lint`.

- [ ] **Step 6: Commit** — `feat(expenses): immediate redirect on start — no list flash`

---

## Exit criteria

1. Capture page has no unsynced badge; the TitleBar indicator spins whole loops while ops are in flight and lists them on hover.
2. Amount inputs flag invalid text and over-cap amounts as the user types; submits with invalid amounts are blocked.
3. Starting an activity never shows the new row on the index list before the redirect; the button stays disabled until navigation.
4. Full matrix green (unit, integration, build, lint). Merge to `replatform` only; user smoke afterwards.

## Self-review notes

- Spinner ≥1-loop guarantee: stop only happens in `onAnimationIteration` (whole-loop boundary) or the 1s fallback (reduced motion / hidden tab, itself > one 800ms loop).
- `SyncIndicator` uses the optional hook so signed-out chrome (TitleBar renders before auth in some states) never throws.
- `validatePesoInput("1000000.00")` is exactly the cap → ok (backend allows ≤ 100,000,000).
- Dashboard `StartButtons` gets no new props — both callbacks optional; its flow (no adjacent reactive list) is unchanged.
- `hideId` never sticks: success path unmounts the page on navigation; failure path clears via `onStartFailed`.
