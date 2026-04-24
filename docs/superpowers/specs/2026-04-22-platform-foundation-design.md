# Polaris Platform Foundation — Design Spec

**Date:** 2026-04-22 (spec), 2026-04-24 (implementation)
**Author:** Raymart Villos
**Status:** Implemented. This document has been updated to describe the as-built
foundation; sections that diverge from the original design are called out.

## Overview

The platform foundation for Polaris — a personal operating system built for a
single user. This spec covers the shared infrastructure that all future systems
will plug into: authentication, database, API layer, file storage, job
processing, integration framework, system conventions, feedback mechanisms, and
the Polaris Design System.

## Tech Stack

| Concern | Choice |
|---|---|
| Language | TypeScript 5 (full-stack) |
| Runtime / package manager | **Bun** (lockfile `bun.lock`; Bun also runs the worker entrypoint and the Prisma seed script directly) |
| Frontend + API | Next.js **16.2.4** (App Router), React 19.2.4 |
| Styling | Tailwind CSS v4 (via `@tailwindcss/postcss`) + Polaris design tokens in `src/app/globals.css` |
| Database | PostgreSQL **17** + **Prisma 7** (driver-adapter mode via `@prisma/adapter-pg`) |
| Auth | NextAuth.js v5 (Auth.js beta) with Google OAuth, **JWT session strategy** |
| File storage | Local filesystem (dev), S3-compatible (prod), behind abstraction |
| Job processing | BullMQ + ioredis |
| Testing | Vitest |
| Linting | ESLint v9 (flat config) |
| Deployment | Local first, designed toward Docker Compose (Bun-based image) |

## Architecture

Monolith with convention-based system directories. Systems are self-contained
folders under `src/systems/` that register themselves via a manifest. The
platform provides shared infrastructure under `src/platform/`.

Two architectural decisions matter beyond the directory layout:

1. **Auth is split into an edge-safe config and a Prisma-backed instance.**
   Next.js middleware runs on the Edge Runtime, which cannot import Prisma.
   `src/platform/auth/auth.config.ts` contains the providers, callbacks, and
   session strategy with no database dependency; `src/platform/auth/config.ts`
   wraps it with `PrismaAdapter` for use in server components and API routes.
   Middleware instantiates its own `NextAuth(authConfig)` locally.

2. **Prisma uses the driver-adapter pattern, not the default engine.** The
   schema's `datasource db` declares no `url`. Instead,
   `src/platform/db/client.ts` reads `DATABASE_URL` at runtime and picks either
   Prisma Accelerate (for `prisma://` / `prisma+postgres://` URLs) or a direct
   Postgres connection wrapped in `PrismaPg` from `@prisma/adapter-pg`. The
   Prisma Client is generated into `src/generated/prisma/` (gitignored) and
   imported as `@/generated/prisma/client`, not `@prisma/client`.

## 1. Project Structure

