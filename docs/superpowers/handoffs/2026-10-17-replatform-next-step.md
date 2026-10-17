# Handoff — replatform: next step (2026-10-17)

Read this first, then `docs/replatform.md` (the epic plan). You are picking up a
long-running migration of Polaris onto Convex. The previous session ran out of
useful context; everything you need is here or linked.

## How to work with this user

- **Plain language, no jargon.** The user asked for this explicitly. Say
  "switch-over" not "cutover", "checklist" not "runbook", and explain any
  unavoidable term inline.
- **End every turn that needs them with a "What I need from you" section**:
  numbered, one concrete action each — what, where, what to reply. (Their
  global CLAUDE.md requires it.)
- **Branch discipline:** do feature work on a branch off `replatform`, merge
  back into `replatform`. Never commit to or push `main` unless the user
  explicitly drives it (the switch-over is the one place `main` gets merged).
- **Process they like:** superpowers skills — `writing-plans` → plan doc in
  `docs/superpowers/plans/`, then `subagent-driven-development` (fresh
  implementer + independent reviewer per task, ledger in `.superpowers/sdd/`,
  final whole-branch review), then `finishing-a-development-branch`.
- UI work: read `docs/design/README.md` and `docs/design/polaris-design-system.md`
  first (CLAUDE.md rule). Next.js is 16.2.4 — check `apps/web/node_modules/next/dist/docs/`
  before touching conventions (AGENTS.md rule).

## Where things stand

| Phase | What | Status |
|---|---|---|
| 0 | Monorepo: `apps/web`, `packages/core`, `packages/backend` (Bun workspaces) | Done on `replatform` |
| 1 | Convex Auth (Google + allowlist) + feedback module | Done on `replatform` |
| 2 | Expenses on Convex + UX fixes (titlebar sync status, amount validation, start-flow flash, capture scroll) | Done on `replatform`, user smoke-tested |
| — | Public landing page at `/` | Done on `replatform` **and** already live via `main` (PRs #1, #2) |
| 3–7 | Journal, habits, decommission Postgres, tokens package, Expo app | Not started |

- `replatform` is **60 commits ahead of `main`** and was pushed to
  `origin/replatform` on 2026-10-17 (head `5b474ba`). It is **2 commits behind
  `origin/main`** — the landing-page backports. On merge, resolve conflicts in
  landing-page files by **taking replatform's side** (see memory
  `landing-page.md`).
- **None of phases 0–2 has ever reached production.** Live site = `main` on
  Vercel, still NextAuth + Prisma/Neon + REST routes.
- Convex: dev deployment `exciting-wolf-282`, prod `rapid-lapwing-153`
  (project `raymart-andrew-villos/polaris`). Prod has not been provisioned with
  auth env vars yet (as far as anyone knows — confirm with
  `bunx convex env list --prod` **only if** you're sure it won't dump secret
  values into the transcript; it does print values, so prefer the dashboard).

## Decision: switch-over (user chose it 2026-10-17)

**The user picked Option A, the switch-over. Start there — don't re-ask switch-over vs Phase 3.** First step: confirm they have an hour where they won't need the app, have them open the tabs listed under "What the user needs to bring", then begin with the backup (Phase 1 checklist §2), which changes nothing live. Re-run the verification matrix below first; it was green on 2026-09-20.

### Background on the choice

The last session recommended **doing the switch-over before starting
Phase 3**: the unreleased pile only grows, the auth swap has never touched real
traffic, and the Phase 2 import was only rehearsed against a nearly empty dev
database. The user had agreed and started gathering credentials (they got as
far as asking where `CRON_SECRET` lives), then paused. They have since chosen the switch-over.

### Option A — switch-over (recommended)

One merge of `replatform` → `main`, one Vercel deploy, carrying phases 0, 1, 2
together ("bundled" — option (b) in the Phase 2 checklist). Checklists:

- `docs/superpowers/plans/2026-08-20-phase-1-cutover-runbook.md`
- `docs/superpowers/plans/2026-08-22-phase-2-cutover-runbook.md`

