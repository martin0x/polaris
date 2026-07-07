# Command Palette Design Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the already-shipped global command palette up to the v1 spec's interaction contract and the committed design reference (`docs/design/palette-v1-reference/`).

**Architecture:** The palette is fully implemented (`src/platform/palette/` + `/api/platform/palette/search` + `.palette-*` CSS). This plan fixes two behavioral spec deviations server-side (systems can't be opened with Enter; opening the palette fan-outs a wall of recents), rewrites `PaletteModal.tsx` markup and the `.palette-*` CSS section to the design reference, and adds the spec's optional ⌘K hint to the TitleBar. No schema, no new routes, no new dependencies.

**Tech Stack:** Next.js 16.2.4 App Router, React 19, TypeScript, Vitest, Bun (`bun run …`, never npm/npx), Prisma 7 (untouched here).

## Global Constraints

- **Design system:** tokens only, never raw hex/px colors (`docs/design/README.md` — read it before Tasks 3–4). Sentence case; no emoji in chrome; icons via `Icon` from `@/app/_components/Icon` (stroke 1.5, `currentColor`); hover = background color change, never opacity; unicode glyphs allowed only inside `kbd` chips because they are the keys (`⌘`, `↵`, `⇥`, `⌫`).
- **Spec copy verbatim** (from `docs/superpowers/specs/2026-04-26-global-command-palette-design.md`): hint `Type to search systems and entities · Tab to drill in · Enter to open.` — zero-result copy `No matches in any system.` (top level) and `No matching <layerName>.` (scoped).
- **Next.js 16 has breaking changes** from training data — if you touch anything Next-specific beyond this plan's code, read `node_modules/next/dist/docs/` first (AGENTS.md rule). Nothing in this plan needs new Next APIs.
- **Commands:** unit tests `bun run test`, integration tests `bun run test:integration` (requires Postgres up: `docker compose -f docker/docker-compose.yml up -d`, and `DATABASE_URL_TEST` set in `.env`), lint `bun run lint`, type-check via `bun run build`.
- **Commits:** one per task, directly on `main`, conventional style (`feat(palette): …`), body ends with `Co-Authored-By:` trailer per harness rules.
- **Dev-server CSS gotcha:** Turbopack's persistent cache can serve stale CSS after `globals.css` edits. If a CSS change doesn't appear, `rm -rf .next` and restart — verify by grepping the served chunk, not by re-editing the source.

---

### Task 1: `MatchedSystem.href` — systems become openable

The spec says systems are "navigable by their top-level system name (autocomplete + Enter opens `nav.href`)", but `MatchedSystem` doesn't carry an href, so the modal can't navigate to a system at all (today Enter on a system drills instead — the modal fix lands in Task 3; this task makes the data available and tested).

**Files:**
- Modify: `src/platform/palette/types.ts` (the `MatchedSystem` interface)
- Modify: `src/platform/palette/registry.ts` (both return branches of `matchSystems`)
- Modify: `src/platform/palette/registry.ts` — the `PaletteRegistry` interface's `matchSystems` return type
- Test: `src/platform/palette/__tests__/registry.test.ts`
- Test: `src/platform/palette/__tests__/resolver.test.ts` (fixture + one `toEqual` assertion gain the field)

**Interfaces:**
- Consumes: `SystemManifest.nav.href` (exists: journal `/journal`, expenses `/expenses`).
- Produces: `MatchedSystem` now includes `href: string`; `registry.matchSystems(q)` returns `Array<{ name: string; displayName: string; icon?: IconName; href: string }>`. The API response's `matchedSystems[]` entries therefore carry `href` (Task 3's modal navigates with it).

- [ ] **Step 1: Write the failing test**

Append to the `describe("buildPaletteRegistry", …)` block in `src/platform/palette/__tests__/registry.test.ts`:

```ts
  it("matchSystems includes each system's nav href", () => {
    const reg = buildPaletteRegistry([journal, budgeting, settings]);
    expect(reg.matchSystems("").map((s) => s.href).sort()).toEqual([
      "/budgeting",
      "/journal",
    ]);
    expect(reg.matchSystems("engin")[0].href).toBe("/journal");
  });
```

