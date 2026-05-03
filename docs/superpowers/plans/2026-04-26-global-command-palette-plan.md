# Global Command Palette — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Update (2026-05-04):** Code samples below show `JobProcessor` and `jobs: Record<string, JobProcessor>` on `SystemManifest`, plus `jobs: {}` in mock manifests. Both have been removed — see `docs/superpowers/plans/2026-05-04-strip-async-jobs.md`. The palette portions of the plan are unaffected.

**Goal:** Ship a platform-level Cmd-K command palette that lets the user navigate across every Polaris system from a single input. Each system extends its `SystemManifest` with a `palette: { layers }` block declaring its searchable entity hierarchy. v1 ships with the Engineering Journal as the only consumer (topics → notes); the manifest contract is generic and future-system-ready.

**Architecture:** Server-side is a small platform module — types, an in-memory registry built from the system manifests, a resolver that fans out to layer `search()` calls, and a single auth-gated POST endpoint at `/api/platform/palette/search`. The client is a React context provider mounted in the root layout (only when authenticated) plus a portal modal with keyboard handling, debounced fetches, breadcrumb-style scope, and a flat result list. The journal contributes a `palette.ts` module exporting two `PaletteLayer`s.

**Tech Stack:** TypeScript 5, Bun, Next.js 16.2.4 (App Router, route group `(platform)`/`(systems)`), React 19, Prisma 7 (driver-adapter mode), PostgreSQL 17, NextAuth v5, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-04-26-global-command-palette-design.md`

> **Cross-cutting notes that apply to every task:**
> - **Bun, not npm.** `bun install`, `bun test`, `bun src/...`. Bun executes TypeScript natively.
> - **Prisma client is at `@/generated/prisma/client`**, not `@prisma/client`.
> - **Auth at the catchall.** `/api/systems/[system]/[...path]/route.ts` checks `auth()`. The palette endpoint at `/api/platform/palette/search` is NOT under the catchall, so the route handler MUST check `auth()` itself (mirror `src/app/api/platform/jobs/route.ts`).
> - **`getOptionalSession()`** already exists at `src/platform/auth/session.ts` (returns `null` for unauthenticated, no throw).
> - **Existing journal palette stub.** `src/systems/journal/palette.ts` already exists with placeholder layers; `src/systems/journal/manifest.ts` has a `(manifest as ...)` cast at the bottom that sets `palette`. Both are replaced cleanly during this plan.
> - **Existing icons.** `Icon.tsx` already exposes `folder`, `file-text`, `command`. No new icons required.
> - **Hash-anchor scroll** is already in place at `src/systems/journal/components/HashAnchorScroll.tsx`, mounted in the topic page. Notes navigate to `/journal/topics/<name>#entry-<id>` and the existing component handles scroll + flash.
> - **Design system is non-negotiable.** Tokens, never hex. Sentence case. Paper + ink. New CSS appends to `src/app/globals.css` with token references only.
> - **Out of scope (per spec):** actions/commands, recents/favorites, custom row rendering, fuzzy-matching libraries, mobile/touch variants, persistent state across reloads, theming, sidebar/TitleBar visual integration beyond a subtle hint, single-entry standalone route. Do not plan for these.

---

## File Map

```
# Platform palette module
src/platform/palette/types.ts                        # PaletteResult, PaletteLayer, PaletteSystemConfig, scope/response types
src/platform/palette/registry.ts                     # buildPaletteRegistry(manifests)
src/platform/palette/rankResults.ts                  # Tier-based stable ordering for cross-system fallback
src/platform/palette/resolver.ts                     # resolveQuery({ query, scope }) — server-side dispatcher
src/platform/palette/__tests__/registry.test.ts
src/platform/palette/__tests__/rankResults.test.ts
src/platform/palette/__tests__/resolver.test.ts
src/platform/palette/client/PaletteProvider.tsx     # React context + modal mount
src/platform/palette/client/useGlobalKeybinding.ts  # Cmd-K global listener
src/platform/palette/client/PaletteModal.tsx        # The modal UI

# Aggregation endpoint
src/app/api/platform/palette/search/route.ts
src/app/api/platform/palette/search/route.integration.test.ts

# System manifest extension
src/systems/types.ts                                 # Add `palette?: PaletteSystemConfig`

# Journal contribution
src/systems/journal/lib/format.ts                    # firstLine + relativeTime helpers (DRY: also used by EntryCard)
src/systems/journal/lib/format.test.ts
src/systems/journal/palette.ts                       # Replaced: real topicsLayer + notesLayer
src/systems/journal/manifest.ts                      # Drop the `(manifest as …).palette = …` cast — use clean field
src/systems/journal/components/EntryCard.tsx         # Refactor: pull relativeTime from lib/format

# Root layout — mount PaletteProvider conditionally
src/app/layout.tsx

# Design tokens
src/app/globals.css                                  # Append .palette-* classes
```

---

## Task 1: Define palette types

**Files:**
- Create: `src/platform/palette/types.ts`

- [ ] **Step 1: Create the types module**

```typescript
// src/platform/palette/types.ts
import type { IconName } from "@/app/_components/Icon";

export interface PaletteResult {
  id: string;
  label: string;
  sublabel?: string;
  icon?: IconName;
  href: string;
  drillable?: boolean;
}

export interface PaletteLayer {
  /** Plural — used in the breadcrumb. */
  name: string;
  /** Singular — used in placeholder/empty-state copy. */
  singular: string;
  search(query: string, parentId: string | null): Promise<PaletteResult[]>;
}

export interface PaletteSystemConfig {
  layers: PaletteLayer[];
}

export interface PaletteResultWithMeta extends PaletteResult {
  systemName: string;
  systemDisplayName: string;
  layerIndex: number;
  layerName: string;
}

export interface PaletteScope {
  systemName: string;
  layerIndex: number;
  parentId: string | null;
}

export interface MatchedSystem {
  name: string;
  displayName: string;
  icon?: IconName;
  layers: Array<{ name: string; singular: string }>;
}

export interface ResolveQueryInput {
  query: string;
  scope?: PaletteScope;
}

export interface ResolveQueryResult {
  results: PaletteResultWithMeta[];
  matchedSystems?: MatchedSystem[];
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `bun run lint`
Expected: PASS (or only pre-existing warnings unrelated to the new file)

- [ ] **Step 3: Commit**

```bash
git add src/platform/palette/types.ts
git commit -m "feat(palette): add palette type contract"
```

---

## Task 2: Extend `SystemManifest` with optional `palette` field and clean up the journal manifest cast

**Files:**
- Modify: `src/systems/types.ts`
- Modify: `src/systems/journal/palette.ts` (temporary — keep stubs valid against the new `PaletteLayer` interface; real layers land in Task 8)
- Modify: `src/systems/journal/manifest.ts`

- [ ] **Step 1: Add the `palette` field on `SystemManifest`**

Edit `src/systems/types.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Job } from "bullmq";
import type { PaletteSystemConfig } from "@/platform/palette/types";

