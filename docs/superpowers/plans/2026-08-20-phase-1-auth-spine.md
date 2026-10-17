# Phase 1 — Auth Swap and Platform Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NextAuth v5 with Convex Auth (Google + allowlist) across the web app, re-gate the legacy REST layer on Convex token validation, stand up the feedback module on Convex with its historical rows imported — and settle the Convex-Auth-vs-Clerk decision with two timeboxed spikes (web, Expo) before committing everywhere.

**Architecture:** Convex Auth lives in `packages/backend/convex/` (authTables schema, Google provider, allowlist enforced in the `createOrUpdateUser` callback). The Next app swaps `src/middleware.ts` (NextAuth edge instance) for `src/proxy.ts` (Next 16's convention) running `convexAuthNextjsMiddleware`; server code reads identity via `convexAuthNextjsToken()` + a `users.viewer` query; the REST catch-all and platform routes gate on `isAuthenticatedNextjs()`. The feedback module becomes three Convex tables + functions; the web keeps a same-shaped `feedback` adapter so all seven call sites are untouched. Metric writes are server-trusted (a `serviceKey` checked against `CRON_SECRET` on the Convex deployment); reads require a signed-in identity.

**Tech Stack:** Bun 1.3.x (toolchain only), Next.js 16.2.4 (pinned), Convex 1.44.x, `@convex-dev/auth` **0.0.95 (exact pin — beta)**, `@auth/core` **0.41.1 (exact pin)**, convex-test 0.0.55, Vitest 4.1.x, Prisma 7 (source of the export; four auth tables dropped at the end).

**Spec:** `docs/replatform.md` — §05 "Phase 1 — Auth swap and platform spine", §06 data migration playbook, §07 improvements ("formalize", "one validation layer"), §08 risks (Convex Auth beta; Next 16 compatibility).

## Global Constraints

- **Branching:** work happens on branch `phase-1-auth-spine`, created from `replatform`, in a dedicated worktree. It merges back into `replatform` at the end (user instruction). Never commit to `main` or `replatform` directly.
- **Bun as toolchain only** (spec §03). `bun install`, `bun add`, `bun run`, `bunx` for every CLI. Never `bun test` (Bun's own runner) — always `bun run test` (Vitest). `next dev`/`next build` run on Node.
- **Next.js 16.2.4 is not the Next you know** (AGENTS.md). Before touching Next config/conventions, consult `apps/web/node_modules/next/dist/docs/`. Already verified for this plan: `middleware.ts` is **deprecated and renamed `proxy.ts`** in v16 (`…/03-file-conventions/proxy.md`, `…/upgrading/version-16.md`); proxy runs on the Node runtime only; matcher config syntax is unchanged; `cookies()`/`headers()` are async.
- **Design system:** any task touching `.tsx` UI (Tasks 3, 5) — read `docs/design/README.md` and `docs/design/polaris-design-system.md` first. The sign-in page **keeps its exact design** (spec §05); sentence case; tokens, never hex; icons only from `apps/web/src/app/_components/Icon.tsx`.
- **Pinned versions:** `@convex-dev/auth` exact `0.0.95` and `@auth/core` exact `0.41.1` (beta package — no caret). `next` stays `16.2.4`, `react` stays `19.2.4`.
- **Data-shape rules** (spec §02): Postgres cuids become an indexed `legacyId` string; `DateTime` → millisecond numbers. Imports are idempotent by `legacyId` upsert.
- **Feedback Postgres tables are NOT dropped.** Per spec §06, migrated tables stay as a frozen archive until phase 5. Only NextAuth's four tables (`User`, `Account`, `Session`, `VerificationToken`) are dropped — that is this phase's exit criterion.
- **Server-trusted metric writes:** the Convex `feedback.recordMetric` mutation authenticates with `serviceKey` = the Convex deployment's `CRON_SECRET` env var (same value as the web's `CRON_SECRET`). Reads (`getAllFeedback`) require a signed-in identity. Rationale: all seven write sites are trusted Next server code during the strangler window (one is the cron route, which has no user token at all); phases 2–4 replace them with internal calls inside Convex.
- **Commits:** conventional style used by this repo (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, scoped like `feat(auth): …`). Commit at the end of every task at minimum; steps below call out commit points.
- **Baseline numbers** (from phase 0 exit, branch `replatform` @ `cd237c6`): unit `bun run test` = 20 files / 147 tests across `@polaris/*` (web 11/70, core 8/76, backend 1/1); integration = 18 files / 113 tests (needs Docker Postgres). If the baseline isn't green at setup, STOP.
- **Two USER-dependent moments** (cannot be automated): (1) adding a redirect URI in Google Cloud Console (Task 1, Step 8); (2) physically completing Google sign-in in a browser (Task 3) and on a simulator (Task 4). Pause and ask at those points.

## Decision gates

This plan has two GO/NO-GO gates, per spec §05 ("decide here, not in phase 7"):

- **Gate 1 (end of Task 3):** Convex Auth works end-to-end on web under Next 16.2.4 with `proxy.ts`. Known risk: `convex-auth` issue #271 ("proxy middleware: isAuthenticated always false") — community-confirmed fixable by having `ConvexAuthNextjsServerProvider` wrap the root layout (which Task 3 does). Fallback ladder: rename `src/proxy.ts` → `src/middleware.ts` (deprecated in 16 but functional). If neither works → NO-GO.
- **Gate 2 (end of Task 4):** Google OAuth completes on a throwaway Expo screen against the same dev deployment. Timebox: 4 hours. If NO-GO on either gate → STOP, write up findings, and re-plan Phase 1 on **Clerk** (named fallback, spec §08): Clerk JWT template `convex` + `convexAuth.config.ts` provider entry + `ConvexProviderWithClerk` — a different plan document.

## File Structure

End state (phase-1-relevant entries only):

```
packages/backend/
  package.json                     # + @convex-dev/auth 0.0.95, @auth/core 0.41.1; + exports map
  README.md                        # NEW: deployment env vars + setup commands
  convex/
    schema.ts                      # ...authTables + systemMetrics/systemReflections/systemIterations
    auth.ts                        # NEW: convexAuth() — Google provider + createOrUpdateUser callback
    auth.config.ts                 # NEW: JWT provider config (CONVEX_SITE_URL)
    http.ts                        # NEW: auth.addHttpRoutes(httpRouter())
    users.ts                       # NEW: viewer query
    feedback.ts                    # NEW: recordMetric, addReflection, logIteration, getAllFeedback
    migrations.ts                  # NEW: importSystemMetrics/-Reflections/-Iterations, feedbackStats
    lib/allowlist.ts               # NEW: ported verbatim from apps/web
    lib/users.ts                   # NEW: upsertAllowlistedUser (the user-creation callback body)
    _generated/                    # regenerated + committed (phase-0 decision)
  test/
    allowlist.test.ts              # ported 10 cases
    users.test.ts                  # NEW: upsert callback + viewer query
    feedback.test.ts               # NEW
    migrations.test.ts             # NEW
  scripts/
    generate-auth-keys.ts          # NEW: JWT_PRIVATE_KEY/JWKS generator (jose)
    import-feedback.ts             # NEW: JSONL → convex run batcher
apps/web/
  package.json                     # + convex, @convex-dev/auth, @polaris/backend; − next-auth, @auth/prisma-adapter; − prisma.seed key
  next.config.ts                   # transpilePackages += @polaris/backend
  .env.example                     # − NEXTAUTH_*/GOOGLE_*/ALLOWED_EMAILS; + NEXT_PUBLIC_CONVEX_URL
  src/proxy.ts                     # NEW (replaces src/middleware.ts, which is deleted)
  src/app/_components/ConvexClientProvider.tsx   # NEW
  src/app/_components/SignOutButton.tsx          # NEW
  src/app/auth/signin/SignInButton.tsx           # NEW
  src/app/auth/signin/page.tsx     # form → <SignInButton />
  src/app/layout.tsx               # ConvexAuthNextjsServerProvider + isAuthenticatedNextjs gate
  src/app/(platform)/layout.tsx    # viewer query + SignOutButton
  src/app/(systems)/layout.tsx     # same (duplicated shell)
  src/app/(platform)/settings/page.tsx           # viewer query
  src/app/api/systems/[system]/[...path]/route.ts        # isAuthenticatedNextjs gate
  src/app/api/platform/palette/search/route.ts           # isAuthenticatedNextjs gate
  src/app/api/platform/storage/upload/route.ts           # isAuthenticatedNextjs gate
  src/app/api/platform/storage/[...key]/route.ts         # isAuthenticatedNextjs gate
  src/app/api/auth/                # DELETED (NextAuth handler)
  src/platform/auth/               # DELETED entirely in Task 10
  src/platform/feedback/index.ts   # rewritten: Convex-backed adapter, same shape
  src/platform/feedback/index.test.ts  # NEW (service.ts + service.test.ts deleted)
  prisma/schema.prisma             # − User/Account/Session/VerificationToken
  prisma/migrations/…drop_nextauth_tables/       # NEW migration
  prisma/seed.ts                   # DELETED
  scripts/export-feedback.ts       # NEW: Prisma → JSONL
  scripts/verify-feedback-import.ts # NEW: Prisma stats vs convex stats
docs/superpowers/specs/2026-08-20-auth-provider-decision.md   # NEW (Task 4)
docs/superpowers/plans/2026-08-20-phase-1-cutover-runbook.md  # NEW (Task 11)
```

## Worktree setup (before Task 1)

Use superpowers:using-git-worktrees. Exact sequence (the phase-0 worktree holds the `replatform` checkout and untracked env files — harvest them, then remove it):

```bash
cd /Users/raymartvillos/Projects/polaris
git worktree add .claude/worktrees/phase-1-auth-spine -b phase-1-auth-spine replatform
cp .claude/worktrees/phase-0-monorepo/apps/web/.env .claude/worktrees/phase-1-auth-spine/apps/web/.env
cp .claude/worktrees/phase-0-monorepo/packages/backend/.env.local .claude/worktrees/phase-1-auth-spine/packages/backend/.env.local
git worktree remove .claude/worktrees/phase-0-monorepo   # clean + fully merged; frees replatform for the final merge
cd .claude/worktrees/phase-1-auth-spine
bun install
docker compose -f apps/web/docker/docker-compose.yml up -d
bun run test 2>&1 | tail -6            # expect 20 files / 147 tests green
bun run test:integration 2>&1 | tail -6  # expect 18 files / 113 tests green
```

Then copy this plan into the worktree and commit it:

```bash
cp /Users/raymartvillos/Projects/polaris/docs/superpowers/plans/2026-08-20-phase-1-auth-spine.md docs/superpowers/plans/
git add docs/superpowers/plans/2026-08-20-phase-1-auth-spine.md
git commit -m "docs: add phase 1 auth swap implementation plan"
```

---

### Task 1: Convex Auth backend foundation (allowlist, callback, provider)

**Files:**
- Modify: `packages/backend/package.json` (deps + exports)
- Create: `packages/backend/convex/lib/allowlist.ts`, `packages/backend/test/allowlist.test.ts` (ported from `apps/web/src/platform/auth/allowlist.ts` / `.test.ts` — copy now, web originals die in Task 10)
- Create: `packages/backend/convex/lib/users.ts`, `packages/backend/test/users.test.ts`
- Create: `packages/backend/convex/auth.ts`, `packages/backend/convex/auth.config.ts`, `packages/backend/convex/http.ts`
- Modify: `packages/backend/convex/schema.ts` (spread `authTables`)
- Create: `packages/backend/scripts/generate-auth-keys.ts`
- Regenerate + commit: `packages/backend/convex/_generated/`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `isEmailAllowed(email: string | null | undefined, allowlist: string | undefined): boolean` and `parseAllowlist(allowlist: string | undefined): string[]` from `convex/lib/allowlist.ts`; `upsertAllowlistedUser(ctx: MutationCtx, args: { existingUserId: Id<"users"> | null; profile: { email?: string | null; name?: string | null; image?: string | null } }): Promise<Id<"users">>` from `convex/lib/users.ts`; a `users` table (authTables) with index `email`; the `auth` object in `convex/auth.ts` that Tasks 2–6 build on. Env vars live on the Convex deployment: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS`, `ALLOWED_EMAILS`, `CRON_SECRET`.

- [ ] **Step 1: Add pinned dependencies**

In `packages/backend/package.json`, change the `dependencies` block to (exact pins on the beta packages) and add the exports map used by the web app in Task 3:

```json
  "exports": {
    "./convex/_generated/api": {
      "types": "./convex/_generated/api.d.ts",
      "default": "./convex/_generated/api.js"
    }
  },
  "dependencies": {
    "@auth/core": "0.41.1",
    "@convex-dev/auth": "0.0.95",
    "convex": "^1.44.0"
  },
```

Run: `bun install` (from the worktree root). Expected: lockfile updates, no errors.

- [ ] **Step 2: Port the allowlist verbatim (tests first)**

Copy `apps/web/src/platform/auth/allowlist.ts` → `packages/backend/convex/lib/allowlist.ts` **unchanged** (it is dependency-free):

```ts
export function parseAllowlist(allowlist: string | undefined): string[] {
  return (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(
  email: string | null | undefined,
  allowlist: string | undefined,
): boolean {
  if (!email) return false;
  return parseAllowlist(allowlist).includes(email.toLowerCase());
}
```

Copy `apps/web/src/platform/auth/allowlist.test.ts` → `packages/backend/test/allowlist.test.ts`, changing only the import line to `from "../convex/lib/allowlist"`. All 10 cases move as-is (comma splitting, trimming, lowercasing, fail-closed on `undefined`/`""`, null email rejection).

Run: `cd packages/backend && bun run test` — Expected: allowlist tests PASS (plus the existing ping test).

- [ ] **Step 3: Add authTables to the schema**

Replace `packages/backend/convex/schema.ts` with:

```ts
import { defineSchema } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

// authTables: users, authSessions, authAccounts, authRefreshTokens,
// authVerificationCodes, authVerifiers, authRateLimits.
// Feedback tables arrive in Task 6; system tables in phase 2.
export default defineSchema({
  ...authTables,
});
```

Run: `cd packages/backend && bunx convex codegen` — Expected: `convex/_generated/` updates without error. (Codegen is local; no deployment push.)

- [ ] **Step 4: Write the failing test for the user-creation callback**

Create `packages/backend/test/users.test.ts`:

```ts
import { convexTest } from "convex-test";
import { beforeEach, expect, test } from "vitest";
import schema from "../convex/schema";
import { upsertAllowlistedUser } from "../convex/lib/users";

const modules = import.meta.glob("../convex/**/*.*s");

beforeEach(() => {
  process.env.ALLOWED_EMAILS = "ray@example.com, partner@example.com";
});

test("rejects an email not on the allowlist", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.run(async (ctx) =>
      upsertAllowlistedUser(ctx, {
        existingUserId: null,
        profile: { email: "intruder@example.com", name: "Intruder", image: null },
      }),
    ),
  ).rejects.toThrow();
});

test("creates a user for an allowlisted email", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    upsertAllowlistedUser(ctx, {
      existingUserId: null,
      profile: { email: "ray@example.com", name: "Ray", image: null },
    }),
  );
  const user = await t.run(async (ctx) => ctx.db.get(userId));
  expect(user?.email).toBe("ray@example.com");
  expect(user?.name).toBe("Ray");
});