(The existing `manifest()` fixture already sets `nav.href` to `` `/${opts.name}` ``.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/platform/palette/__tests__/registry.test.ts`
Expected: FAIL — `s.href` is `undefined` (property doesn't exist yet), so the sorted array is `[undefined, undefined]`.

- [ ] **Step 3: Implement**

In `src/platform/palette/types.ts`, add `href` to `MatchedSystem`:

```ts
export interface MatchedSystem {
  name: string;
  displayName: string;
  icon?: IconName;
  href: string;
  layers: Array<{ name: string; singular: string }>;
}
```

In `src/platform/palette/registry.ts`, update the interface:

```ts
export interface PaletteRegistry {
  getSystem(name: string): { manifest: SystemManifest; palette: PaletteSystemConfig } | null;
  matchSystems(query: string): Array<{ name: string; displayName: string; icon?: IconName; href: string }>;
  allLayers(): FlatLayer[];
}
```

and both `matchSystems` branches:

```ts
    matchSystems(query) {
      const q = query.toLowerCase();
      if (!q) {
        return withPalette.map((m) => ({
          name: m.name,
          displayName: m.displayName,
          icon: m.nav.icon as IconName,
          href: m.nav.href,
        }));
      }
      return manifests
        .filter((m) => m.name.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q))
        .map((m) => ({
          name: m.name,
          displayName: m.displayName,
          icon: m.nav.icon as IconName,
          href: m.nav.href,
        }));
    },
```

- [ ] **Step 4: Fix the resolver test fixture**

`src/platform/palette/__tests__/resolver.test.ts` fakes a registry; its `matchSystems` must now return `href` too. In `makeRegistry`, change the final `return subset.map(...)`:

```ts
      return subset.map((s) => ({
        name: s.name,
        displayName: s.displayName,
        icon: s.icon as never,
        href: `/${s.name}`,
      }));
```

And the first test's exact assertion (`it("top-level query: returns matchedSystems with layer metadata + ranked cross-system results")`) uses `toEqual` on the full object — add the field:

```ts
    expect(out.matchedSystems).toEqual([
      {
        name: "journal",
        displayName: "Engineering Journal",
        icon: undefined,
        href: "/journal",
        layers: [
          { name: "topics", singular: "topic" },
          { name: "notes", singular: "note" },
        ],
      },
    ]);
```

- [ ] **Step 5: Run the full unit suite**

Run: `bun run test`
Expected: PASS (all palette + systems + journal + expenses unit tests green).

- [ ] **Step 6: Commit**

```bash
git add src/platform/palette/types.ts src/platform/palette/registry.ts src/platform/palette/__tests__/registry.test.ts src/platform/palette/__tests__/resolver.test.ts
git commit -m "feat(palette): carry each system's nav href in matchSystems

Systems in the palette could only be drilled into, never opened —
the spec says Enter on a system opens its nav.href. This makes the
href available to the client; the modal starts using it in the
design-refresh task.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Skip the layer fan-out on an empty top-level query

Opening the palette currently runs every layer with `query: ""`, so the first paint is a 30-row wall of recents — the spec explicitly excludes recents from v1, and the design reference lands on "systems + hint" as the opening state. Short-circuit in the resolver: empty top-level query returns matched systems and no results (also saves 3 DB queries per palette open). Scoped empty queries still run their layer (drilling into Journal should list recent topics).

**Files:**
- Modify: `src/platform/palette/resolver.ts` (top-level branch only)
- Test: `src/platform/palette/__tests__/resolver.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `resolveQuery(registry, { query: "" })` (no scope) → `{ matchedSystems, results: [] }` without calling any `layer.search`. Scoped behavior unchanged. The modal (Task 3) relies on this: its empty-query top-level render is systems group + hint.

- [ ] **Step 1: Write the failing test**

Append to the `describe("resolveQuery", …)` block in `src/platform/palette/__tests__/resolver.test.ts`:

```ts
  it("empty top-level query does not call any layer search", async () => {
    const search = vi.fn(async () => [] as PaletteResult[]);
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [{ name: "topics", singular: "topic", search }],
        },
      ],
    });
    const out = await resolveQuery(reg, { query: "   " });
    expect(search).not.toHaveBeenCalled();
    expect(out.matchedSystems).toHaveLength(1);
    expect(out.results).toEqual([]);
  });

  it("scoped empty query still calls the layer (layer defaults)", async () => {
    const search = vi.fn(async () => [
      { id: "t1", label: "Polaris", href: "/x" } as PaletteResult,
    ]);
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [{ name: "topics", singular: "topic", search }],
        },
      ],
    });
    const out = await resolveQuery(reg, {
      query: "",
      scope: { systemName: "journal", layerIndex: 0, parentId: null },
    });
    expect(search).toHaveBeenCalledWith("", null);
    expect(out.results).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/platform/palette/__tests__/resolver.test.ts`
Expected: the first new test FAILS (`search` was called once); the second already passes (guards the behavior we must not break).

- [ ] **Step 3: Implement**

In `src/platform/palette/resolver.ts`, inside the `if (!scope)` branch, immediately after `matchedSystems` is built and before the `layerHits` fan-out:

```ts
    if (!query.trim()) {
      return { matchedSystems, results: [] };
    }