```
polaris/
  src/
    app/                             # Next.js App Router
      (platform)/                    # Protected platform routes (dashboard, settings)
        dashboard/
        settings/
        layout.tsx                   # App shell: TitleBar + Sidebar + main
      api/
        auth/[...nextauth]/          # NextAuth handler
        platform/
          storage/
            upload/
            [...key]/
          jobs/
        systems/[system]/            # Dynamic system API routes
          [...path]/
      auth/signin/                   # Sign-in page (outside the protected group)
      _components/                   # Design-system primitives
        Icon.tsx
        TitleBar.tsx
        Sidebar.tsx
        PolarisGlyph.tsx
      layout.tsx                     # Root layout; loads the three fonts
      page.tsx                       # Redirect to /dashboard
      globals.css                    # Tailwind + Polaris tokens (~726 lines)
    generated/
      prisma/                        # Generated Prisma Client (gitignored)
    middleware.ts                    # Edge-runtime auth guard
    platform/                        # Shared platform infrastructure
      auth/
        auth.config.ts               # Edge-safe NextAuth config (no Prisma)
        config.ts                    # Full NextAuth instance (with PrismaAdapter)
        session.ts                   # getSession / getOptionalSession helpers
      db/
        client.ts                    # Prisma client singleton (adapter-pg + Accelerate detection)
      storage/
        types.ts
        local.ts
        s3.ts
        index.ts                     # Factory driven by STORAGE_DRIVER
      jobs/
        connection.ts                # Shared Redis connection (ioredis)
        queue.ts
        worker.ts
        registry.ts
        start-workers.ts             # Standalone worker entrypoint
      integrations/
        types.ts
        registry.ts
      feedback/
        service.ts
        index.ts                     # `feedback` singleton
      api/
        router.ts                    # matchRoute helper for dynamic system routing
        errors.ts                    # apiError, notFound, unauthorized, badRequest
    systems/                         # Self-contained system modules
      types.ts                       # SystemManifest
      registry.ts                    # createSystemRegistry
      index.ts                       # Aggregates manifests (empty on v0)
      _template/                     # Starter template
        components/
        services/
        schemas/
        routes/
        manifest.ts
    lib/
      utils.ts                       # formatDate helper
  prisma/
    schema.prisma
    seed.ts
    migrations/
      20260424071851_init/
  docs/
    design/                          # Polaris Design System docs
      README.md
      polaris-design-system.md
      tokens-reference.css
      preview-cards-reference/       # Swatch + component reference HTML
      ui-kit-reference/              # Full workspace HTML/JSX prototype
  docker/
    docker-compose.yml               # Postgres 17 (host 5440) + Redis 7 (host 6377)
    Dockerfile                       # Multi-stage Bun build (oven/bun:1)
    .dockerignore
  public/
  .env.example
  next.config.ts
  postcss.config.mjs
  eslint.config.mjs
  vitest.config.ts
  tsconfig.json
  package.json
  bun.lock
```

Key decisions:
- `src/platform/` holds all shared infrastructure — this is what systems import
  from.
- `src/systems/` holds all system modules — each is a self-contained folder.
- `src/app/` is Next.js routing; platform pages use the `(platform)` route
  group, system pages will live under a `(systems)` group as they're added.
- `src/app/_components/` holds the design-system primitives that are shared
  across all pages. The leading underscore keeps them out of the route tree.
- `src/generated/prisma/` is emitted by `prisma generate` and imported
  throughout the codebase; it's gitignored.
- `_template/` gives a copy-paste starting point for new systems.
- `docker/` is present from day one but not required to run locally except for
  Postgres and Redis containers.

## 2. Authentication

NextAuth.js v5 with Google OAuth, configured for a single user and split across
two files so it stays edge-compatible.

**File split:**

- `src/platform/auth/auth.config.ts` — exports `authConfig: NextAuthConfig`.
  Contains the Google provider, the `signIn` callback (which checks
  `user.email === process.env.ALLOWED_EMAIL`), the `pages.signIn` override, and
  `session.strategy: "jwt"`. **No Prisma import**, so it runs in the Edge
  Runtime.
- `src/platform/auth/config.ts` — imports `authConfig`, spreads it into
  `NextAuth({ ...authConfig, adapter: PrismaAdapter(prisma) })`, and re-exports
  `handlers`, `auth`, `signIn`, `signOut`. Used in server components and API
  routes.
- `src/platform/auth/session.ts` — thin helpers: `getSession()` throws if
  unauthenticated, `getOptionalSession()` returns nullable.
- `src/app/api/auth/[...nextauth]/route.ts` — re-exports `GET` and `POST` from
  `handlers`.

**Middleware:**

- `src/middleware.ts` builds its own local `NextAuth(authConfig)` instance from
  the edge-safe config. It redirects unauthenticated requests to
  `/auth/signin`, with a matcher that excludes `/api/auth`, static assets, and
  the favicon.

**Session strategy:**

- JWT. Database sessions would require Prisma, which isn't available on the
  Edge Runtime. The `Session` and `VerificationToken` Prisma tables remain
  because the `@auth/prisma-adapter` contract includes them, and they're
  available if email verification is added later.

**Prisma 7 compatibility:**

- `@auth/prisma-adapter` has not been updated for Prisma 7's client types, so
  `config.ts` uses `PrismaAdapter(prisma as any)` with an eslint-disable
  comment. Remove the cast when the adapter publishes a Prisma-7-compatible
  release.

**Schema:**

- NextAuth's standard tables via the Prisma adapter: `User`, `Account`,
  `Session`, `VerificationToken`.

## 3. Database

PostgreSQL 17 with Prisma 7 in driver-adapter mode.

**Schema:**