test("re-links by email instead of duplicating the user", async () => {
  const t = convexTest(schema, modules);
  const first = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "ray@example.com", name: "Old name" }),
  );
  const relinked = await t.run(async (ctx) =>
    upsertAllowlistedUser(ctx, {
      existingUserId: null,
      profile: { email: "ray@example.com", name: "New name", image: null },
    }),
  );
  expect(relinked).toBe(first);
  const users = await t.run(async (ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0].name).toBe("New name");
});

test("patches the existing user when existingUserId is provided", async () => {
  const t = convexTest(schema, modules);
  const existing = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "ray@example.com" }),
  );
  const result = await t.run(async (ctx) =>
    upsertAllowlistedUser(ctx, {
      existingUserId: existing,
      profile: { email: "ray@example.com", name: "Ray", image: "https://img" },
    }),
  );
  expect(result).toBe(existing);
  const user = await t.run(async (ctx) => ctx.db.get(existing));
  expect(user?.image).toBe("https://img");
});
```

Note: convex-test runs handlers in-process, so plain `process.env` assignment in the test file is visible to the code under test. If it is not (edge-runtime quirk), use Vitest's `vi.stubEnv("ALLOWED_EMAILS", "…")` instead — same semantics.

Run: `cd packages/backend && bun run test` — Expected: FAIL — `convex/lib/users` does not exist.

- [ ] **Step 5: Implement `upsertAllowlistedUser`**

Create `packages/backend/convex/lib/users.ts`:

```ts
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isEmailAllowed } from "./allowlist";

export type OAuthProfile = {
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

// The Convex Auth user-creation callback body. Throwing here aborts the
// auth:store transaction, which denies the sign-in — the allowlist gate.
export async function upsertAllowlistedUser(
  ctx: MutationCtx,
  args: { existingUserId: Id<"users"> | null; profile: OAuthProfile },
): Promise<Id<"users">> {
  const email = args.profile.email ?? null;
  if (!isEmailAllowed(email, process.env.ALLOWED_EMAILS)) {
    throw new ConvexError("Email is not on the allowlist");
  }
  const patch = {
    email: email!,
    name: args.profile.name ?? undefined,
    image: args.profile.image ?? undefined,
  };
  if (args.existingUserId !== null) {
    await ctx.db.patch(args.existingUserId, patch);
    return args.existingUserId;
  }
  const existing = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email!))
    .unique();
  if (existing !== null) {
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }
  return await ctx.db.insert("users", patch);
}
```

Run: `cd packages/backend && bun run test` — Expected: all PASS.

- [ ] **Step 6: Wire `convexAuth` (auth.ts, auth.config.ts, http.ts)**

Create `packages/backend/convex/auth.ts`:

```ts
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { upsertAllowlistedUser } from "./lib/users";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      return upsertAllowlistedUser(ctx, {
        existingUserId: args.existingUserId,
        profile: {
          email: args.profile.email as string | null | undefined,
          name: (args.profile as { name?: string | null }).name,
          image: (args.profile as { image?: string | null }).image,
        },
      });
    },
  },
});
```

Create `packages/backend/convex/auth.config.ts`:

```ts
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
```

Create `packages/backend/convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
```

Run: `cd packages/backend && bunx convex codegen && bun run test` — Expected: codegen clean, tests PASS.

- [ ] **Step 7: Generate JWT keys and set deployment env vars**

Create `packages/backend/scripts/generate-auth-keys.ts` (from Convex Auth's manual-setup docs; `jose` ships with `@convex-dev/auth`):

```ts
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";