```

- [ ] **Step 4: Run unit + integration tests**

Run: `bun run test`
Expected: PASS. (The existing "empty top-level query: returns all matched systems with layers" test asserted `results: []` already.)

Run: `docker compose -f docker/docker-compose.yml up -d && bun run test:integration`
Expected: PASS — the route test "top-level empty query lists matched systems with layers" asserts `matchedSystems` only, unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/platform/palette/resolver.ts src/platform/palette/__tests__/resolver.test.ts
git commit -m "feat(palette): open with systems and hint, not a wall of recents

Empty top-level query no longer fans out to every layer. Recents are
explicitly out of scope for v1; the opening state per the design
reference is the systems group plus the hint line. Saves three DB
queries per palette open. Scoped empty queries still return layer
defaults so drilling stays browsable.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Restyle `PaletteModal` to the design reference (markup + CSS)

One atomic task — the new markup and its CSS ship together (split, either half leaves the modal broken). Open `docs/design/palette-v1-reference/index.html` in a browser (or its `?state=` presets) and match it. Behavior changes bundled here because they live in the same render path: Enter/click on a system navigates (Tab drills), short placeholders, spec hint/empty copy, provenance meta only at top level, key chips on the selected row, scope trail with pop affordance, loading dot, scroll-into-view, `aria-activedescendant`.

**Files:**
- Modify: `src/platform/palette/client/PaletteModal.tsx` (full rewrite below)
- Modify: `src/app/globals.css` — replace the `/* Command palette --- */` section (currently lines ~1150–1228, between the `.notfound`-adjacent block above and the `/* ===== Narrow viewports ===== */` banner below; locate by the section comment, not line numbers)
- Test: none (component tests explicitly skipped in the spec §7; verified by Task 5's authenticated smoke)

**Interfaces:**
- Consumes: `MatchedSystem.href` (Task 1), empty-top-level `{ matchedSystems, results: [] }` (Task 2), `PaletteScopeFrame.parentLabel` (exists), global `kbd` chip styling in `globals.css` (exists at the `kbd, .kbd` rule).
- Produces: nothing consumed by later tasks except the CSS section, which Task 4 appends `.palette-trigger` to.

- [ ] **Step 1: Confirm token prerequisites**

Run: `grep -n -- "--r-full\|--ease-in-out" src/app/globals.css`
Expected: both tokens exist (they are part of the ported token set). If either is genuinely missing, add it to the token block at the top of `globals.css` copying the value from `docs/design/tokens-reference.css`, with a one-line comment — do not inline a raw value.

- [ ] **Step 2: Replace `src/platform/palette/client/PaletteModal.tsx` with:**

```tsx
"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/app/_components/Icon";
import type { MatchedSystem, PaletteResultWithMeta } from "../types";
import type { PaletteScopeFrame } from "./PaletteProvider";

interface PaletteModalProps {
  onClose: () => void;
}

interface PaletteResponse {
  results: PaletteResultWithMeta[];
  matchedSystems?: MatchedSystem[];
}

type SelectableItem =
  | { kind: "system"; system: MatchedSystem }
  | { kind: "result"; result: PaletteResultWithMeta };

const DEBOUNCE_MS = 150;