- Single Prisma schema at `prisma/schema.prisma` containing all models.
- Generator block declares `provider = "prisma-client"` (the Prisma 7 ESM-first
  generator) with `output = "../src/generated/prisma"`.
- `datasource db { provider = "postgresql" }` intentionally has **no `url`
  line**. The URL is resolved at runtime by the client factory.
- Each system's models are grouped under a comment block (e.g., `// === Journal
  System ===`).
- Prisma Migrate for schema changes. Initial migration:
  `prisma/migrations/20260424071851_init/`.

**Prisma client (`src/platform/db/client.ts`):**

- Singleton exported from `src/platform/db/client.ts`.
- In development, attached to `globalThis` to avoid multiple clients during hot
  reload.
- On first instantiation: reads `DATABASE_URL`, throws if missing. If the URL
  starts with `prisma://` or `prisma+postgres://`, constructs
  `new PrismaClient({ accelerateUrl: url })`. Otherwise wraps `pg` with
  `new PrismaPg({ connectionString: url })` and passes it as the adapter.
- All systems import from `@/platform/db/client`.

**Conventions:**

- System tables are prefixed with the system name (e.g., `journal_entries`,
  `budget_transactions`).
- Systems define Zod schemas in their `schemas/` directory for runtime
  validation.
- Systems never access another system's tables directly — cross-system data
  goes through a service interface.

**Seeding:**

- `prisma/seed.ts` run via `bun prisma/seed.ts` (no `tsx` dependency — Bun
  executes TypeScript directly).
- The seed upserts a user with `ALLOWED_EMAIL` if that env var is set.
- Systems can register seed functions called during `prisma db seed`.

## 4. API Layer

Next.js App Router API routes with dynamic system routing.

**Structure:**
```
src/app/api/
  auth/[...nextauth]/     # Auth
  platform/
    storage/
      upload/             # POST — file upload
      [...key]/           # GET — file download/serve
    jobs/                 # GET — queue status
  systems/
    [system]/             # Dynamic route per system
      [...path]/          # Catch-all for system-specific endpoints
```

**How system APIs work:**
- Each system defines route handlers in its `routes/` directory.
- The dynamic `[system]/[...path]` catch-all looks up the system by name in
  `createSystemRegistry(manifests)`, iterates the manifest's registered routes,
  matches the request against each pattern using `matchRoute`, and invokes the
  first matching handler.
- The catch-all exports `GET`, `POST`, `PUT`, `PATCH`, `DELETE` — all of them
  delegate to the same `handleRequest` function.

**Route patterns:**
- Pattern format: `"METHOD /path/with/:params"`, e.g.
  `"GET /items/:id/comments/:commentId"`.
- `src/platform/api/router.ts` exports `matchRoute(pattern, method,
  pathSegments)`. Returns a `Record<string, string>` of extracted params on
  match, or `null` on miss (wrong method, length mismatch, or static-segment
  mismatch).

**Shared concerns:**
- Auth check happens once in the catch-all before delegating — every system
  API is protected by default. Returns `unauthorized()` on missing session.
- Returns `notFound()` if the system doesn't exist or no route matches.
- `src/platform/api/errors.ts` provides `apiError(status, message, details?)`,
  `notFound()`, `unauthorized()`, `badRequest()` — all return
  `NextResponse.json({ error, details }, { status })`.
- Request validation uses the system's Zod schemas.

**Why plain API routes (not tRPC or GraphQL):**
- For a single-user app, the overhead isn't justified.
- Plain routes are easy to write, delete, and understand.
- WebSocket support can be added per-system later without changing the core
  pattern.

## 5. File Storage

Abstraction layer switching between local filesystem and S3-compatible storage.

**Interface (`src/platform/storage/types.ts`):**

```typescript
export interface StorageDriver {
  upload(key: string, data: Buffer, metadata: StorageMetadata): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
}
```

**Implementations:**
- `src/platform/storage/local.ts` — `createLocalStorage(basePath)` uses
  `fs/promises`, creates nested directories on upload, returns a
  `/api/platform/storage/<key>` URL.
- `src/platform/storage/s3.ts` — `createS3Storage(config)` uses the AWS SDK v3
  (`PutObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`) and
  `getSignedUrl` from `@aws-sdk/s3-request-presigner` for 1-hour presigned URLs.
  Supports custom S3-compatible endpoints (MinIO, Cloudflare R2) via
  `forcePathStyle`.
