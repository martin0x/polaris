# Strip Async Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the BullMQ/Redis async job system from Polaris and replace the one real job (`computeActiveTopics`) with an authenticated cron-triggered HTTP route, so deployment options collapse to Next.js + Postgres + S3 (no long-lived worker process needed).

**Architecture:** The single existing job (`computeActiveTopics`, daily 11pm) becomes `GET /api/cron/compute-active-topics`, guarded by a `CRON_SECRET` shared-secret header. Whichever scheduler the eventual deployment uses (Vercel Cron, GitHub Actions, system cron + curl) calls the route. The `SystemManifest.jobs` field, `JobProcessor` type, the `src/platform/jobs/` directory, the admin queue-status route, the `bun start-workers` script, the `bullmq` and `ioredis` dependencies, the `redis` Docker service, and the `REDIS_URL` env var all go away. The `computeActiveTopics` business logic itself moves up one directory (out of the now-misleading `services/jobs/` folder) but is otherwise unchanged.

**Tech Stack:** Next.js 16, TypeScript, vitest, Prisma. No new dependencies.

---

## File Structure

**Files to create:**
- `src/app/api/cron/compute-active-topics/route.ts` — authenticated GET endpoint that calls `computeActiveTopics()`
- `src/app/api/cron/compute-active-topics/route.test.ts` — auth-flow unit test
- `src/systems/journal/services/computeActiveTopics.ts` — moved from `services/jobs/computeActiveTopics.ts`, contents unchanged

**Files to modify:**
- `src/systems/types.ts` — drop `JobProcessor` type and `jobs` field from `SystemManifest`; drop `Job` import from `bullmq`
- `src/systems/journal/manifest.ts` — drop `jobs` field and the `computeActiveTopicsJob` import
- `src/systems/registry.test.ts` — remove `jobs: {}` from `mockManifest`
- `package.json` — remove `bullmq` and `ioredis` deps; remove `workers` script
- `docker/docker-compose.yml` — remove `redis` service and `redis_data` volume; remove the commented-out `worker` block
- `.env.example` — remove `REDIS_URL` block; add `CRON_SECRET` block

**Files to delete:**
- `src/platform/jobs/connection.ts`
- `src/platform/jobs/queue.ts`
- `src/platform/jobs/worker.ts`
- `src/platform/jobs/registry.ts`
- `src/platform/jobs/start-workers.ts`
- `src/platform/jobs/` (the directory itself, after files removed)
- `src/systems/journal/services/jobs/index.ts`
- `src/systems/journal/services/jobs/` (the directory itself, after `computeActiveTopics.ts` is moved out and `index.ts` deleted)
- `src/app/api/platform/jobs/route.ts`
- `src/app/api/platform/jobs/` (the directory itself, after route deleted)

---

## Task 1: Add the authenticated cron route (TDD)

**Files:**
- Create: `src/app/api/cron/compute-active-topics/route.ts`
- Create: `src/app/api/cron/compute-active-topics/route.test.ts`

This task uses the *current* import path for `computeActiveTopics` (still inside `services/jobs/`). Task 2 moves the file; Task 3 updates the import in this route. We do it in this order so each task's test stays green.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/cron/compute-active-topics/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/systems/journal/services/jobs/computeActiveTopics", () => ({
  computeActiveTopics: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from "./route";
import { computeActiveTopics } from "@/systems/journal/services/jobs/computeActiveTopics";