export function PaletteModal({ onClose }: PaletteModalProps) {
  const [query, setQuery] = useState("");
  const [scopeStack, setScopeStack] = useState<PaletteScopeFrame[]>([]);
  const [results, setResults] = useState<PaletteResultWithMeta[]>([]);
  const [matchedSystems, setMatchedSystems] = useState<MatchedSystem[] | undefined>(undefined);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cache of all palette-bearing systems' layer metadata. Populated on mount
  // and used for Tab-drill lookups even when the current scoped response no
  // longer contains matchedSystems.
  const systemsCatalogRef = useRef<Map<string, MatchedSystem>>(new Map());

  const currentScope = scopeStack[scopeStack.length - 1];
  const emptyQuery = query.trim() === "";

  const selectable = useMemo<SelectableItem[]>(() => {
    const items: SelectableItem[] = [];
    if (!currentScope && matchedSystems) {
      for (const s of matchedSystems) items.push({ kind: "system", system: s });
    }
    for (const r of results) items.push({ kind: "result", result: r });
    return items;
  }, [matchedSystems, results, currentScope]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the selected row visible while arrowing through a scrolled list.
  useEffect(() => {
    document
      .getElementById(`palette-option-${selectedIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, results, matchedSystems]);

  // One-shot catalog fetch on mount. Independent of the debounced query
  // fetch so the catalog is populated even if the user types fast and the
  // first debounced response carries a substring-filtered matchedSystems.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform/palette/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "" }),
    })
      .then((r) => r.json() as Promise<PaletteResponse>)
      .then((j) => {
        if (cancelled || !j.matchedSystems) return;
        for (const s of j.matchedSystems) {
          systemsCatalogRef.current.set(s.name, s);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced fetch on query/scope change.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const body = currentScope
          ? {
              query,
              scope: {
                systemName: currentScope.systemName,
                layerIndex: currentScope.layerIndex,
                parentId: currentScope.parentId,
              },
            }
          : { query };
        const res = await fetch("/api/platform/palette/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json: PaletteResponse = await res.json();
        if (cancelled) return;
        setResults(json.results ?? []);
        setMatchedSystems(json.matchedSystems);
        setSelectedIndex(0);
        if (json.matchedSystems) {
          for (const s of json.matchedSystems) {
            systemsCatalogRef.current.set(s.name, s);
          }
        }
      } catch {
        // Network error — keep prior list (no flash of empty per spec).
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, currentScope]);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose]
  );

  const pushSystemScope = useCallback((system: MatchedSystem) => {
    if (system.layers.length === 0) return;
    const firstLayer = system.layers[0];
    setScopeStack((s) => [
      ...s,
      {
        systemName: system.name,
        systemDisplayName: system.displayName,
        layerIndex: 0,
        layerName: firstLayer.name,
        parentId: null,
        parentLabel: system.displayName,
      },
    ]);
    setQuery("");
  }, []);

  const pushDrillScope = useCallback((result: PaletteResultWithMeta) => {
    if (!result.drillable) return;
    const sys = systemsCatalogRef.current.get(result.systemName);
    if (!sys) return;
    const nextIndex = result.layerIndex + 1;
    const nextLayer = sys.layers[nextIndex];
    if (!nextLayer) return;
    setScopeStack((s) => [
      ...s,
      {
        systemName: result.systemName,
        systemDisplayName: result.systemDisplayName,
        layerIndex: nextIndex,
        layerName: nextLayer.name,
        parentId: result.id,
        parentLabel: result.label,
      },
    ]);
    setQuery("");
  }, []);

  const popScope = useCallback(() => {
    setScopeStack((s) => s.slice(0, -1));
    setQuery("");
  }, []);

  const activate = useCallback(
    (sel: SelectableItem) => {
      if (sel.kind === "system") navigate(sel.system.href);
      else navigate(sel.result.href);
    },
    [navigate]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) =>
          Math.min(i + 1, Math.max(0, selectable.length - 1))
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Backspace" && query === "" && scopeStack.length > 0) {
        e.preventDefault();
        popScope();
        return;
      }
      const sel = selectable[selectedIndex];
      if (!sel) return;
      if (e.key === "Enter") {
        e.preventDefault();
        activate(sel);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (sel.kind === "system") {
          pushSystemScope(sel.system);
        } else {
          pushDrillScope(sel.result);
        }
        return;
      }
    },
    [
      selectable,
      selectedIndex,
      query,
      scopeStack.length,
      onClose,
      popScope,
      pushSystemScope,
      pushDrillScope,
      activate,
    ]
  );

  const placeholder = currentScope
    ? `Search ${currentScope.layerName} in ${currentScope.parentLabel}…`
    : "Search systems and entities…";

  const noResults = !loading && !emptyQuery && selectable.length === 0;
  const scopedIdle =
    !loading && emptyQuery && !!currentScope && selectable.length === 0;

  const systemItems = selectable.filter(
    (s): s is { kind: "system"; system: MatchedSystem } => s.kind === "system"
  );
  const resultItems = selectable.filter(
    (s): s is { kind: "result"; result: PaletteResultWithMeta } =>
      s.kind === "result"
  );

  function row(index: number, sel: SelectableItem) {
    const selected = index === selectedIndex;
    const icon: IconName | undefined =
      sel.kind === "system" ? (sel.system.icon as IconName | undefined) : sel.result.icon;
    const drills =
      sel.kind === "system"
        ? sel.system.layers.length > 0
        : sel.result.drillable === true;
    return (
      <li
        key={sel.kind === "system" ? `sys-${sel.system.name}` : `res-${sel.result.id}`}
        id={`palette-option-${index}`}
        role="option"
        className={`palette-row${selected ? " selected" : ""}`}
        aria-selected={selected}
        onMouseMove={() => {
          if (selectedIndex !== index) setSelectedIndex(index);
        }}
        onClick={() => activate(sel)}
      >
        {icon ? <Icon name={icon} size={14} /> : <span />}
        <div className="palette-main">
          <div className="lbl">
            {sel.kind === "system" ? sel.system.displayName : sel.result.label}
          </div>
          {sel.kind === "result" && sel.result.sublabel ? (
            <div className="sublabel">{sel.result.sublabel}</div>
          ) : null}
        </div>
        <div className="palette-side">
          {sel.kind === "system" && sel.system.layers.length > 0 ? (
            <span className="meta">
              {sel.system.layers.map((l) => l.name).join(" › ")}
            </span>
          ) : null}
          {sel.kind === "result" && !currentScope ? (
            <span className="meta">
              {sel.result.systemDisplayName} · {sel.result.layerName}
            </span>
          ) : null}
          {selected ? (
            <span className="palette-keys">
              {drills ? <kbd>⇥</kbd> : null}
              <kbd>↵</kbd>
            </span>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette-modal">
        {scopeStack.length > 0 ? (
          <div className="palette-scope">
            <span className="palette-scope-arrow" aria-hidden="true">
              →
            </span>
            {scopeStack.map((s, i) => {
              const deep = i === scopeStack.length - 1;
              return (
                <Fragment key={`${s.systemName}-${s.layerIndex}-${i}`}>
                  {i > 0 ? <span aria-hidden="true">·</span> : null}
                  {deep ? (
                    <span className="palette-scope-seg deep">
                      {s.parentLabel}
                      <kbd
                        className={`palette-pop-key${emptyQuery ? " on" : ""}`}
                        aria-hidden={!emptyQuery}
                      >
                        ⌫
                      </kbd>
                    </span>
                  ) : (
                    <span className="palette-scope-seg">{s.parentLabel}</span>
                  )}
                </Fragment>
              );
            })}
          </div>
        ) : null}
        <div className="palette-search">
          <Icon name="search" />
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            value={query}
            placeholder={placeholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Command palette input"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={
              selectable.length > 0 ? `palette-option-${selectedIndex}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
          />
          <span
            className={`palette-load-dot${loading ? " on" : ""}`}
            aria-hidden="true"
          />
          <kbd className="palette-esc">esc</kbd>
        </div>
        {selectable.length > 0 ? (
          <ul className="palette-results" id="palette-listbox" role="listbox">
            {systemItems.length > 0 ? (
              <>
                <li className="palette-group-header" aria-hidden="true">
                  Systems
                </li>
                {systemItems.map((s, i) => row(i, s))}
                {resultItems.length > 0 ? (
                  <li className="palette-divider" role="separator" />
                ) : null}
              </>
            ) : null}
            {resultItems.map((r, i) => row(systemItems.length + i, r))}
          </ul>
        ) : null}
        {noResults ? (
          <p className="palette-empty">
            {currentScope
              ? `No matching ${currentScope.layerName}.`
              : "No matches in any system."}
          </p>
        ) : null}
        {scopedIdle && currentScope ? (
          <p className="palette-empty">
            {`Search ${currentScope.layerName} in ${currentScope.parentLabel}.`}
          </p>
        ) : null}
        {!currentScope && emptyQuery ? (
          <p className="palette-hint">
            Type to search systems and entities · Tab to drill in · Enter to
            open.
          </p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the `/* Command palette --- */` section of `src/app/globals.css` with:**

(Everything from the `/* Command palette --------------------------------------------------------- */` comment down to — not including — the `/* ===== Narrow viewports` banner.)

```css
/* Command palette --------------------------------------------------------- */
.palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(40, 32, 20, 0.36);
  z-index: var(--z-modal);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
}
.palette-modal {
  width: 640px;
  max-width: calc(100vw - var(--sp-8));
  background: var(--paper-0);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: palette-pop 160ms var(--ease-spring);
}
@keyframes palette-pop {
  from { transform: translateY(6px) scale(0.98); opacity: 0; }
  to { transform: none; opacity: 1; }
}

/* Scope trail — the poppable path. The deepest segment is a wash capsule;
   its ⌫ surfaces only while Backspace would actually pop it (empty input). */
.palette-scope {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4) 0;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--ink-3);
}
.palette-scope-arrow { color: var(--accent); }
.palette-scope-seg {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.palette-scope-seg.deep {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  background: var(--accent-wash);
  color: var(--accent-ink);
  border-radius: var(--r-sm);
  padding: 2px var(--sp-2);
}
.palette-pop-key {
  background: none;
  border: 0;
  padding: 0;
  font-size: 10px;
  color: inherit;
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.palette-pop-key.on { opacity: 1; }

.palette-search {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border);
}
.palette-search > svg { flex: 0 0 16px; color: var(--ink-3); }
.palette-input {
  flex: 1;
  min-width: 0;
  font-family: var(--font-sans);
  font-size: var(--fs-md);
  background: transparent;
  border: 0;
  outline: 0;
  padding: 0;
  color: var(--ink-0);
}
.palette-input::placeholder { color: var(--ink-4); }
.palette-load-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: var(--r-full);
  background: var(--accent);
  opacity: 0;
}
.palette-load-dot.on {
  opacity: 1;
  animation: palette-pulse 1s var(--ease-in-out) infinite;
}
@keyframes palette-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(0.55); }
}
.palette-esc {
  background: none;
  border: 0;
  padding: 0;
  font-size: 10px;
  color: var(--ink-4);
}

.palette-results {
  list-style: none;
  margin: 0;
  padding: var(--sp-1) 0;
  max-height: 380px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--paper-4) transparent;
}
.palette-group-header {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  color: var(--ink-4);
  padding: var(--sp-2) var(--sp-4) var(--sp-1);
}
.palette-row {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  gap: var(--sp-3);
  align-items: center;
  padding: var(--sp-2) var(--sp-4);
  cursor: default;
}
.palette-row svg { color: var(--ink-3); }
.palette-row .lbl {
  color: var(--ink-1);
  font-size: var(--fs-base);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.palette-row .sublabel {
  color: var(--ink-3);
  font-size: var(--fs-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.palette-side { display: flex; align-items: center; gap: var(--sp-2); }
.palette-row .meta {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--ink-4);
}
.palette-keys { display: inline-flex; gap: var(--sp-1); }
.palette-row.selected { background: var(--accent-wash); }
.palette-row.selected svg,
.palette-row.selected .lbl,
.palette-row.selected .sublabel,
.palette-row.selected .meta { color: var(--accent-ink); }
.palette-empty,
.palette-hint {
  padding: var(--sp-4);
  margin: 0;
  text-align: center;
  color: var(--ink-4);
  font-size: var(--fs-sm);
}
.palette-hint { border-top: 1px solid var(--border); }
.palette-divider {
  border-top: 1px solid var(--border);
  margin: var(--sp-1) 0;
}
@media (prefers-reduced-motion: reduce) {
  .palette-modal { animation: none; }
  .palette-load-dot.on { animation: none; }
  .palette-pop-key { transition: none; }
}
```

Note: `.palette-hint` follows the systems list in the DOM, so its `border-top` doubles as the list/hint divider — do not also render `.palette-divider` before it.

- [ ] **Step 4: Type-check and lint**

Run: `bun run lint && bun run build`
Expected: both clean. (`build` is the type-check; there is no separate tsc script.)

- [ ] **Step 5: Run the unit suite**

Run: `bun run test`
Expected: PASS (no component tests exist; this catches accidental type breakage in shared imports).

- [ ] **Step 6: Commit**

```bash
git add src/platform/palette/client/PaletteModal.tsx src/app/globals.css
git commit -m "feat(palette): restyle the modal to the v1 design reference

Scope trail with wash capsule and backspace-pop affordance, search
row with loading dot and esc chip, key chips on the selected row,
provenance meta only at top level, layer-chain meta on system rows,
enter opens a system's page (tab still drills), short placeholders
with the spec hint moved to its own line, scroll-into-view and
aria-activedescendant. Matches docs/design/palette-v1-reference.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: ⌘K trigger in the TitleBar

The spec allows "an optional subtle Cmd-K hint" in the TitleBar. Today there is no visible palette trigger anywhere — and on touch devices no way to open it at all. Add a small `kbd`-chip button to the TitleBar's right side. The `(systems)` and `(platform)` layouts render TitleBar even without a session (they don't redirect), while `PaletteProvider` mounts only with a session — so the trigger must tolerate a missing provider.

**Files:**
- Modify: `src/platform/palette/client/PaletteProvider.tsx` (add `usePaletteOptional`)
- Create: `src/app/_components/PaletteTrigger.tsx`
- Modify: `src/app/_components/TitleBar.tsx` (mount in `.titlebar-right`)
- Modify: `src/app/globals.css` (append `.palette-trigger` rules to the Command palette section, before the `prefers-reduced-motion` block)
- Test: none (chrome-only UI; covered by Task 5 smoke)

**Interfaces:**
- Consumes: `PaletteContextValue` (`{ open, close, toggle }`) and the module-private `Ctx` inside `PaletteProvider.tsx`; global `kbd` chip styling.
- Produces: `usePaletteOptional(): PaletteContextValue | null` exported from `PaletteProvider.tsx`; `<PaletteTrigger />` exported from `src/app/_components/PaletteTrigger.tsx`.

- [ ] **Step 1: Add the optional hook**

In `src/platform/palette/client/PaletteProvider.tsx`, below the existing `usePalette`:

```tsx
/** Like usePalette, but returns null outside a provider (e.g. signed-out chrome). */
export function usePaletteOptional(): PaletteContextValue | null {
  return useContext(Ctx);
}
```

- [ ] **Step 2: Create `src/app/_components/PaletteTrigger.tsx`**

```tsx
"use client";

import { usePaletteOptional } from "@/platform/palette/client/PaletteProvider";

// Subtle ⌘K affordance in the title bar — the palette's only visible
// trigger, and the only way to open it on touch.
export function PaletteTrigger() {
  const palette = usePaletteOptional();
  if (!palette) return null;
  return (
    <button
      type="button"
      className="palette-trigger"
      onClick={palette.open}
      aria-label="Open command palette"
    >
      <kbd>⌘K</kbd>
    </button>
  );
}
```

- [ ] **Step 3: Mount it in `src/app/_components/TitleBar.tsx`**

Add the import at the top:

```tsx
import { PaletteTrigger } from "./PaletteTrigger";
```

and make it the first child of the existing `<div className="titlebar-right">`:

```tsx
      <div className="titlebar-right">
        <PaletteTrigger />
        <span
          className="sync-dot"
```

- [ ] **Step 4: Append the CSS**

In `src/app/globals.css`, inside the Command palette section, immediately before the `@media (prefers-reduced-motion: reduce)` block:

```css
.palette-trigger {
  display: inline-flex;
  align-items: center;
  background: none;
  border: 0;
  padding: 2px;
  cursor: pointer;
  border-radius: var(--r-sm);
}
.palette-trigger:hover { background: var(--bg-hover); }
.palette-trigger:focus-visible { box-shadow: var(--ring); outline: 0; }
```

(The inner `⌘K` chip styling comes from the global `kbd, .kbd` rule for free.)

- [ ] **Step 5: Verify it compiles**

Run: `bun run lint && bun run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/platform/palette/client/PaletteProvider.tsx src/app/_components/PaletteTrigger.tsx src/app/_components/TitleBar.tsx src/app/globals.css
git commit -m "feat(shell): add a command palette trigger to the title bar

The spec's optional subtle Cmd-K hint. Renders nothing when the
palette provider is absent (signed-out chrome); on touch it is the
only way to open the palette.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Full verification — suites plus authenticated smoke

No component tests by spec decision, so the modal must be exercised in a real browser against the design reference. Use the forged-JWT recipe (documented from the 2026-06-13 mobile-shell fix).

**Files:**
- Create (temporary, delete after): `palette-smoke.mjs` at the repo root — it must live inside the repo so Bun resolves `playwright-core` and `next-auth/jwt` from the repo's `node_modules`. Never commit it.
- No repo changes except fixes for anything the smoke finds.

**Interfaces:**
- Consumes: everything above; `.env`'s `NEXTAUTH_SECRET` and `ALLOWED_EMAIL`; system Chrome at `/usr/bin/google-chrome`.

- [ ] **Step 1: Run all suites**

```bash
bun run lint && bun run test
docker compose -f docker/docker-compose.yml up -d && bun run test:integration
bun run build
```
Expected: all green. `test:integration` requires `DATABASE_URL_TEST` in `.env` — if unset, stop and report rather than skipping.

- [ ] **Step 2: Start the dev server with fresh CSS**

```bash
rm -rf .next   # Turbopack persistent cache serves stale CSS after globals.css edits
bun run dev    # brings up docker compose + next dev on :3000
```

- [ ] **Step 3: Install the driver (temporarily) and write the smoke script**

```bash
bun add -d playwright-core
```

Scratch script (`palette-smoke.mjs` at the repo root, temporary) — forge the session cookie and walk the palette's states:

```js
import { chromium } from "playwright-core";
import { encode } from "next-auth/jwt";

const secret = process.env.NEXTAUTH_SECRET;
const email = process.env.ALLOWED_EMAIL;
const cookieName = "authjs.session-token"; // salt MUST equal the cookie name
const token = await encode({
  token: { sub: "smoke", name: "Smoke", email },
  secret,
  salt: cookieName,
});

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addCookies([
  { name: cookieName, value: token, url: "http://localhost:3000" },
]);
const page = await ctx.newPage();
await page.goto("http://localhost:3000/journal");

const shot = (n) => page.screenshot({ path: `pal-smoke-${n}.png` });

await page.keyboard.press("ControlOrMeta+k"); // open
await page.waitForSelector(".palette-modal");
await page.waitForTimeout(400);
await shot("home"); // expect: Systems group + hint, no recents wall

await page.keyboard.type("pol");
await page.waitForTimeout(500);
await shot("query"); // expect: provenance meta on rows, chips on selected

await page.keyboard.press("Backspace");
await page.keyboard.press("Backspace");
await page.keyboard.press("Backspace");
await page.waitForTimeout(400);
await page.keyboard.press("Tab"); // drill into first system
await page.waitForTimeout(500);
await shot("scoped"); // expect: scope trail capsule with ⌫, recent topics

await page.keyboard.press("Tab"); // drill into first topic
await page.waitForTimeout(500);
await shot("deep"); // expect: two-segment trail, notes, no meta column

await page.keyboard.press("Enter"); // open selected note
await page.waitForTimeout(800);
await shot("navigated"); // expect: journal topic page, palette closed

await browser.close();
```

Run it with the repo's env loaded:

```bash
cd /home/raymartvillos/Mart/Polaris && bun --env-file=.env palette-smoke.mjs
```

- [ ] **Step 4: Compare against the design reference**

Open each `pal-smoke-*.png` next to the matching preset of the reference (`docs/design/palette-v1-reference/index.html?state=home|query|scoped|deep`). Verify: scope-trail capsule + ⌫ appears only with empty input; `↵`/`⇥` chips only on the selected row; provenance meta absent when scoped; loading dot pulses during fetch; opening state has no recents wall; Enter on a system row navigates to `/journal` (also click the TitleBar `⌘K` chip once to confirm the trigger opens the palette). If CSS looks stale, `rm -rf .next` and restart before debugging further.

- [ ] **Step 5: Clean up**

```bash
bun remove playwright-core
rm palette-smoke.mjs pal-smoke-*.png 2>/dev/null || true
git status --short   # expect: clean tree, no stray files
```

- [ ] **Step 6: Fix-and-recommit loop**

Anything the smoke surfaces gets fixed in the task it belongs to (modal → amend nothing; make a new focused commit `fix(palette): …`). Re-run Step 1's suites after any fix.

---

## Deliberate deltas from the spec (do not "fix" these)

Documented in `docs/design/palette-v1-reference/README.md`:
- No trailing `·` after the last breadcrumb segment.
- Provenance meta (`System · layer`) hidden when scoped.
- Loading is a pulsing accent dot, not a spinner.
- Empty top-level query returns systems + hint, not layer defaults.
- Scoped placeholder uses `parentLabel` (`Search notes in Polaris…`), not the system display name, once drilled past layer 0.