const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });

console.log(privateKey.trimEnd().replace(/\n/g, " "));
console.log(jwks);
```

Run it and set the dev deployment env (values for `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`/`ALLOWED_EMAILS`/`CRON_SECRET` come from `apps/web/.env` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `CRON_SECRET`):

```bash
cd packages/backend
bun scripts/generate-auth-keys.ts          # line 1 = JWT_PRIVATE_KEY, line 2 = JWKS
bunx convex env set JWT_PRIVATE_KEY -- "<line 1 output>"
bunx convex env set JWKS -- '<line 2 output>'
bunx convex env set SITE_URL http://localhost:3000
bunx convex env set AUTH_GOOGLE_ID "<GOOGLE_CLIENT_ID from apps/web/.env>"
bunx convex env set AUTH_GOOGLE_SECRET "<GOOGLE_CLIENT_SECRET from apps/web/.env>"
bunx convex env set ALLOWED_EMAILS "<ALLOWED_EMAILS from apps/web/.env>"
bunx convex env set CRON_SECRET "<CRON_SECRET from apps/web/.env>"
bunx convex env list                       # verify all seven present
```

- [ ] **Step 8: USER ACTION — Google Cloud Console redirect URI**

Ask the user to add this authorized redirect URI to the existing Google OAuth client (the one whose ID is `GOOGLE_CLIENT_ID` in `apps/web/.env`):

```
https://exciting-wolf-282.convex.site/api/auth/callback/google
```

(Deployment slug from `packages/backend/.env.local` → `CONVEX_SITE_URL`. Do not proceed to Task 3's manual verification without this.)

- [ ] **Step 9: Push to the dev deployment**

Run: `cd packages/backend && bunx convex dev --once` — Expected: schema + functions deploy cleanly (authTables tables appear in the dashboard).

- [ ] **Step 10: Commit**

```bash
git add packages/backend bun.lock
git commit -m "feat(auth): convex auth foundation — allowlist, user callback, google provider"
```

---

### Task 2: `users.viewer` query

**Files:**
- Create: `packages/backend/convex/users.ts`
- Test: `packages/backend/test/users.test.ts` (extend)
- Regenerate: `packages/backend/convex/_generated/`

**Interfaces:**
- Consumes: `users` table from Task 1.
- Produces: `api.users.viewer` — query, args `{}`, returns `{ email: string | null; name: string | null } | null` (null when unauthenticated). Tasks 3 and 5 call it via `fetchQuery(api.users.viewer, {}, { token })`.

- [ ] **Step 1: Write the failing tests** (append to `packages/backend/test/users.test.ts`)

```ts
import { api } from "../convex/_generated/api";

test("viewer returns null when unauthenticated", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.users.viewer, {})).toBeNull();
});

test("viewer returns the signed-in user's email and name", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "ray@example.com", name: "Ray" }),
  );
  const asUser = t.withIdentity({ subject: `${userId}|session1` });
  expect(await asUser.query(api.users.viewer, {})).toEqual({
    email: "ray@example.com",
    name: "Ray",
  });
});
```

(`getAuthUserId` derives the user id from the identity `subject`'s prefix before `|` — that is Convex Auth's subject format.)

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/backend && bun run test` — Expected: FAIL — `api.users` undefined.

- [ ] **Step 3: Implement**

Create `packages/backend/convex/users.ts`:

```ts
import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    return { email: user.email ?? null, name: user.name ?? null };
  },
});
```

- [ ] **Step 4: Codegen + run tests**

Run: `cd packages/backend && bunx convex codegen && bun run test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend
git commit -m "feat(auth): users.viewer query"
```

---

### Task 3: Web wiring — providers, proxy.ts, sign-in page (Gate 1: web spike)

**Files:**
- Modify: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/.env`, `apps/web/.env.example`
- Create: `apps/web/src/app/_components/ConvexClientProvider.tsx`, `apps/web/src/app/auth/signin/SignInButton.tsx`, `apps/web/src/proxy.ts`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/src/app/auth/signin/page.tsx`
- Delete: `apps/web/src/middleware.ts`, `apps/web/src/app/api/auth/[...nextauth]/route.ts` (and the now-empty `api/auth/` directory)

**Interfaces:**
- Consumes: the deployed auth functions from Task 1 (dev deployment `exciting-wolf-282`).
- Produces: a working Convex Auth session on web. `ConvexClientProvider` (default export, client component) and the proxy are what Task 5's consumers rely on. After this task, the app's data routes intentionally 401 until Task 5 swaps their gates — expected mid-migration state.
- **Read the design docs first** (`docs/design/README.md`, `docs/design/polaris-design-system.md`) — this task touches UI files. The sign-in page's rendered output must be pixel-identical except the button now works via client JS.

- [ ] **Step 1: Dependencies + config**

In `apps/web/package.json` `dependencies`, add:

```json
    "@auth/core": "0.41.1",
    "@convex-dev/auth": "0.0.95",
    "@polaris/backend": "workspace:*",
    "convex": "^1.44.0",
```

In `apps/web/next.config.ts`, change the `transpilePackages` line to:

```ts
  transpilePackages: ["@polaris/core", "@polaris/backend"],
```

In `apps/web/.env` and `apps/web/.env.example`, add under a `# Convex` header:

```
NEXT_PUBLIC_CONVEX_URL=https://exciting-wolf-282.convex.cloud
```

(In `.env.example` leave the value empty with a comment `# from packages/backend/.env.local CONVEX_URL`.)

Run: `bun install` — Expected: clean.

- [ ] **Step 2: ConvexClientProvider**

Create `apps/web/src/app/_components/ConvexClientProvider.tsx`:

```tsx
"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
```

- [ ] **Step 3: Root layout — server provider + auth gate swap**

In `apps/web/src/app/layout.tsx`: replace the `getOptionalSession` import (line 3) with

```ts
import {
  ConvexAuthNextjsServerProvider,
  isAuthenticatedNextjs,
} from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "@/app/_components/ConvexClientProvider";
```

and replace the body of `RootLayout` (lines 49–63) with:

```tsx
  const isAuthenticated = await isAuthenticatedNextjs();
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        className={`${fraunces.variable} ${jakarta.variable} ${plexMono.variable}`}
      >
        <body className="antialiased">
          <ConvexClientProvider>
            {isAuthenticated ? (
              <PaletteProvider>{children}</PaletteProvider>
            ) : (
              children
            )}
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
```

Everything above line 44 (fonts, metadata) stays byte-identical.

- [ ] **Step 4: proxy.ts replaces middleware.ts**

Delete `apps/web/src/middleware.ts`. Create `apps/web/src/proxy.ts`:

```ts
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Public: the sign-in page and Convex Auth's own token-sync API route.
const isPublic = createRouteMatcher(["/auth/signin", "/api/auth"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (!isPublic(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/auth/signin");
  }
});

export const config = {
  // Unlike the NextAuth matcher this must INCLUDE /api/auth (the middleware
  // proxies Convex Auth actions through it). api/cron keeps its bearer secret.
  matcher: [
    "/((?!api/cron|_next/static|_next/image|favicon.ico|brand/|icons/).*)",
  ],
};
```

Delete `apps/web/src/app/api/auth/[...nextauth]/route.ts` (and the empty `api/auth/` tree).

- [ ] **Step 5: Sign-in page keeps its design; the button goes client-side**

Create `apps/web/src/app/auth/signin/SignInButton.tsx`:

```tsx
"use client";

import { useAuthActions } from "@convex-dev/auth/react";

export default function SignInButton() {
  const { signIn } = useAuthActions();
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => void signIn("google", { redirectTo: "/" })}
    >
      Sign in with Google
    </button>
  );
}
```

In `apps/web/src/app/auth/signin/page.tsx`: remove the `signIn` import (line 1), add `import SignInButton from "./SignInButton";`, and replace the `<form>…</form>` block (lines 41–50) with `<SignInButton />`. Every style prop, class, and string on the page stays identical.

- [ ] **Step 6: Unit tests + build still green**

Run: `bun run test` — Expected: 20 files / 147 tests PASS (nothing in the unit suites touches the changed files).
Run: `cd apps/web && bun run build` — Expected: exit 0. (If the build fails on `@polaris/backend` resolution, verify the exports map from Task 1 Step 1 and `transpilePackages`.)

- [ ] **Step 7: Manual verification — the web spike (USER CHECKPOINT, Gate 1)**

Requires Task 1 Step 8 (Google redirect URI) done. Terminal A: `cd packages/backend && bunx convex dev`. Terminal B: `cd apps/web && bun run dev`. Then the user verifies in a browser:

1. `http://localhost:3000` while signed out → redirected to `/auth/signin`; page looks unchanged.
2. "Sign in with Google" → Google consent → lands back signed in (redirects to `/` → `/dashboard`; dashboard renders — data pages may 401 until Task 5, expected).
3. Reload → still signed in (cookie persists; proxy's `isAuthenticated` true — this is exactly the issue-#271 symptom check).
4. (Optional) A non-allowlisted Google account is denied.

**Gate 1 decision:** PASS → continue. FAIL on proxy only → rename `src/proxy.ts` to `src/middleware.ts` (same code; deprecated convention still works in 16.2.4), retest; note it in the Task 4 decision memo. FAIL both → STOP; write findings; re-plan on Clerk.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web bun.lock
git commit -m "feat(auth): convex auth on web — providers, proxy, sign-in page"
```

---

### Task 4: Expo throwaway spike (Gate 2) + decision memo

**Files:**
- Create (throwaway, NOT in the repo): `/Users/raymartvillos/Projects/expo-auth-spike/`
- Modify (temporarily): `packages/backend/convex/auth.ts` (redirect callback — reverted in Step 6)
- Create: `docs/superpowers/specs/2026-08-20-auth-provider-decision.md`

**Interfaces:**
- Consumes: dev deployment auth from Task 1; `users.viewer` from Task 2.
- Produces: the written GO/NO-GO decision that unblocks Tasks 5–11. Nothing in the spike app is reused.
- **Timebox: 4 hours of wall-clock effort.** When the box expires without success, that is a NO-GO — do not extend it silently.

- [ ] **Step 1: Temporarily allow Expo redirect URIs in the backend**

In `packages/backend/convex/auth.ts`, add a `redirect` callback inside `callbacks` (above `createOrUpdateUser`):

```ts
    // TEMPORARY — phase-1 Expo spike only; reverted after Gate 2.
    async redirect({ redirectTo }) {
      if (redirectTo.startsWith("exp://") || redirectTo.startsWith("polarisspike://")) {
        return redirectTo;
      }
      const siteUrl = process.env.SITE_URL;
      if (siteUrl && (redirectTo.startsWith(siteUrl) || redirectTo.startsWith("/"))) {
        return redirectTo;
      }
      throw new Error(`Invalid redirectTo: ${redirectTo}`);
    },
```

Run: `cd packages/backend && bunx convex dev --once` to push.

- [ ] **Step 2: Scaffold the throwaway app** (outside the repo — Bun workspaces must not see it)

```bash
cd /Users/raymartvillos/Projects
bunx create-expo-app@latest expo-auth-spike --template blank-typescript
cd expo-auth-spike
bunx expo install expo-auth-session expo-web-browser expo-linking expo-secure-store
bun add convex @convex-dev/auth@0.0.95 @auth/core@0.41.1
```

In `app.json`, inside `"expo"`, add `"scheme": "polarisspike"`. Create `.env` with `EXPO_PUBLIC_CONVEX_URL=https://exciting-wolf-282.convex.cloud`.

- [ ] **Step 3: The one throwaway screen** — replace `App.tsx` with:

```tsx
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { makeRedirectUri } from "expo-auth-session";
import { openAuthSessionAsync } from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { Button, Text, View } from "react-native";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

function SignInScreen() {
  const { signIn } = useAuthActions();
  const redirectTo = makeRedirectUri();
  const handlePress = async () => {
    const { redirect } = await signIn("google", { redirectTo });
    if (redirect === undefined) return;
    const result = await openAuthSessionAsync(redirect.toString(), redirectTo);
    if (result.type === "success") {
      const code = new URL(result.url).searchParams.get("code");
      if (code !== null) await signIn("google", { code });
    }
  };
  return <Button title="Sign in with Google" onPress={() => void handlePress()} />;
}

function Home() {
  const viewer = useQuery(anyApi.users.viewer, {});
  const { signOut } = useAuthActions();
  return (
    <View>
      <Text>Signed in as {viewer?.email ?? "…"}</Text>
      <Button title="Sign out" onPress={() => void signOut()} />
    </View>
  );
}

function Main() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <Text>Loading…</Text>;
  return isAuthenticated ? <Home /> : <SignInScreen />;
}

export default function App() {
  return (
    <ConvexAuthProvider client={convex} storage={secureStorage}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Main />
      </View>
    </ConvexAuthProvider>
  );
}
```

(No native Google client needed: the OAuth leg runs through the `.convex.site` web callback, then deep-links back — the existing web OAuth client covers it.)

- [ ] **Step 4: Run it (USER CHECKPOINT, Gate 2)**

Run: `bunx expo start --ios` (or `--android`; Expo Go is fine). The user completes on the simulator/device:

1. Tap "Sign in with Google" → browser sheet → Google consent → returns to the app.
2. The screen shows `Signed in as <allowlisted email>`.
3. Kill and relaunch the app → still signed in (secure-store persistence).
4. Sign out works.

**Success = all four within the timebox.** Known first hurdles: `Invalid redirectTo` (the Step 1 callback fixes it — check the exact `exp://` URI Expo prints and extend the prefix check if it differs), and the `@convex-dev/auth` React provider needing `storage` on native.

- [ ] **Step 5: Write the decision memo**

Create `docs/superpowers/specs/2026-08-20-auth-provider-decision.md` recording: verdicts of Gate 1 and Gate 2 with the evidence (what was run, what worked, exact versions: `@convex-dev/auth@0.0.95`, `next@16.2.4`, proxy vs middleware outcome, Expo SDK used), residual risks accepted (beta status, issue #271 unofficial), and the decision: **Convex Auth adopted / Clerk fallback triggered**. One page, spec-style prose.

- [ ] **Step 6: Revert the temporary redirect callback and clean up**

Remove the `redirect` callback added in Step 1 from `packages/backend/convex/auth.ts`; run `cd packages/backend && bunx convex dev --once`. Delete `/Users/raymartvillos/Projects/expo-auth-spike` (or leave it if the user wants to poke — ask). 

- [ ] **Step 7: Commit**

```bash
git add packages/backend/convex/auth.ts docs/superpowers/specs/2026-08-20-auth-provider-decision.md
git commit -m "docs: record auth provider decision after web and expo spikes"
```

**If Gate 2 is NO-GO: STOP here.** The branch keeps Tasks 1–4 as spike evidence; re-plan Phase 1 on Clerk with the user.

---

### Task 5: Swap every session consumer (layouts, settings, four API gates)

**Files:**
- Create: `apps/web/src/app/_components/SignOutButton.tsx`
- Modify: `apps/web/src/app/(platform)/layout.tsx`, `apps/web/src/app/(systems)/layout.tsx`, `apps/web/src/app/(platform)/settings/page.tsx`
- Modify: `apps/web/src/app/api/systems/[system]/[...path]/route.ts`, `apps/web/src/app/api/platform/palette/search/route.ts`, `apps/web/src/app/api/platform/storage/upload/route.ts`, `apps/web/src/app/api/platform/storage/[...key]/route.ts`
- Test: `apps/web/src/app/api/platform/palette/search/route.integration.test.ts`

**Interfaces:**
- Consumes: `api.users.viewer` (Task 2), `ConvexClientProvider`/proxy session (Task 3). `isAuthenticatedNextjs`, `convexAuthNextjsToken` from `@convex-dev/auth/nextjs/server`; `fetchQuery` from `convex/nextjs`.
- Produces: zero remaining runtime consumers of `@/platform/auth/*` outside the module itself — the precondition for Task 10's deletion. UI task — design docs rule applies. Sign-out button must render identically (`.sb-item`, `var(--danger)`, `log-out` icon, "Sign out" label).

- [ ] **Step 1: Update the palette route's integration test first (TDD on the gate)**

In `apps/web/src/app/api/platform/palette/search/route.integration.test.ts`, replace the NextAuth mock:

```ts
vi.mock("@convex-dev/auth/nextjs/server", () => ({
  isAuthenticatedNextjs: vi.fn(),
}));
```

with `import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";` and `const mockedIsAuthenticated = vi.mocked(isAuthenticatedNextjs);`. Default every test to `mockedIsAuthenticated.mockResolvedValue(true)` in a `beforeEach`; the 401 case uses `mockedIsAuthenticated.mockResolvedValueOnce(false)`. Delete the old `vi.mock("@/platform/auth/config", …)` and `mockedAuth` plumbing (the `{ user: { email } }` resolved values map to `true`).

Run: `cd apps/web && bun run test:integration -- src/app/api/platform/palette` — Expected: FAIL (route still calls `auth()`).

- [ ] **Step 2: Swap the four API gates**

In each of the four route files, replace

```ts
import { auth } from "@/platform/auth/config";
```

with

```ts
import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
```

and replace the two-line gate

```ts
  const session = await auth();
  if (!session?.user) return unauthorized();
```

with

```ts
  if (!(await isAuthenticatedNextjs())) return unauthorized();
```

(Same edit in all four; the catch-all's gate sits at the top of `handleRequest`.)

Run: `cd apps/web && bun run test:integration -- src/app/api/platform/palette` — Expected: PASS.

- [ ] **Step 3: SignOutButton**

Create `apps/web/src/app/_components/SignOutButton.tsx`:

```tsx
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export function SignOutButton() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <button
      type="button"
      className="sb-item"
      style={{ width: "100%", color: "var(--danger)" }}
      aria-label="Sign out"
      title="Sign out"
      onClick={async () => {
        await signOut();
        router.push("/auth/signin");
      }}
    >
      <Icon name="log-out" size={14} />
      <span className="sb-label">Sign out</span>
    </button>
  );
}
```

- [ ] **Step 4: The two shell layouts**

In `apps/web/src/app/(platform)/layout.tsx` (and identically in `apps/web/src/app/(systems)/layout.tsx` — the shell is duplicated by design):

Replace line 1 `import { auth, signOut } from "@/platform/auth/config";` with:

```ts
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { SignOutButton } from "@/app/_components/SignOutButton";
```

Replace `const session = await auth();` with:

```ts
  const token = await convexAuthNextjsToken();
  const viewer = token
    ? await fetchQuery(api.users.viewer, {}, { token })
    : null;
```

Replace the whole `const sidebarFooter = session?.user ? (<form …>…</form>) : null;` block with:

```ts
  const sidebarFooter = viewer ? (
    <div style={{ marginTop: 4 }}>
      <SignOutButton />
    </div>
  ) : null;
```

Replace `email={session?.user?.email}` with `email={viewer?.email}` in the `<TitleBar …>` props.

- [ ] **Step 5: Settings page**

In `apps/web/src/app/(platform)/settings/page.tsx`: swap the import (line 2) for the same three-line import set as Step 4 (no `SignOutButton`), replace the `Promise.all` with:

```ts
  const integrations = listIntegrations();
  const token = await convexAuthNextjsToken();
  const viewer = token
    ? await fetchQuery(api.users.viewer, {}, { token })
    : null;
```

and replace `{session?.user?.email ?? "Not signed in"}` with `{viewer?.email ?? "Not signed in"}`.

- [ ] **Step 6: Verify nothing else imports NextAuth config**

Run: `grep -rn "platform/auth/config\|platform/auth/session" apps/web/src --include='*.ts*' | grep -v "src/platform/auth/"` — Expected: no output (the module itself is deleted in Task 10).

- [ ] **Step 7: Full suites + manual smoke**

Run: `bun run test` — Expected: all green.
Run: `bun run test:integration` — Expected: 18 files / 113 tests green.
Manual (with both dev servers up): signed in, visit journal / expenses / habits — pages load and CRUD works again (gates now accept the Convex session); TitleBar shows the email; sign out returns to `/auth/signin`.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web
git commit -m "feat(auth): swap layouts, settings, and API gates to convex auth"
```

---

### Task 6: Feedback tables and functions on Convex

**Files:**
- Modify: `packages/backend/convex/schema.ts`
- Create: `packages/backend/convex/feedback.ts`
- Test: `packages/backend/test/feedback.test.ts`
- Regenerate: `packages/backend/convex/_generated/`

**Interfaces:**
- Consumes: schema from Task 1.
- Produces (Task 8's web adapter and Task 7's import depend on these exact shapes):
  - Tables `systemMetrics { system, name, value, recordedAt: number, legacyId? }` (indexes `by_system`, `by_system_name`, `by_recorded_at`, `by_legacy_id`), `systemReflections { system, content, strengths[], weaknesses[], ideas[], createdAt: number, legacyId? }`, `systemIterations { system, description, reason, outcome?, createdAt: number, legacyId? }` (each with `by_system`, `by_created_at`, `by_legacy_id`).
  - `api.feedback.recordMetric` — mutation `{ system: string, name: string, value: number, serviceKey: string }`, gated on `serviceKey === process.env.CRON_SECRET`.
  - `internal.feedback.addReflection` `{ system, content, strengths, weaknesses, ideas }` and `internal.feedback.logIteration` `{ system, description, reason }` — internal (hand-run via `bunx convex run`, matching their historical usage; zero production call sites).
  - `api.feedback.getAllFeedback` — query `{}`, requires identity, returns `{ metrics: Doc<"systemMetrics">[] (newest 50 by recordedAt), reflections: … (newest 20), iterations: … (newest 20) }`.
  - Dropped deliberately: `getMetrics`/`getReflections`/`getIterations` — zero production call sites in the Prisma module; phases 2+ add reads when a consumer exists (YAGNI).

- [ ] **Step 1: Extend the schema**

In `packages/backend/convex/schema.ts`, add imports `defineTable` (from `"convex/server"`) and `v` (from `"convex/values"`), and add inside `defineSchema({ ...authTables, … })`:

```ts
  // Platform: feedback. recordedAt/createdAt are ms since epoch (Prisma
  // DateTime → number); legacyId carries the Postgres cuid for idempotent import.
  systemMetrics: defineTable({
    system: v.string(),
    name: v.string(),
    value: v.number(),
    recordedAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_system", ["system"])
    .index("by_system_name", ["system", "name"])
    .index("by_recorded_at", ["recordedAt"])
    .index("by_legacy_id", ["legacyId"]),
  systemReflections: defineTable({
    system: v.string(),
    content: v.string(),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    ideas: v.array(v.string()),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_system", ["system"])
    .index("by_created_at", ["createdAt"])
    .index("by_legacy_id", ["legacyId"]),
  systemIterations: defineTable({
    system: v.string(),
    description: v.string(),
    reason: v.string(),
    outcome: v.optional(v.string()),
    createdAt: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_system", ["system"])
    .index("by_created_at", ["createdAt"])
    .index("by_legacy_id", ["legacyId"]),
```

Run: `cd packages/backend && bunx convex codegen` — Expected: clean.

- [ ] **Step 2: Write the failing tests**

Create `packages/backend/test/feedback.test.ts`:

```ts
import { convexTest } from "convex-test";
import { beforeEach, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
});

test("recordMetric rejects a bad service key", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.feedback.recordMetric, {
      system: "journal",
      name: "entry_created",
      value: 1,
      serviceKey: "wrong",
    }),
  ).rejects.toThrow();
});

test("recordMetric inserts with a numeric recordedAt", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.feedback.recordMetric, {
    system: "journal",
    name: "entry_created",
    value: 1,
    serviceKey: "test-secret",
  });
  const rows = await t.run(async (ctx) => ctx.db.query("systemMetrics").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].system).toBe("journal");
  expect(typeof rows[0].recordedAt).toBe("number");
});

test("getAllFeedback requires an identity", async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.feedback.getAllFeedback, {})).rejects.toThrow();
});