- `src/platform/storage/index.ts` — `getStorage()` singleton; reads
  `STORAGE_DRIVER` and returns the appropriate driver.

**How systems use it:**
- Import from `@/platform/storage` and call methods.
- Keys are namespaced by system (e.g., `journal/photos/2026-04-22.jpg`).

**API endpoints:**
- `POST /api/platform/storage/upload` — accepts multipart form data with
  `file` (File) and `key` (string); returns `{ key, size }` (201 Created).
- `GET /api/platform/storage/[...key]` — serves a file (local) or returns the
  signed URL (S3).
- Both are auth-protected.

**Local development:** Files go to `./uploads/` (gitignored), no extra
infrastructure needed.

**Production:** Flip `STORAGE_DRIVER=s3` and set S3 credentials.

## 6. Job Processing

BullMQ with Redis for background and scheduled tasks.

**Setup:**
- `src/platform/jobs/connection.ts` — `getRedisConnection()` singleton. Reads
  `REDIS_URL` (defaults to `redis://localhost:6379`). BullMQ requires
  `maxRetriesPerRequest: null`.
- `src/platform/jobs/queue.ts` — `getQueue(name)` factory with a Map cache;
  `getAllQueues()` returns every queue created in the process.
- `src/platform/jobs/worker.ts` — `createWorker(queueName, processor)` attaches
  `failed` and `completed` listeners that log to console.
- `src/platform/jobs/registry.ts` — `registerSystemJobs(manifests)` walks each
  manifest's `jobs` map, creates a queue per system (`<system-name>-queue`),
  and spawns a worker that dispatches by `job.name`. Also exports
  `getWorkers()` and `shutdownWorkers()` for graceful shutdown.
- `src/platform/jobs/start-workers.ts` — standalone entrypoint. Imports
  manifests, calls `registerSystemJobs(manifests)`, wires SIGINT/SIGTERM to
  `shutdownWorkers()`.

**How systems use it:**
- Define job processor functions in `services/`.
- Register queues and job-to-processor mappings in the manifest.

**Supported job types:**
- Immediate — fire and forget.
- Delayed — run after a specified delay.
- Repeatable / Cron — run on a schedule.
- Prioritized — higher priority jobs processed first.

**Worker lifecycle:**
- Development: workers run alongside Next.js with
  `bun src/platform/jobs/start-workers.ts` (via the `bun run workers` script).
- Production (Docker Compose): workers run as a separate container. The
  `docker/docker-compose.yml` includes a commented-out `worker` service with
  `command: bun src/platform/jobs/start-workers.ts` that can be uncommented
  when container deployment happens.

**Monitoring:**
- `GET /api/platform/jobs` — returns `{ queues: { [name]: jobCounts } }` via
  `queue.getJobCounts()`.
- Bull Board is not yet integrated; can be added later as a mountable route.

**Local development:** Requires Redis running locally. The Docker Compose
service maps Redis to host port **6377** to avoid conflicts; the app reads
`REDIS_URL=redis://localhost:6377`.

## 7. Integration Framework

Shared connectors for external services.

**Structure:**
```
src/platform/integrations/
  types.ts             # Integration interface
  registry.ts          # Register / get / has / list
  # Per-integration folders get added here when a system needs one, e.g.
  # google-calendar/
  #   client.ts
  #   auth.ts
```

**Interface:**

```typescript
export interface Integration {
  name: string;
  displayName: string;
  status(): Promise<"connected" | "disconnected" | "expired">;
  connect(): Promise<string>;
  disconnect(): Promise<void>;
}
```

**Registry (`src/platform/integrations/registry.ts`):**
- Private `Map<string, Integration>`.
- `registerIntegration(integration)`, `getIntegration(name)`,
  `hasIntegration(name)`, `listIntegrations()`.

**How it works:**
- Each integration wraps an external API into clean methods.
- Integrations needing OAuth manage their own tokens — stored in the database,
  refreshed automatically.

**Token storage:**
- Separate from NextAuth's `Account` table — user auth and service
  integrations are independent concerns.

