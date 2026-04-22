# Polaris Platform Foundation — Design Spec

**Date:** 2026-04-22
**Author:** Raymart Villos
**Status:** Approved

## Overview

The platform foundation for Polaris — a personal operating system built for a single user. This spec covers the shared infrastructure that all future systems will plug into: authentication, database, API layer, file storage, job processing, integration framework, system conventions, and feedback mechanisms.

## Tech Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (full-stack) |
| Frontend + API | Next.js (App Router) |
| Database | PostgreSQL + Prisma |
| Auth | NextAuth.js (Auth.js) with Google OAuth |
| File storage | Local filesystem (dev), S3-compatible (prod), behind abstraction |
| Job processing | BullMQ + Redis |
| Deployment | Local first, designed toward Docker Compose |

## Architecture

Monolith with convention-based system directories. Systems are self-contained folders under `src/systems/` that register themselves via a manifest. The platform provides shared infrastructure under `src/platform/`.

## 1. Project Structure

```
polaris/
  src/
    app/                        # Next.js App Router
      (platform)/               # Platform routes (dashboard, settings)
        dashboard/
        settings/
        layout.tsx
      api/                      # API routes
        auth/[...nextauth]/
        platform/
          settings/
          storage/
          jobs/
        systems/[system]/       # Dynamic system API routes
          [...path]/
      (systems)/                # System pages (route group)
      layout.tsx
      page.tsx                  # Landing / redirect to dashboard
    platform/                   # Platform-level shared infrastructure
      auth/                     # NextAuth config, session helpers
      db/                       # Prisma client, seed scripts
      storage/                  # File storage abstraction (local/S3)
      jobs/                     # BullMQ setup, base worker, queue registry
      integrations/             # Shared external service connectors
      feedback/                 # Metrics, reflections, iteration history
    systems/                    # Self-contained system modules
      _template/                # Starter template for new systems
        components/
        services/
        schemas/
        routes/
        manifest.ts
    lib/                        # Generic shared utilities
      utils.ts
  prisma/
    schema.prisma
    migrations/
  public/
  docker/
    docker-compose.yml          # Postgres + Redis + app (future)
    Dockerfile
  .env.local
  next.config.ts
  package.json
  tsconfig.json
```

Key decisions:
- `src/platform/` holds all shared infrastructure — this is what systems import from.
- `src/systems/` holds all system modules — each is a self-contained folder.
- `src/app/` is purely Next.js routing — platform pages use route groups, system pages get wired through a dynamic or explicit pattern.
- `_template/` gives a copy-paste starting point for new systems.
- `docker/` is present from day one but not required to run locally.

## 2. Authentication

NextAuth.js with Google OAuth, configured for a single user.

**Flow:**
- NextAuth handles the Google OAuth flow via `/api/auth/[...nextauth]/`.
- On successful login, the callback checks if the authenticated email matches the allowed email (stored in env var `ALLOWED_EMAIL`).
- If it doesn't match, the sign-in is rejected.
- Session is stored in the database via the Prisma adapter.

**Key files:**
- `src/platform/auth/config.ts` — NextAuth configuration, Google provider, Prisma adapter, sign-in callback with email check.
- `src/platform/auth/session.ts` — helper to get the current session in server components and API routes.
- `src/app/api/auth/[...nextauth]/route.ts` — the NextAuth route handler.

**Middleware:**
- A Next.js middleware at the root protects all routes except the sign-in page.
- Unauthenticated requests redirect to the login page.

**Schema:**
- NextAuth's standard tables via the Prisma adapter: `User`, `Account`, `Session`, `VerificationToken`.

## 3. Database

PostgreSQL with Prisma as the ORM.

**Setup:**
- Single Prisma schema at `prisma/schema.prisma` containing all models.
- Each system's models are grouped under a comment block (e.g., `// === Journal System ===`).
- Prisma Migrate for schema changes.

**Prisma client:**
- Singleton client exported from `src/platform/db/client.ts`.
- In development, attached to `globalThis` to avoid multiple clients during hot reload.
- All systems import from `@/platform/db/client`.

**Conventions:**
- System tables are prefixed with the system name (e.g., `journal_entries`, `budget_transactions`).
- Systems define Zod schemas in their `schemas/` directory for runtime validation.
- Systems never access another system's tables directly — cross-system data goes through a service interface.

**Seeding:**
- `prisma/seed.ts` for initial data.
- Systems can register seed functions called during `prisma db seed`.

## 4. API Layer

Next.js App Router API routes with dynamic system routing.

**Structure:**
```
src/app/api/
  auth/[...nextauth]/     # Auth
  platform/
    settings/             # Platform-level settings
    storage/              # File upload/download endpoints
    jobs/                 # Job status, queue management
  systems/
    [system]/             # Dynamic route per system
      [...path]/          # Catch-all for system-specific endpoints
```

**How system APIs work:**
- Each system defines route handlers in its `routes/` directory.
- The dynamic `[system]/[...path]` catch-all looks up the system by name, finds the matching handler, and delegates.
- The system manifest exports a route map that registers these handlers.

**Shared concerns:**
- Auth check happens once in the catch-all before delegating — every system API is protected by default.
- A thin wrapper provides consistent error formatting.
- Request validation uses the system's Zod schemas.

