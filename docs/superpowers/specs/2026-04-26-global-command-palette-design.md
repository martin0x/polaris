# Global Command Palette — Design Spec

**Date:** 2026-04-26
**Author:** Raymart Villos
**Status:** Draft. Brainstormed alongside the Engineering Journal spec
(`2026-04-26-engineering-journal-design.md`). Builds on top of the platform
foundation (`2026-04-22-platform-foundation-design.md`). Sequenced to ship
**after** the Engineering Journal — the journal is the first and only
initial consumer.

## Overview

A platform-level command palette that lets the user navigate across every
Polaris system from a single Cmd-K input. Each system extends its
`SystemManifest` with a `palette: { layers }` block declaring its searchable
entity hierarchy. The palette walks those layers via Tab to drill, Enter to
open, with a breadcrumb-style scope indicator.

The palette is a navigator, not a command runner. It opens any system, any
topic, any note (and, in the future, any transaction, any workout session,
any habit) in a few keystrokes from anywhere in the platform.

This spec is intentionally generic: while the Engineering Journal is the
only consumer at ship time, the manifest extension is designed so any future
system declares its palette participation in one place with no platform-side
code changes.

## Scope

### In scope for v1

- Global Cmd-K / Ctrl-K keybinding to open the palette. Esc closes.
- Centered modal UI (~640px) with dimmed backdrop, mounted in the root
  layout for authenticated sessions only.
- Top-level autocomplete: input matches against registered system
  names/displayNames first.
- Drill-down via Tab using the manifest's `palette.layers`. Breadcrumb-style
  scope indicator (`→ Journal · Polaris ·`). Backspace on empty input pops
  one level.
- Enter on any result navigates to its `href` and closes the palette.
- Cross-system fallback: when the top-level input doesn't match a system,
  every system's layers run with `parentId: null` and results merge.
- Server-side search aggregation endpoint at
  `/api/platform/palette/search`, auth-gated.
- 150ms debounce on input. Loading spinner; previous results stay visible
  until new ones arrive.
- Empty-query hint copy. Empty-results message per the design system's
  voice.
- Engineering Journal as the only initial consumer; manifest extension is
  generic and future-system-ready.

### Explicitly out of scope for v1

- **Actions / commands.** No "Create new entry," no "Open settings." Palette
  is navigation only.
- **Recents / favorites / pinned items.** Empty palette is empty results.
- **Custom per-system row rendering.** All rows use the shared `label /
  sublabel / icon` template.
- **Fuzzy matching library.** Each layer brings its own match logic
  (`ILIKE`, FTS, etc.).
- **Mobile / touch-optimized variants.** Palette assumes a keyboard.
- **Persistent palette state across sessions / page reloads.**
- **Theming, custom positions, custom widths.**
- **Sidebar / TitleBar visual integration** beyond an optional subtle `Cmd-K`
  hint.

## 1. Architecture & File Layout

Palette code lives at the platform level. The journal's contribution is
limited to its `manifest.palette` block plus a small `palette.ts` module.

```
src/platform/palette/
  types.ts                    # PaletteResult, PaletteLayer, scope types
  registry.ts                 # buildPaletteRegistry(manifests)
  resolver.ts                 # resolveQuery({ query, scope }) — server-side dispatcher
  rankResults.ts              # cross-system relevance score
  client/
    PaletteProvider.tsx       # context: open state, scope stack, query, results
    PaletteModal.tsx          # the modal UI (input, breadcrumb, result list)
    useGlobalKeybinding.ts    # Cmd-K listener
src/app/api/platform/palette/
  search/route.ts             # POST /api/platform/palette/search
src/app/layout.tsx            # mounts <PaletteProvider> conditionally on session
src/systems/types.ts          # extended with `palette?: PaletteSystemConfig`
src/systems/journal/palette.ts # journal's two PaletteLayers
```

The `client/` subfolder is the only piece that ships to the browser; the
rest is server-side TypeScript that runs inside Next.js route handlers and
the manifest registry.

## 2. Manifest Extension Contract

