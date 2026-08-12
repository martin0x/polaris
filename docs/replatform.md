# Polaris replatform

**Status:** ratified 2026-08-13 · **Sequencing:** expenses → journal → habits

Move the backend to Convex, add a full-parity Expo mobile app, and formalize
Bun as the toolchain — system by system, without losing a row of data or a
token of the design system.

| Decision | Choice |
| --- | --- |
| Auth | Convex Auth (Clerk is the named fallback) |
| Mobile scope | Full parity |
| Sequencing | System by system (strangler) |
| Web app | Next.js stays |

## 01 · Starting point

Next.js 16 on Vercel, Prisma 7 over Postgres (Neon in production, Docker
locally), NextAuth v5 with Google sign-in gated by an email allowlist, a
local/S3 storage driver, and a Vercel cron. Three live systems — journal,
expenses, habits — sit on a platform layer (auth, db, storage, feedback,
command palette) and register through manifests with hand-rolled REST route
tables. Roughly 12k lines of TypeScript; Bun is already the package manager.

Two structural facts shape the whole plan. First, the systems are genuinely
isolated — expenses and journal import nothing from each other. The one
coupling is that **habits writes into journal** (habit logs create journal
entries; habit creation makes a journal topic), which fixes the migration
order. Second, each system already splits transport (`routes/`) from logic
(`services/`) from pure helpers (`lib/`) — the services port to Convex
functions almost one to one, and the libs move to a shared package verbatim.

## 02 · Target architecture

```
polaris/                    # Bun workspaces
  apps/
    web/                    # Next.js — kept, pages move to Convex hooks
    mobile/                 # Expo + React Native, full parity
  packages/
    backend/                # convex/ schema, functions, crons, auth
    core/                   # framework-free logic: dates, stats, money, parser…
    tokens/                 # design tokens → generates globals.css + RN theme
```

Everything bespoke that existed because Next-plus-REST lacked it maps onto a
Convex primitive:

| Today | On Convex |
| --- | --- |
| Manifest route tables, `matchRoute`, per-route Zod parsing | Queries and mutations with argument validators, typed end to end via the generated `api` object |
| Hand-rolled client caches, sequence guards, optimistic updates | `useQuery` reactive subscriptions plus declared optimistic updates |
| `SyncQueue` offline expense capture | Convex client's built-in offline mutation queue (see risks) |
| Postgres `tsvector` + GIN journal search | Convex search index on entry body, filtered by topic and deletion |
| `tags String[]` with GIN index | `entryTags` join table maintained by entry mutations |
| Vercel cron + `CRON_SECRET` route | `crons.ts` — daily at 15:00 UTC (23:00 Manila) |
| Local/S3 storage driver + serve routes | Convex file storage with upload URLs |
| NextAuth + Prisma adapter + middleware | Convex Auth (Google), allowlist enforced in the user-creation callback |
| Vitest integration tests against a live test database | `convex-test` in-memory function tests — no Docker, no test database |

Data-shape rules for the whole migration: cuids become Convex ids but are
preserved as an indexed `legacyId` field so imports are idempotent and
auditable; `DateTime` columns become millisecond numbers; calendar-day fields
(habit ticks) stay `YYYY-MM-DD` strings; the `HabitTickStatus` enum becomes a
union of literals; the tsvector column is dropped in favor of the search
index.

## 03 · Bun: yes as toolchain, no as runtime

**Yes** — Bun as package manager, workspace tool, script runner, and `bunx`
for every CLI (convex, expo, next). This is already true today; the monorepo
formalizes it and it stays the single lockfile across all workspaces.

**No** — chasing the Bun *runtime* buys nothing here. Vercel runs the Next app
on Node in production, Convex functions execute in Convex's own runtime
regardless of local tooling, and Expo's Metro bundler is Node. Running
`next dev` under the Bun runtime would only create dev/prod divergence. Tests
stay on Vitest, since `convex-test` is built for it; Bun runs Vitest fine as
the package manager.

## 04 · Migration order

```
expenses → journal → habits
(standalone pilot · hardest data features · depends on journal)
```

Expenses first because it is fully standalone and exercises the two patterns
that matter most (optimistic capture, offline behavior) — it proves the
per-system playbook cheaply. Journal second because it owns the hard data
features (full-text search, tags, cron, soft delete) and unblocks habits.
Habits last because its mutations must call journal's Convex functions.
Convex and Postgres run side by side throughout; the app never stops being
usable.

## 05 · The phase plan