test("getAllFeedback returns newest-first, capped lists", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 60; i++) {
      await ctx.db.insert("systemMetrics", {
        system: "journal",
        name: "entry_created",
        value: i,
        recordedAt: 1_000 + i,
      });
    }
    await ctx.db.insert("systemReflections", {
      system: "journal",
      content: "note",
      strengths: ["a"],
      weaknesses: [],
      ideas: [],
      createdAt: 5,
    });
    await ctx.db.insert("systemIterations", {
      system: "expenses",
      description: "d",
      reason: "r",
      createdAt: 6,
    });
  });
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const result = await asUser.query(api.feedback.getAllFeedback, {});
  expect(result.metrics).toHaveLength(50);
  expect(result.metrics[0].value).toBe(59); // newest first
  expect(result.reflections).toHaveLength(1);
  expect(result.iterations).toHaveLength(1);
});

test("addReflection and logIteration insert with createdAt", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.feedback.addReflection, {
    system: "journal",
    content: "went well",
    strengths: ["focus"],
    weaknesses: ["scope"],
    ideas: ["split"],
  });
  await t.mutation(internal.feedback.logIteration, {
    system: "journal",
    description: "tightened parser",
    reason: "false positives",
  });
  const [reflections, iterations] = await t.run(async (ctx) =>
    Promise.all([
      ctx.db.query("systemReflections").collect(),
      ctx.db.query("systemIterations").collect(),
    ]),
  );
  expect(reflections).toHaveLength(1);
  expect(typeof reflections[0].createdAt).toBe("number");
  expect(iterations).toHaveLength(1);
});
```

Run: `cd packages/backend && bun run test` — Expected: FAIL — `api.feedback` undefined.

- [ ] **Step 3: Implement `convex/feedback.ts`**

```ts
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

// Server-trusted writes during the strangler window: the Next server proves
// itself with the shared CRON_SECRET. Phases 2-4 replace these call sites
// with internal calls inside Convex and this gate goes away.
function assertServiceKey(serviceKey: string): void {
  const expected = process.env.CRON_SECRET;
  if (!expected || serviceKey !== expected) {
    throw new ConvexError("Invalid service key");
  }
}

export const recordMetric = mutation({
  args: {
    system: v.string(),
    name: v.string(),
    value: v.number(),
    serviceKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertServiceKey(args.serviceKey);
    await ctx.db.insert("systemMetrics", {
      system: args.system,
      name: args.name,
      value: args.value,
      recordedAt: Date.now(),
    });
  },
});

// Hand-run via `bunx convex run feedback:addReflection '…'` — matching the
// historical bun -e workflow; no production call sites exist.
export const addReflection = internalMutation({
  args: {
    system: v.string(),
    content: v.string(),
    strengths: v.array(v.string()),
    weaknesses: v.array(v.string()),
    ideas: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("systemReflections", { ...args, createdAt: Date.now() });
  },
});

export const logIteration = internalMutation({
  args: {
    system: v.string(),
    description: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("systemIterations", { ...args, createdAt: Date.now() });
  },
});