```typescript
// src/platform/palette/types.ts

import type { IconName } from "@/app/_components/Icon";

export interface PaletteResult {
  id: string;              // used as parentId when drilling into the next layer
  label: string;           // primary text in the row
  sublabel?: string;       // optional secondary line
  icon?: IconName;         // optional Lucide icon
  href: string;            // navigation target on Enter
  drillable?: boolean;     // if true, Tab drills into the next layer using this id
}

export interface PaletteLayer {
  name: string;            // plural — "topics", "notes" (used in breadcrumb)
  singular: string;        // singular — "topic", "note" (used in placeholder)
  search(query: string, parentId: string | null): Promise<PaletteResult[]>;
}

export interface PaletteSystemConfig {
  layers: PaletteLayer[];  // ordered outermost → leaf
}
```

`src/systems/types.ts` extends `SystemManifest` with an optional `palette`
field:

```typescript
export interface SystemManifest {
  // ...existing fields...
  palette?: PaletteSystemConfig;
}
```

Systems without a `palette` block are still navigable by their top-level
system name (autocomplete + Enter opens `nav.href`); they just don't expose
deep entity layers.

### `parentId` semantics

- `parentId === null` means "no parent constraint." Layers must support this
  for cross-system fallback to work — e.g., the journal's `notes` layer with
  `parentId: null` searches across all topics.
- `parentId === string` is opaque to the platform; the layer interprets it
  however its model requires (topic id for journal, account id for budgeting,
  etc.).

### Result `id` semantics

`result.id` is what the palette passes as `parentId` to the next layer's
`search` when the user drills. The palette never inspects the id beyond
that.

## 3. Registry

`buildPaletteRegistry(manifests)` produces an in-memory structure indexed by
system name. Built once at module load from `src/systems/index.ts`,
following the same pattern as `createSystemRegistry`.

```typescript
// src/platform/palette/registry.ts

export interface PaletteRegistry {
  getSystem(name: string): { manifest: SystemManifest; palette: PaletteSystemConfig } | null;
  matchSystems(query: string): Array<{ name: string; displayName: string; icon?: IconName }>;
  allLayers(): Array<{
    systemName: string;
    systemDisplayName: string;
    layerIndex: number;
    layer: PaletteLayer;
  }>;
}

export function buildPaletteRegistry(manifests: SystemManifest[]): PaletteRegistry;
```

`matchSystems(query)` returns systems whose `name` or `displayName` matches
query case-insensitively (substring). Empty query returns all systems with a
`palette` block.

`allLayers()` returns a flat list of every layer across every system, used
by cross-system fallback.

## 4. Aggregation Endpoint

`POST /api/platform/palette/search`

Auth-gated via `getSession()` from `src/platform/auth/session.ts`.
Unauthenticated requests get 401.

### Request

```typescript
{
  query: string;
  scope?: {
    systemName: string;
    layerIndex: number;
    parentId: string | null;
  };
}
```

### Response

```typescript
{
  results: Array<PaletteResult & {
    systemName: string;
    systemDisplayName: string;
    layerIndex: number;       // index into the system's palette.layers
    layerName: string;
  }>;
  matchedSystems?: Array<{    // only when scope is undefined (top-level query)
    name: string;
    displayName: string;
    icon?: IconName;
    layers: Array<{ name: string; singular: string }>;  // empty array if system has no palette block
  }>;
}
```

`layerIndex` is included on every result so the client can compute the
correct next-layer scope when the user Tab-drills on a result from
cross-system fallback (where `scopeStack` is empty but the result still
belongs to a specific layer).

Each `matchedSystems` entry includes its layer metadata (`name`, `singular`)
so the client can construct the new scope and breadcrumb label without a
round-trip when the user Tabs on a system match. Systems without a
`palette` block return `layers: []` and Tab is a no-op for them.

### Resolver behavior (`resolver.ts`)

```
resolveQuery({ query, scope }):
  if scope is undefined:
    matchedSystems = registry.matchSystems(query)
    fallbackResults = await Promise.all(
      registry.allLayers().map(({ layer, systemName, systemDisplayName, layerIndex }) =>
        layer.search(query, null)
          .then(rs => rs.map(r => ({
            ...r,
            systemName,
            systemDisplayName,
            layerIndex,
            layerName: layer.name,
          })))
          .catch(err => { log(err); return []; })
      )
    ).then(flat)
    ranked = rankResults(fallbackResults, query)
    return { matchedSystems, results: ranked.slice(0, 30) }
  else:
    system = registry.getSystem(scope.systemName)
    layer = system.palette.layers[scope.layerIndex]
    raw = await layer.search(query, scope.parentId).catch(err => { log(err); return []; })
    return { results: raw.map(r => ({
      ...r,
      systemName: scope.systemName,
      systemDisplayName: system.manifest.displayName,
      layerIndex: scope.layerIndex,
      layerName: layer.name,
    })) }
```