| Phase | Scope | Size |
| --- | --- | --- |
| 0 | Monorepo foundations — Bun workspaces, core package, Convex project scaffold | M |
| 1 | Auth swap and platform spine — Convex Auth, feedback module, storage module | L |
| 2 | Expenses on Convex — the pilot that proves the playbook | M |
| 3 | Journal on Convex — search, tags, cron, soft delete | L |
| 4 | Habits on Convex — cross-system contract formalized | M |
| 5 | Decommission — Postgres, Prisma, NextAuth, REST layer all deleted | S |
| 6 | Token package — design tokens shared between CSS and React Native | S |
| 7 | Expo app to full parity | XL |

### Phase 0 — Monorepo foundations (M)

Restructure into Bun workspaces with zero behavior change: the Next app moves
to `apps/web`, the framework-free `lib/` modules (dates, stats, money, months,
format, tasks, parser) move to `packages/core`, and `packages/backend` is
scaffolded with `bunx convex dev` wired to dev and prod deployments. CI, path
aliases, and Vercel config updated.

**Exit:** the deployed app is byte-for-byte the same product; tests green;
Convex dev loop works.

### Phase 1 — Auth swap and platform spine (L)

The one step that cannot be halved: Convex Auth with the Google provider
replaces NextAuth, with `allowlist.ts` ported verbatim into the user-creation
callback. The web middleware swaps to Convex's, the sign-in page keeps its
design, and the legacy REST catch-all switches its gate from NextAuth session
to Convex token validation so old routes stay protected during the strangler
window. Auth tables carry no history worth migrating — one re-login and the
Google integration re-connects.

Two platform modules stand up now because every system depends on them: the
**feedback module** (metrics, reflections, iterations — its historical rows
are the first, low-stakes data import and the rehearsal for the real ones) and
the **file storage module**.

**Spike, timeboxed:** Convex Auth on a throwaway Expo screen before committing
everywhere. If it fights back, the fallback is Clerk with the allowlist
enforced in Convex functions — decide here, not in phase 7.

**Exit:** production sign-in runs through Convex Auth; NextAuth and its four
Prisma tables are gone.

### Phase 2 — Expenses on Convex (M)

Schema (`expenseActivityTypes`, `expenseActivities`, `expenseItems`), services
ported to queries and mutations, trends aggregation done in TypeScript over an
indexed range — fine at personal scale. The capture page moves to `useQuery`
plus optimistic mutations and **retires `SyncQueue`** in favor of Convex's
built-in offline queue. Data import runs the playbook (section 06) for the
first time. Integration tests move to `convex-test`.

**Exit:** expenses reads and writes only Convex; the playbook doc is corrected
with what was learned.

### Phase 3 — Journal on Convex (L)

The largest tables and the hardest features. A search index on entry body
replaces tsvector, with an acceptance pass against the real corpus and real
queries before flipping. Tags move to an `entryTags` join table. The nightly
compute-active-topics job moves to `crons.ts`; the cron route and
`CRON_SECRET` die. The Tiptap editor is untouched — it already speaks markdown
and simply posts through mutations. Import order: topics, then entries with
topic ids remapped.

**Exit:** journal fully on Convex; search accepted on real data; no Vercel
cron remains.

### Phase 4 — Habits on Convex (M)

The habits-to-journal coupling becomes explicit: topic creation, archival, and
log-entry writes go through journal's `internalMutation`s — the formal version
of today's informal service imports. The `HabitTracker` client deletes its
week cache, sequence guards, and prefetch bookkeeping for one `useQuery` per
week plus an optimistic tick mutation. "Today" becomes fully client-owned
(device timezone), removing the server's `POLARIS_TZ` guesswork.

**Exit:** no live Postgres tables remain; the decommission gate opens.

### Phase 5 — Decommission (S)

Delete the catch-all API route, `matchRoute`, the route-error helpers, Prisma
and its generated client, the Docker Postgres, Neon, and `db-clone-prod.sh`.
The command palette resolver re-points its system layers at Convex queries.
Stored blobs copy from S3/local into Convex storage and the driver abstraction
goes. Backups replace the clone script with a scheduled `bunx convex export`
snapshot — data ownership stays intact, and Convex's open-source self-host
option remains the documented escape hatch.

**Exit:** one backend; final row-count and checksum reconciliation archived.

### Phase 6 — Token package (S)

`packages/tokens` becomes the source of truth for the ~196 design tokens.
Codegen emits the `:root` blocks of `globals.css` — verified byte-identical by
diff, so the web changes nothing — and a typed React Native theme object.
Fraunces, Plus Jakarta Sans, and IBM Plex Mono load on mobile via
expo-google-fonts; `lucide-react-native` mirrors the `Icon` contract (stroke
1.5, 16px default, currentColor).

**Exit:** web visually unchanged with proof; mobile theme ready.

### Phase 7 — Expo app to full parity (XL)

Staged internally, shipped when the parity checklist is green:

- **Shell** — Expo Router, Convex client, Convex Auth with secure token
  storage, theme and fonts from the token package, tab navigation. The design
  system's rules (tokens, typography, sentence case, voice) carry over; its
  desktop chrome (TitleBar, sidebar) is reinterpreted for mobile idioms in a
  short adaptation memo.
- **Core screens** — habits week grid with tick interactions (haptics standing
  in for sounds), expense capture with camera into Convex storage, journal
  browsing and markdown-first composing.
- **Hard parity items** — charts hand-rolled in react-native-svg (the
  heatmaps, streak tiles, and trend lines are bespoke enough that matching the
  web design directly beats theming a chart library); the rich editor via a
  **10tap-editor spike** (Tiptap on React Native — riskiest single item;
  fallback is a markdown composer, and since entries are markdown at rest the
  data is identical either way); a search screen standing in for the ⌘K
  palette on the same resolver; trends, settings, dashboard.
- **Ship** — parity audit against the feature inventory, EAS dev builds,
  TestFlight, icon and splash from the Polaris glyph.

**Exit:** every feature-inventory row checked off on a device.

## 06 · Data migration playbook

Run once per system, at its flip. Single-user scale makes the freeze window
minutes, not hours.

1. **Export** — a Bun script reads Postgres through Prisma and emits JSONL per
   table, cuids intact.
2. **Import** — an internal Convex mutation inserts documents, builds the
   cuid-to-id map, remaps relations, and converts dates. Idempotent by
   `legacyId` upsert, so it can rerun safely.
3. **Freeze, verify, flip** — stop writing to that system, run the final
   export/import, verify, point the UI at Convex. Postgres tables stay as a
   frozen archive until phase 5.

**Verification per table:** row counts, plus domain checksums that would catch
remap errors — sum of `amountCentavos` per month, tick counts per habit, entry
counts per topic — and a side-by-side comparison of old API output versus new
query output for a sample of records.

## 07 · Hindsight: could the systems have been built better?

Mostly, no — and the proof is how cheap this migration is. The route tables,
`matchRoute`, per-route validation, the client caches with sequence guards,
and `SyncQueue` look like over-engineering in hindsight, but they were the
platform tax of REST-on-Next: mini-frameworks built because the platform
lacked them. Convex deletes those categories outright rather than translating
them. The decisions that *were* ours — services split from transport,
framework-free libs, isolated systems, plain-string cross-system references —
are exactly why the port is nearly mechanical. Keep making those.

Genuine improvements to fold into the port:

- **Formalize the habits→journal contract** as internal mutations instead of
  reaching into another system's service module.
- **Make feedback recording unable to fail user actions** — record metrics via
  the Convex scheduler (`runAfter(0, …)`) rather than inline calls sprinkled
  through services.
- **Move "today" to the client.** The server guessing the user's calendar day
  via `POLARIS_TZ` was always a smell; device-local day strings unify web and
  mobile.
- **One validation layer.** Route-level Zod plus service-level checks collapse
  into Convex argument validators.
- **Tags become a join table**, indexable instead of GIN-dependent.
- **Tests stop needing infrastructure** — `convex-test` replaces the
  live-database integration suite.

Kept as designed: the palette registry and resolver, the manifest concept
(minus its route table — it remains the nav, palette, and dashboard
declaration), the design system CSS, the component tree, and the docs.

## 08 · Risks and early spikes

| Risk | Mitigation | When |
| --- | --- | --- |
| Convex Auth is beta; Expo flow unproven here | Timeboxed spike on web and a throwaway Expo screen; Clerk is the named fallback | Phase 1 |
| Search regression vs Postgres FTS (prefix semantics, simpler ranking) | Acceptance pass on the real corpus before flipping; fallback is a client-side index over the small corpus | Phase 3 |
| Rich editor on React Native | 10tap-editor spike early in the mobile phase; markdown composer fallback loses no data | Phase 7 |
| Offline capture: Convex's queue doesn't survive a page reload, unlike `SyncQueue`'s localStorage replay | Accept on web (rare case; mobile app becomes the real capture surface); a thin localStorage journal is the escape hatch if it bites | Phase 2 |
| Vendor dependence contradicts "Polaris is mine" | Scheduled `convex export` backups; self-hosted Convex documented as the exit | Phase 5 onward |
| Next 16 (canary) compatibility with Convex's Next integration | Verify versions against the in-repo Next docs before phase 1 lands | Phase 1 |

## 09 · Out of scope, on the backlog

- Push notifications and habit reminders (Expo push + Convex scheduler —
  natural once mobile ships).
- Camera-first grocery capture flow beyond basic photo attach.
- Home-screen widgets.
- Client-side palette ranking for lower latency.
- Search upgrades if the Convex index disappoints on real use.
