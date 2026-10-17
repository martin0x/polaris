# Phase 2 — production cutover runbook

This is the ordered procedure for cutting Polaris's production deployment
over to the Convex expenses module, executed around the `replatform` →
`main` merge. It is **not executed from this branch** — Vercel ships `main`,
and every `--prod` command below targets the real production Postgres and
the real production Convex deployment. The human operator runs this; steps
that require clicking an external dashboard (Vercel) are marked **USER**.

Deployment names: dev is `exciting-wolf-282`, prod is `rapid-lapwing-153`,
both in Convex project `raymart-andrew-villos/polaris` — same deployments as
phase 1 (`docs/superpowers/plans/2026-08-20-phase-1-cutover-runbook.md`);
this cutover reuses them rather than provisioning anything new.

No command in this runbook prints a secret to its own output beyond what the
target CLI already does. Never paste secret values into a commit, a PR
description, or this file — values come from the password manager.

---

## 1. Preconditions

- `phase-2-expenses` is merged into `replatform` (via
  `superpowers:finishing-a-development-branch`, driven by the user).
- All suites are green on `replatform` — the same matrix as Task 12
  (`bun run test`; `bun run test:integration` with `DATABASE_URL_TEST` set;
  `apps/web` build + lint; `packages/backend`'s `bunx convex dev --once`),
  re-run one more time on `replatform` immediately before shipping.
- **Hard dependency on phase 1:** every expenses query and mutation calls
  `ctx.auth.getUserIdentity()` (`packages/backend/convex/expenses/*.ts`), so
  prod Convex must already have Convex Auth provisioned — the env vars,
  signing keys, and Google OAuth redirect from the phase 1 runbook's §3. As
  of this writing, phase 1's production cutover has not yet been executed.
  Pick one:
  - **(a) Sequential** — run the phase 1 runbook to completion first, as its
    own cutover event, then run this one as a second, later event; or
  - **(b) Bundled** — run phase 1 runbook §§1–4 (through its freeze +
    import), then this runbook's §§2–3 below, all before merging to `main`,
    so one `replatform` → `main` merge and one Vercel deploy carry auth and
    expenses live together.

  Either way, do not start §2 below until prod Convex Auth is confirmed
  working (phase 1 runbook §6's sign-in smoke test).
- Unlike phase 1, this migration drops no Postgres tables and needs no
  standalone backup step: the expense tables stay exactly as they are,
  frozen archive material for phase 5, so there is nothing here to lose.

## 2. Deploy expense functions to prod Convex

Push the expense schema and functions (including the `migrations:*` import
mutations) onto the existing prod deployment. This is additive — the
currently-live web app doesn't call any of these functions yet, so this is
safe to run well ahead of the freeze window:

```bash
cd "$(git rev-parse --show-toplevel)/packages/backend"
bunx convex deploy
```

Confirm it targeted `rapid-lapwing-153` in the command's own output (or the
[Convex dashboard](https://dashboard.convex.dev/t/raymart-andrew-villos/polaris))
rather than assuming it. No new env vars are needed — expenses reuses the
Convex Auth identity phase 1 already set up; there is no expenses-specific
secret.

## 3. Freeze + import

Stop using the app's expense capture briefly — this is the write freeze.
There's no dual-write period to fall back on: Task 12 deleted the Prisma
REST routes for expenses from the codebase entirely, so once `main` ships
(§4), the app reads and writes only Convex. Anything captured against old
Postgres during this freeze needs to be in Convex before that happens.

Point the export at prod Postgres using the **direct** (unpooled) Neon URL —
Prisma's prepared statements don't work over the pooled connection
(`apps/web/.env.example`'s documented reason for `DIRECT_DATABASE_URL`):

```bash
cd "$(git rev-parse --show-toplevel)/apps/web"
DATABASE_URL="<prod-neon-direct-url>" bun scripts/export-expenses.ts
```

This writes `apps/web/scripts/out/expense-{types,activities,items}.jsonl`.
Import into prod Convex — parents first, which is why the script's file list
is ordered types → activities → items — then verify, both against the same
Postgres and the same Convex deployment:

```bash
cd "$(git rev-parse --show-toplevel)/packages/backend"
bun scripts/import-expenses.ts "$(git rev-parse --show-toplevel)/apps/web/scripts/out" --prod

cd "$(git rev-parse --show-toplevel)/apps/web"
DATABASE_URL="<prod-neon-direct-url>" bun scripts/verify-expenses-import.ts --prod
```

Expected: every line prints `OK` — row counts, per-month centavo sums, and
per-type activity counts all match between Postgres and Convex. If any line
prints `FAIL`, stop — do not proceed to §4 until it's resolved.

## 4. Ship

Merge `replatform` → `main` (driven by the user; Vercel ships `main`). No
new Vercel environment variables are needed — `NEXT_PUBLIC_CONVEX_URL`
already points at `rapid-lapwing-153` from the phase 1 cutover, and expenses
has no secrets of its own.

**USER**, in the Vercel dashboard: deploy `main`. This is the point where
the app stops reading/writing Postgres for expenses — the old routes no
longer exist in the deployed code (Task 12), and capture, trends, and the
dashboard all read Convex from this deploy onward.

## 5. Post-flip

Rows can land in Postgres between the §3 export and this deploy going live
(if the freeze slipped). Re-run the import + verify once more — it's
idempotent (upsert by `legacyId`), so re-importing already-imported rows is
a no-op. Run this §5 import before anyone touches an imported row in the new
app: the import matches by `legacyId` and calls `ctx.db.replace`, so it would
silently overwrite any Convex-side edit made to an already-imported row in
the meantime.

```bash
cd "$(git rev-parse --show-toplevel)/apps/web"
DATABASE_URL="<prod-neon-direct-url>" bun scripts/export-expenses.ts

cd "$(git rev-parse --show-toplevel)/packages/backend"
bun scripts/import-expenses.ts "$(git rev-parse --show-toplevel)/apps/web/scripts/out" --prod

cd "$(git rev-parse --show-toplevel)/apps/web"
DATABASE_URL="<prod-neon-direct-url>" bun scripts/verify-expenses-import.ts --prod
```

Then smoke-test production by hand:

- Sign in on production (Google OAuth through the allowlisted account, per
  phase 1).
- Capture a new expense item and confirm it appears immediately (the
  optimistic write + Convex's own offline queue, no `SyncQueue`).
- Open trends (`/expenses/trends`) and confirm a month total matches what
  verify just checked.
- Open the dashboard and confirm the expenses summary tile renders (not the
  degraded/empty state a missing auth identity would produce).
- Open the command palette and confirm expense activities are searchable.

## 6. Rollback note

Unlike phase 1 — which drops the NextAuth tables as an irreversible step —
this migration deletes nothing in Postgres. The expense tables are
untouched and stay frozen-complete (§3 and §5 both confirmed `OK`) regardless
of what happens after §4. If the post-deploy smoke test in §5 turns up a
problem, roll back by redeploying the previous Vercel build (the pre-merge
`main`, still on Prisma-backed expense routes) — Postgres needs no repair
because it was never touched, and prod Convex can simply be re-imported
into again from the same export files once the issue is fixed, since import
is idempotent by `legacyId`.
