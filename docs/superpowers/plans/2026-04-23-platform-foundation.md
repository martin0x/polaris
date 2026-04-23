# Polaris Platform Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared infrastructure (auth, database, API layer, file storage, job processing, integration framework, system conventions, feedback mechanisms) that all future Polaris systems plug into.

**Architecture:** TypeScript monolith with convention-based system directories. Systems are self-contained folders under `src/systems/` that register themselves via a manifest. The platform provides shared infrastructure under `src/platform/`. Next.js App Router handles both frontend and API routes.

**Tech Stack:** Next.js 15 (App Router), TypeScript, PostgreSQL + Prisma, NextAuth.js v5 (Auth.js) with Google OAuth, BullMQ + Redis, Vitest

**Spec:** `docs/superpowers/specs/2026-04-22-platform-foundation-design.md`

---

## File Map

Files created or modified by this plan, organized by responsibility:

```
# Project root — config & tooling
package.json                          # Dependencies and scripts
tsconfig.json                         # TypeScript configuration (created by setup)
next.config.ts                        # Next.js configuration
postcss.config.mjs                    # PostCSS + Tailwind v4
vitest.config.ts                      # Test runner configuration
.env.example                          # Environment variable template
.gitignore                            # Updated for Next.js + uploads

# Database
prisma/schema.prisma                  # All models: auth, integrations, feedback
prisma/seed.ts                        # Initial data seeding

# Platform infrastructure
src/platform/db/client.ts             # Prisma client singleton
src/platform/auth/config.ts           # NextAuth v5 configuration
src/platform/auth/session.ts          # Session helpers for server components
src/platform/storage/types.ts         # StorageDriver interface
src/platform/storage/local.ts         # Local filesystem driver
src/platform/storage/s3.ts            # S3-compatible driver
src/platform/storage/index.ts         # Factory — picks driver from env
src/platform/jobs/connection.ts       # Shared Redis connection (ioredis)
src/platform/jobs/queue.ts            # Queue factory
src/platform/jobs/worker.ts           # Worker factory
src/platform/jobs/registry.ts         # Queue/worker registry reads manifests
src/platform/jobs/start-workers.ts    # Standalone worker entrypoint
src/platform/integrations/types.ts    # Integration interface
src/platform/integrations/registry.ts # Integration registry
src/platform/feedback/service.ts      # recordMetric, addReflection, logIteration
src/platform/feedback/index.ts        # Public API (singleton)
src/platform/api/router.ts           # Route matching logic for system APIs
src/platform/api/errors.ts           # Consistent API error formatting

# System convention
src/systems/types.ts                  # SystemManifest type definition
src/systems/registry.ts              # Loads and indexes all manifests
src/systems/index.ts                  # Imports and exports all system manifests
src/systems/_template/manifest.ts     # Starter manifest template
src/systems/_template/components/.gitkeep
src/systems/_template/services/.gitkeep
src/systems/_template/schemas/.gitkeep
src/systems/_template/routes/.gitkeep

# Next.js App Router — pages
src/app/layout.tsx                    # Root layout
src/app/page.tsx                      # Landing — redirect to dashboard
src/app/globals.css                   # Tailwind v4 import + base styles
src/app/auth/signin/page.tsx          # Sign-in page
src/app/(platform)/layout.tsx         # Platform layout with navigation
src/app/(platform)/dashboard/page.tsx # Dashboard — feedback aggregation
src/app/(platform)/settings/page.tsx  # Settings page

# Next.js App Router — API routes
src/app/api/auth/[...nextauth]/route.ts           # NextAuth route handler
src/app/api/platform/storage/upload/route.ts       # File upload
src/app/api/platform/storage/[...key]/route.ts     # File download/serve
src/app/api/platform/jobs/route.ts                 # Queue status
src/app/api/systems/[system]/[...path]/route.ts    # Dynamic system API catch-all

# Middleware
src/middleware.ts                     # Auth guard for all routes

# Tests
src/platform/api/router.test.ts      # Route matching tests
src/platform/storage/local.test.ts    # Local storage driver tests
src/platform/feedback/service.test.ts # Feedback service tests
src/systems/registry.test.ts         # System registry tests

# Docker (future deployment)
docker/docker-compose.yml            # Postgres + Redis + app
docker/Dockerfile                    # Multi-stage Next.js build
docker/.dockerignore                 # Docker build exclusions
```

---

## Task 1: Project Scaffolding & Configuration

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Initialize Next.js project**

Run from the project root. This creates the Next.js boilerplate around existing files:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

If the command warns about existing files (README.md, .gitignore), allow it to proceed — we'll restore/merge in the next steps.

- [ ] **Step 2: Restore project docs if overwritten**