**Why plain API routes (not tRPC or GraphQL):**
- For a single-user app, the overhead isn't justified.
- Plain routes are easy to write, delete, and understand.
- WebSocket support can be added per-system later without changing the core pattern.

## 5. File Storage

Abstraction layer switching between local filesystem and S3-compatible storage.

**Interface:**
- `src/platform/storage/storage.ts` — defines the interface: `upload(key, data, metadata)`, `download(key)`, `delete(key)`, `getUrl(key)`.
- `src/platform/storage/local.ts` — local filesystem implementation, stores under `./uploads/`.
- `src/platform/storage/s3.ts` — S3-compatible implementation (AWS S3, MinIO, Cloudflare R2).
- `src/platform/storage/index.ts` — factory that reads `STORAGE_DRIVER` env var and returns the right implementation.

**How systems use it:**
- Import from `@/platform/storage` and call methods.
- Keys are namespaced by system (e.g., `journal/photos/2026-04-22.jpg`).

**API endpoints:**
- `POST /api/platform/storage/upload` — accepts multipart form data, stores the file, returns the key.
- `GET /api/platform/storage/[...key]` — serves a file (local) or returns a signed URL (S3).
- Both are auth-protected.

**Local development:** Files go to `./uploads/` (gitignored), no extra infrastructure needed.

**Production:** Flip `STORAGE_DRIVER=s3` and set S3 credentials.

## 6. Job Processing

BullMQ with Redis for background and scheduled tasks.

**Setup:**
- `src/platform/jobs/queue.ts` — shared Redis connection and queue factory.
- `src/platform/jobs/worker.ts` — base worker factory with error handling, retries, logging.
- `src/platform/jobs/registry.ts` — central registry where systems register queues and processors.

**How systems use it:**
- Define job processor functions in `services/`.
- Register queues and job-to-processor mappings in the manifest.

**Supported job types:**
- Immediate — fire and forget.
- Delayed — run after a specified delay.
- Repeatable/Cron — run on a schedule.
- Prioritized — higher priority jobs processed first.

**Worker lifecycle:**
- Development: workers run in-process alongside the Next.js dev server.
- Production (Docker Compose): workers run as a separate container with entrypoint `node src/platform/jobs/start-workers.ts`.

**Monitoring:**
- `GET /api/platform/jobs/` — returns queue status (active, waiting, completed, failed counts).
- Optional: Bull Board UI mountable as a route.

**Local development:** Requires Redis running locally. Connection via `REDIS_URL` env var.

## 7. Integration Framework

Shared connectors for external services.

**Structure:**
```
src/platform/integrations/
  base.ts              # Base integration interface
  registry.ts          # Discovers and exposes available integrations
  google-calendar/     # Example (built when a system needs it)
    client.ts
    auth.ts
```

**How it works:**
- Each integration wraps an external API into clean methods.
- Integrations needing OAuth manage their own tokens — stored in the database, refreshed automatically.
- The registry exposes what's available via `integrations.has("google-calendar")`.

**Token storage:**
- Separate from NextAuth's `Account` table — user auth and service integrations are independent concerns.

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
- `/(platform)/settings/integrations` — connect/disconnect external services.
- Each integration provides a `connect()` flow and `status()` check.

**For v0:** The framework and registry ship. No integrations are pre-built — added when a system needs one.

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

**Manifest shape:**
```ts
export const manifest = {
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
    icon: "icon-name",
    href: "/system-path",
  },
};
```

**Registration:**
- `src/systems/index.ts` imports all manifests and exports them as an array.
- The platform reads this to wire up API routes, register job queues, and build navigation.
- Adding a system = create folder, write manifest, add one import to `index.ts`.
- Removing a system = delete folder, remove the import.

**System pages:** Live under `src/app/(systems)/[systemName]/` following Next.js conventions.

**The `_template/`:** A copy-paste starter with placeholder manifest and empty directories.

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
}

model SystemReflection {
  id         String   @id @default(cuid())
  system     String
  content    String
  strengths  String[]
  weaknesses String[]
  ideas      String[]
  createdAt  DateTime @default(now())
}

model SystemIteration {
  id          String   @id @default(cuid())
  system      String
  description String
  reason      String
  outcome     String?
  createdAt   DateTime @default(now())
}
```

**Service:**
- `src/platform/feedback/` provides `recordMetric()`, `addReflection()`, `logIteration()`.
- Systems call these from their own services.

**Dashboard:**
- `/(platform)/dashboard` aggregates feedback across all systems.
- Shows recent metrics, reflections, and iteration history.

**For v0:** Models and service ship with the foundation. Dashboard starts empty.

## Environment Variables

```env
# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_EMAIL=raymart@mediajel.com

# Database
DATABASE_URL=postgresql://polaris:polaris@localhost:5432/polaris

# Redis
REDIS_URL=redis://localhost:6379

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

## What This Spec Does NOT Cover

- Specific system implementations (journal, budget, etc.) — each gets its own spec.
- Specific integrations (Google Calendar, etc.) — built when a system needs one.
- Production deployment configuration — designed toward Docker Compose but not configured yet.
- CI/CD pipeline.
- UI component library or design system — will emerge as systems are built.