export type RouteHandler = (
  req: NextRequest,
  params: Record<string, string>
) => Promise<NextResponse>;

export type JobProcessor = (job: Job) => Promise<void>;

export interface SystemManifest {
  name: string;
  displayName: string;
  description: string;
  routes: Record<string, RouteHandler>;
  jobs: Record<string, JobProcessor>;
  nav: {
    label: string;
    icon: string;
    href: string;
  };
  palette?: PaletteSystemConfig;
}
```

- [ ] **Step 2: Make the existing journal palette stubs satisfy `PaletteLayer`**

Replace the entire body of `src/systems/journal/palette.ts` with:

```typescript
// Temporary stubs satisfying the PaletteLayer interface. Real implementations
// land in Task 8 (Global Command Palette plan).
import type { PaletteLayer } from "@/platform/palette/types";

export const topicsLayer: PaletteLayer = {
  name: "topics",
  singular: "topic",
  search: async () => [],
};

export const notesLayer: PaletteLayer = {
  name: "notes",
  singular: "note",
  search: async () => [],
};
```

- [ ] **Step 3: Replace the cast in the journal manifest with the typed field**

Edit `src/systems/journal/manifest.ts` — delete the trailing block that casts the manifest, and inline the `palette` field in the manifest literal:

```typescript
import { SystemManifest } from "../types";
import * as palette from "./palette";
import * as entries from "./routes/entries";
import * as topics from "./routes/topics";
import * as tags from "./routes/tags";
import { computeActiveTopicsJob } from "./services/jobs";