```prisma
model PlatformIntegration {
  id           String   @id @default(cuid())
  provider     String   @unique
  accessToken  String
  refreshToken String?
  expiresAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**Settings UI:**
- `/(platform)/settings` — lists currently-registered integrations via
  `listIntegrations()`. Empty state says "No integrations configured" when
  none exist.

**For v0:** The framework and registry ship. No integrations are pre-built —
added when a system needs one.

## 8. System Convention & Manifest

The contract every system follows.

**Directory structure:**
```
src/systems/<system-name>/
  components/        # React components
  services/          # Business logic, DB queries, job processors
  schemas/           # Zod schemas
  routes/            # API route handlers
  manifest.ts        # Registration — metadata, routes, jobs, nav
```

**Manifest shape (`src/systems/types.ts`):**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Job } from "bullmq";

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
}
```

Example manifest:

```ts
export const manifest: SystemManifest = {
  name: "system-name",
  displayName: "Human Name",
  description: "What this system does",
  routes: {
    "GET /resource": handler,
    "POST /resource": handler,
  },
  jobs: {
    "job-name": processorFunction,
  },
  nav: {
    label: "Nav Label",
    icon: "beaker",
    href: "/system-path",
  },
};
```

**Registry (`src/systems/registry.ts`):**
- `createSystemRegistry(manifests)` indexes by name and exposes `get(name)`,
  `list()`, and `navItems()`.

**Registration:**
- `src/systems/index.ts` imports all manifests and exports them as an array.
  Currently empty — ready for systems to register themselves.
- The platform reads this to wire up API routes, register job queues, and
  build navigation.
- Adding a system = create folder, write manifest, add one import to
  `index.ts`.
- Removing a system = delete folder, remove the import.

**System pages:** Live under `src/app/(systems)/[systemName]/` following
Next.js conventions (route group not yet materialized — no systems exist).

**The `_template/`:** A copy-paste starter with a placeholder manifest and four
empty subdirectories (`components/`, `services/`, `schemas/`, `routes/`), each
containing a `.gitkeep`.

## 9. Feedback Mechanisms

Platform-level tracking of system effectiveness.

**Models:**

```prisma
model SystemMetric {
  id         String   @id @default(cuid())
  system     String
  name       String
  value      Float
  recordedAt DateTime @default(now())

  @@index([system])
  @@index([system, name])
}

model SystemReflection {
  id         String   @id @default(cuid())
  system     String
  content    String
  strengths  String[]
  weaknesses String[]
  ideas      String[]
  createdAt  DateTime @default(now())

  @@index([system])
}

model SystemIteration {
  id          String   @id @default(cuid())
  system      String
  description String
  reason      String
  outcome     String?
  createdAt   DateTime @default(now())

  @@index([system])
}
```

**Service (`src/platform/feedback/service.ts`):**
- `createFeedbackService(prisma)` returns a service with:
  - `recordMetric(system, name, value)`
  - `addReflection(system, { content, strengths, weaknesses, ideas })`
  - `logIteration(system, { description, reason })`
  - `getMetrics(system)`, `getReflections(system)`, `getIterations(system)`
  - `getAllFeedback()` — latest 50 metrics, 20 reflections, 20 iterations
- `src/platform/feedback/index.ts` exports a `feedback` singleton bound to the
  shared Prisma client.

**Dashboard (`src/app/(platform)/dashboard/page.tsx`):**
- Server component calling `feedback.getAllFeedback()`.
- Renders today's date + active system count, two stat cards (metrics and
  reflections), a recent-metrics table, reflection blockquotes, and an
  iteration history task list. Each section has an empty state following
  design-system voice rules.

**For v0:** Models, service, and dashboard ship with the foundation. The
dashboard starts empty until systems record feedback.

## 10. Polaris Design System

Not in the original spec scope, but built as part of the platform foundation
(commit `cabd9a5 feat: add Polaris design system with tokens, components, and
UI overhaul`). Source of truth lives in `docs/design/`.

**Identity:**
- Warm paper + ink surfaces (no pure white/black).
- Obsidian purple (`#3c2ea3`) as the single accent, used sparingly for links,
  focus, selection, primary CTAs, and active nav.
- Humanist serif display + clean sans body + JetBrains Mono for code and
  timestamps.
- Sentence case everywhere. No exclamation points, marketing adjectives, or
  emoji in chrome.

**Tokens (`src/app/globals.css`, ~726 lines):**
- Paper series (`--paper-0` … `--paper-4`) and Ink series (`--ink-0` …
  `--ink-5`) for light surfaces.