```bash
git checkout -- README.md ARCHITECTURE.md
```

- [ ] **Step 3: Install platform dependencies**

```bash
npm install next-auth@5 @auth/prisma-adapter @prisma/client zod bullmq ioredis @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 4: Install dev dependencies**

```bash
npm install -D prisma vitest @types/node
```

- [ ] **Step 5: Initialize Prisma**

```bash
npx prisma init
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`. We'll replace the schema content in Task 2.

- [ ] **Step 6: Configure Next.js for server packages**

Replace the contents of `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ioredis", "bullmq"],
};

export default nextConfig;
```

- [ ] **Step 7: Create Vitest configuration**

Create `vitest.config.ts`:

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

- [ ] **Step 8: Add test script to package.json**

Add to the `"scripts"` section of `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 9: Create .env.example**

Create `.env.example`:

```env
# Auth
NEXTAUTH_SECRET=generate-a-secret-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_EMAIL=

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

- [ ] **Step 10: Update .gitignore**

Append these entries to `.gitignore` (keep any existing entries):

```
# Uploads (local storage)
uploads/

# Environment
.env
.env.local

# Prisma
prisma/*.db
```

- [ ] **Step 11: Create shared utilities stub**

Create `src/lib/utils.ts`:

```typescript
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
```

- [ ] **Step 12: Verify the dev server starts**

```bash
npm run dev
```

Expected: Next.js dev server starts on `http://localhost:3000` with the default page.

Press Ctrl+C to stop.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js project with platform dependencies"
```

---

## Task 2: Database — Prisma Schema & Client

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/platform/db/client.ts`

- [ ] **Step 1: Write the Prisma schema**

Replace the contents of `prisma/schema.prisma` with the full schema — auth tables, integration table, and feedback tables:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
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

- [ ] **Step 2: Create the Prisma client singleton**

Create `src/platform/db/client.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: Create the seed script**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const email = process.env.ALLOWED_EMAIL;
  if (email) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: "Raymart" },
    });
    console.log(`Seeded user: ${email}`);
  }

  console.log("Seeding complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 4: Configure seed command in package.json**

Add to `package.json`:

```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

Also install tsx as a dev dependency:

```bash
npm install -D tsx
```

- [ ] **Step 5: Set up local .env and run first migration**

Create `.env` (or `.env.local`) from `.env.example` with your actual values. Then ensure PostgreSQL is running locally and create the database:

```bash
createdb polaris
```

Run the initial migration:

```bash
npx prisma migrate dev --name init
```

Expected: Migration created successfully, Prisma Client generated.

- [ ] **Step 6: Run the seed**

```bash
npx prisma db seed
```

Expected: "Seeding complete." printed.

- [ ] **Step 7: Verify with Prisma Studio**

```bash
npx prisma studio
```

Expected: Opens browser at `http://localhost:5555` showing all tables. Verify the User table has the seeded record.

Press Ctrl+C to stop.

- [ ] **Step 8: Commit**

```bash
git add prisma/ src/platform/db/ package.json
git commit -m "feat: add Prisma schema with auth, integration, and feedback models"
```

---

## Task 3: Authentication — NextAuth Setup

**Files:**
- Create: `src/platform/auth/config.ts`, `src/platform/auth/session.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`, `src/app/auth/signin/page.tsx`

- [ ] **Step 1: Create NextAuth configuration**

Create `src/platform/auth/config.ts`:

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/platform/db/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
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
});
```

- [ ] **Step 2: Create session helpers**

Create `src/platform/auth/session.ts`:

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

- [ ] **Step 3: Create the NextAuth API route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/platform/auth/config";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Create the auth middleware**

Create `src/middleware.ts`:

```typescript
import { auth } from "@/platform/auth/config";
import { NextResponse } from "next/server";

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

- [ ] **Step 5: Create the sign-in page**

Create `src/app/auth/signin/page.tsx`:

```tsx
import { signIn } from "@/platform/auth/config";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">Polaris</h1>
        <p className="text-gray-500 mb-8">Personal Operating System</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify auth flow**

Start the dev server:

```bash
npm run dev
```

Navigate to `http://localhost:3000`. Expected: redirected to `/auth/signin` showing the sign-in page.

Note: Google OAuth won't work until you set up a Google Cloud project and add the client ID/secret to `.env`. For now, verify the redirect and page render work.

- [ ] **Step 7: Commit**

```bash
git add src/platform/auth/ src/app/api/auth/ src/app/auth/ src/middleware.ts
git commit -m "feat: add NextAuth v5 with Google OAuth and single-user guard"
```

---

## Task 4: System Convention — Types, Registry & Template

**Files:**
- Create: `src/systems/types.ts`, `src/systems/registry.ts`, `src/systems/index.ts`, `src/systems/_template/manifest.ts`, `src/systems/_template/components/.gitkeep`, `src/systems/_template/services/.gitkeep`, `src/systems/_template/schemas/.gitkeep`, `src/systems/_template/routes/.gitkeep`
- Test: `src/systems/registry.test.ts`

- [ ] **Step 1: Write the failing test for the system registry**

Create `src/systems/registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createSystemRegistry } from "./registry";
import { SystemManifest } from "./types";
import { NextRequest, NextResponse } from "next/server";

const mockHandler = async () => NextResponse.json({ ok: true });

const mockManifest: SystemManifest = {
  name: "test-system",
  displayName: "Test System",
  description: "A test system",
  routes: {
    "GET /items": mockHandler,
    "POST /items": mockHandler,
    "GET /items/:id": mockHandler,
  },
  jobs: {},
  nav: {
    label: "Test",
    icon: "beaker",
    href: "/test",
  },
};

describe("SystemRegistry", () => {
  it("finds a system by name", () => {
    const registry = createSystemRegistry([mockManifest]);
    expect(registry.get("test-system")).toBe(mockManifest);
  });

  it("returns undefined for unknown system", () => {
    const registry = createSystemRegistry([mockManifest]);
    expect(registry.get("unknown")).toBeUndefined();
  });

  it("lists all registered systems", () => {
    const registry = createSystemRegistry([mockManifest]);
    expect(registry.list()).toEqual([mockManifest]);
  });

  it("returns navigation items for all systems", () => {
    const registry = createSystemRegistry([mockManifest]);
    expect(registry.navItems()).toEqual([
      { label: "Test", icon: "beaker", href: "/test" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/systems/registry.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Define the SystemManifest type**

Create `src/systems/types.ts`:

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

- [ ] **Step 4: Implement the system registry**

Create `src/systems/registry.ts`:

```typescript
import { SystemManifest } from "./types";

export function createSystemRegistry(manifests: SystemManifest[]) {
  const byName = new Map(manifests.map((m) => [m.name, m]));

  return {
    get(name: string): SystemManifest | undefined {
      return byName.get(name);
    },

    list(): SystemManifest[] {
      return manifests;
    },

    navItems() {
      return manifests.map((m) => m.nav);
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/systems/registry.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Create the systems index (empty to start)**

Create `src/systems/index.ts`:

```typescript
import { SystemManifest } from "./types";

export const manifests: SystemManifest[] = [
  // Import and add system manifests here as they are built.
  // Example:
  // journalManifest,
];
```

- [ ] **Step 7: Create the system template**

Create `src/systems/_template/manifest.ts`:

```typescript
import { SystemManifest } from "../types";

export const manifest: SystemManifest = {
  name: "_template",
  displayName: "Template System",
  description: "Copy this folder to start a new system",
  routes: {},
  jobs: {},
  nav: {
    label: "Template",
    icon: "template",
    href: "/template",
  },
};
```

Create empty directories with `.gitkeep` files:

```bash
mkdir -p src/systems/_template/components src/systems/_template/services src/systems/_template/schemas src/systems/_template/routes
touch src/systems/_template/components/.gitkeep src/systems/_template/services/.gitkeep src/systems/_template/schemas/.gitkeep src/systems/_template/routes/.gitkeep
```

- [ ] **Step 8: Commit**

```bash
git add src/systems/
git commit -m "feat: add system manifest types, registry, and template"
```

---

## Task 5: Dynamic API Routing

**Files:**
- Create: `src/platform/api/router.ts`, `src/platform/api/errors.ts`, `src/app/api/systems/[system]/[...path]/route.ts`
- Test: `src/platform/api/router.test.ts`

- [ ] **Step 1: Write the failing test for route matching**

Create `src/platform/api/router.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { matchRoute } from "./router";

describe("matchRoute", () => {
  it("matches an exact static route", () => {
    const result = matchRoute("GET /items", "GET", ["items"]);
    expect(result).toEqual({});
  });

  it("rejects wrong method", () => {
    const result = matchRoute("POST /items", "GET", ["items"]);
    expect(result).toBeNull();
  });

  it("matches a route with one param", () => {
    const result = matchRoute("GET /items/:id", "GET", ["items", "abc123"]);
    expect(result).toEqual({ id: "abc123" });
  });

  it("matches a route with multiple params", () => {
    const result = matchRoute(
      "GET /items/:id/comments/:commentId",
      "GET",
      ["items", "abc", "comments", "xyz"]
    );
    expect(result).toEqual({ id: "abc", commentId: "xyz" });
  });

  it("rejects mismatched path length", () => {
    const result = matchRoute("GET /items/:id", "GET", ["items"]);
    expect(result).toBeNull();
  });

  it("rejects mismatched static segment", () => {
    const result = matchRoute("GET /items/:id", "GET", ["users", "abc"]);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/platform/api/router.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route matcher**

Create `src/platform/api/router.ts`:

```typescript
export function matchRoute(
  pattern: string,
  method: string,
  pathSegments: string[]
): Record<string, string> | null {
  const spaceIndex = pattern.indexOf(" ");
  const patternMethod = pattern.slice(0, spaceIndex);
  const patternPath = pattern.slice(spaceIndex + 1);

  if (patternMethod !== method) return null;

  const patternParts = patternPath.split("/").filter(Boolean);
  if (patternParts.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = pathSegments[i];
    } else if (patternParts[i] !== pathSegments[i]) {
      return null;
    }
  }

  return params;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/platform/api/router.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Create the API error helper**

Create `src/platform/api/errors.ts`:

```typescript
import { NextResponse } from "next/server";

export function apiError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function notFound(message = "Not found") {
  return apiError(404, message);
}

export function unauthorized(message = "Unauthorized") {
  return apiError(401, message);
}

export function badRequest(message = "Bad request", details?: unknown) {
  return apiError(400, message, details);
}
```

- [ ] **Step 6: Create the dynamic system API catch-all**

Create `src/app/api/systems/[system]/[...path]/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { auth } from "@/platform/auth/config";
import { matchRoute } from "@/platform/api/router";
import { notFound, unauthorized } from "@/platform/api/errors";
import { manifests } from "@/systems";
import { createSystemRegistry } from "@/systems/registry";

const registry = createSystemRegistry(manifests);

async function handleRequest(
  req: NextRequest,
  { params }: { params: Promise<{ system: string; path: string[] }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const { system: systemName, path } = await params;
  const manifest = registry.get(systemName);
  if (!manifest) return notFound(`System "${systemName}" not found`);

  const method = req.method;
  for (const [pattern, handler] of Object.entries(manifest.routes)) {
    const routeParams = matchRoute(pattern, method, path);
    if (routeParams !== null) {
      return handler(req, routeParams);
    }
  }

  return notFound(`No route matches ${method} /${path.join("/")}`);
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
```

- [ ] **Step 7: Commit**

```bash
git add src/platform/api/ src/app/api/systems/
git commit -m "feat: add dynamic API routing with path-param matching for systems"
```

---

## Task 6: File Storage Abstraction

**Files:**
- Create: `src/platform/storage/types.ts`, `src/platform/storage/local.ts`, `src/platform/storage/s3.ts`, `src/platform/storage/index.ts`, `src/app/api/platform/storage/upload/route.ts`, `src/app/api/platform/storage/[...key]/route.ts`
- Test: `src/platform/storage/local.test.ts`

- [ ] **Step 1: Write the failing test for local storage**

Create `src/platform/storage/local.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createLocalStorage } from "./local";
import fs from "fs/promises";
import path from "path";
import os from "os";

let tmpDir: string;
let storage: ReturnType<typeof createLocalStorage>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "polaris-test-"));
  storage = createLocalStorage(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("LocalStorage", () => {
  it("uploads and downloads a file", async () => {
    const data = Buffer.from("hello world");
    await storage.upload("test/file.txt", data, { contentType: "text/plain" });

    const result = await storage.download("test/file.txt");
    expect(result.toString()).toBe("hello world");
  });

  it("deletes a file", async () => {
    const data = Buffer.from("to delete");
    await storage.upload("test/delete-me.txt", data, {});
    await storage.delete("test/delete-me.txt");

    await expect(storage.download("test/delete-me.txt")).rejects.toThrow();
  });

  it("returns a file path as URL for local driver", async () => {
    const data = Buffer.from("url test");
    await storage.upload("test/url.txt", data, {});

    const url = await storage.getUrl("test/url.txt");
    expect(url).toContain("test/url.txt");
  });

  it("creates nested directories automatically", async () => {
    const data = Buffer.from("nested");
    await storage.upload("a/b/c/deep.txt", data, {});

    const result = await storage.download("a/b/c/deep.txt");
    expect(result.toString()).toBe("nested");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/platform/storage/local.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Define the storage interface**

Create `src/platform/storage/types.ts`:

```typescript
export interface StorageMetadata {
  contentType?: string;
  [key: string]: string | undefined;
}

export interface StorageDriver {
  upload(key: string, data: Buffer, metadata: StorageMetadata): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
}
```

- [ ] **Step 4: Implement the local storage driver**

Create `src/platform/storage/local.ts`:

```typescript
import fs from "fs/promises";
import path from "path";
import { StorageDriver, StorageMetadata } from "./types";

export function createLocalStorage(basePath: string): StorageDriver {
  return {
    async upload(key: string, data: Buffer, _metadata: StorageMetadata) {
      const filePath = path.join(basePath, key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data);
    },

    async download(key: string) {
      const filePath = path.join(basePath, key);
      return fs.readFile(filePath);
    },

    async delete(key: string) {
      const filePath = path.join(basePath, key);
      await fs.unlink(filePath);
    },

    async getUrl(key: string) {
      return `/api/platform/storage/${key}`;
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/platform/storage/local.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Implement the S3 storage driver**

Create `src/platform/storage/s3.ts`:

```typescript
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageDriver, StorageMetadata } from "./types";

export function createS3Storage(config: {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}): StorageDriver {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: !!config.endpoint,
  });

  return {
    async upload(key: string, data: Buffer, metadata: StorageMetadata) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: data,
          ContentType: metadata.contentType,
        })
      );
    },

    async download(key: string) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key })
      );
      const stream = response.Body;
      if (!stream) throw new Error(`File not found: ${key}`);
      return Buffer.from(await stream.transformToByteArray());
    },

    async delete(key: string) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key })
      );
    },

    async getUrl(key: string) {
      const command = new GetObjectCommand({ Bucket: config.bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: 3600 });
    },
  };
}
```

- [ ] **Step 7: Create the storage factory**

Create `src/platform/storage/index.ts`:

```typescript
import { StorageDriver } from "./types";
import { createLocalStorage } from "./local";
import { createS3Storage } from "./s3";

let storageInstance: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (storageInstance) return storageInstance;

  const driver = process.env.STORAGE_DRIVER || "local";

  if (driver === "s3") {
    storageInstance = createS3Storage({
      bucket: process.env.S3_BUCKET!,
      region: process.env.S3_REGION!,
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    });
  } else {
    const basePath = process.env.STORAGE_LOCAL_PATH || "./uploads";
    storageInstance = createLocalStorage(basePath);
  }

  return storageInstance;
}

export type { StorageDriver, StorageMetadata } from "./types";
```

- [ ] **Step 8: Create the upload API route**

Create `src/app/api/platform/storage/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/platform/auth/config";
import { getStorage } from "@/platform/storage";
import { unauthorized, badRequest } from "@/platform/api/errors";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const key = formData.get("key") as string | null;

  if (!file || !key) {
    return badRequest("Missing 'file' or 'key' in form data");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  await storage.upload(key, buffer, { contentType: file.type });

  return NextResponse.json({ key, size: buffer.length }, { status: 201 });
}
```

- [ ] **Step 9: Create the download/serve API route**

Create `src/app/api/platform/storage/[...key]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/platform/auth/config";
import { getStorage } from "@/platform/storage";
import { unauthorized, notFound } from "@/platform/api/errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const { key } = await params;
  const fullKey = key.join("/");
  const storage = getStorage();

  try {
    const data = await storage.download(fullKey);
    return new NextResponse(data, {
      headers: { "Content-Type": "application/octet-stream" },
    });
  } catch {
    return notFound(`File not found: ${fullKey}`);
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add src/platform/storage/ src/app/api/platform/storage/
git commit -m "feat: add file storage abstraction with local and S3 drivers"
```

---

## Task 7: Job Processing — BullMQ Setup

**Files:**
- Create: `src/platform/jobs/connection.ts`, `src/platform/jobs/queue.ts`, `src/platform/jobs/worker.ts`, `src/platform/jobs/registry.ts`, `src/platform/jobs/start-workers.ts`, `src/app/api/platform/jobs/route.ts`

- [ ] **Step 1: Create the shared Redis connection**

Create `src/platform/jobs/connection.ts`:

```typescript
import IORedis from "ioredis";

let connectionInstance: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (connectionInstance) return connectionInstance;

  const url = process.env.REDIS_URL || "redis://localhost:6379";
  connectionInstance = new IORedis(url, { maxRetriesPerRequest: null });

  return connectionInstance;
}
```

- [ ] **Step 2: Create the queue factory**

Create `src/platform/jobs/queue.ts`:

```typescript
import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  const existing = queues.get(name);
  if (existing) return existing;

  const queue = new Queue(name, { connection: getRedisConnection() });
  queues.set(name, queue);
  return queue;
}

export function getAllQueues(): Map<string, Queue> {
  return queues;
}
```

- [ ] **Step 3: Create the worker factory**

Create `src/platform/jobs/worker.ts`:

```typescript
import { Worker, Job, Processor } from "bullmq";
import { getRedisConnection } from "./connection";

export function createWorker(
  queueName: string,
  processor: Processor
): Worker {
  const worker = new Worker(queueName, processor, {
    connection: getRedisConnection(),
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    console.error(
      `[${queueName}] Job ${job?.id} failed: ${err.message}`
    );
  });

  worker.on("completed", (job: Job) => {
    console.log(`[${queueName}] Job ${job.id} completed`);
  });

  return worker;
}
```

- [ ] **Step 4: Create the job registry**

Create `src/platform/jobs/registry.ts`:

```typescript
import { Job, Worker } from "bullmq";
import { SystemManifest } from "@/systems/types";
import { getQueue } from "./queue";
import { createWorker } from "./worker";

const workers: Worker[] = [];

export function registerSystemJobs(manifests: SystemManifest[]) {
  for (const manifest of manifests) {
    if (Object.keys(manifest.jobs).length === 0) continue;

    const queueName = `${manifest.name}-queue`;
    getQueue(queueName);

    const jobProcessors = manifest.jobs;
    const worker = createWorker(queueName, async (job: Job) => {
      const processor = jobProcessors[job.name];
      if (!processor) {
        throw new Error(
          `No processor for job "${job.name}" in system "${manifest.name}"`
        );
      }
      await processor(job);
    });

    workers.push(worker);
    console.log(
      `Registered jobs for ${manifest.name}: ${Object.keys(manifest.jobs).join(", ")}`
    );
  }
}

export function getWorkers(): Worker[] {
  return workers;
}

export async function shutdownWorkers() {
  await Promise.all(workers.map((w) => w.close()));
}
```

- [ ] **Step 5: Create the worker startup script**

Create `src/platform/jobs/start-workers.ts`:

```typescript
import { manifests } from "@/systems";
import { registerSystemJobs, shutdownWorkers } from "./registry";

console.log("Starting workers...");
registerSystemJobs(manifests);
console.log("Workers running. Press Ctrl+C to stop.");

process.on("SIGINT", async () => {
  console.log("Shutting down workers...");
  await shutdownWorkers();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down workers...");
  await shutdownWorkers();
  process.exit(0);
});
```

- [ ] **Step 6: Create the jobs status API route**

Create `src/app/api/platform/jobs/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/platform/auth/config";
import { unauthorized } from "@/platform/api/errors";
import { getAllQueues } from "@/platform/jobs/queue";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const queues = getAllQueues();
  const status: Record<string, unknown> = {};

  for (const [name, queue] of queues) {
    const counts = await queue.getJobCounts();
    status[name] = counts;
  }

  return NextResponse.json({ queues: status });
}
```

- [ ] **Step 7: Add worker script to package.json**

Add to the `"scripts"` section of `package.json`:

```json
"workers": "tsx src/platform/jobs/start-workers.ts"
```

- [ ] **Step 8: Commit**

```bash
git add src/platform/jobs/ src/app/api/platform/jobs/ package.json
git commit -m "feat: add BullMQ job processing with queue/worker factories and registry"
```

---

## Task 8: Integration Framework

**Files:**
- Create: `src/platform/integrations/types.ts`, `src/platform/integrations/registry.ts`

- [ ] **Step 1: Define the integration interface**

Create `src/platform/integrations/types.ts`:

```typescript
export interface Integration {
  name: string;
  displayName: string;
  status(): Promise<"connected" | "disconnected" | "expired">;
  connect(): Promise<string>;
  disconnect(): Promise<void>;
}
```

- [ ] **Step 2: Create the integration registry**

Create `src/platform/integrations/registry.ts`:

```typescript
import { Integration } from "./types";

const integrations = new Map<string, Integration>();

export function registerIntegration(integration: Integration) {
  integrations.set(integration.name, integration);
}

export function getIntegration(name: string): Integration | undefined {
  return integrations.get(name);
}

export function hasIntegration(name: string): boolean {
  return integrations.has(name);
}

export function listIntegrations(): Integration[] {
  return Array.from(integrations.values());
}
```

- [ ] **Step 3: Commit**

```bash
git add src/platform/integrations/
git commit -m "feat: add integration framework with registry"
```

---

## Task 9: Feedback Mechanisms — Service

**Files:**
- Create: `src/platform/feedback/service.ts`, `src/platform/feedback/index.ts`
- Test: `src/platform/feedback/service.test.ts`

- [ ] **Step 1: Write the failing test for the feedback service**

Create `src/platform/feedback/service.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createFeedbackService } from "./service";

function mockPrisma() {
  return {
    systemMetric: {
      create: vi.fn().mockResolvedValue({ id: "m1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    systemReflection: {
      create: vi.fn().mockResolvedValue({ id: "r1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    systemIteration: {
      create: vi.fn().mockResolvedValue({ id: "i1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe("FeedbackService", () => {
  it("records a metric", async () => {
    const prisma = mockPrisma();
    const service = createFeedbackService(prisma as any);

    await service.recordMetric("journal", "entries_created", 5);

    expect(prisma.systemMetric.create).toHaveBeenCalledWith({
      data: { system: "journal", name: "entries_created", value: 5 },
    });
  });

  it("adds a reflection", async () => {
    const prisma = mockPrisma();
    const service = createFeedbackService(prisma as any);

    await service.addReflection("journal", {
      content: "Going well",
      strengths: ["consistency"],
      weaknesses: ["depth"],
      ideas: ["add prompts"],
    });

    expect(prisma.systemReflection.create).toHaveBeenCalledWith({
      data: {
        system: "journal",
        content: "Going well",
        strengths: ["consistency"],
        weaknesses: ["depth"],
        ideas: ["add prompts"],
      },
    });
  });

  it("logs an iteration", async () => {
    const prisma = mockPrisma();
    const service = createFeedbackService(prisma as any);

    await service.logIteration("journal", {
      description: "Added AI prompts",
      reason: "Entries were too shallow",
    });

    expect(prisma.systemIteration.create).toHaveBeenCalledWith({
      data: {
        system: "journal",
        description: "Added AI prompts",
        reason: "Entries were too shallow",
      },
    });
  });

  it("lists metrics for a system", async () => {
    const prisma = mockPrisma();
    const service = createFeedbackService(prisma as any);

    await service.getMetrics("journal");

    expect(prisma.systemMetric.findMany).toHaveBeenCalledWith({
      where: { system: "journal" },
      orderBy: { recordedAt: "desc" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/platform/feedback/service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the feedback service**

Create `src/platform/feedback/service.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

interface ReflectionInput {
  content: string;
  strengths: string[];
  weaknesses: string[];
  ideas: string[];
}

interface IterationInput {
  description: string;
  reason: string;
}

export function createFeedbackService(prisma: PrismaClient) {
  return {
    async recordMetric(system: string, name: string, value: number) {
      return prisma.systemMetric.create({
        data: { system, name, value },
      });
    },

    async addReflection(system: string, input: ReflectionInput) {
      return prisma.systemReflection.create({
        data: { system, ...input },
      });
    },

    async logIteration(system: string, input: IterationInput) {
      return prisma.systemIteration.create({
        data: { system, ...input },
      });
    },

    async getMetrics(system: string) {
      return prisma.systemMetric.findMany({
        where: { system },
        orderBy: { recordedAt: "desc" },
      });
    },

    async getReflections(system: string) {
      return prisma.systemReflection.findMany({
        where: { system },
        orderBy: { createdAt: "desc" },
      });
    },

    async getIterations(system: string) {
      return prisma.systemIteration.findMany({
        where: { system },
        orderBy: { createdAt: "desc" },
      });
    },

    async getAllFeedback() {
      const [metrics, reflections, iterations] = await Promise.all([
        prisma.systemMetric.findMany({ orderBy: { recordedAt: "desc" }, take: 50 }),
        prisma.systemReflection.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
        prisma.systemIteration.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
      ]);
      return { metrics, reflections, iterations };
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/platform/feedback/service.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Create the public API (singleton)**

Create `src/platform/feedback/index.ts`:

```typescript
import { prisma } from "@/platform/db/client";
import { createFeedbackService } from "./service";

export const feedback = createFeedbackService(prisma);
```

- [ ] **Step 6: Commit**

```bash
git add src/platform/feedback/
git commit -m "feat: add feedback service for metrics, reflections, and iterations"
```

---

## Task 10: Platform UI — Layout, Dashboard & Settings

**Files:**
- Create/Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/(platform)/layout.tsx`, `src/app/(platform)/dashboard/page.tsx`, `src/app/(platform)/settings/page.tsx`

- [ ] **Step 1: Update the root layout**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polaris",
  description: "Personal Operating System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Update the root page to redirect to dashboard**

Replace `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 3: Update globals.css for Tailwind v4**

Replace `src/app/globals.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Create the platform layout with navigation**

Create `src/app/(platform)/layout.tsx`:

```tsx
import Link from "next/link";
import { auth, signOut } from "@/platform/auth/config";
import { manifests } from "@/systems";
import { createSystemRegistry } from "@/systems/registry";

const registry = createSystemRegistry(manifests);

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen">
      <nav className="w-64 border-r bg-gray-50 p-4">
        <Link href="/dashboard" className="block text-xl font-bold mb-8">
          Polaris
        </Link>

        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="block rounded px-3 py-2 text-sm hover:bg-gray-200"
          >
            Dashboard
          </Link>

          {registry.navItems().map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded px-3 py-2 text-sm hover:bg-gray-200"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="mt-auto pt-8 border-t">
          <Link
            href="/settings"
            className="block rounded px-3 py-2 text-sm hover:bg-gray-200"
          >
            Settings
          </Link>
          {session?.user && (
            <div className="px-3 py-2 text-xs text-gray-500">
              {session.user.email}
            </div>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/auth/signin" });
            }}
          >
            <button
              type="submit"
              className="block w-full text-left rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Create the dashboard page**

Create `src/app/(platform)/dashboard/page.tsx`:

```tsx
import { feedback } from "@/platform/feedback";

export default async function DashboardPage() {
  const { metrics, reflections, iterations } = await feedback.getAllFeedback();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Recent Metrics</h2>
          {metrics.length === 0 ? (
            <p className="text-sm text-gray-500">No metrics recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {metrics.slice(0, 10).map((m) => (
                <li key={m.id} className="text-sm">
                  <span className="font-medium">{m.system}</span> — {m.name}:{" "}
                  {m.value}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Recent Reflections</h2>
          {reflections.length === 0 ? (
            <p className="text-sm text-gray-500">No reflections yet.</p>
          ) : (
            <ul className="space-y-2">
              {reflections.slice(0, 5).map((r) => (
                <li key={r.id} className="text-sm">
                  <span className="font-medium">{r.system}</span> — {r.content}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-semibold mb-3">Iteration History</h2>
          {iterations.length === 0 ? (
            <p className="text-sm text-gray-500">No iterations logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {iterations.slice(0, 5).map((i) => (
                <li key={i.id} className="text-sm">
                  <span className="font-medium">{i.system}</span> —{" "}
                  {i.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create the settings page**

Create `src/app/(platform)/settings/page.tsx`:

```tsx
import { listIntegrations } from "@/platform/integrations/registry";

export default async function SettingsPage() {
  const integrations = listIntegrations();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Integrations</h2>
        {integrations.length === 0 ? (
          <p className="text-sm text-gray-500">
            No integrations configured. Integrations are added when a system
            needs one.
          </p>
        ) : (
          <ul className="space-y-3">
            {integrations.map((integration) => (
              <li
                key={integration.name}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <div className="font-medium">{integration.displayName}</div>
                  <div className="text-sm text-gray-500">
                    {integration.name}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Verify the UI**

Start the dev server:

```bash
npm run dev
```

Navigate to `http://localhost:3000`. Expected:
- Redirected to `/auth/signin` (if not authenticated)
- After auth, redirected to `/dashboard` with the sidebar nav and empty dashboard cards
- `/settings` page shows "No integrations configured"

- [ ] **Step 8: Commit**

```bash
git add src/app/
git commit -m "feat: add platform UI with dashboard, settings, and navigation"
```

---

## Task 11: Docker Configuration

**Files:**
- Create: `docker/docker-compose.yml`, `docker/Dockerfile`, `docker/.dockerignore`

- [ ] **Step 1: Create docker-compose.yml**

Create `docker/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: polaris
      POSTGRES_PASSWORD: polaris
      POSTGRES_DB: polaris
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
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
  #   command: node src/platform/jobs/start-workers.ts
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

- [ ] **Step 2: Create the Dockerfile**

Create `docker/Dockerfile`:

```dockerfile
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Create .dockerignore**

Create `docker/.dockerignore`:

```
node_modules
.next
.git
uploads
.env
.env.local
```

- [ ] **Step 4: Verify Docker infrastructure starts**

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

Expected: PostgreSQL on port 5432, Redis on port 6379.

```bash
docker compose -f docker/docker-compose.yml down
```

- [ ] **Step 5: Commit**

```bash
git add docker/
git commit -m "feat: add Docker Compose for Postgres and Redis"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass (router, storage, feedback, registry).

- [ ] **Step 2: Run the linter**

```bash
npm run lint
```

Expected: No lint errors (fix any that appear).

- [ ] **Step 3: Start infrastructure**

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

- [ ] **Step 4: Run database migration**

```bash
npx prisma migrate dev
```

- [ ] **Step 5: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 6: Verify the full flow**

Open `http://localhost:3000` and check:

1. Redirected to `/auth/signin` — sign-in page renders with Google button
2. After signing in (requires Google OAuth credentials in `.env`), redirected to `/dashboard`
3. Dashboard shows three empty cards (metrics, reflections, iterations)
4. Sidebar navigation shows "Dashboard" and "Settings"
5. `/settings` page renders with empty integrations section
6. Sign out button works

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 8: Stop infrastructure**

```bash
docker compose -f docker/docker-compose.yml down
```

- [ ] **Step 9: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
