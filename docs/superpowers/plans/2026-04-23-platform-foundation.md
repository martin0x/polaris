# Polaris Platform Foundation — Implementation Plan

> **Status:** Implemented 2026-04-24. All tasks completed; checkboxes reflect
> reality. Divergences from the original plan are called out inline as
> **Implementation note** blocks.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared infrastructure (auth, database, API layer, file storage, job processing, integration framework, system conventions, feedback mechanisms) that all future Polaris systems plug into.

**Architecture:** TypeScript monolith with convention-based system directories. Systems are self-contained folders under `src/systems/` that register themselves via a manifest. The platform provides shared infrastructure under `src/platform/`. Next.js App Router handles both frontend and API routes.

**Tech Stack (as built):** Next.js **16.2.4** (App Router), React 19.2.4, TypeScript 5, **Bun** (package manager + worker runtime), PostgreSQL 17 + **Prisma 7** with `@prisma/adapter-pg`, NextAuth.js v5 (Auth.js) with Google OAuth and **JWT session strategy**, BullMQ + ioredis, Vitest. Tailwind CSS v4 via `@tailwindcss/postcss` (no `tailwind.config` file — v4 uses inline directives in `globals.css`).

**Spec:** `docs/superpowers/specs/2026-04-22-platform-foundation-design.md`

> **Implementation notes that apply across the plan:**
> - The original plan assumed **npm**; the project migrated to **Bun** during scaffolding. Wherever steps below say `npm …` / `npx …` / `tsx …`, the actual commands are `bun …` / `bunx …` / `bun <file>.ts` (Bun executes TypeScript natively, so `tsx` was never installed).
> - Package lockfile is `bun.lock`, not `package-lock.json`.
> - Ports diverged from defaults to avoid conflicts with other local services: **Postgres 5440**, **Redis 6377** (host side; container sides remain 5432/6379).
> - The most recent commit (`cabd9a5 feat: add Polaris design system …`) added a full design system that the original plan did not scope; Task 10's UI section reflects the as-built version, not the stub layout in the first draft.

---

## File Map

Files created or modified by this plan, organized by responsibility:

```
# Project root — config & tooling
package.json                          # Dependencies and scripts (Bun)
bun.lock                              # Bun lockfile (replaces package-lock.json)
tsconfig.json                         # TypeScript configuration
next.config.ts                        # Next.js configuration
postcss.config.mjs                    # PostCSS + Tailwind v4
eslint.config.mjs                     # ESLint v9 flat config
vitest.config.ts                      # Test runner configuration
.env.example                          # Environment variable template
.gitignore                            # Updated for Next.js + uploads + bun + src/generated

# Database
prisma/schema.prisma                  # Generator = prisma-client, output = src/generated/prisma
prisma/seed.ts                        # Initial data seeding (run via `bun prisma/seed.ts`)
prisma/migrations/20260424071851_init # Initial migration

# Platform infrastructure
src/generated/prisma/                 # Generated Prisma Client (gitignored)
src/platform/db/client.ts             # Prisma client singleton with adapter-pg + Accelerate detection
src/platform/auth/auth.config.ts      # Edge-safe NextAuth config (JWT, Google, ALLOWED_EMAIL gate)
src/platform/auth/config.ts           # Full NextAuth instance (wraps auth.config + Prisma adapter)
src/platform/auth/session.ts          # Session helpers for server components
src/platform/storage/types.ts         # StorageDriver interface
src/platform/storage/local.ts         # Local filesystem driver
src/platform/storage/s3.ts            # S3-compatible driver
src/platform/storage/index.ts         # Factory — picks driver from env
src/platform/jobs/connection.ts       # Shared Redis connection (ioredis)
src/platform/jobs/queue.ts            # Queue factory
src/platform/jobs/worker.ts           # Worker factory
src/platform/jobs/registry.ts         # Queue/worker registry reads manifests
src/platform/jobs/start-workers.ts    # Standalone worker entrypoint (run via `bun …`)
src/platform/integrations/types.ts    # Integration interface
src/platform/integrations/registry.ts # Integration registry
src/platform/feedback/service.ts      # recordMetric, addReflection, logIteration
src/platform/feedback/index.ts        # Public API (singleton)
src/platform/api/router.ts            # Route matching logic for system APIs
src/platform/api/errors.ts            # Consistent API error formatting

# System convention
src/systems/types.ts                  # SystemManifest type definition
src/systems/registry.ts               # Loads and indexes all manifests
src/systems/index.ts                  # Imports and exports all system manifests
src/systems/_template/manifest.ts     # Starter manifest template
src/systems/_template/components/.gitkeep
src/systems/_template/services/.gitkeep
src/systems/_template/schemas/.gitkeep
src/systems/_template/routes/.gitkeep

# Next.js App Router — pages
src/app/layout.tsx                    # Root layout — loads Source Serif 4, Inter, JetBrains Mono via next/font/google
src/app/page.tsx                      # Landing — redirect to /dashboard
src/app/globals.css                   # Tailwind v4 + full Polaris token system (~726 lines)
src/app/auth/signin/page.tsx          # Sign-in page
src/app/(platform)/layout.tsx         # Platform shell (TitleBar + Sidebar + main)
src/app/(platform)/dashboard/page.tsx # Dashboard — feedback aggregation
src/app/(platform)/settings/page.tsx  # Settings page

# Next.js App Router — API routes
src/app/api/auth/[...nextauth]/route.ts           # NextAuth route handler
src/app/api/platform/storage/upload/route.ts      # File upload
src/app/api/platform/storage/[...key]/route.ts    # File download/serve
src/app/api/platform/jobs/route.ts                # Queue status
src/app/api/systems/[system]/[...path]/route.ts   # Dynamic system API catch-all

# Middleware
src/middleware.ts                     # Auth guard (uses auth.config, not config.ts — edge runtime)

# Design system (added in commit cabd9a5 — outside original plan scope)
src/app/_components/Icon.tsx          # Lucide-based icon set with IconName union
src/app/_components/TitleBar.tsx      # 36px app chrome (glyph + breadcrumbs + sync dot)
src/app/_components/Sidebar.tsx       # 248px rail with search, Today, Systems, footer
src/app/_components/PolarisGlyph.tsx  # Four-point north star brand mark
docs/design/README.md
docs/design/polaris-design-system.md
docs/design/tokens-reference.css
docs/design/preview-cards-reference/  # Swatch + component reference HTML
docs/design/ui-kit-reference/         # Full workspace HTML/JSX/CSS prototype

# Shared utilities
src/lib/utils.ts                      # formatDate helper (kept minimal)

# Tests
src/platform/api/router.test.ts       # Route matching tests
src/platform/storage/local.test.ts    # Local storage driver tests
src/platform/feedback/service.test.ts # Feedback service tests
src/systems/registry.test.ts          # System registry tests

# Docker (infrastructure + future deployment)
docker/docker-compose.yml             # Postgres 17 (host 5440) + Redis 7 (host 6377) + commented app/worker
docker/Dockerfile                     # Multi-stage Bun build (oven/bun:1)
docker/.dockerignore                  # Docker build exclusions
```

---

## Task 1: Project Scaffolding & Configuration

**Status:** Complete. Migrated to Bun partway through; the originally-planned npm steps were swapped for Bun equivalents in the final state.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`, `eslint.config.mjs`, `bun.lock`
- Modify: `.gitignore`

- [x] **Step 1: Initialize Next.js project**

Originally planned as `npx create-next-app@latest . --use-npm …`. Project was scaffolded with the Next.js 16 App Router template and migrated to Bun shortly after — `bun.lock` is the canonical lockfile and `package-lock.json` is not present.

- [x] **Step 2: Restore project docs if overwritten**

- [x] **Step 3: Install platform dependencies**

Actual (Bun) equivalent:

```bash
bun add next-auth@beta @auth/prisma-adapter @prisma/client @prisma/adapter-pg pg zod bullmq ioredis @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

> **Implementation note:** `@prisma/adapter-pg` + `pg` were added because Prisma 7's default engine-based connection is replaced by the new driver-adapter approach. See Task 2 for the schema/client consequences.

- [x] **Step 4: Install dev dependencies**

Actual (Bun) equivalent:

```bash
bun add -d prisma vitest @types/node @types/pg dotenv
```

> **Implementation note:** `tsx` was never installed — Bun executes TypeScript natively, so the seed script and worker entrypoint run via `bun <file>.ts` directly.

- [x] **Step 5: Initialize Prisma**

```bash
bunx prisma init
```