Order: Phase 1 §1–4 → Phase 2 §2–3 → merge + deploy → Phase 1 §6 and Phase 2
§5 (re-import gap rows, smoke test).

**Gaps the checklists don't cover — handle these:**

1. **Vercel Root Directory must change to `apps/web`** (and "Include source
   files outside the Root Directory" must be on). This is only in the Phase 0
   plan (`2026-08-19-phase-0-monorepo-foundations.md`, ~line 711–750). Without
   it the deploy fails outright. Flip it immediately before the merge;
   rollback = clear the setting + redeploy the previous build.
2. **The deploy is the point of no return for login.** `apps/web`'s
   `vercel-build` runs `prisma migrate deploy`, which drops the four NextAuth
   tables. If prod Convex Auth is misconfigured, neither old nor new sign-in
   works until fixed (config-only fix, no data loss). So verify every prod
   Convex env var and the Google redirect URI *before* merging.
3. **Phase 2 checklist says "confirm prod auth works before importing
   expenses"** — impossible in bundled mode (sign-in needs the deploy). Accept
   that: verify config pre-merge, smoke sign-in post-deploy, and remember
   Phase 2 itself is fully reversible (Postgres untouched).
4. **Custom domain / `SITE_URL`:** prod Vercel URLs sit behind Vercel
   Deployment Protection; the landing page is only public via a custom domain.
   Convex prod `SITE_URL` must be the URL users actually sign in from. Ask
   the user which URL that is.
5. Merge conflicts with the 2 landing-page commits on `main` → take
   replatform's side.

**What the user needs to bring** (most are in Vercel → Settings →
Environment Variables): `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (reused —
just add the redirect `https://rapid-lapwing-153.convex.site/api/auth/callback/google`
in Google Cloud Console), `CRON_SECRET` (production value; if Vercel marks it
Sensitive and won't show it, generate a new one with `openssl rand -base64 32`
and set it in both Vercel and Convex prod), the Neon **direct/unpooled**
connection string, the production site URL, and logins for Vercel, Google
Cloud Console, and the Convex dashboard. Never echo secrets into the
transcript.

### Option B — Phase 3 (journal on Convex)

See `docs/replatform.md` §05 Phase 3. Largest phase: Convex search index
replacing Postgres tsvector (acceptance pass on real data before flipping),
tags → `entryTags` join table, nightly compute-active-topics job → Convex
`crons.ts` at 15:00 UTC (kills the Vercel cron and `CRON_SECRET` route),
topics import with `parentId` remap then entries. Start with
`superpowers:brainstorming` / `writing-plans`, mirroring
`docs/superpowers/plans/2026-08-22-phase-2-expenses.md`.

Carry these lessons from Phase 2 into the plan:
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

## Small deferred follow-ups (not blocking either option)

- Titlebar sync popover is hover-only — no touch/keyboard access, and the
  phone breakpoint hides the label.
- Saving an expense row with an empty name gives no visual cue.
- Activity delete and types-manager mutations don't report to the titlebar
  sync status (`useSyncStatus().track`).
- Brief "No activities yet" flash on the very first activity start.

## Verification commands

```bash
bun run test                                    # core 83 / backend 62 / web 50
DATABASE_URL_TEST=postgresql://polaris:polaris@localhost:5440/polaris_test \
  bun run test:integration                      # 14 files / 84 tests (needs Docker Postgres)
cd apps/web && bun run build && bun run lint
cd packages/backend && bunx convex dev --once   # syncs the dev deployment
```

Use `bun run test`, never `bun test`. Bun doesn't forward `.env` to
node-shebang children, so integration needs the var inline.

## Housekeeping you may notice

- Stale worktrees: `.claude/worktrees/landing-page` (branch
  `landing-plex-fonts`, already merged as PR #2) and
  `~/Projects/worktrees/polaris/cobalt-acorn/polaris` (detached). Ask before
  removing.
- Railway was discussed as an alternative host: feasible (no Vercel coupling
  in code), but advised against until after the switch-over; ideally after
  Phase 5. Not a current task.