export const manifest: SystemManifest = {
  name: "journal",
  displayName: "Engineering Journal",
  description: "Daily micro-log of building, learning, and working",

  routes: {
    "GET /entries":        entries.listEntries,
    "POST /entries":       entries.createEntry,
    "GET /entries/:id":    entries.getEntry,
    "PATCH /entries/:id":  entries.updateEntry,
    "DELETE /entries/:id": entries.deleteEntry,
    "GET /topics":         topics.listTopics,
    "POST /topics":        topics.createTopic,
    "GET /topics/:id":     topics.getTopic,
    "PATCH /topics/:id":   topics.updateTopic,
    "GET /tags":           tags.listTags,
  },

  jobs: {
    "compute-active-topics": computeActiveTopicsJob,
  },

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

- [ ] **Step 4: Run the test suite to confirm nothing regresses**

Run: `bun test`
Expected: PASS (existing `src/systems/registry.test.ts` and journal unit tests still green)

- [ ] **Step 5: Commit**

```bash
git add src/systems/types.ts src/systems/journal/palette.ts src/systems/journal/manifest.ts
git commit -m "feat(palette): extend SystemManifest with typed palette field"
```

---

## Task 3: Implement `buildPaletteRegistry` with unit tests

**Files:**
- Create: `src/platform/palette/registry.ts`
- Create: `src/platform/palette/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/platform/palette/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { buildPaletteRegistry } from "../registry";
import type { SystemManifest } from "@/systems/types";
import type { PaletteLayer } from "../types";

const noop = async () => NextResponse.json({});

function layer(name: string, singular: string): PaletteLayer {
  return { name, singular, search: async () => [] };
}

function manifest(opts: {
  name: string;
  displayName: string;
  withPalette?: PaletteLayer[];
}): SystemManifest {
  return {
    name: opts.name,
    displayName: opts.displayName,
    description: "",
    routes: { "GET /x": noop },
    jobs: {},
    nav: { label: opts.displayName, icon: "folder", href: `/${opts.name}` },
    ...(opts.withPalette ? { palette: { layers: opts.withPalette } } : {}),
  };
}

describe("buildPaletteRegistry", () => {
  const journal = manifest({
    name: "journal",
    displayName: "Engineering Journal",
    withPalette: [layer("topics", "topic"), layer("notes", "note")],
  });
  const budgeting = manifest({
    name: "budgeting",
    displayName: "Budgeting",
    withPalette: [layer("accounts", "account")],
  });
  const settings = manifest({ name: "settings", displayName: "Settings" }); // no palette

  it("getSystem returns a system by name when it has a palette block", () => {
    const reg = buildPaletteRegistry([journal, budgeting]);
    const got = reg.getSystem("journal");
    expect(got?.manifest.name).toBe("journal");
    expect(got?.palette.layers).toHaveLength(2);
  });

  it("getSystem returns null for systems without a palette block", () => {
    const reg = buildPaletteRegistry([settings]);
    expect(reg.getSystem("settings")).toBeNull();
  });

  it("getSystem returns null for unknown system", () => {
    const reg = buildPaletteRegistry([journal]);
    expect(reg.getSystem("unknown")).toBeNull();
  });

  it("matchSystems empty query returns only systems with palette block", () => {
    const reg = buildPaletteRegistry([journal, budgeting, settings]);
    const got = reg.matchSystems("");
    expect(got.map((s) => s.name).sort()).toEqual(["budgeting", "journal"]);
  });

  it("matchSystems substring matches name and displayName, case-insensitive", () => {
    const reg = buildPaletteRegistry([journal, budgeting]);
    expect(reg.matchSystems("JOUR").map((s) => s.name)).toEqual(["journal"]);
    expect(reg.matchSystems("engin").map((s) => s.name)).toEqual(["journal"]);
    expect(reg.matchSystems("budg").map((s) => s.name)).toEqual(["budgeting"]);
  });

  it("matchSystems with a non-matching query returns empty", () => {
    const reg = buildPaletteRegistry([journal]);
    expect(reg.matchSystems("xyz")).toEqual([]);
  });

  it("allLayers returns flat layer list with system metadata", () => {
    const reg = buildPaletteRegistry([journal, budgeting]);
    const layers = reg.allLayers();
    expect(layers).toHaveLength(3);
    expect(layers[0]).toMatchObject({
      systemName: "journal",
      systemDisplayName: "Engineering Journal",
      layerIndex: 0,
    });
    expect(layers[0].layer.name).toBe("topics");
    expect(layers[1].layer.name).toBe("notes");
    expect(layers[2].systemName).toBe("budgeting");
  });

  it("allLayers skips systems without a palette block", () => {
    const reg = buildPaletteRegistry([journal, settings]);
    expect(reg.allLayers().every((l) => l.systemName === "journal")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/platform/palette/__tests__/registry.test.ts`
Expected: FAIL with "Cannot find module '../registry'"

- [ ] **Step 3: Implement `registry.ts`**

Create `src/platform/palette/registry.ts`:

```typescript
import type { SystemManifest } from "@/systems/types";
import type { IconName } from "@/app/_components/Icon";
import type { PaletteLayer, PaletteSystemConfig } from "./types";

interface FlatLayer {
  systemName: string;
  systemDisplayName: string;
  layerIndex: number;
  layer: PaletteLayer;
}

export interface PaletteRegistry {
  getSystem(name: string): { manifest: SystemManifest; palette: PaletteSystemConfig } | null;
  matchSystems(query: string): Array<{ name: string; displayName: string; icon?: IconName }>;
  allLayers(): FlatLayer[];
}

export function buildPaletteRegistry(manifests: SystemManifest[]): PaletteRegistry {
  const withPalette = manifests.filter(
    (m): m is SystemManifest & { palette: PaletteSystemConfig } => !!m.palette
  );

  const flat: FlatLayer[] = [];
  for (const m of withPalette) {
    m.palette.layers.forEach((layer, layerIndex) => {
      flat.push({
        systemName: m.name,
        systemDisplayName: m.displayName,
        layerIndex,
        layer,
      });
    });
  }

  return {
    getSystem(name) {
      const m = manifests.find((x) => x.name === name);
      if (!m || !m.palette) return null;
      return { manifest: m, palette: m.palette };
    },
    matchSystems(query) {
      const q = query.toLowerCase();
      if (!q) {
        return withPalette.map((m) => ({
          name: m.name,
          displayName: m.displayName,
          icon: m.nav.icon as IconName,
        }));
      }
      return manifests
        .filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.displayName.toLowerCase().includes(q)
        )
        .map((m) => ({
          name: m.name,
          displayName: m.displayName,
          icon: m.nav.icon as IconName,
        }));
    },
    allLayers() {
      return flat;
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/platform/palette/__tests__/registry.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platform/palette/registry.ts src/platform/palette/__tests__/registry.test.ts
git commit -m "feat(palette): registry with system + layer indexing"
```

---

## Task 4: Implement `rankResults` with unit tests

**Files:**
- Create: `src/platform/palette/rankResults.ts`
- Create: `src/platform/palette/__tests__/rankResults.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/platform/palette/__tests__/rankResults.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rankResults } from "../rankResults";
import type { PaletteResultWithMeta } from "../types";

function r(label: string, sublabel?: string): PaletteResultWithMeta {
  return {
    id: label,
    label,
    sublabel,
    href: `/x/${label}`,
    systemName: "journal",
    systemDisplayName: "Engineering Journal",
    layerIndex: 0,
    layerName: "topics",
  };
}

describe("rankResults", () => {
  it("exact-prefix match outranks substring on label", () => {
    const out = rankResults([r("Polaris milestone"), r("Hello Polaris")], "polaris");
    expect(out.map((x) => x.label)).toEqual(["Polaris milestone", "Hello Polaris"]);
  });

  it("substring on label outranks substring on sublabel", () => {
    const out = rankResults(
      [r("Hello world", "polaris note"), r("Polaris quick")],
      "polaris"
    );
    expect(out.map((x) => x.label)).toEqual(["Polaris quick", "Hello world"]);
  });

  it("preserves input order within the same tier (stable sort)", () => {
    const out = rankResults([r("Alpha"), r("Beta"), r("Gamma")], "");
    expect(out.map((x) => x.label)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("preserves input order for two equally-tiered substring matches", () => {
    const out = rankResults(
      [r("apple polaris"), r("banana polaris")],
      "polaris"
    );
    expect(out.map((x) => x.label)).toEqual(["apple polaris", "banana polaris"]);
  });

  it("no-match items sink to the bottom", () => {
    const out = rankResults([r("Banana"), r("polaris")], "polaris");
    expect(out.map((x) => x.label)).toEqual(["polaris", "Banana"]);
  });

  it("empty query returns input unchanged", () => {
    const items = [r("z"), r("a"), r("m")];
    expect(rankResults(items, "").map((x) => x.label)).toEqual(["z", "a", "m"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/platform/palette/__tests__/rankResults.test.ts`
Expected: FAIL with "Cannot find module '../rankResults'"

- [ ] **Step 3: Implement `rankResults.ts`**

Create `src/platform/palette/rankResults.ts`:

```typescript
import type { PaletteResultWithMeta } from "./types";

function tier(r: PaletteResultWithMeta, q: string): number {
  const label = r.label.toLowerCase();
  const sublabel = r.sublabel?.toLowerCase() ?? "";
  if (label.startsWith(q)) return 0;
  if (label.includes(q)) return 1;
  if (sublabel.includes(q)) return 2;
  return 3;
}

export function rankResults(
  results: PaletteResultWithMeta[],
  query: string
): PaletteResultWithMeta[] {
  if (!query) return [...results];
  const q = query.toLowerCase();
  // Array.prototype.sort is stable as of ES2019, so equal tiers preserve input order.
  return [...results].sort((a, b) => tier(a, q) - tier(b, q));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/platform/palette/__tests__/rankResults.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platform/palette/rankResults.ts src/platform/palette/__tests__/rankResults.test.ts
git commit -m "feat(palette): tier-based result ranking"
```

---

## Task 5: Implement `resolver.ts` with integration-style unit tests against a fake registry

**Files:**
- Create: `src/platform/palette/resolver.ts`
- Create: `src/platform/palette/__tests__/resolver.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/platform/palette/__tests__/resolver.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveQuery } from "../resolver";
import type { PaletteRegistry } from "../registry";
import type { PaletteLayer, PaletteResult } from "../types";

function layer(
  name: string,
  singular: string,
  results: PaletteResult[] = [],
  opts: { throwOn?: string } = {}
): PaletteLayer {
  return {
    name,
    singular,
    search: async (query) => {
      if (opts.throwOn !== undefined && query === opts.throwOn) {
        throw new Error(`boom from ${name}`);
      }
      return results;
    },
  };
}

function makeRegistry(opts: {
  systems: Array<{
    name: string;
    displayName: string;
    icon?: string;
    layers: PaletteLayer[];
  }>;
  matchedNames?: string[];
}): PaletteRegistry {
  const flat = opts.systems.flatMap((s) =>
    s.layers.map((layer, layerIndex) => ({
      systemName: s.name,
      systemDisplayName: s.displayName,
      layerIndex,
      layer,
    }))
  );
  return {
    getSystem(name) {
      const s = opts.systems.find((x) => x.name === name);
      if (!s) return null;
      return {
        manifest: {
          name: s.name,
          displayName: s.displayName,
          description: "",
          routes: {},
          jobs: {},
          nav: { label: s.displayName, icon: s.icon ?? "folder", href: `/${s.name}` },
          palette: { layers: s.layers },
        },
        palette: { layers: s.layers },
      };
    },
    matchSystems(query) {
      const subset = opts.matchedNames
        ? opts.systems.filter((s) => opts.matchedNames!.includes(s.name))
        : opts.systems.filter(
            (s) =>
              !query ||
              s.name.toLowerCase().includes(query.toLowerCase()) ||
              s.displayName.toLowerCase().includes(query.toLowerCase())
          );
      return subset.map((s) => ({
        name: s.name,
        displayName: s.displayName,
        icon: s.icon as never,
      }));
    },
    allLayers() {
      return flat;
    },
  };
}

const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => errSpy.mockClear());

describe("resolveQuery", () => {
  beforeEach(() => errSpy.mockClear());

  it("top-level query: returns matchedSystems with layer metadata + ranked cross-system results", async () => {
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [
            layer("topics", "topic", [
              { id: "t1", label: "Polaris", href: "/journal/topics/Polaris", drillable: true },
            ]),
            layer("notes", "note", [
              { id: "n1", label: "Polaris ship note", href: "/journal/topics/Polaris#entry-n1" },
            ]),
          ],
        },
      ],
    });
    const out = await resolveQuery(reg, { query: "polaris" });
    expect(out.matchedSystems).toEqual([
      {
        name: "journal",
        displayName: "Engineering Journal",
        icon: undefined,
        layers: [
          { name: "topics", singular: "topic" },
          { name: "notes", singular: "note" },
        ],
      },
    ]);
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({
      id: "t1",
      systemName: "journal",
      systemDisplayName: "Engineering Journal",
      layerIndex: 0,
      layerName: "topics",
    });
    expect(out.results[1]).toMatchObject({ id: "n1", layerName: "notes" });
  });

  it("scoped query: routes to the correct layer with the correct parentId", async () => {
    const search = vi.fn(async (_q: string, _p: string | null) => [
      { id: "n1", label: "scoped result", href: "/x" } as PaletteResult,
    ]);
    const scoped: PaletteLayer = { name: "notes", singular: "note", search };
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [layer("topics", "topic"), scoped],
        },
      ],
    });
    const out = await resolveQuery(reg, {
      query: "deploy",
      scope: { systemName: "journal", layerIndex: 1, parentId: "topic-123" },
    });
    expect(search).toHaveBeenCalledWith("deploy", "topic-123");
    expect(out.matchedSystems).toBeUndefined();
    expect(out.results).toEqual([
      {
        id: "n1",
        label: "scoped result",
        href: "/x",
        systemName: "journal",
        systemDisplayName: "Engineering Journal",
        layerIndex: 1,
        layerName: "notes",
      },
    ]);
  });

  it("scoped query with unknown system returns empty results", async () => {
    const reg = makeRegistry({ systems: [] });
    const out = await resolveQuery(reg, {
      query: "x",
      scope: { systemName: "ghost", layerIndex: 0, parentId: null },
    });
    expect(out.results).toEqual([]);
  });

  it("layer errors are isolated — other layers still return", async () => {
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [
            layer("topics", "topic", [
              { id: "t1", label: "Polaris", href: "/x" },
            ]),
            layer("notes", "note", [], { throwOn: "polaris" }),
          ],
        },
      ],
    });
    const out = await resolveQuery(reg, { query: "polaris" });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].id).toBe("t1");
    expect(errSpy).toHaveBeenCalled();
  });

  it("scoped query with throwing layer returns empty (not 500)", async () => {
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [layer("notes", "note", [], { throwOn: "boom" })],
        },
      ],
    });
    const out = await resolveQuery(reg, {
      query: "boom",
      scope: { systemName: "journal", layerIndex: 0, parentId: null },
    });
    expect(out.results).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
  });

  it("empty top-level query: returns all matched systems with layers", async () => {
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [layer("topics", "topic", [])],
        },
      ],
    });
    const out = await resolveQuery(reg, { query: "" });
    expect(out.matchedSystems).toHaveLength(1);
    expect(out.matchedSystems![0].layers).toEqual([
      { name: "topics", singular: "topic" },
    ]);
    expect(out.results).toEqual([]);
  });

  it("caps cross-system fallback at 30 results", async () => {
    const many: PaletteResult[] = Array.from({ length: 50 }, (_, i) => ({
      id: `n${i}`,
      label: `note ${i}`,
      href: `/x/${i}`,
    }));
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [layer("notes", "note", many)],
        },
      ],
    });
    const out = await resolveQuery(reg, { query: "note" });
    expect(out.results).toHaveLength(30);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/platform/palette/__tests__/resolver.test.ts`
Expected: FAIL with "Cannot find module '../resolver'"

- [ ] **Step 3: Implement `resolver.ts`**

Create `src/platform/palette/resolver.ts`:

```typescript
import type { PaletteRegistry } from "./registry";
import type {
  ResolveQueryInput,
  ResolveQueryResult,
  PaletteResultWithMeta,
  MatchedSystem,
} from "./types";
import { rankResults } from "./rankResults";

const FALLBACK_LIMIT = 30;

export async function resolveQuery(
  registry: PaletteRegistry,
  input: ResolveQueryInput
): Promise<ResolveQueryResult> {
  const { query, scope } = input;

  if (!scope) {
    const matched = registry.matchSystems(query);
    const matchedSystems: MatchedSystem[] = matched.map((m) => {
      const sys = registry.getSystem(m.name);
      const layers = sys
        ? sys.palette.layers.map((l) => ({ name: l.name, singular: l.singular }))
        : [];
      return { ...m, layers };
    });

    const layerHits = await Promise.all(
      registry.allLayers().map(async ({ layer, systemName, systemDisplayName, layerIndex }) => {
        try {
          const raw = await layer.search(query, null);
          return raw.map<PaletteResultWithMeta>((r) => ({
            ...r,
            systemName,
            systemDisplayName,
            layerIndex,
            layerName: layer.name,
          }));
        } catch (err) {
          console.error(
            `palette: layer ${systemName}.${layer.name} failed`,
            err
          );
          return [];
        }
      })
    );

    const flat = layerHits.flat();
    const ranked = rankResults(flat, query).slice(0, FALLBACK_LIMIT);
    return { matchedSystems, results: ranked };
  }

  const sys = registry.getSystem(scope.systemName);
  if (!sys) return { results: [] };
  const layer = sys.palette.layers[scope.layerIndex];
  if (!layer) return { results: [] };

  try {
    const raw = await layer.search(query, scope.parentId);
    return {
      results: raw.map<PaletteResultWithMeta>((r) => ({
        ...r,
        systemName: scope.systemName,
        systemDisplayName: sys.manifest.displayName,
        layerIndex: scope.layerIndex,
        layerName: layer.name,
      })),
    };
  } catch (err) {
    console.error(
      `palette: layer ${scope.systemName}.${layer.name} failed`,
      err
    );
    return { results: [] };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/platform/palette/__tests__/resolver.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platform/palette/resolver.ts src/platform/palette/__tests__/resolver.test.ts
git commit -m "feat(palette): query resolver with cross-system fallback"
```

---

## Task 6: Build the `POST /api/platform/palette/search` route handler with integration tests

**Files:**
- Create: `src/app/api/platform/palette/search/route.ts`
- Create: `src/app/api/platform/palette/search/route.integration.test.ts`

- [ ] **Step 1: Implement the route handler first** (it has no behavior to test until the file exists; we'll write the integration tests against it)

Create `src/app/api/platform/palette/search/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/platform/auth/config";
import { unauthorized, badRequest } from "@/platform/api/errors";
import { manifests } from "@/systems";
import { buildPaletteRegistry } from "@/platform/palette/registry";
import { resolveQuery } from "@/platform/palette/resolver";
import type { PaletteScope } from "@/platform/palette/types";

const registry = buildPaletteRegistry(manifests);

function isScope(value: unknown): value is PaletteScope {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.systemName === "string" &&
    typeof v.layerIndex === "number" &&
    (v.parentId === null || typeof v.parentId === "string")
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof (body as { query?: unknown }).query !== "string") {
    return badRequest("query (string) is required");
  }

  const scope = isScope((body as { scope?: unknown }).scope)
    ? (body as { scope: PaletteScope }).scope
    : undefined;

  const result = await resolveQuery(registry, {
    query: (body as { query: string }).query,
    scope,
  });
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Write the failing integration tests**

Create `src/app/api/platform/palette/search/route.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createTopic } from "@/systems/journal/services/topics";
import { createEntry } from "@/systems/journal/services/entries";

vi.mock("@/platform/auth/config", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/platform/auth/config";
import { POST } from "./route";

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/palette/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockedAuth = vi.mocked(auth);

describe("POST /api/platform/palette/search", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(async () => {
    mockedAuth.mockReset();
    await withCleanJournalTables();
  });

  it("returns 401 when there is no session", async () => {
    mockedAuth.mockResolvedValueOnce(null as never);
    const res = await POST(jsonRequest({ query: "" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing the query field", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: "test@example.com" } } as never);
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("happy path: top-level empty query lists matched systems with layers", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: "test@example.com" } } as never);
    const res = await POST(jsonRequest({ query: "" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matchedSystems).toBeDefined();
    const journal = json.matchedSystems.find(
      (s: { name: string }) => s.name === "journal"
    );
    expect(journal).toBeDefined();
    expect(journal.layers).toEqual([
      { name: "topics", singular: "topic" },
      { name: "notes", singular: "note" },
    ]);
  });

  it("happy path: top-level query with topic + entry returns layered results", async () => {
    mockedAuth.mockResolvedValue({ user: { email: "test@example.com" } } as never);
    const topic = await createTopic({ name: "Polaris" });
    await createEntry({ topicId: topic.id, body: "polaris ship note" });

    const res = await POST(jsonRequest({ query: "polaris" }));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.results.some((r: { id: string }) => r.id === topic.id)).toBe(true);
    expect(
      json.results.some(
        (r: { layerName: string; label: string }) =>
          r.layerName === "notes" && r.label.includes("polaris")
      )
    ).toBe(true);

    const topicHit = json.results.find((r: { id: string }) => r.id === topic.id);
    expect(topicHit).toMatchObject({
      systemName: "journal",
      layerIndex: 0,
      layerName: "topics",
      drillable: true,
    });
    expect(topicHit.href).toBe("/journal/topics/Polaris");
  });

  it("scoped query: routes to a specific layer with parentId", async () => {
    mockedAuth.mockResolvedValue({ user: { email: "test@example.com" } } as never);
    const polaris = await createTopic({ name: "Polaris" });
    const otherTopic = await createTopic({ name: "Other" });
    await createEntry({ topicId: polaris.id, body: "deploy ship note" });
    await createEntry({ topicId: otherTopic.id, body: "deploy elsewhere" });

    const res = await POST(
      jsonRequest({
        query: "deploy",
        scope: { systemName: "journal", layerIndex: 1, parentId: polaris.id },
      })
    );
    const json = await res.json();
    expect(json.results.length).toBeGreaterThan(0);
    expect(
      json.results.every((r: { href: string }) => r.href.includes("/Polaris"))
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run the integration tests**

Run: `bun run test:integration src/app/api/platform/palette/search/route.integration.test.ts`
Expected: PASS (5 tests)

If the run fails because no `DATABASE_URL_TEST` is set, set it in `.env` (mirror `DATABASE_URL`, pointing at a dedicated test DB) and re-run. The journal integration tests use the same setup.

- [ ] **Step 4: Run the full unit suite to confirm no regression**

Run: `bun test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/platform/palette/search/route.ts src/app/api/platform/palette/search/route.integration.test.ts
git commit -m "feat(palette): POST /api/platform/palette/search endpoint"
```

---

## Task 7: Add `firstLine` and `relativeTime` helpers and DRY `EntryCard`

**Files:**
- Create: `src/systems/journal/lib/format.ts`
- Create: `src/systems/journal/lib/format.test.ts`
- Modify: `src/systems/journal/components/EntryCard.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/systems/journal/lib/format.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { firstLine, relativeTime } from "./format";

describe("firstLine", () => {
  it("returns the first non-blank line trimmed", () => {
    expect(firstLine("\n\nhello world\nsecond", 80)).toBe("hello world");
  });

  it("truncates with an ellipsis when over the max length", () => {
    expect(firstLine("a".repeat(100), 10)).toBe("aaaaaaaaa…");
  });

  it("does not truncate when under the max length", () => {
    expect(firstLine("short", 10)).toBe("short");
  });

  it("returns empty string for empty body", () => {
    expect(firstLine("", 10)).toBe("");
  });

  it("returns empty string when only whitespace", () => {
    expect(firstLine("\n   \n", 10)).toBe("");
  });
});

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("formats minutes", () => {
    expect(relativeTime(new Date("2026-04-26T11:50:00Z"))).toContain("minute");
  });

  it("formats hours", () => {
    expect(relativeTime(new Date("2026-04-26T08:00:00Z"))).toContain("hour");
  });

  it("formats days", () => {
    expect(relativeTime(new Date("2026-04-23T12:00:00Z"))).toContain("day");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/systems/journal/lib/format.test.ts`
Expected: FAIL with "Cannot find module './format'"

- [ ] **Step 3: Implement the helpers**

Create `src/systems/journal/lib/format.ts`:

```typescript
const RTF = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function firstLine(body: string, maxLength: number): string {
  if (!body) return "";
  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return "";
  return line.length <= maxLength ? line : line.slice(0, maxLength - 1) + "…";
}

export function relativeTime(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return RTF.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RTF.format(hours, "hour");
  const days = Math.round(hours / 24);
  return RTF.format(days, "day");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/systems/journal/lib/format.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: DRY `EntryCard.tsx` to use the shared helper**

Edit `src/systems/journal/components/EntryCard.tsx`:

Replace the local `RTF` constant and `relativeTime` function (lines 11–21) with an import:

```tsx
"use client";

import { useState } from "react";
import type { JournalEntryWithTopic } from "../services/entries";
import { relativeTime } from "../lib/format";
import { ComposeBox } from "./ComposeBox";
import { EntryActions } from "./EntryActions";
import { MarkdownContent } from "./MarkdownContent";
import { TopicChip } from "./TopicChip";
import { TagChip } from "./TagChip";

export function EntryCard({ entry }: { entry: JournalEntryWithTopic }) {
  const [editing, setEditing] = useState(false);
  const edited = entry.updatedAt.getTime() > entry.createdAt.getTime() + 1000;

  if (editing) {
    return (
      <ComposeBox
        editingEntry={{
          id: entry.id,
          title: entry.title,
          body: entry.body,
          topic: { id: entry.topic.id, name: entry.topic.name },
        }}
        onSubmitted={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article id={`entry-${entry.id}`} className="entry-card">
      <div className="meta">
        <TopicChip name={entry.topic.name} />
        {entry.tags.map((t) => (
          <TagChip key={t} tag={t} />
        ))}
        <span className="time" title={new Date(entry.createdAt).toISOString()}>
          {relativeTime(new Date(entry.createdAt))}
        </span>
        <EntryActions entryId={entry.id} onEdit={() => setEditing(true)} />
      </div>
      {entry.title ? (
        <h3 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>{entry.title}</h3>
      ) : null}
      <MarkdownContent body={entry.body} />
      {edited ? (
        <p className="caption" style={{ margin: 0 }}>
          Edited {relativeTime(new Date(entry.updatedAt))}
        </p>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 6: Run the full unit suite to confirm no regression**

Run: `bun test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/systems/journal/lib/format.ts src/systems/journal/lib/format.test.ts src/systems/journal/components/EntryCard.tsx
git commit -m "feat(journal): extract firstLine + relativeTime helpers"
```

---

## Task 8: Replace journal palette stubs with real `topicsLayer` and `notesLayer`

**Files:**
- Modify: `src/systems/journal/palette.ts`

- [ ] **Step 1: Replace the stubs with the real implementations**

Overwrite `src/systems/journal/palette.ts`:

```typescript
import type { PaletteLayer } from "@/platform/palette/types";
import { prisma } from "@/platform/db/client";
import { searchEntries } from "./services/search";
import { firstLine, relativeTime } from "./lib/format";

export const topicsLayer: PaletteLayer = {
  name: "topics",
  singular: "topic",
  search: async (query, _parentId) => {
    const trimmed = query.trim();
    const topics = await prisma.journalTopic.findMany({
      where: {
        archived: false,
        ...(trimmed
          ? { name: { contains: trimmed, mode: "insensitive" as const } }
          : {}),
      },
      take: 10,
      orderBy: { updatedAt: "desc" },
    });
    return topics.map((t) => ({
      id: t.id,
      label: t.name,
      sublabel: t.description ?? undefined,
      icon: "folder" as const,
      href: `/journal/topics/${encodeURIComponent(t.name)}`,
      drillable: true,
    }));
  },
};

export const notesLayer: PaletteLayer = {
  name: "notes",
  singular: "note",
  search: async (query, parentId) => {
    const entries = await searchEntries({
      q: query,
      topicId: parentId ?? undefined,
      limit: 20,
    });
    return entries.map((e) => ({
      id: e.id,
      label: e.title ?? firstLine(e.body, 80),
      sublabel: relativeTime(new Date(e.createdAt)),
      icon: "file-text" as const,
      href: `/journal/topics/${encodeURIComponent(e.topic.name)}#entry-${e.id}`,
      drillable: false,
    }));
  },
};
```

- [ ] **Step 2: Re-run the route integration tests to confirm the journal layers wire up correctly**

Run: `bun run test:integration src/app/api/platform/palette/search/route.integration.test.ts`
Expected: PASS (5 tests). The "happy path" tests already exercise these layers end-to-end via the route handler.

- [ ] **Step 3: Run the full unit suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/systems/journal/palette.ts
git commit -m "feat(journal): real topics + notes palette layers"
```

---

## Task 9: Append palette CSS to `globals.css`

**Files:**
- Modify: `src/app/globals.css` (append at end of file)

- [ ] **Step 1: Append the palette styles**

Open `src/app/globals.css`. Scroll to the bottom of the file. Append:

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
  padding-top: 12vh;
}
.palette-modal {
  width: 640px;
  max-width: calc(100vw - var(--sp-8));
  background: var(--paper-0);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.palette-breadcrumb {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--ink-3);
  padding: var(--sp-2) var(--sp-4) 0;
}
.palette-input {
  font-family: var(--font-sans);
  font-size: var(--fs-md);
  background: transparent;
  border: 0;
  outline: 0;
  padding: var(--sp-3) var(--sp-4);
  color: var(--ink-0);
  border-bottom: 1px solid var(--border);
}
.palette-input::placeholder { color: var(--ink-4); }
.palette-results {
  list-style: none;
  margin: 0;
  padding: var(--sp-1) 0;
  max-height: 60vh;
  overflow-y: auto;
}
.palette-group-header {
  font-family: var(--font-sans);
  font-size: var(--fs-xs);
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
.palette-row.selected { background: var(--bg-hover); }
.palette-row .lbl { color: var(--ink-1); font-size: var(--fs-base); }
.palette-row .sublabel { color: var(--ink-3); font-size: var(--fs-sm); }
.palette-row .meta {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--ink-4);
}
.palette-empty {
  padding: var(--sp-3) var(--sp-4);
  color: var(--ink-3);
  font-size: var(--fs-sm);
}
.palette-divider {
  border-top: 1px solid var(--border);
  margin: var(--sp-1) 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(palette): tokenised palette modal styles"
```

---

## Task 10: Implement `useGlobalKeybinding` hook and `PaletteProvider` context

**Files:**
- Create: `src/platform/palette/client/useGlobalKeybinding.ts`
- Create: `src/platform/palette/client/PaletteProvider.tsx`

- [ ] **Step 1: Create the keybinding hook**

Create `src/platform/palette/client/useGlobalKeybinding.ts`:

```typescript
"use client";

import { useEffect } from "react";

export function useGlobalKeybinding(toggle: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);
}
```

- [ ] **Step 2: Create the provider**

Create `src/platform/palette/client/PaletteProvider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useGlobalKeybinding } from "./useGlobalKeybinding";
import { PaletteModal } from "./PaletteModal";

export interface PaletteScopeFrame {
  systemName: string;
  systemDisplayName: string;
  layerIndex: number;
  layerName: string;
  parentId: string | null;
  parentLabel: string;
}

interface PaletteContextValue {
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const Ctx = createContext<PaletteContextValue | null>(null);

export function usePalette(): PaletteContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePalette must be used inside <PaletteProvider>");
  return v;
}

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((s) => !s), []);

  useGlobalKeybinding(toggle);

  const value = useMemo(() => ({ open, close, toggle }), [open, close, toggle]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen ? <PaletteModal onClose={close} /> : null}
    </Ctx.Provider>
  );
}
```

- [ ] **Step 3: Commit (modal lands in next task — provider compiles standalone after Task 11)**

We will defer the commit until `PaletteModal` exists; otherwise this file fails to typecheck.

---

## Task 11: Implement `PaletteModal`

**Files:**
- Create: `src/platform/palette/client/PaletteModal.tsx`

- [ ] **Step 1: Create the modal component**

Create `src/platform/palette/client/PaletteModal.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/app/_components/Icon";
import type {
  MatchedSystem,
  PaletteResultWithMeta,
} from "../types";
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

  // Cache of ALL palette-bearing systems' layer metadata. Populated on mount
  // (via a separate empty-query fetch) and used for Tab-drill lookups even
  // when the current scoped response no longer contains matchedSystems.
  const systemsCatalogRef = useRef<Map<string, MatchedSystem>>(new Map());

  const currentScope = scopeStack[scopeStack.length - 1];

  const selectable = useMemo<SelectableItem[]>(() => {
    const items: SelectableItem[] = [];
    if (!currentScope && matchedSystems) {
      for (const s of matchedSystems) items.push({ kind: "system", system: s });
    }
    for (const r of results) items.push({ kind: "result", result: r });
    return items;
  }, [matchedSystems, results, currentScope]);

  // Reset selection when the visible list size changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [selectable.length]);

  // Focus input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  // Debounced fetch — runs whenever query or scope changes.
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
    if (!sys) return; // can't determine next layer name without catalog entry
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
        if (sel.kind === "system") {
          pushSystemScope(sel.system);
        } else {
          navigate(sel.result.href);
        }
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
      navigate,
    ]
  );

  const placeholder = !currentScope
    ? "Type to search systems and entities · Tab to drill in · Enter to open."
    : `Search ${currentScope.layerName} in ${currentScope.systemDisplayName}.`;

  const breadcrumb =
    scopeStack.length === 0
      ? null
      : "→ " + scopeStack.map((s) => s.parentLabel).join(" · ") + " ·";

  const noResults =
    !loading &&
    selectable.length === 0 &&
    query.length > 0 &&
    !(matchedSystems && matchedSystems.length > 0);

  // Group rendering: top-level shows a "Systems" group then the cross-system results;
  // scoped shows a flat list of results.
  const systemItems = selectable.filter(
    (s): s is { kind: "system"; system: MatchedSystem } => s.kind === "system"
  );
  const resultItems = selectable.filter(
    (s): s is { kind: "result"; result: PaletteResultWithMeta } => s.kind === "result"
  );

  function rowFor(index: number, kind: "system" | "result", node: React.ReactNode) {
    return (
      <li
        key={`${kind}-${index}`}
        className={`palette-row${index === selectedIndex ? " selected" : ""}`}
        aria-selected={index === selectedIndex}
        onMouseEnter={() => setSelectedIndex(index)}
        onClick={() => {
          const sel = selectable[index];
          if (!sel) return;
          if (sel.kind === "system") pushSystemScope(sel.system);
          else navigate(sel.result.href);
        }}
      >
        {node}
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
        {breadcrumb ? (
          <div className="palette-breadcrumb">{breadcrumb}</div>
        ) : null}
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Command palette input"
        />
        {selectable.length === 0 && query === "" && !loading ? (
          <p className="palette-empty">{placeholder}</p>
        ) : null}
        {noResults ? (
          <p className="palette-empty">
            {currentScope
              ? `No matching ${currentScope.layerName}.`
              : "No matches in any system."}
          </p>
        ) : null}
        {selectable.length > 0 ? (
          <ul className="palette-results">
            {systemItems.length > 0 ? (
              <>
                <li className="palette-group-header">Systems</li>
                {systemItems.map((s, i) =>
                  rowFor(
                    i,
                    "system",
                    <>
                      {s.system.icon ? (
                        <Icon name={s.system.icon as IconName} />
                      ) : (
                        <span />
                      )}
                      <div>
                        <div className="lbl">{s.system.displayName}</div>
                        <div className="sublabel">{s.system.name}</div>
                      </div>
                      <span className="meta">↹</span>
                    </>
                  )
                )}
                {resultItems.length > 0 ? <li className="palette-divider" /> : null}
              </>
            ) : null}
            {resultItems.map((r, i) => {
              const idx = systemItems.length + i;
              return rowFor(
                idx,
                "result",
                <>
                  {r.result.icon ? <Icon name={r.result.icon} /> : <span />}
                  <div>
                    <div className="lbl">{r.result.label}</div>
                    {r.result.sublabel ? (
                      <div className="sublabel">{r.result.sublabel}</div>
                    ) : null}
                  </div>
                  <span className="meta">
                    {r.result.systemDisplayName} · {r.result.layerName}
                  </span>
                </>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the client tree typechecks**

Run: `bun run lint`
Expected: PASS (or only pre-existing warnings).

- [ ] **Step 3: Commit (provider + hook + modal together — they form one client unit)**

```bash
git add src/platform/palette/client/useGlobalKeybinding.ts src/platform/palette/client/PaletteProvider.tsx src/platform/palette/client/PaletteModal.tsx
git commit -m "feat(palette): client provider, modal, and global Cmd-K binding"
```

---

## Task 12: Mount `PaletteProvider` in the root layout, conditional on session

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Wrap children with `PaletteProvider` only for authenticated sessions**

Replace the entire body of `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Source_Serif_4, Inter, JetBrains_Mono } from "next/font/google";
import { getOptionalSession } from "@/platform/auth/session";
import { PaletteProvider } from "@/platform/palette/client/PaletteProvider";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Polaris",
  description: "A personal operating system.",
  icons: {
    icon: "/brand/polaris-glyph.svg",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getOptionalSession();
  return (
    <html
      lang="en"
      className={`${sourceSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        {session?.user ? (
          <PaletteProvider>{children}</PaletteProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Build to confirm there are no SSR/typing issues**

Run: `bun run build`
Expected: Build succeeds. (Pre-existing build settings already type-check.)

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(palette): mount PaletteProvider in root layout for sessions"
```

---

## Task 13: Manual smoke test

Per spec §7, component tests for the modal and end-to-end flows are skipped for v1; manual smoke covers the keyboard model.

- [ ] **Step 1: Boot the dev environment**

Run: `bun dev`
Expected: Next.js dev server reachable at `http://localhost:3000`. Sign in if not already.

- [ ] **Step 2: Walk the keyboard model**

For each row, perform the listed action and confirm the expected result.

| Action | Expected |
| --- | --- |
| Press `Cmd-K` (or `Ctrl-K` on Linux/Windows) anywhere in the app while signed in | Modal opens, input focused, breadcrumb absent, placeholder reads "Type to search systems and entities · Tab to drill in · Enter to open." |
| With empty query, scroll the list | "Systems" group shows "Engineering Journal"; below the divider, recent topics + recent notes appear (cross-system fallback) |
| Type `pol` | Matched systems disappears (no system matches), results show topic "Polaris" and any matching notes |
| Press `Tab` on the topic "Polaris" | Breadcrumb becomes `→ Engineering Journal · Polaris ·`; input clears; placeholder reads "Search notes in Engineering Journal." |
| Type a term that appears in a note in Polaris | Notes filtered to that topic appear |
| Press `Enter` on a note | URL changes to `/journal/topics/Polaris#entry-<id>`; modal closes; the matching `EntryCard` scrolls into view and flashes briefly (existing `HashAnchorScroll`) |
| Re-open the palette and drill in again; press `Backspace` on empty input | Scope pops one level (back to top-level cross-system search) |
| Press `Esc` | Modal closes |
| Sign out, then `Cmd-K` | Nothing happens (provider not mounted) |

- [ ] **Step 3: If any cell fails, fix the underlying code, re-run `bun test`, and commit a fix per task convention. Then re-run the smoke walkthrough end-to-end.**

- [ ] **Step 4: Final verification**

Run: `bun test && bun run test:integration`
Expected: All suites PASS.

---

## Self-review notes

- Spec §1 file layout: every listed file is created or modified. ✔
- Spec §2 manifest extension: `palette?: PaletteSystemConfig` added in Task 2; types in Task 1. ✔
- Spec §3 registry: `getSystem`, `matchSystems`, `allLayers` plus tests for each in Task 3. ✔
- Spec §4 endpoint: route handler in Task 6 returns the documented shape (results with full meta + optional matchedSystems with layer metadata). Resolver behaviour matches the pseudocode (top-level fan-out + scoped routing + per-layer error isolation). ✔
- Spec §4 ranking: tier 1/2/3 + stable input order in Task 4. ✔
- Spec §5 client: `PaletteProvider`, `useGlobalKeybinding`, `PaletteModal` (input handlers, debounce, breadcrumb, scope stack, empty states, group header, system-vs-result rows). The modal carries a `systemsCatalogRef` to support drilling on cross-system results — the spec contemplates this implicitly via "the client can construct the new scope and breadcrumb label without a round-trip when the user Tabs on a system match" (Task 11). ✔
- Spec §6 journal integration: real layers in Task 8; `firstLine`/`relativeTime` helpers in Task 7; anchor-based deep links rely on the existing `HashAnchorScroll` component (already mounted in `topics/[name]/page.tsx`). ✔
- Spec §7 testing strategy: registry, rankResults, resolver unit tests; route integration tests with auth mock + DB; component tests for the modal explicitly out of scope. ✔