Created `prisma/schema.prisma` and added `DATABASE_URL` to the env. The schema is replaced wholesale in Task 2.

- [x] **Step 6: Configure Next.js for server packages**

`next.config.ts` in the repo:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ioredis", "bullmq"],
};

export default nextConfig;
```

- [x] **Step 7: Create Vitest configuration**

`vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [x] **Step 8: Add test script to package.json**

Actual scripts block:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "workers": "bun src/platform/jobs/start-workers.ts"
}
```

- [x] **Step 9: Create .env.example**

Actual contents (ports diverge from the original 5432/6379 defaults):

```env
# Auth
NEXTAUTH_SECRET=generate-a-secret-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_EMAIL=

# Database
DATABASE_URL=postgresql://polaris:polaris@localhost:5440/polaris

# Redis
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

- [x] **Step 10: Update .gitignore**

Actual relevant entries:

```
# Uploads (local storage)
uploads/

# Environment
.env
.env.local

# Prisma
prisma/*.db

# Prisma generated client
src/generated/

# Bun / misc
.worktrees/
```

- [x] **Step 11: Create shared utilities stub**

`src/lib/utils.ts`:

```typescript
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
```

- [x] **Step 12: Verify the dev server starts**

```bash
bun run dev
```

- [x] **Step 13: Commit**

Initial scaffolding and subsequent Bun migration are in the project history.

---

## Task 2: Database — Prisma Schema & Client

**Status:** Complete. Implementation uses Prisma 7's driver-adapter pattern (not the default engine), so the schema and client diverge from the original plan.

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/platform/db/client.ts`, `prisma/migrations/20260424071851_init/`

- [x] **Step 1: Write the Prisma schema**

Actual `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// === Auth (NextAuth.js / Auth.js) ===

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// === Platform: Integrations ===