export const getAllFeedback = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new ConvexError("Unauthorized");
    const [metrics, reflections, iterations] = await Promise.all([
      ctx.db.query("systemMetrics").withIndex("by_recorded_at").order("desc").take(50),
      ctx.db.query("systemReflections").withIndex("by_created_at").order("desc").take(20),
      ctx.db.query("systemIterations").withIndex("by_created_at").order("desc").take(20),
    ]);
    return { metrics, reflections, iterations };
  },
});
```

- [ ] **Step 4: Codegen + tests pass**

Run: `cd packages/backend && bunx convex codegen && bun run test` — Expected: PASS.

- [ ] **Step 5: Push + commit**

```bash
cd packages/backend && bunx convex dev --once && cd ../..
git add packages/backend
git commit -m "feat(feedback): metrics, reflections, iterations on convex"
```

---

### Task 7: Import mutations and verification stats

**Files:**
- Create: `packages/backend/convex/migrations.ts`
- Test: `packages/backend/test/migrations.test.ts`
- Regenerate: `packages/backend/convex/_generated/`

**Interfaces:**
- Consumes: feedback tables (Task 6).
- Produces (Task 9's scripts call these by name via `bunx convex run`):
  - `internal.migrations.importSystemMetrics` — `{ rows: Array<{ legacyId, system, name, value, recordedAt }> }` → `{ inserted: number, updated: number }`, idempotent by `legacyId`.
  - `internal.migrations.importSystemReflections` — same pattern, row `{ legacyId, system, content, strengths, weaknesses, ideas, createdAt }`.
  - `internal.migrations.importSystemIterations` — row `{ legacyId, system, description, reason, outcome?, createdAt }`.
  - `internal.migrations.feedbackStats` — `{}` → `{ metricCount, reflectionCount, iterationCount, metricsBySystemName: Record<"system/name", { count: number, sum: number }> }`.

- [ ] **Step 1: Write the failing tests**

Create `packages/backend/test/migrations.test.ts`:

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

const rows = [
  { legacyId: "cm1", system: "journal", name: "entry_created", value: 1, recordedAt: 1_000 },
  { legacyId: "cm2", system: "journal", name: "words_per_entry", value: 42, recordedAt: 2_000 },
  { legacyId: "cm3", system: "expenses", name: "activity_started", value: 1, recordedAt: 3_000 },
];

test("importSystemMetrics inserts and is idempotent by legacyId", async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(internal.migrations.importSystemMetrics, { rows });
  expect(first).toEqual({ inserted: 3, updated: 0 });
  const second = await t.mutation(internal.migrations.importSystemMetrics, { rows });
  expect(second).toEqual({ inserted: 0, updated: 3 });
  const all = await t.run(async (ctx) => ctx.db.query("systemMetrics").collect());
  expect(all).toHaveLength(3);
});

test("importSystemReflections and importSystemIterations round-trip", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.migrations.importSystemReflections, {
    rows: [{
      legacyId: "cr1", system: "journal", content: "note",
      strengths: ["a"], weaknesses: ["b"], ideas: [], createdAt: 10,
    }],
  });
  await t.mutation(internal.migrations.importSystemIterations, {
    rows: [{
      legacyId: "ci1", system: "expenses", description: "d", reason: "r",
      outcome: undefined, createdAt: 20,
    }],
  });
  const [r, i] = await t.run(async (ctx) =>
    Promise.all([
      ctx.db.query("systemReflections").collect(),
      ctx.db.query("systemIterations").collect(),
    ]),
  );
  expect(r[0].legacyId).toBe("cr1");
  expect(i[0].legacyId).toBe("ci1");
});

test("feedbackStats aggregates counts and per-metric sums", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.migrations.importSystemMetrics, { rows });
  const stats = await t.query(internal.migrations.feedbackStats, {});
  expect(stats.metricCount).toBe(3);
  expect(stats.metricsBySystemName["journal/entry_created"]).toEqual({ count: 1, sum: 1 });
  expect(stats.metricsBySystemName["journal/words_per_entry"]).toEqual({ count: 1, sum: 42 });
});
```

Run: `cd packages/backend && bun run test` — Expected: FAIL — `internal.migrations` undefined.

- [ ] **Step 2: Implement `convex/migrations.ts`**

```ts
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Phase-1 data-migration playbook (docs/replatform.md §06): idempotent
// legacyId upserts so the import can rerun safely at the freeze/flip.

export const importSystemMetrics = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        system: v.string(),
        name: v.string(),
        value: v.number(),
        recordedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("systemMetrics")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("systemMetrics", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const importSystemReflections = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        system: v.string(),
        content: v.string(),
        strengths: v.array(v.string()),
        weaknesses: v.array(v.string()),
        ideas: v.array(v.string()),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("systemReflections")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("systemReflections", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const importSystemIterations = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        system: v.string(),
        description: v.string(),
        reason: v.string(),
        outcome: v.optional(v.string()),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("systemIterations")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (existing !== null) {
        await ctx.db.replace(existing._id, row);
        updated++;
      } else {
        await ctx.db.insert("systemIterations", row);
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

export const feedbackStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [metrics, reflections, iterations] = await Promise.all([
      ctx.db.query("systemMetrics").collect(),
      ctx.db.query("systemReflections").collect(),
      ctx.db.query("systemIterations").collect(),
    ]);
    const metricsBySystemName: Record<string, { count: number; sum: number }> = {};
    for (const m of metrics) {
      const key = `${m.system}/${m.name}`;
      metricsBySystemName[key] ??= { count: 0, sum: 0 };
      metricsBySystemName[key].count += 1;
      metricsBySystemName[key].sum += m.value;
    }
    return {
      metricCount: metrics.length,
      reflectionCount: reflections.length,
      iterationCount: iterations.length,
      metricsBySystemName,
    };
  },
});
```

- [ ] **Step 3: Codegen + tests pass**

Run: `cd packages/backend && bunx convex codegen && bun run test` — Expected: PASS.

- [ ] **Step 4: Push + commit**

```bash
cd packages/backend && bunx convex dev --once && cd ../..
git add packages/backend
git commit -m "feat(feedback): idempotent import mutations and verification stats"
```

---

### Task 8: Web feedback adapter — same shape, Convex behind it

**Files:**
- Rewrite: `apps/web/src/platform/feedback/index.ts`
- Delete: `apps/web/src/platform/feedback/service.ts`, `apps/web/src/platform/feedback/service.test.ts`
- Create: `apps/web/src/platform/feedback/index.test.ts`
- Modify (test-only): `apps/web/src/systems/journal/routes/entries.integration.test.ts`, `apps/web/src/systems/journal/services/computeActiveTopics.integration.test.ts`, `apps/web/src/systems/expenses/services/items.integration.test.ts`, `apps/web/src/test/db.ts`

**Interfaces:**
- Consumes: `api.feedback.recordMetric`, `api.feedback.getAllFeedback` (Task 6); `CRON_SECRET` from the web env; `NEXT_PUBLIC_CONVEX_URL`.
- Produces: `feedback.recordMetric(system: string, name: string, value: number): Promise<void>` and `feedback.getAllFeedback(): Promise<{ metrics: Array<{ id: string; system: string; name: string; value: number; recordedAt: Date }>; reflections: Array<{ id: string; system: string; content: string; strengths: string[]; weaknesses: string[]; ideas: string[]; createdAt: Date }>; iterations: Array<{ id: string; system: string; description: string; reason: string; outcome: string | null; createdAt: Date }> }>` — **the exact shape the seven call sites and the dashboard already consume, so none of them change.** `addReflection`/`logIteration` are not re-exposed on the web (their Convex internal mutations replace the old `bun -e` workflow).

- [ ] **Step 1: Write the failing adapter unit test**

Create `apps/web/src/platform/feedback/index.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { api } from "@polaris/backend/convex/_generated/api";
import { feedback } from "./index";

vi.mock("convex/nextjs", () => ({
  fetchMutation: vi.fn(),
  fetchQuery: vi.fn(),
}));
vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsToken: vi.fn(),
}));

const mockedFetchMutation = vi.mocked(fetchMutation);
const mockedFetchQuery = vi.mocked(fetchQuery);
const mockedToken = vi.mocked(convexAuthNextjsToken);

describe("feedback adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "k");
  });

  it("records a metric with the service key", async () => {
    await feedback.recordMetric("journal", "entry_created", 1);
    expect(mockedFetchMutation).toHaveBeenCalledWith(api.feedback.recordMetric, {
      system: "journal",
      name: "entry_created",
      value: 1,
      serviceKey: "k",
    });
  });

  it("maps getAllFeedback docs to the legacy shape", async () => {
    mockedToken.mockResolvedValue("tok");
    mockedFetchQuery.mockResolvedValue({
      metrics: [{ _id: "m1", _creationTime: 1, system: "journal", name: "entry_created", value: 2, recordedAt: 1_700_000_000_000 }],
      reflections: [{ _id: "r1", _creationTime: 1, system: "journal", content: "c", strengths: [], weaknesses: [], ideas: [], createdAt: 1_700_000_000_000 }],
      iterations: [{ _id: "i1", _creationTime: 1, system: "expenses", description: "d", reason: "r", createdAt: 1_700_000_000_000 }],
    } as never);
    const result = await feedback.getAllFeedback();
    expect(mockedFetchQuery).toHaveBeenCalledWith(api.feedback.getAllFeedback, {}, { token: "tok" });
    expect(result.metrics[0]).toEqual({
      id: "m1", system: "journal", name: "entry_created", value: 2,
      recordedAt: new Date(1_700_000_000_000),
    });
    expect(result.iterations[0].outcome).toBeNull();
  });
});
```

Run: `cd apps/web && bun run test -- src/platform/feedback` — Expected: FAIL (adapter not implemented; `service.ts` still exports the Prisma factory).

- [ ] **Step 2: Rewrite the module**

Delete `apps/web/src/platform/feedback/service.ts` and `service.test.ts`. Replace `apps/web/src/platform/feedback/index.ts` with:

```ts
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";

// Strangler-window adapter: same surface the call sites always had, Convex
// behind it. Writes are server-trusted (CRON_SECRET as service key) so the
// cron route — which has no user token — records metrics identically.
function serviceKey(): string {
  const key = process.env.CRON_SECRET;
  if (!key) throw new Error("CRON_SECRET environment variable is not set");
  return key;
}

export const feedback = {
  async recordMetric(system: string, name: string, value: number): Promise<void> {
    await fetchMutation(api.feedback.recordMetric, {
      system,
      name,
      value,
      serviceKey: serviceKey(),
    });
  },

  async getAllFeedback() {
    const token = await convexAuthNextjsToken();
    const { metrics, reflections, iterations } = await fetchQuery(
      api.feedback.getAllFeedback,
      {},
      { token },
    );
    return {
      metrics: metrics.map((d) => ({
        id: d.legacyId ?? d._id,
        system: d.system,
        name: d.name,
        value: d.value,
        recordedAt: new Date(d.recordedAt),
      })),
      reflections: reflections.map((d) => ({
        id: d.legacyId ?? d._id,
        system: d.system,
        content: d.content,
        strengths: d.strengths,
        weaknesses: d.weaknesses,
        ideas: d.ideas,
        createdAt: new Date(d.createdAt),
      })),
      iterations: iterations.map((d) => ({
        id: d.legacyId ?? d._id,
        system: d.system,
        description: d.description,
        reason: d.reason,
        outcome: d.outcome ?? null,
        createdAt: new Date(d.createdAt),
      })),
    };
  },
};
```

Run: `cd apps/web && bun run test -- src/platform/feedback` — Expected: PASS.

- [ ] **Step 3: Update the three integration test files that asserted Prisma metric rows**

All three now mock the adapter and assert calls instead (metrics no longer land in Postgres):

`apps/web/src/systems/journal/routes/entries.integration.test.ts` — add at the top:

```ts
vi.mock("@/platform/feedback", () => ({
  feedback: { recordMetric: vi.fn().mockResolvedValue(undefined) },
}));
import { feedback } from "@/platform/feedback";
const mockedRecordMetric = vi.mocked(feedback.recordMetric);
```

Remove the `beforeEach` `prisma.systemMetric.deleteMany(…)` (keep any other cleanup) and add `mockedRecordMetric.mockClear()`. Rewrite the two metric assertions: "POST /entries creates and records both metrics" asserts `mockedRecordMetric` was called with `("journal", "entry_created", 1)` and `("journal", "words_per_entry", <same word count the old test used>)`; "PATCH /entries/:id re-records words_per_entry" asserts the calls' `value` arguments were `2` then `6` (same numbers as before — read the current file for the exact bodies that produce them).

`apps/web/src/systems/journal/services/computeActiveTopics.integration.test.ts` — same mock block; the two tests assert `mockedRecordMetric` called with `("journal", "active_topic_count", 2)` and `("journal", "active_topic_count", 0)` respectively, instead of reading `systemMetric.findFirst`.

`apps/web/src/systems/expenses/services/items.integration.test.ts` — same mock block; "records snapshot metrics after an upsert" keeps its `vi.waitFor` but asserts the last `mockedRecordMetric` call with `("expenses", "activity_total_centavos", 21500)`.

`apps/web/src/test/db.ts` — remove the `prisma.systemMetric.deleteMany({ where: { system: "expenses" } })` line from `withCleanExpenseTables()` (nothing writes that table anymore).

- [ ] **Step 4: Run both suites**

Run: `bun run test` — Expected: green (web unit gains `index.test.ts`, loses `service.test.ts`).
Run: `bun run test:integration` — Expected: 18 files green with the rewritten assertions.

- [ ] **Step 5: Manual smoke**

With both dev servers running and signed in: create a journal entry, then open the dashboard — the "System health" section shows the new `entry_created` / `words_per_entry` rows (read from Convex). Peso formatting on `*_centavos` still renders via the untouched dashboard code.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web
git commit -m "feat(feedback): web adapter reads and writes convex instead of prisma"
```

---

### Task 9: Export / import / verify scripts + dev rehearsal

**Files:**
- Create: `apps/web/scripts/export-feedback.ts`, `apps/web/scripts/verify-feedback-import.ts`
- Create: `packages/backend/scripts/import-feedback.ts`
- Modify: `apps/web/.gitignore` (ignore `scripts/out/`)

**Interfaces:**
- Consumes: Prisma models (still in the schema — frozen archive), `internal.migrations.*` (Task 7).
- Produces: the three-step playbook (spec §06) as runnable commands, rehearsed against the dev deployment. The cutover runbook (Task 11) reuses these verbatim with `--prod`.

- [ ] **Step 1: Export script**

Create `apps/web/scripts/export-feedback.ts` (run from `apps/web/` with `bun scripts/export-feedback.ts`; Bun loads `.env` and resolves the `@` alias via tsconfig):

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/platform/db/client";

// Playbook step 1 (docs/replatform.md §06): Postgres → JSONL, cuids intact
// as legacyId, DateTime → ms numbers.
const outDir = join(import.meta.dir, "out");
mkdirSync(outDir, { recursive: true });

function writeJsonl(file: string, rows: unknown[]): void {
  writeFileSync(
    join(outDir, file),
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""),
  );
}

const metrics = await prisma.systemMetric.findMany({ orderBy: { recordedAt: "asc" } });
writeJsonl(
  "system-metrics.jsonl",
  metrics.map((m) => ({
    legacyId: m.id,
    system: m.system,
    name: m.name,
    value: m.value,
    recordedAt: m.recordedAt.getTime(),
  })),
);

const reflections = await prisma.systemReflection.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "system-reflections.jsonl",
  reflections.map((r) => ({
    legacyId: r.id,
    system: r.system,
    content: r.content,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    ideas: r.ideas,
    createdAt: r.createdAt.getTime(),
  })),
);

const iterations = await prisma.systemIteration.findMany({ orderBy: { createdAt: "asc" } });
writeJsonl(
  "system-iterations.jsonl",
  iterations.map((i) => ({
    legacyId: i.id,
    system: i.system,
    description: i.description,
    reason: i.reason,
    ...(i.outcome === null ? {} : { outcome: i.outcome }),
    createdAt: i.createdAt.getTime(),
  })),
);

console.log(
  `exported metrics=${metrics.length} reflections=${reflections.length} iterations=${iterations.length} → ${outDir}`,
);
await prisma.$disconnect();
```

Add `scripts/out/` to `apps/web/.gitignore`.

- [ ] **Step 2: Import driver**

Create `packages/backend/scripts/import-feedback.ts` (run from `packages/backend/` with `bun scripts/import-feedback.ts ../../apps/web/scripts/out [--prod]`):

```ts
// Playbook step 2: JSONL → internal import mutations, batched. Idempotent —
// rerunning re-upserts by legacyId.
const [dir, ...flags] = process.argv.slice(2);
if (!dir) {
  console.error("usage: bun scripts/import-feedback.ts <jsonl-dir> [--prod]");
  process.exit(1);
}
const prod = flags.includes("--prod");
const BATCH = 200;

const files: Array<[string, string]> = [
  ["system-metrics.jsonl", "migrations:importSystemMetrics"],
  ["system-reflections.jsonl", "migrations:importSystemReflections"],
  ["system-iterations.jsonl", "migrations:importSystemIterations"],
];

for (const [file, fn] of files) {
  const path = `${dir}/${file}`;
  const text = await Bun.file(path).text().catch(() => "");
  const rows = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const args = ["convex", "run", fn, JSON.stringify({ rows: batch })];
    if (prod) args.push("--prod");
    const proc = Bun.spawnSync(["bunx", ...args], { cwd: import.meta.dir + "/.." });
    if (proc.exitCode !== 0) {
      console.error(proc.stderr.toString());
      throw new Error(`${fn} batch at offset ${i} failed`);
    }
    const result = JSON.parse(proc.stdout.toString().trim().split("\n").at(-1)!);
    inserted += result.inserted;
    updated += result.updated;
  }
  console.log(`${file}: rows=${rows.length} inserted=${inserted} updated=${updated}`);
}
```

- [ ] **Step 3: Verify script**

Create `apps/web/scripts/verify-feedback-import.ts` (run from `apps/web/`; pass `--prod` to check the prod deployment):

```ts
import { prisma } from "../src/platform/db/client";

// Playbook verification: row counts + domain checksums (count and sum of
// value per system/name) compared between Postgres and Convex.
const prod = process.argv.includes("--prod");

const metrics = await prisma.systemMetric.findMany();
const reflectionCount = await prisma.systemReflection.count();
const iterationCount = await prisma.systemIteration.count();
const expected: Record<string, { count: number; sum: number }> = {};
for (const m of metrics) {
  const key = `${m.system}/${m.name}`;
  expected[key] ??= { count: 0, sum: 0 };
  expected[key].count += 1;
  expected[key].sum += m.value;
}
await prisma.$disconnect();

const args = ["convex", "run", "migrations:feedbackStats", "{}"];
if (prod) args.push("--prod");
const proc = Bun.spawnSync(["bunx", ...args], {
  cwd: import.meta.dir + "/../../../packages/backend",
});
if (proc.exitCode !== 0) {
  console.error(proc.stderr.toString());
  process.exit(1);
}
const stats = JSON.parse(proc.stdout.toString().trim().split("\n").at(-1)!);

let failed = false;
function check(label: string, want: number, got: number): void {
  const ok = want === got;
  if (!ok) failed = true;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: postgres=${want} convex=${got}`);
}
check("metric rows", metrics.length, stats.metricCount);
check("reflection rows", reflectionCount, stats.reflectionCount);
check("iteration rows", iterationCount, stats.iterationCount);
for (const [key, agg] of Object.entries(expected)) {
  const got = stats.metricsBySystemName[key] ?? { count: 0, sum: 0 };
  check(`count ${key}`, agg.count, got.count);
  check(`sum ${key}`, agg.sum, got.sum);
}
process.exit(failed ? 1 : 0);
```

Note: the verify comparison is exact only between a frozen Postgres and a Convex deployment that has taken **no live writes since the import** — run it immediately after an import. (Live `recordMetric` writes after the flip legitimately diverge; the cutover runbook orders freeze → export → import → verify → flip for this reason.)

- [ ] **Step 4: Rehearse against the dev deployment (playbook dry run)**

```bash
cd apps/web && bun scripts/export-feedback.ts
cd ../../packages/backend && bun scripts/import-feedback.ts ../../apps/web/scripts/out
cd ../../apps/web && bun scripts/verify-feedback-import.ts       # expect all OK, exit 0
cd ../../packages/backend && bun scripts/import-feedback.ts ../../apps/web/scripts/out   # rerun
cd ../../apps/web && bun scripts/verify-feedback-import.ts       # still OK — idempotency proven
```

Expected: second import reports `inserted=0 updated=N`; verify passes twice. Record the numbers in the task report.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts apps/web/.gitignore packages/backend/scripts
git commit -m "feat(feedback): export, import, and verify scripts for the data playbook"
```