Errors from individual layer searches are isolated — a failing layer logs
but does not fail the whole request. The endpoint returns whatever
succeeded.

### `rankResults.ts`

For cross-system fallback, results from multiple layers and systems must
share a comparable ordering. The default ranking scheme:

1. Exact-prefix match on `label` ranks highest.
2. Substring match on `label` ranks next.
3. Substring match on `sublabel` ranks lower.
4. Within each tier, recency wins (sublabel-derived timestamp if available;
   otherwise the layer's own ordering).

The function is intentionally simple. Each layer can override by ranking
internally before returning — `rankResults` just preserves their order
within a tier.

## 5. Client Architecture

`<PaletteProvider />` is a React context provider mounted in the root
layout for authenticated sessions only:

```tsx
// src/app/layout.tsx (excerpt)

const session = await getOptionalSession();
return (
  <html lang="en">
    <body>
      {session ? <PaletteProvider>{children}</PaletteProvider> : children}
    </body>
  </html>
);
```

Auth pages (signin) get bare children; everything else gets the palette
wrapper.

### `<PaletteProvider />` state

- `isOpen: boolean`
- `scopeStack: Array<{ systemName: string; systemDisplayName: string; layerIndex: number; layerName: string; parentId: string | null; parentLabel: string }>`
- `query: string`
- `results: PaletteResultWithMeta[]`
- `matchedSystems?: Array<{ name; displayName; icon? }>`
- `selectedIndex: number`
- `loading: boolean`

### `useGlobalKeybinding`

Attaches a `keydown` listener to `document` that toggles `isOpen` on
`(e.metaKey || e.ctrlKey) && e.key === "k"` (and `preventDefault`). Cleaned
up on unmount.

### `<PaletteModal />`

Renders when `isOpen`. Owns the input keyboard handlers:

- **Cmd-K (already open):** close (toggle off).
- **Esc:** close.
- **Up / Down:** move `selectedIndex` within the visible result list.
- **Enter:** navigate to `results[selectedIndex].href`, close palette.
- **Tab:** depends on the selection's group:
  - On a **matched system** (top-level systems group): push
    `{ systemName, systemDisplayName, layerIndex: 0, layerName: layers[0].name, parentId: null, parentLabel: systemDisplayName }`.
    Clear `query`.
  - On a **drillable result** (`result.drillable === true`): push
    `{ systemName: result.systemName, systemDisplayName: result.systemDisplayName, layerIndex: result.layerIndex + 1, layerName: layers[result.layerIndex + 1].name, parentId: result.id, parentLabel: result.label }`.
    Clear `query`. Works regardless of whether the result came from a
    scoped layer query or the cross-system fallback.
  - On a non-drillable result: no-op.
- **Backspace on empty input:** pop one entry from `scopeStack`. If the
  stack is empty, no-op (don't close).

The breadcrumb at the top of the modal renders the system name once,
followed by each subsequent scope entry's `parentLabel`, separated by ` · `.
For example: with `scopeStack = [{ layerIndex: 0, parentLabel: "Engineering Journal" }, { layerIndex: 1, parentLabel: "Polaris" }]`,
the breadcrumb reads `→ Engineering Journal · Polaris ·`. The input sits
below the breadcrumb; the result list sits below the input.

Input changes trigger a 150ms-debounced fetch to
`/api/platform/palette/search` with the current scope (or undefined scope at
top level). Previous result list stays rendered until new results arrive
(no flash of empty).

### Result rendering

Each row uses a shared template:

```
[icon]  Label                                System · LayerName
        Sublabel                                          ⏎
```

At top level (no scope), system matches render as a separate group above
the cross-system fallback results, with a `Systems` group header. Other
result groups render flat under a divider.

### Empty states

- Empty query, no scope: hint text "Type to search systems and entities ·
  Tab to drill in · Enter to open."
- Empty query, scoped: hint text "Search <singular>s in <system>." (e.g.,
  "Search topics in Engineering Journal.")
- Non-empty query, zero results: "No matches in any system." (top level) or
  "No matching <plural>." (scoped).

All copy follows the design system's empty-state voice rules — sentence
case, no exclamations, no apologies.

## 6. Journal Integration

The journal's contribution is a single `palette.ts` module that exports two
`PaletteLayer` instances, plus the `palette` block in its manifest.

```typescript
// src/systems/journal/palette.ts

import type { PaletteLayer } from "@/platform/palette/types";
import { prisma } from "@/platform/db/client";
import { searchEntries } from "./services/search";
import { firstLine, relativeTime } from "./lib";

export const topicsLayer: PaletteLayer = {
  name: "topics",
  singular: "topic",
  search: async (query, _parentId) => {
    const topics = await prisma.journalTopic.findMany({
      where: {
        archived: false,
        ...(query && { name: { contains: query, mode: "insensitive" } }),
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
    // parentId === topicId; null means cross-topic
    const entries = await searchEntries({
      q: query,
      topicId: parentId ?? undefined,
      limit: 20,
    });
    return entries.map((e) => ({
      id: e.id,
      label: e.title ?? firstLine(e.body, 80),
      sublabel: relativeTime(e.createdAt),
      icon: "file-text" as const,
      href: `/journal/topics/${encodeURIComponent(e.topicName)}#entry-${e.id}`,
      drillable: false,
    }));
  },
};
```

Manifest:

```typescript
// src/systems/journal/manifest.ts (excerpt)

