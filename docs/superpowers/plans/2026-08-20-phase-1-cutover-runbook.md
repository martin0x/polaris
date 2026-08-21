# Phase 1 — production cutover runbook

This is the ordered procedure for cutting Polaris's production deployment
over to Convex Auth and the Convex feedback module, executed around the
`replatform` → `main` merge. It is **not executed from this branch** — Vercel
ships `main`, and every `--prod` command below targets the real production
Postgres and the real production Convex deployment. The human operator runs
this; steps that require clicking an external dashboard (Google Cloud,
Vercel, the Convex dashboard) are marked **USER**.

Deployment names used below: dev is `exciting-wolf-282`, prod is
`rapid-lapwing-153`, both in Convex project `raymart-andrew-villos/polaris`.
If prod Convex hasn't been provisioned yet, treat `rapid-lapwing-153` as the
expected name and confirm it against the `bunx convex deploy` output (or the
[Convex dashboard](https://dashboard.convex.dev/t/raymart-andrew-villos/polaris))
rather than assuming it.

No command in this runbook prints a secret to its own output beyond what the
target CLI already does (`convex env set` echoes the value it just set,
`generate-auth-keys.ts` prints the keys it generates — both expected and
scoped to the operator's own terminal). Never paste secret values into a
commit, a PR description, or this file.

---

## 1. Preconditions

- `phase-1-auth-spine` is merged into `replatform` (via
  `superpowers:finishing-a-development-branch`, driven by the user).
- All suites are green on `replatform` — the same matrix as Step 2 below,
  re-run one more time on `replatform` immediately before shipping.
- The provider decision memo says GO:
  `docs/superpowers/specs/2026-08-20-auth-provider-decision.md` — "Decision:
  Convex Auth", both gates PASS.

## 2. Backup

Archive Postgres state before anything touches prod. Two options exist in
this repo; pick one (or both). Every command block in this runbook starts
with `cd "$(git rev-parse --show-toplevel)/…"` so it works regardless of
what directory your shell was in before — don't chain relative `cd`s across
blocks:

```bash
cd "$(git rev-parse --show-toplevel)/apps/web"

# Option A — pull a live local copy of prod into your dev Postgres. Useful
# as a queryable snapshot, but it overwrites your local dev database and
# produces no portable file.
DIRECT_DATABASE_URL="<prod-neon-direct-url>" ./scripts/db-clone-prod.sh

# Option B — a portable, point-in-time archive file, independent of local
# dev state. Preferred for an actual rollback artifact.
pg_dump "<prod-neon-direct-url>" --no-owner --no-acl -Fc -f "polaris-prod-$(date +%Y%m%d%H%M%S).dump"
```

Store the dump file (Option B) somewhere outside the repo. This is the
artifact referenced in the rollback note (§7).

## 3. Provision prod Convex

```bash
cd "$(git rev-parse --show-toplevel)/packages/backend"
bunx convex deploy   # creates/updates the prod deployment (rapid-lapwing-153)
```

Set all seven deployment env vars with `bunx convex env set NAME value
--prod` — the full table (names + purpose) is in
[`packages/backend/README.md`](../../../packages/backend/README.md), not
duplicated here. Two notes specific to cutover:

- `SITE_URL` must be the production web app URL (not localhost).
- `ALLOWED_EMAILS` on prod Convex is the *only* place this allowlist lives
  after cutover — Vercel's copy is being removed in §5, not duplicated.

Generate a fresh signing key pair rather than reusing the dev deployment's:

```bash
cd "$(git rev-parse --show-toplevel)/packages/backend"
KEYS=$(bun scripts/generate-auth-keys.ts)
bunx convex env set --prod JWT_PRIVATE_KEY -- "$(echo "$KEYS" | sed -n '1p')"
bunx convex env set --prod JWKS -- "$(echo "$KEYS" | sed -n '2p')"
unset KEYS
```

Set the remaining scalar vars with the same `--` guard: `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `CRON_SECRET` (must be the **same value** already set
as `CRON_SECRET` on Vercel — this is the shared feedback-writer service key).

For example:

```bash
bunx convex env set --prod AUTH_GOOGLE_ID -- "<value>"
bunx convex env set --prod AUTH_GOOGLE_SECRET -- "<value>"
bunx convex env set --prod CRON_SECRET -- "<value>"
bunx convex env set --prod SITE_URL -- "<prod-url>"
```

The `--` stops the CLI from parsing values that could start with a dash as options.

**USER:** add the prod redirect URI in Google Cloud Console — Credentials →
the OAuth client → Authorized redirect URIs:

```
https://rapid-lapwing-153.convex.site/api/auth/callback/google
```

(substitute the actual prod deployment slug if it differs from the expected
name above).

## 4. Freeze + import

Stop using the app briefly — this is the write freeze. Point the export at
prod Postgres using the **direct** (unpooled) Neon URL, since Prisma's
prepared statements don't work over the pooled connection
(`apps/web/.env.example`'s documented reason for `DIRECT_DATABASE_URL`):

```bash
cd "$(git rev-parse --show-toplevel)/apps/web"
DATABASE_URL="<prod-neon-direct-url>" bun scripts/export-feedback.ts
```

This writes `apps/web/scripts/out/system-{metrics,reflections,iterations}.jsonl`.
Import into prod Convex, then verify — both need to agree on which Postgres
and which Convex deployment they're comparing:

```bash
cd "$(git rev-parse --show-toplevel)/packages/backend"
bun scripts/import-feedback.ts "$(git rev-parse --show-toplevel)/apps/web/scripts/out" --prod

cd "$(git rev-parse --show-toplevel)/apps/web"
DATABASE_URL="<prod-neon-direct-url>" bun scripts/verify-feedback-import.ts --prod
```

Expected: every line prints `OK` (row counts and per-`system/name`
count+sum checksums match between Postgres and Convex). If any line prints
`FAIL`, stop — do not proceed to §5 until it's resolved.

## 5. Ship

Merge `replatform` → `main` (driven by the user; Vercel ships `main`).

**USER**, in the Vercel dashboard, project settings → Environment Variables:

- Add `NEXT_PUBLIC_CONVEX_URL` = the prod `.convex.cloud` URL (e.g.
  `https://rapid-lapwing-153.convex.cloud`).
- Remove `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS` — these were the NextAuth-era
  vars (`apps/web/.env.example`, pre-teardown), now dead.
- Leave `CRON_SECRET` in place — it doubles as the feedback service key and
  must keep matching the value set on prod Convex in §3.

Deploy. `vercel-build` (`apps/web/package.json`) runs `prisma migrate deploy
&& next build`, so the `drop_nextauth_tables` migration
(`apps/web/prisma/migrations/20260821031936_drop_nextauth_tables`) executes
as part of this deploy — this is the point of no return for the four
NextAuth tables (`User`, `Account`, `Session`, `VerificationToken`).

## 6. Post-flip

Rows can land in Postgres between the §4 export and this deploy going live.
Re-run the import + verify once more — it's idempotent (upsert by
`legacyId`), so re-importing already-imported rows is a no-op:

```bash
cd "$(git rev-parse --show-toplevel)/apps/web"
DATABASE_URL="<prod-neon-direct-url>" bun scripts/export-feedback.ts

cd "$(git rev-parse --show-toplevel)/packages/backend"
bun scripts/import-feedback.ts "$(git rev-parse --show-toplevel)/apps/web/scripts/out" --prod

cd "$(git rev-parse --show-toplevel)/apps/web"
DATABASE_URL="<prod-neon-direct-url>" bun scripts/verify-feedback-import.ts --prod
```

Then smoke-test production by hand:

- Sign in on production (Google OAuth through the allowlisted account).
- Create a journal entry.
- Hit the cron endpoint with the bearer secret and confirm `200`:

  ```bash
  curl -i -H "Authorization: Bearer $CRON_SECRET" https://<prod-url>/api/cron/compute-active-topics
  ```

  (`CRON_SECRET` exported in your own shell — never inline the literal
  value in a command you might paste elsewhere.)
- Confirm the `journal/active_topic_count` metric that call just recorded
  shows up on `/dashboard` (`apps/web/src/app/(platform)/dashboard/page.tsx`
  renders `feedback.getAllFeedback()`).

## 7. Rollback note

Auth is a one-way door **once the migration in §5 drops the four NextAuth
tables** — there's no data to roll back to (spec §05: NextAuth's tables
"carry no history worth migrating"; re-login just re-links the same Google
account, no session history is lost either way). Before that migration
runs, the cutover is still abortable: don't merge/deploy, and prod Postgres
is untouched.

Data rollback for the feedback rows is the §2 backup. Since import is
idempotent by `legacyId`, there's no "undo the import" step needed on the
Convex side if something goes wrong before §5 — a botched prod Convex
deployment can simply be re-provisioned from §3 and re-imported from the
same export files.