---

### Task 10: NextAuth teardown

**Files:**
- Delete: `apps/web/src/platform/auth/` (all five files: `auth.config.ts`, `config.ts`, `session.ts`, `allowlist.ts`, `allowlist.test.ts`), `apps/web/prisma/seed.ts`
- Modify: `apps/web/package.json` (remove deps + `prisma.seed` key), `apps/web/prisma/schema.prisma`, `apps/web/.env.example`, `apps/web/.env`
- Create: migration `apps/web/prisma/migrations/<timestamp>_drop_nextauth_tables/`, `packages/backend/README.md`
- Modify: `README.md`, `ARCHITECTURE.md` (auth references)

**Interfaces:**
- Consumes: Tasks 3, 5, 8 having removed every runtime consumer.
- Produces: the phase exit criterion — NextAuth and its four Prisma tables gone. Feedback Prisma models **stay** (frozen archive until phase 5).

- [ ] **Step 1: Prove nothing imports the module, then delete it**

Run: `grep -rn "platform/auth" apps/web/src --include='*.ts*' | grep -v "src/platform/auth/"` — Expected: no output. Then:

```bash
git rm -r apps/web/src/platform/auth apps/web/prisma/seed.ts
```

- [ ] **Step 2: Remove dependencies and the seed hook**

```bash
cd apps/web && bun remove next-auth @auth/prisma-adapter
```

In `apps/web/package.json`, delete the `"prisma": { "seed": "bun prisma/seed.ts" }` block.

- [ ] **Step 3: Drop the four auth tables**

In `apps/web/prisma/schema.prisma`, delete the `// === Auth (NextAuth.js / Auth.js) ===` section — models `User`, `Account`, `Session`, `VerificationToken` (nothing else references them; the feedback and system models remain). Then:

```bash
cd apps/web
bunx prisma migrate dev --name drop_nextauth_tables      # local dev database
DATABASE_URL="$(grep '^DATABASE_URL_TEST=' .env | cut -d= -f2- | tr -d '\"')" bunx prisma migrate deploy   # test database
```

Expected: migration created and applied to both databases; `prisma generate` reruns clean.

- [ ] **Step 4: Environment files**

In `apps/web/.env.example` (mirror in `.env`): delete `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS` and their comments. Keep `CRON_SECRET` (now doubling as the feedback service key — update its comment to say so). Ensure the `# Convex` block from Task 3 documents `NEXT_PUBLIC_CONVEX_URL` and points at `packages/backend/README.md` for deployment-side vars.

Create `packages/backend/README.md`:

```markdown
# @polaris/backend

Convex schema, functions, and auth for Polaris.

## Commands

- `bunx convex dev` — dev loop against the dev deployment (`.env.local`)
- `bunx convex deploy` — deploy to production
- `bun run test` — convex-test suite (in-memory, no deployment)

## Deployment environment variables

Set with `bunx convex env set NAME value` (add `--prod` for production):

| Name | Purpose |
| --- | --- |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (callback: `https://<deployment>.convex.site/api/auth/callback/google`) |
| `SITE_URL` | Web app origin for post-auth redirects |
| `JWT_PRIVATE_KEY` / `JWKS` | Convex Auth token signing — `bun scripts/generate-auth-keys.ts` |
| `ALLOWED_EMAILS` | Comma-separated sign-in allowlist |
| `CRON_SECRET` | Service key for server-trusted writes (same value as the web env var) |
```

- [ ] **Step 5: Docs sweep**

Run: `grep -rniE "nextauth|next-auth" README.md ARCHITECTURE.md CLAUDE.md docs --include='*.md' -l | grep -v docs/superpowers | grep -v docs/replatform.md` — update each hit (expected: `README.md` setup instructions and `ARCHITECTURE.md`'s auth/platform description) to describe Convex Auth: Google sign-in, allowlist enforced in the backend's user-creation callback, `proxy.ts` guard, env vars per `packages/backend/README.md`. Historical plan/spec files under `docs/superpowers/` and the epic `docs/replatform.md` stay untouched.

- [ ] **Step 6: Full verification**

```bash
bun run test               # expect: green (web unit no longer has allowlist.test.ts — it lives in backend)
bun run test:integration   # expect: 18 files green
cd apps/web && bun run build && bun run lint
grep -rn "next-auth\|@auth/prisma-adapter" apps/web/src apps/web/package.json   # expect: no output
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth)!: remove nextauth — four auth tables dropped, docs updated"
```

---

### Task 11: Cutover runbook + final verification

**Files:**
- Create: `docs/superpowers/plans/2026-08-20-phase-1-cutover-runbook.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the ordered production cutover procedure the user executes around the `replatform` → `main` merge. Production cutover is deliberately **not** executed from this branch — Vercel ships `main`.

- [ ] **Step 1: Write the runbook** — `docs/superpowers/plans/2026-08-20-phase-1-cutover-runbook.md` with exactly these ordered sections (fill in the commands from the tasks above; every command already exists in this branch):

1. **Preconditions** — phase-1 branch merged to `replatform`; all suites green; decision memo says GO.
2. **Backup** — `cd apps/web && ./scripts/db-clone-prod.sh` (or `pg_dump` of Neon) so Postgres state is archived pre-cutover.
3. **Provision prod Convex** — `cd packages/backend && bunx convex deploy` (creates/updates the prod deployment); set all seven env vars with `bunx convex env set --prod …` (`SITE_URL` = the production URL; fresh keys from `generate-auth-keys.ts`); **USER:** add the prod redirect URI `https://<prod-deployment>.convex.site/api/auth/callback/google` in Google Cloud Console.
4. **Freeze + import** — stop using the app briefly; `bun scripts/export-feedback.ts` against prod Postgres (`DATABASE_URL` pointed at Neon via `DIRECT_DATABASE_URL`); `bun scripts/import-feedback.ts … --prod`; `bun scripts/verify-feedback-import.ts --prod` → all OK.
5. **Ship** — merge `replatform` → `main`; Vercel env: add `NEXT_PUBLIC_CONVEX_URL` (prod `.convex.cloud` URL), remove `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`; deploy (the `drop_nextauth_tables` migration runs in `vercel-build`).
6. **Post-flip** — re-run import + verify once (idempotent — catches rows written between export and deploy); sign in on production; create a journal entry; confirm the metric appears on the dashboard; confirm `/api/cron/compute-active-topics` with the bearer secret returns 200.
7. **Rollback note** — auth is a one-way door once the tables drop (re-login re-links, no session history lost — spec §05); data rollback = the step-2 backup.

- [ ] **Step 2: Run the complete verification matrix one last time**

```bash
bun run test && bun run test:integration
cd apps/web && bun run build && bun run lint
cd ../../packages/backend && bunx convex dev --once   # dev deployment in sync
```

Expected: everything green. Record final counts in the task report.

- [ ] **Step 3: Commit, then finish the branch**

```bash
git add docs/superpowers/plans/2026-08-20-phase-1-cutover-runbook.md
git commit -m "docs: phase 1 production cutover runbook"
```

Then use superpowers:finishing-a-development-branch — merge `phase-1-auth-spine` into `replatform` (user instruction), clean up the worktree. The `replatform` → `main` merge happens with the runbook, driven by the user.

---

## Self-review notes (kept for executors)

- **Spec coverage:** Convex Auth + Google + allowlist-in-callback (T1), middleware swap (T3), sign-in page design kept (T3), REST catch-all on Convex token validation (T5), feedback module + first data import (T6–T9), Expo spike with decide-here gate (T4), NextAuth + four tables gone (T10), exit verification (T11). Spec's "auth tables carry no history worth migrating" → no auth-data import, by design.
- **Deliberate deviations, argued from the spec:** (1) metric writes authenticate by service key, not user token — the cron writer has no user, all writers are trusted server code, and spec §07's scheduler-based recording arrives when the writers themselves move into Convex (phases 2–4); (2) `getMetrics`/`getReflections`/`getIterations` not ported — zero call sites (YAGNI); (3) `addReflection`/`logIteration` become internal mutations — their only historical invocation was by hand.
- **Known risks executors may hit:** convex-test env-var visibility under edge-runtime (fallback: `vi.stubEnv`); `bunx convex run` stdout mixing log lines with the result JSON (scripts parse the last line); Bun 1.3.14 not forwarding `.env` to node-shebang children on `test:integration` (phase-0 workaround: export the vars in the shell first); `createOrUpdateUser` arg typing may need a cast against `@convex-dev/auth@0.0.95`'s `profile` type — keep `upsertAllowlistedUser`'s own signature stable and adapt in `auth.ts`.