import { topicsLayer, notesLayer } from "./palette";

export const manifest: SystemManifest = {
  // ...existing fields...
  palette: {
    layers: [topicsLayer, notesLayer],
  },
};
```

`searchEntries` is the same helper that powers the journal's per-system
search bar at `/journal/search?q=...`. Sharing the helper means the palette
benefits from any improvement to the in-system search query and there's
exactly one canonical FTS query.

### Anchor-based deep links

Notes in the palette navigate to the topic page with an `#entry-<id>`
anchor. The topic page reads `window.location.hash` on mount, scrolls the
matching `<EntryCard />` into view, and applies a temporary highlight class
for ~1.5s. This avoids needing a single-entry standalone route in v1 while
giving the palette a precise navigation target.

## 7. Testing Strategy

Vitest, in `src/platform/palette/__tests__/`.

### Required

- **Unit: `rankResults.ts`.** Exact-prefix outranks substring; substring on
  label outranks substring on sublabel; recency breaks ties.
- **Unit: `registry.ts`.** `matchSystems` substring-matches name and
  displayName, case-insensitive; `matchSystems("")` returns all systems
  with a palette block; `allLayers` returns a flat structure for a fixture
  manifest set; missing-palette manifests are skipped.
- **Integration: `resolver.ts`.** Given a fake registry with two systems,
  verify:
  - top-level query matches systems first;
  - scoped query routes to the correct layer with the correct `parentId`;
  - layer errors don't break the whole response (other layers still
    return);
  - empty query at top level returns matched systems plus an empty or
    layer-default result set.
- **Integration: `POST /api/platform/palette/search`.** Auth gate (401
  without session); happy path with the journal registered; error
  isolation (one layer throws, response still 200 with partial results).

### Skipped for v1

- **Component tests for `<PaletteModal />`.** Keyboard handlers and React
  Testing Library on portal modals are notoriously brittle. Manual smoke
  covers v1.
- **E2E tests.** No Playwright/Cypress in the platform yet. Manual smoke
  through the keyboard model on each PR.

## What This Spec Does NOT Cover

- Actions / commands ("Create new entry," "Open settings," etc.). The
  palette is navigation only in v1. A future "Commands" spec can layer on
  by adding a parallel `commands` block to the manifest extension.
- Recents / favorites / pinned items. Empty palette is empty results.
- Custom per-system row rendering or per-row keyboard actions.
- Fuzzy matching across the platform. Each layer brings its own match
  logic.
- Mobile / touch-optimized variants. Palette assumes a keyboard.
- Persistent palette state across sessions / page reloads. Open is clean.
- Theming, sizing, position customization.
- Sidebar / TitleBar visual integration beyond an optional subtle `Cmd-K`
  hint.
- Single-entry standalone page at `/journal/entries/[id]`. The
  `#entry-<id>` anchor pattern carries v1.
- Future systems' palette integrations (budgeting, workouts, etc.). The
  manifest extension is designed to support them; specific systems will
  declare their layers when they ship.
