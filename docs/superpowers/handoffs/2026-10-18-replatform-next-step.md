# Handoff — replatform: next step (2026-10-18)

Read this first, then `docs/replatform.md` (the epic plan). Supersedes
`2026-10-17-replatform-next-step.md`. You are picking up a long-running
migration of Polaris onto Convex. Phases 0–2 went live on 2026-10-17; the
next big piece is Phase 3 (journal on Convex).

## How to work with this user

- **Plain language, no jargon.** Say "switch-over" not "cutover",
  "checklist" not "runbook", and explain any unavoidable term inline.
- **End every turn that needs them with a "What I need from you" section**:
  numbered, one concrete action each — what, where, what to reply. If
  nothing is needed, say so and say whether the work is finished. (Their
  global CLAUDE.md requires it.)
- **Branch discipline:** feature work on a branch off `replatform`, merged
  back into `replatform`. `main` only changes through a PR from
  `replatform` that the user asks for (they've said "merge it" / "ship it to
  main" explicitly each time). Use merge commits, not squash.
- **Process they like:** superpowers skills — `writing-plans` → plan in
  `docs/superpowers/plans/`, then `subagent-driven-development` (fresh
  implementer + independent reviewer per task, ledger in
  `.superpowers/sdd/<plan>/`, final whole-branch review on the most capable
  model), then `finishing-a-development-branch`. They accepted the
  controller making and listing "rulings" instead of stopping to ask.
- **UI work:** read `docs/design/README.md` and
  `docs/design/polaris-design-system.md` first (CLAUDE.md rule). Next.js is
  16.2.4 — check `node_modules/.bun/next@16.2.4*/node_modules/next/dist/docs/`
  before relying on an API (AGENTS.md rule).
- **Secrets:** never in chat or the repo. Pattern that worked: the user
  pastes values into a `chmod 600` file outside the repo
  (`~/.config/polaris/<name>.env`), commands load it with
  `set -a; . file; set +a`, and nothing prints values (`>/dev/null`, print
  lengths or names only). Delete the file afterwards.

## Where things stand

| Phase | What | Status |
|---|---|---|
| 0 | Monorepo: `apps/web`, `packages/core`, `packages/backend` (Bun workspaces) | **Live** |
| 1 | Convex Auth (Google + allowlist) + feedback module | **Live** |
| 2 | Expenses on Convex + UX fixes | **Live** |
| — | Landing page at `/` | Live |
| — | Self-hosted fonts (`next/font/local`) | **Live** (PR #4, 2026-10-18) |
| 3–7 | Journal, habits, decommission Postgres, tokens package, Expo app | Not started |

- Production: https://polaris.martinv.dev (Vercel, Root Directory
  `apps/web`). The switch-over record, with every check and the follow-ups,
  is `docs/superpowers/plans/2026-10-17-switch-over-checklist.md`.
- Convex: dev `exciting-wolf-282`, prod `rapid-lapwing-153` (project
  `raymart-andrew-villos/polaris`). Prod holds sign-in, feedback (419
  metrics), and expenses (6 types / 10 activities / 85 items at switch-over).
  All seven prod env vars are set (`ALLOWED_EMAILS` =
  `raymart.villos@gmail.com`, `SITE_URL` = `https://polaris.martinv.dev`).
- Postgres (Neon) still serves journal and habits. Its expense and feedback
  tables are a frozen archive (Phase 5 drops them); the four NextAuth tables
  are gone. Backup from just before the switch-over:
  `~/Backups/polaris/polaris-prod-20261017-215246.dump` (restore-tested).
- Branches: `replatform` (856ec88) is the dev branch; `main` (702ba03) is
  `replatform` plus two merge commits. Clean tree, everything pushed.
- Vercel env vars left: `NEXT_PUBLIC_CONVEX_URL` (Production + Preview),
  `CRON_SECRET`, `DATABASE_URL`, `DIRECT_DATABASE_URL`. The old NextAuth
  vars are removed.

## Deploy facts you must know

- **Vercel does not deploy Convex.** The Vercel build only builds the web
  app. When `packages/backend/convex` changes, run
  `bunx convex deploy --yes` from `packages/backend` (the `--yes` flag is
  hidden but required in a non-interactive shell) *before* the `main` merge
  ships web code that calls it. Phase 3 will need this.
- **`vercel-build`** = `next build && if [ "$VERCEL_ENV" = production ];
  then prisma migrate deploy; fi`. Build first, migrations only on
  production. Preview builds have the production `DATABASE_URL`, so never
  loosen that guard.
- **Build logs:** the Vercel CLI is logged in on this machine —
  `bunx vercel inspect <deployment-url> --logs --scope raymarts-projects-c114a093`.
  Commit statuses: `gh api repos/martin0x/polaris/commits/<sha>/statuses`.
  If you need `vercel env`/`link`, run it from a scratch directory so no
  `.vercel/` lands in the repo.
- **Neon:** the direct (unpooled) URL is the pooled host minus `-pooler`.
  There's no local `pg_dump`/`psql`; use the `postgres:17` Docker image
  (`docker run --rm -e NEON_DIRECT_URL postgres:17 sh -c '…'` — export the
  variable first).
- **Fonts:** all five families load from `apps/web/src/app/_fonts/`
  (README there has provenance and regeneration commands). A guard test
  fails if `next/font/google` comes back — it was making builds fail at
  random (vercel/next.js#99114).

## Next step: Phase 3 — journal on Convex

See `docs/replatform.md` §05 "Phase 3 — Journal on Convex (L)" (line ~162)
and its risk table. Largest phase: Convex search index replacing Postgres
tsvector (acceptance pass on the real corpus before flipping), tags →
`entryTags` join table, the nightly compute-active-topics job → Convex
`crons.ts` (kills the Vercel cron and the `CRON_SECRET` route), topics
import with `parentId` remap, then entries. Start with
`superpowers:brainstorming` / `writing-plans`, mirroring
`docs/superpowers/plans/2026-08-22-phase-2-expenses.md`. Its go-live will
need its own short checklist (copy the shape of the switch-over checklist:
deploy Convex → copy data → verify → merge → re-copy → smoke).

Lessons to carry into the plan:
- convex-test scheduler tests: `vi.useFakeTimers()` then
  `await t.finishAllScheduledFunctions(vi.runAllTimers)`.
- Palette layers get called with an empty query when browsing a layer —
  return the newest N, not `[]`.
- Web integration tests that mock `@convex-dev/auth/nextjs/server` must also
  stub `convexAuthNextjsToken`.
- `assertSignedIn` is copy-pasted across `convex/expenses/*` — extract
  `convex/lib/auth.ts` before journal multiplies it.
- The import driver treats a missing JSONL file as zero rows; make it fail.
- Backend `package.json` exports `./convex/_generated/dataModel` for `Id`
  types in web.
- Imports upsert by `legacyId` and never delete: a row deleted in Postgres
  between copies shows up as a verify count mismatch.
- Pre-existing Prisma↔DB drift on `journal_entries.search_vector` — Phase 3
  owns it; `prisma migrate dev` will propose dropping it, so keep scoping
  migrations by hand.

## Small follow-ups (not blocking)

- Remove `DATABASE_URL` / `DIRECT_DATABASE_URL` from Vercel's Preview
  environment (previews read production Postgres while pre-rendering), and
  Preview's `CRON_SECRET` is stale. The user was offered this ("previews")
  and hasn't picked it yet.
- The dashboard's expenses summary catches Next's dynamic-render signal
  during `next build` and logs it as a failure — `unstable_rethrow` fixes it.
- Font guard test is a substring match (a comment mentioning the Google
  loader would trip it); the font file test only checks woff2 magic bytes.
- Phase 2 UX leftovers: titlebar sync popover is hover-only (no
  touch/keyboard; phone hides the label); saving an expense row with an
  empty name gives no cue; activity delete and types-manager mutations don't
  report to `useSyncStatus().track`; brief "No activities yet" flash on the
  first-ever activity start.

## Verification commands

```bash
bun run test                                    # core 83 / backend 62 / web 60
docker compose -f apps/web/docker/docker-compose.yml up -d   # local Postgres on 5440
DATABASE_URL_TEST=postgresql://polaris:polaris@localhost:5440/polaris_test \
  bun run test:integration                      # 14 files / 84 tests
cd apps/web && bun run build && bun run lint
cd packages/backend && bunx convex dev --once   # syncs the dev deployment
```

Use `bun run test`, never `bun test`. Bun doesn't forward `.env` to
node-shebang children, so integration needs the var inline.

## Housekeeping you may notice

- Local branches `landing-page`, `landing-plex-fonts` (squash-merged as PRs
  #1/#2), `docs/replatform-plan`, and an odd one named `list` — plus the
  first three on `origin`. Ask before deleting.
- zsh gotchas: don't name shell variables `GID`/`UID`; `echo ====` is a
  zsh error (use `echo '----'`); export variables you pass with
  `docker run -e NAME`.
- Railway was discussed as an alternative host — advised against until after
  Phase 5. Not a current task.