describe("GET /api/cron/compute-active-topics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  it("returns 401 when authorization header is missing", async () => {
    const req = new NextRequest(
      "http://localhost/api/cron/compute-active-topics"
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(computeActiveTopics).not.toHaveBeenCalled();
  });

  it("returns 401 when secret is wrong", async () => {
    const req = new NextRequest(
      "http://localhost/api/cron/compute-active-topics",
      { headers: { authorization: "Bearer wrong" } }
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(computeActiveTopics).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET env var is unset", async () => {
    delete process.env.CRON_SECRET;
    const req = new NextRequest(
      "http://localhost/api/cron/compute-active-topics",
      { headers: { authorization: "Bearer anything" } }
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(computeActiveTopics).not.toHaveBeenCalled();
  });

  it("runs computeActiveTopics and returns 200 with valid secret", async () => {
    const req = new NextRequest(
      "http://localhost/api/cron/compute-active-topics",
      { headers: { authorization: "Bearer test-secret" } }
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(computeActiveTopics).toHaveBeenCalledOnce();
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/app/api/cron/compute-active-topics/route.test.ts`
Expected: FAIL with `Cannot find module './route'` or similar import error (because `route.ts` doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/cron/compute-active-topics/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { computeActiveTopics } from "@/systems/journal/services/jobs/computeActiveTopics";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await computeActiveTopics();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/app/api/cron/compute-active-topics/route.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/compute-active-topics/
git commit -m "feat(cron): add authenticated compute-active-topics route"
```

---

## Task 2: Move computeActiveTopics out of the jobs/ subdir

The `services/jobs/` folder name becomes misleading once async work is gone. The business logic file moves up one level; the BullMQ wrapper file (`index.ts`) gets deleted because nothing imports it after Task 5.

**Files:**
- Create: `src/systems/journal/services/computeActiveTopics.ts` (moved, contents unchanged)
- Delete: `src/systems/journal/services/jobs/computeActiveTopics.ts`
- Delete: `src/systems/journal/services/jobs/index.ts`
- Delete: `src/systems/journal/services/jobs/` (directory)

- [ ] **Step 1: Move the file with git**

```bash
git mv src/systems/journal/services/jobs/computeActiveTopics.ts \
       src/systems/journal/services/computeActiveTopics.ts
```

- [ ] **Step 2: Delete the BullMQ wrapper file**

```bash
rm src/systems/journal/services/jobs/index.ts
rmdir src/systems/journal/services/jobs
```

- [ ] **Step 3: Verify the moved file still compiles in isolation**

Run: `bunx tsc --noEmit src/systems/journal/services/computeActiveTopics.ts`
Expected: No errors related to this file. (Other unrelated tsc errors in the project are fine — we're checking this one file's imports still resolve.)

- [ ] **Step 4: Commit**

```bash
git add -A src/systems/journal/services/
git commit -m "refactor(journal): move computeActiveTopics out of jobs subdir"
```

---

## Task 3: Update cron route's import to the new path

Now that `computeActiveTopics.ts` lives at `services/computeActiveTopics.ts`, fix the import in the route and its test.

**Files:**
- Modify: `src/app/api/cron/compute-active-topics/route.ts`
- Modify: `src/app/api/cron/compute-active-topics/route.test.ts`

- [ ] **Step 1: Update the route import**

In `src/app/api/cron/compute-active-topics/route.ts`, change:

```ts
import { computeActiveTopics } from "@/systems/journal/services/jobs/computeActiveTopics";
```

to:

```ts
import { computeActiveTopics } from "@/systems/journal/services/computeActiveTopics";
```

- [ ] **Step 2: Update the test's mock target and import**

In `src/app/api/cron/compute-active-topics/route.test.ts`, change both:

```ts
vi.mock("@/systems/journal/services/jobs/computeActiveTopics", () => ({
```

to:

```ts
vi.mock("@/systems/journal/services/computeActiveTopics", () => ({
```

and:

```ts
import { computeActiveTopics } from "@/systems/journal/services/jobs/computeActiveTopics";
```

to:

```ts
import { computeActiveTopics } from "@/systems/journal/services/computeActiveTopics";
```

- [ ] **Step 3: Run the route tests to verify they still pass**

Run: `bun run test src/app/api/cron/compute-active-topics/route.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/compute-active-topics/
git commit -m "refactor(cron): update import path after services move"
```

---

## Task 4: Strip JobProcessor and jobs field from SystemManifest

Three files reference the manifest's `jobs` field. Remove the field, then remove the references that produced it.

**Files:**
- Modify: `src/systems/types.ts`
- Modify: `src/systems/journal/manifest.ts`
- Modify: `src/systems/registry.test.ts`

- [ ] **Step 1: Remove `jobs` and `JobProcessor` from types**

In `src/systems/types.ts`, replace:

```ts
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

with:

```ts
import { NextRequest, NextResponse } from "next/server";
import type { PaletteSystemConfig } from "@/platform/palette/types";

export type RouteHandler = (
  req: NextRequest,
  params: Record<string, string>
) => Promise<NextResponse>;

export interface SystemManifest {
  name: string;
  displayName: string;
  description: string;
  routes: Record<string, RouteHandler>;
  nav: {
    label: string;
    icon: string;
    href: string;
  };
  palette?: PaletteSystemConfig;
}
```

- [ ] **Step 2: Remove `jobs` from the journal manifest**

In `src/systems/journal/manifest.ts`, delete the import line:

```ts
import { computeActiveTopicsJob } from "./services/jobs";
```

and delete the `jobs` block:

```ts
  jobs: {
    "compute-active-topics": computeActiveTopicsJob,
  },
```

- [ ] **Step 3: Remove `jobs: {}` from the test mock**

In `src/systems/registry.test.ts`, delete the line:

```ts
  jobs: {},
```

from `mockManifest`.

- [ ] **Step 4: Run typecheck and registry test**

Run: `bunx tsc --noEmit`
Expected: One remaining set of errors — anything still importing from `@/platform/jobs/*` or `bullmq`. That's expected; Task 5 deletes those. No errors from the three files just edited.

Run: `bun run test src/systems/registry.test.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/systems/types.ts src/systems/journal/manifest.ts src/systems/registry.test.ts
git commit -m "refactor(systems): drop jobs field from SystemManifest"
```

---

## Task 5: Delete platform/jobs/ infrastructure and the admin route

With `SystemManifest.jobs` gone, nothing imports from `src/platform/jobs/` or the admin queue route anymore.

**Files:**
- Delete: `src/platform/jobs/connection.ts`
- Delete: `src/platform/jobs/queue.ts`
- Delete: `src/platform/jobs/worker.ts`
- Delete: `src/platform/jobs/registry.ts`
- Delete: `src/platform/jobs/start-workers.ts`
- Delete: `src/platform/jobs/` (directory)
- Delete: `src/app/api/platform/jobs/route.ts`
- Delete: `src/app/api/platform/jobs/` (directory)

- [ ] **Step 1: Confirm no remaining imports**

Run: `grep -rn "from \"@/platform/jobs\|from \"bullmq\|from \"ioredis" src/`
Expected: No matches. (If matches exist, stop and investigate before deleting — something escaped the analysis.)

- [ ] **Step 2: Delete the infrastructure files**

```bash
rm -r src/platform/jobs
rm -r src/app/api/platform/jobs
```

- [ ] **Step 3: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run the full unit test suite**

Run: `bun run test`
Expected: All tests pass. No `cannot find module` errors. Integration tests are excluded from this run by `vitest.config.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A src/platform/jobs src/app/api/platform/jobs
git commit -m "chore: remove BullMQ infrastructure and admin queue route"
```

---

## Task 6: Drop dependencies, scripts, env, and Docker config

**Files:**
- Modify: `package.json`
- Modify: `docker/docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Remove deps and the workers script from package.json**

In `package.json`, delete these `dependencies` entries:

```json
    "bullmq": "^5.76.1",
    "ioredis": "^5.10.1",
```

And delete this `scripts` entry:

```json
    "workers": "bun src/platform/jobs/start-workers.ts",
```

- [ ] **Step 2: Refresh the lockfile**

Run: `bun install`
Expected: Lockfile updates; no errors. `bun.lockb` (or `bun.lock`) shows changes.

- [ ] **Step 3: Remove the redis service and worker stub from docker-compose.yml**

In `docker/docker-compose.yml`, delete the `redis:` service block:

```yaml
  redis:
    image: redis:7-alpine
    ports:
      - "6377:6379"
    volumes:
      - redis_data:/data
```

Delete the `redis_data:` line from the `volumes:` block at the bottom (keep `postgres_data:`).

Delete the entire commented-out `worker:` block (the one that runs `bun src/platform/jobs/start-workers.ts`). Keep the commented-out `app:` block — it's still useful for self-hosted deployments. Inside the `app:` block's commented `environment:` section, delete the `REDIS_URL: redis://redis:6379` line.

After editing, the relevant sections should look like:

```yaml
  # Uncomment when ready for containerized deployment:
  # app:
  #   build:
  #     context: ..
  #     dockerfile: docker/Dockerfile
  #   ports:
  #     - "3000:3000"
  #   environment:
  #     DATABASE_URL: postgresql://polaris:polaris@postgres:5432/polaris
  #   depends_on:
  #     - postgres

volumes:
  postgres_data:
```

- [ ] **Step 4: Update .env.example**

In `.env.example`, delete this block:

```
# Redis
REDIS_URL=redis://localhost:6377
```

Add this block (place it after the `# Database` block):

```
# Cron — shared secret for /api/cron/* routes. Generate with: openssl rand -base64 32
CRON_SECRET=
```

- [ ] **Step 5: Verify the dev workflow still works**

Run: `bun run dev` (then Ctrl+C after the server boots)
Expected: `docker compose up -d` brings up only postgres (no redis), and `next dev` starts on port 3000. No errors about missing Redis connection.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock docker/docker-compose.yml .env.example
git commit -m "chore: drop bullmq, ioredis, redis service, REDIS_URL"
```

(If the lockfile is named `bun.lockb` instead of `bun.lock`, adjust the `git add` accordingly. Use `git status` to confirm.)

---

## Task 7: Final verification

- [ ] **Step 1: Run the full unit test suite**

Run: `bun run test`
Expected: All tests pass.

- [ ] **Step 2: Run the integration test suite**

Run: `bun run test:integration`
Expected: All tests pass (or skip cleanly if `DATABASE_URL_TEST` is unset).

- [ ] **Step 3: Run typecheck**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Run lint**

Run: `bun run lint`
Expected: No errors.

- [ ] **Step 5: Run build**

Run: `bun run build`
Expected: Build succeeds; `/api/cron/compute-active-topics` appears in the route manifest.

- [ ] **Step 6: Manually exercise the cron route**

In one terminal: `bun run dev`
In another:

```bash
# Should 401:
curl -i http://localhost:3000/api/cron/compute-active-topics

# Should 401:
curl -i -H "Authorization: Bearer wrong" http://localhost:3000/api/cron/compute-active-topics

# Should 200 — replace VALUE with the value of CRON_SECRET in your .env.local:
curl -i -H "Authorization: Bearer VALUE" http://localhost:3000/api/cron/compute-active-topics
```

Expected: First two return 401; third returns 200 with `{"ok":true}` and a `feedback` metric row gets recorded for `journal.active_topic_count`.

- [ ] **Step 7: Final confirmation**

`git log --oneline -8` should show the six commits from Tasks 1–6 in order. No uncommitted changes (`git status` clean).

---

## Out of scope (intentionally not done here)

- **Picking a deployment target.** This refactor is deployment-agnostic. Whichever scheduler you pick (Vercel Cron, GitHub Actions, system cron + curl) just needs to call `GET /api/cron/compute-active-topics` daily with the `Authorization: Bearer $CRON_SECRET` header.
- **Tests for `computeActiveTopics` itself.** The function had no tests before this refactor and still doesn't. Add them in a separate change if desired.
- **Designing the future supplemental-workers repo.** When that exists, Polaris will talk to it via plain `fetch()` calls. No abstraction needed in Polaris until a second async use case appears.