model PlatformIntegration {
  id           String    @id @default(cuid())
  provider     String    @unique
  accessToken  String
  refreshToken String?
  expiresAt    DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

// === Platform: Feedback ===

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

> **Implementation notes:**
> - `generator client { provider = "prisma-client" … output = "../src/generated/prisma" }` — Prisma 7's new ESM-first `prisma-client` generator. Output lives in-tree at `src/generated/prisma/` (gitignored) and is imported as `@/generated/prisma/client`, not `@prisma/client`.
> - `datasource db` intentionally has **no `url` line**. The URL is resolved at runtime inside `src/platform/db/client.ts`, which lets the client choose between Prisma Accelerate and the direct `pg` adapter based on the URL scheme.

The `Session` and `VerificationToken` tables remain even though the app uses JWT sessions — they're kept for NextAuth's adapter contract and any future email verification flows.

- [x] **Step 2: Create the Prisma client singleton**

Actual `src/platform/db/client.ts`:

```typescript
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  if (url.startsWith("prisma+postgres://") || url.startsWith("prisma://")) {
    return new PrismaClient({ accelerateUrl: url });
  }

  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

> **Implementation note:** Two significant deviations from the plan's original snippet:
> 1. `PrismaClient` is imported from the generated path, not `@prisma/client`.
> 2. The client auto-detects whether it's talking to Prisma Accelerate (`prisma://` / `prisma+postgres://`) or a direct Postgres connection (wrapped in `PrismaPg`). This is necessary because Prisma 7 requires an explicit adapter for direct connections — there is no implicit default.

- [x] **Step 3: Create the seed script**

`prisma/seed.ts` upserts the `ALLOWED_EMAIL` user if one is set in the environment. Runs under Bun (`bun prisma/seed.ts`).

- [x] **Step 4: Configure seed command in package.json**

Actual:

```json
"prisma": {
  "seed": "bun prisma/seed.ts"
}
```

(No `tsx` install — Bun runs the file directly.)

- [x] **Step 5: Set up local .env and run first migration**

```bash
docker compose -f docker/docker-compose.yml up -d postgres
bunx prisma migrate dev --name init
```

Initial migration stored at `prisma/migrations/20260424071851_init/`.

- [x] **Step 6: Run the seed**

```bash
bunx prisma db seed
```

- [x] **Step 7: Verify with Prisma Studio**

```bash
bunx prisma studio
```

- [x] **Step 8: Commit**

---

## Task 3: Authentication — NextAuth Setup

**Status:** Complete. Auth config was **split into two files** after initial implementation (commits `8f7a6ad fix: split auth config to avoid Prisma in Edge Runtime middleware` and `729e71b fix: use JWT session strategy to match middleware and server auth`). The plan below reflects the post-split state.

**Files:**
- Create: `src/platform/auth/auth.config.ts` (new — edge-safe), `src/platform/auth/config.ts` (wraps with Prisma adapter), `src/platform/auth/session.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`, `src/app/auth/signin/page.tsx`

- [x] **Step 1: Create the edge-safe NextAuth config**

`src/platform/auth/auth.config.ts`:

```typescript
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    signIn({ user }) {
      return user.email === process.env.ALLOWED_EMAIL;
    },
  },
};
```

> **Implementation note:** This file contains **no Prisma import** so it can run in the Edge Runtime (Next.js middleware environment). The `signIn` callback enforces the single-user `ALLOWED_EMAIL` gate. `session.strategy: "jwt"` is required because database sessions would need Prisma, which is incompatible with Edge Runtime.

- [x] **Step 2: Create the full NextAuth instance with the Prisma adapter**

`src/platform/auth/config.ts`:

```typescript
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/platform/db/client";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma 7 type incompatibility with @auth/prisma-adapter
  adapter: PrismaAdapter(prisma as any),
});
```

> **Implementation note:** The `as any` cast is a known-temporary workaround — `@auth/prisma-adapter` has not yet been updated for Prisma 7's client types. The eslint-disable comment documents this for future cleanup.

- [x] **Step 3: Create session helpers**

`src/platform/auth/session.ts`:

```typescript
import { auth } from "./config";

export async function getSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getOptionalSession() {
  return auth();
}
```

- [x] **Step 4: Create the NextAuth API route handler**

`src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/platform/auth/config";

export const { GET, POST } = handlers;
```

- [x] **Step 5: Create the auth middleware**

`src/middleware.ts` — imports the **edge-safe** `auth.config`, not `config.ts`:

```typescript
import NextAuth from "next-auth";
import { authConfig } from "@/platform/auth/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== "/auth/signin") {
    const signInUrl = new URL("/auth/signin", req.url);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

> **Implementation note:** The middleware instantiates its own local `NextAuth(authConfig)` instead of importing `auth` from `config.ts`, because `config.ts` pulls in Prisma through the adapter. This is the core reason for the split-config refactor.

- [x] **Step 6: Create the sign-in page**

`src/app/auth/signin/page.tsx` — server component with the Google OAuth button. Styled with design-system primitives (wordmark, tagline "One user · built for one life") rather than the original stub markup.

- [x] **Step 7: Verify auth flow**

- [x] **Step 8: Commit**

History: initial single-file config → split into `auth.config.ts` + `config.ts` → switched to JWT strategy to match middleware.

---

## Task 4: System Convention — Types, Registry & Template

**Status:** Complete. Matches the original plan exactly.

**Files:**
- Create: `src/systems/types.ts`, `src/systems/registry.ts`, `src/systems/index.ts`, `src/systems/_template/manifest.ts`, `src/systems/_template/{components,services,schemas,routes}/.gitkeep`
- Test: `src/systems/registry.test.ts`

- [x] **Step 1: Write the failing test for the system registry**

Tests 4 behaviors: lookup by name, unknown returns undefined, list all, nav items projection. See `src/systems/registry.test.ts`.

- [x] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/systems/registry.test.ts
```

- [x] **Step 3: Define the SystemManifest type**

- [x] **Step 4: Implement the system registry**

- [x] **Step 5: Run the test to verify it passes** (all 4 tests pass)

- [x] **Step 6: Create the systems index (empty to start)**

`src/systems/index.ts` currently exports an empty `manifests: SystemManifest[]` array, ready for systems to be registered as they're built.

- [x] **Step 7: Create the system template**

`src/systems/_template/` with manifest and four empty subdirectories (`components/`, `services/`, `schemas/`, `routes/`), each with a `.gitkeep`.

- [x] **Step 8: Commit**

---

## Task 5: Dynamic API Routing

**Status:** Complete. Matches the original plan.

**Files:**
- Create: `src/platform/api/router.ts`, `src/platform/api/errors.ts`, `src/app/api/systems/[system]/[...path]/route.ts`
- Test: `src/platform/api/router.test.ts`

- [x] **Step 1: Write the failing test for route matching** (6 cases: exact match, wrong method, one param, multiple params, length mismatch, static-segment mismatch)

- [x] **Step 2: Run the test to verify it fails**

- [x] **Step 3: Implement the route matcher**

- [x] **Step 4: Run the test to verify it passes**

- [x] **Step 5: Create the API error helper** (`apiError`, `notFound`, `unauthorized`, `badRequest`)

- [x] **Step 6: Create the dynamic system API catch-all**

`src/app/api/systems/[system]/[...path]/route.ts` — imports `auth` from `@/platform/auth/config`, looks up the system from `createSystemRegistry(manifests)`, iterates registered routes and returns the first match. Exports `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, all pointing at the same `handleRequest` function.

- [x] **Step 7: Commit**

---

## Task 6: File Storage Abstraction

**Status:** Complete. Matches the original plan.

**Files:**
- Create: `src/platform/storage/types.ts`, `src/platform/storage/local.ts`, `src/platform/storage/s3.ts`, `src/platform/storage/index.ts`, `src/app/api/platform/storage/upload/route.ts`, `src/app/api/platform/storage/[...key]/route.ts`
- Test: `src/platform/storage/local.test.ts`

- [x] **Step 1: Write the failing test for local storage** (upload/download, delete, URL, nested dirs)

- [x] **Step 2: Run the test to verify it fails**

- [x] **Step 3: Define the storage interface** (`StorageDriver`, `StorageMetadata`)

- [x] **Step 4: Implement the local storage driver** (`createLocalStorage(basePath)`)

- [x] **Step 5: Run the test to verify it passes**

- [x] **Step 6: Implement the S3 storage driver** (`createS3Storage(config)` with presigned URL support)

- [x] **Step 7: Create the storage factory** (`getStorage()` picks driver by `STORAGE_DRIVER` env)

- [x] **Step 8: Create the upload API route** (`POST /api/platform/storage/upload` — FormData with `file` + `key`)

- [x] **Step 9: Create the download/serve API route** (`GET /api/platform/storage/[...key]`)

- [x] **Step 10: Commit**

---

## Task 7: Job Processing — BullMQ Setup

**Status:** Complete. One deviation: the worker entrypoint runs under Bun instead of tsx.

**Files:**
- Create: `src/platform/jobs/connection.ts`, `src/platform/jobs/queue.ts`, `src/platform/jobs/worker.ts`, `src/platform/jobs/registry.ts`, `src/platform/jobs/start-workers.ts`, `src/app/api/platform/jobs/route.ts`

- [x] **Step 1: Create the shared Redis connection** (`getRedisConnection()` singleton, uses `REDIS_URL`, defaults to `redis://localhost:6379` — note actual local dev uses `redis://localhost:6377`)

- [x] **Step 2: Create the queue factory** (`getQueue(name)` + `getAllQueues()`)

- [x] **Step 3: Create the worker factory** (`createWorker(queueName, processor)` with failed/completed logging)

- [x] **Step 4: Create the job registry** (`registerSystemJobs`, `getWorkers`, `shutdownWorkers`)

- [x] **Step 5: Create the worker startup script** (`start-workers.ts` with SIGINT/SIGTERM handlers)

- [x] **Step 6: Create the jobs status API route** (`GET /api/platform/jobs` returns queue job counts)

- [x] **Step 7: Add worker script to package.json**

Actual (not `tsx`):

```json
"workers": "bun src/platform/jobs/start-workers.ts"
```

- [x] **Step 8: Commit**

---

## Task 8: Integration Framework

**Status:** Complete. Matches the plan.

**Files:**
- Create: `src/platform/integrations/types.ts`, `src/platform/integrations/registry.ts`

- [x] **Step 1: Define the integration interface** (`Integration` with `name`, `displayName`, `status()`, `connect()`, `disconnect()`)

- [x] **Step 2: Create the integration registry** (`registerIntegration`, `getIntegration`, `hasIntegration`, `listIntegrations`)

- [x] **Step 3: Commit**

No concrete integrations shipped — they're added when a system needs one.

---

## Task 9: Feedback Mechanisms — Service

**Status:** Complete. Matches the plan.

**Files:**
- Create: `src/platform/feedback/service.ts`, `src/platform/feedback/index.ts`
- Test: `src/platform/feedback/service.test.ts`

- [x] **Step 1: Write the failing test for the feedback service** (4 cases: recordMetric, addReflection, logIteration, getMetrics)

- [x] **Step 2: Run the test to verify it fails**

- [x] **Step 3: Implement the feedback service** (`createFeedbackService(prisma)` exposes `recordMetric`, `addReflection`, `logIteration`, `getMetrics`, `getReflections`, `getIterations`, `getAllFeedback`)

- [x] **Step 4: Run the test to verify it passes**

- [x] **Step 5: Create the public API (singleton)**

```typescript
import { prisma } from "@/platform/db/client";
import { createFeedbackService } from "./service";

export const feedback = createFeedbackService(prisma);
```

- [x] **Step 6: Commit**

---

## Task 10: Platform UI — Layout, Dashboard & Settings

**Status:** Complete, then substantially extended in commit `cabd9a5 feat: add Polaris design system with tokens, components, and UI overhaul`. The original plan described a bare Tailwind sidebar; the as-built UI is a full design-system shell with a custom titlebar, sidebar rail, icon set, and typography system.

**Files (as built):**
- Create/Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/(platform)/layout.tsx`, `src/app/(platform)/dashboard/page.tsx`, `src/app/(platform)/settings/page.tsx`
- Add (design system, beyond original plan): `src/app/_components/Icon.tsx`, `src/app/_components/TitleBar.tsx`, `src/app/_components/Sidebar.tsx`, `src/app/_components/PolarisGlyph.tsx`, `docs/design/README.md`, `docs/design/polaris-design-system.md`, `docs/design/tokens-reference.css`, `docs/design/preview-cards-reference/**`, `docs/design/ui-kit-reference/**`

- [x] **Step 1: Update the root layout**

`src/app/layout.tsx` loads Source Serif 4, Inter, and JetBrains Mono from `next/font/google`, injects them as CSS variables (`--font-serif`, `--font-sans`, `--font-mono`), and sets metadata (title "Polaris", description "A personal operating system", icon `/brand/polaris-glyph.svg`).

- [x] **Step 2: Update the root page to redirect to dashboard**

`src/app/page.tsx` → `redirect("/dashboard")`.

- [x] **Step 3: Update globals.css for Tailwind v4**

`src/app/globals.css` is ~726 lines. It starts with `@import "tailwindcss";` but the bulk of the file defines the Polaris token system:

- **Paper** series (`--paper-0` through `--paper-4`) and **Ink** series (`--ink-0` through `--ink-5`) for warm-paper light surfaces
- **Night** / **Moon** for dark surfaces
- **Accent** (Obsidian purple `#3c2ea3`) with hover/press/wash/ink variants
- **Semantic** tokens mapped from the Obsidian markdown palette (`--tag`, `--link`, `--heading` terracotta, `--emphasis`, `--mark`) plus status colors (`--success`, `--warning`, `--danger`, `--info` with `-wash` variants)
- **Code** palette for syntax highlighting
- **Surface** tokens (`--bg`, `--bg-raised`, `--bg-sunken`, `--bg-hover`, `--bg-active`, `--border`, `--border-strong`, `--fg`, `--fg-muted`, `--fg-faint`, `--selection`)
- **Typography** scale on a 1.2 modular ratio with 14.5px body (`--fs-xs` … `--fs-lg` + larger), three font families
- **Spacing** scale on a 4px grid (`--sp-0` … `--sp-20`)
- **Radius**, **shadow** (warm-tinted), gap/padding standards

Followed by utility class rules for `.doc`, `.caption`, `.lead`, `.tag-inline`, `.paper-card`, `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-ghost`/`.btn-danger`, `.titlebar`, `.crumbs`, `.sidebar`, `.sb-item`, `.task-row`, etc.

- [x] **Step 4: Create the platform layout with navigation**

`src/app/(platform)/layout.tsx` renders the full app shell:

1. `<TitleBar />` — 36px top chrome (glyph + breadcrumbs + sync dot + email)
2. `<Sidebar />` — 248px left rail (search button, Today link, Systems section with manifests, settings link, sign-out form)
3. `<main className="main"><div className="content">{children}</div></main>`

The sidebar pulls system nav items from `createSystemRegistry(manifests).navItems()`, so new systems appear automatically as they're registered.

- [x] **Step 5: Create the dashboard page**

`src/app/(platform)/dashboard/page.tsx` is a server component calling `feedback.getAllFeedback()`. It renders:
- Today's date + active system count
- Two stat cards (metrics count + most recent metric; reflections count + latest system)
- A metrics table (latest 10)
- Reflection blockquotes (latest 5)
- Iteration history as a task-row list (latest 8)
- Empty-state copy following design-system rules (short declarative sentence + nudge)

- [x] **Step 6: Create the settings page**

`src/app/(platform)/settings/page.tsx` shows the signed-in email and lists registered integrations via `listIntegrations()`, with an empty state when none are configured.

- [x] **Step 7: Verify the UI**

- [x] **Step 8: Commit**

Two commits span this task: the initial stub UI, then `cabd9a5 feat: add Polaris design system with tokens, components, and UI overhaul` which introduced `docs/design/`, the four `_components/`, and the overhauled `globals.css`.

---

## Task 11: Docker Configuration

**Status:** Complete with two deviations — non-default ports and a Bun-based image.

**Files:**
- Create: `docker/docker-compose.yml`, `docker/Dockerfile`, `docker/.dockerignore`

- [x] **Step 1: Create docker-compose.yml**

Actual `docker/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: polaris
      POSTGRES_PASSWORD: polaris
      POSTGRES_DB: polaris
    ports:
      - "5440:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6377:6379"
    volumes:
      - redis_data:/data

  # Uncomment when ready for containerized deployment:
  # app:
  #   build:
  #     context: ..
  #     dockerfile: docker/Dockerfile
  #   ports:
  #     - "3000:3000"
  #   environment:
  #     DATABASE_URL: postgresql://polaris:polaris@postgres:5432/polaris
  #     REDIS_URL: redis://redis:6379
  #   depends_on:
  #     - postgres
  #     - redis

  # worker:
  #   build:
  #     context: ..
  #     dockerfile: docker/Dockerfile
  #   command: bun src/platform/jobs/start-workers.ts
  #   environment:
  #     DATABASE_URL: postgresql://polaris:polaris@postgres:5432/polaris
  #     REDIS_URL: redis://redis:6379
  #   depends_on:
  #     - postgres
  #     - redis

volumes:
  postgres_data:
  redis_data:
```

> **Implementation note:** Host ports `5440` (Postgres) and `6377` (Redis) avoid collisions with other services on the dev machine. See commits `e7311e9 chore: use port 5440 for Postgres to avoid conflict` and `f0fba06 chore: use port 6377 for Redis to avoid conflict`.

- [x] **Step 2: Create the Dockerfile**

Actual `docker/Dockerfile`:

```dockerfile
FROM oven/bun:1 AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
RUN bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["bun", "server.js"]
```

> **Implementation note:** Base image is `oven/bun:1` (not `node:22-alpine`), install uses `bun install --frozen-lockfile`, and the runner entrypoint is `bun server.js`. Copies `bun.lock` instead of `package-lock.json`.

- [x] **Step 3: Create .dockerignore**

- [x] **Step 4: Verify Docker infrastructure starts**

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
# Postgres reachable on host port 5440, Redis on 6377
```

- [x] **Step 5: Commit**

---

## Task 12: Final Verification

**Status:** Complete. All verification steps passed at commit `cabd9a5`.

- [x] **Step 1: Run all tests**

```bash
bun run test
```

All tests pass (router, local storage, feedback service, system registry).

- [x] **Step 2: Run the linter**

```bash
bun run lint
```

- [x] **Step 3: Start infrastructure**

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

- [x] **Step 4: Run database migration**

```bash
bunx prisma migrate dev
```

- [x] **Step 5: Start the dev server**

```bash
bun run dev
```

- [x] **Step 6: Verify the full flow**

Sign-in → redirect to `/dashboard` → sidebar with Today + (empty) Systems section → `/settings` with account info + empty integrations list → sign out. Google OAuth credentials were provisioned in the local `.env`.

- [x] **Step 7: Verify TypeScript compiles**

```bash
bunx tsc --noEmit
```

- [x] **Step 8: Stop infrastructure**

```bash
docker compose -f docker/docker-compose.yml down
```

- [x] **Step 9: Final commit**

The platform foundation is in place. Next work: build the first system under `src/systems/<system-name>/` and register its manifest in `src/systems/index.ts`.