- Night / Moon for dark surfaces.
- Accent with hover / press / wash / ink variants.
- Semantic tokens (`--tag`, `--link`, `--heading` terracotta, `--emphasis`,
  `--mark`) plus status colors (`--success`, `--warning`, `--danger`, `--info`
  with `-wash` variants).
- Code palette for syntax highlighting.
- Surface tokens (`--bg`, `--bg-raised`, `--bg-sunken`, `--bg-hover`,
  `--bg-active`, `--border`, `--border-strong`, `--fg`, `--fg-muted`,
  `--fg-faint`, `--selection`).
- Three font family variables wired up via `next/font/google` in
  `src/app/layout.tsx`: `--font-serif` (Source Serif 4), `--font-sans`
  (Inter), `--font-mono` (JetBrains Mono).
- Modular type scale (1.2 ratio, 14.5px body), 4px spacing grid, warm-tinted
  shadows, radius scale.
- Utility classes: `.paper-card`, `.btn` (`btn-primary`/`-secondary`/`-ghost`/
  `-danger`), `.titlebar`, `.crumbs`, `.sidebar`, `.sb-item`, `.task-row`,
  `.tag-inline`, `.kbd`, `.overline`, `.lead`, `.caption`, `.doc`, `.content`.

**Components (`src/app/_components/`):**
- `Icon.tsx` — Lucide icon set with a constrained `IconName` union (~31 icons
  exposed). Stroke 1.5, `currentColor`, 16px default. Never filled.
- `TitleBar.tsx` — 36px app chrome with glyph, breadcrumbs, sync status dot,
  and user email.
- `Sidebar.tsx` — 248px rail with search button, Today link, Systems section
  (pulled from the registry's `navItems()`), and footer slot.
- `PolarisGlyph.tsx` — four-point north star SVG, brand-restricted.

**Documentation (`docs/design/`):**
- `README.md` — entry point.
- `polaris-design-system.md` — the full design system write-up (colors,
  typography, spacing, casing, iconography, layout, motion, empty/error
  states, voice).
- `tokens-reference.css` — all tokens in one file for quick lookup.
- `preview-cards-reference/` — HTML swatch pages for every token and component
  (colors, buttons, cards, inputs, nav, tags, tasks, toasts, typography,
  radii, shadows, spacing).
- `ui-kit-reference/workspace/` — full HTML/CSS/JSX prototype of the workspace
  shell (excluded from ESLint because it's reference-only).

The project's `CLAUDE.md` requires any UI work to read
`docs/design/README.md` and `docs/design/polaris-design-system.md` before
writing or modifying UI code.

## Environment Variables

```env
# Auth
NEXTAUTH_SECRET=generate-a-secret-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_EMAIL=

# Database (note port 5440 — not 5432 — to avoid local conflicts)
DATABASE_URL=postgresql://polaris:polaris@localhost:5440/polaris

# Redis (note port 6377 — not 6379 — to avoid local conflicts)
REDIS_URL=redis://localhost:6377

# Storage
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./uploads
# S3 (production)
# S3_BUCKET=
# S3_REGION=
# S3_ACCESS_KEY=
# S3_SECRET_KEY=
# S3_ENDPOINT=
```

`DATABASE_URL` also supports `prisma://` and `prisma+postgres://` schemes —
the Prisma client auto-detects these and switches to Accelerate mode.

## Docker

`docker/docker-compose.yml` ships with Postgres 17 on host port 5440 and
Redis 7-alpine on host port 6377. Commented-out `app` and `worker` services
are ready to be uncommented for containerized deployment.

`docker/Dockerfile` is a multi-stage Bun build:

- Base image: `oven/bun:1`
- `deps` stage: `bun install --frozen-lockfile` from `package.json` + `bun.lock`
- `builder` stage: `bunx prisma generate` then `bun run build`
- `runner` stage: copies `.next/standalone`, static assets, Prisma client;
  `CMD ["bun", "server.js"]`

## What This Spec Does NOT Cover

- Specific system implementations (journal, budget, etc.) — each gets its own
  spec.
- Specific integrations (Google Calendar, etc.) — built when a system needs
  one.
- Production deployment configuration — designed toward Docker Compose but the
  `app` / `worker` services are still commented out; no hosting provider is
  chosen.
- CI/CD pipeline.
