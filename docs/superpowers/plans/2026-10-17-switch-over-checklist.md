# Switch-over checklist — replatform goes live (2026-10-17)

**Done 2026-10-17.** Phases 0–2 are live at https://polaris.martinv.dev
(merge `a2126d6`); the user's smoke test passed.

One merge of `replatform` → `main` and one Vercel deploy put phases 0–2 live
together: the monorepo layout, Convex Auth sign-in, feedback on Convex, and
expenses on Convex. This page is the order of work. The detail behind each
step is in the two older checklists:

- [Phase 1 checklist](2026-08-20-phase-1-cutover-runbook.md) — sign-in and feedback
- [Phase 2 checklist](2026-08-22-phase-2-cutover-runbook.md) — expenses

This page also covers what those two missed (see the handoff,
`docs/superpowers/handoffs/2026-10-17-replatform-next-step.md`): the Vercel
Root Directory change, setting `NEXT_PUBLIC_CONVEX_URL` *before* the merge
(the merge itself starts the build), and testing sign-in against production
Convex before anything goes live.

Production Convex is `rapid-lapwing-153`; dev is `exciting-wolf-282`.

## Secrets

Secrets live in `~/.config/polaris/switch-over.env` (outside the repo,
readable only by you), not in chat or in any file in the repo. Commands load
it with `set -a; . ~/.config/polaris/switch-over.env; set +a` and never print
values. Delete the file when the switch-over is finished.

## Stage 1 — prepare (nothing live changes)

- [x] Re-run every check on `replatform` — core 83, backend 62, web 50,
      integration 14 files / 84, build + lint clean, `convex dev --once` OK.
- [x] Merge `origin/main` into `replatform`, keeping `replatform`'s side
      (`c0a2047`). Its tree is unchanged; the later PR now merges cleanly.
- [x] Deploy the backend code to production Convex (`bunx convex deploy --yes`).
- [x] Generate fresh signing keys on production Convex (`JWT_PRIVATE_KEY`,
      `JWKS`). The key script needed `jose` added to `packages/backend`.
- [x] Make the Vercel build safe: `vercel-build` now builds first, and only
      then updates the database — and only when `VERCEL_ENV` is exactly
      `production`. Before, a failed build could still drop the old sign-in
      tables, and a preview build could change whatever database previews
      point at (evidence suggests they have one). If `VERCEL_ENV` were ever
      missing, the database step is skipped — the safe direction.
- [x] Back up the production database: `~/Backups/polaris/polaris-prod-20261017-215246.dump`
      (`pg_dump -Fc` inside the `postgres:17` Docker image — there's no local
      `pg_dump`; server is Postgres 17.11). Restored into a scratch database:
      all 16 tables match production row for row (`counts-prod.txt` beside it).
      `NEON_DIRECT_URL` must be the host *without* `-pooler`.
- [x] Early copy of the data, as a rehearsal on real rows (2026-10-17):
      feedback 418 metrics, expenses 6 types / 10 activities / 85 items, every
      verify line `OK`. Stage 3's copy is now a top-up: the same commands pick up
      anything added since. If a row gets *deleted* in the app before stage 3,
      verify will show a count mismatch — clear that Convex table and re-import.
- [x] All seven production Convex settings: `JWT_PRIVATE_KEY`, `JWKS`,
      `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (copied from dev — client
      `874558860450-j73to9f…`), `CRON_SECRET` (fresh; in the secrets file for
      Vercel later), `ALLOWED_EMAILS` = `raymart.villos@gmail.com`,
      `SITE_URL` = `https://polaris.martinv.dev`.
- [x] Google Cloud Console: prod redirect URI added to that client.
- [x] Sign-in rehearsal: with `SITE_URL` briefly `http://localhost:3000`, the
      local app ran against production Convex; signed in, expenses looked
      right, one `users` row + one Google `authAccounts` row created. `SITE_URL`
      then set to the real address. Only that string is untested.

## Stage 2 — Vercel test build (nothing live changes)

- [x] Vercel → Settings → Environment Variables: add `NEXT_PUBLIC_CONVEX_URL`
      = `https://rapid-lapwing-153.convex.cloud` (Production and Preview).
      Harmless to the live site — today's `main` doesn't read it — and it must
      be there before the merge, because the build bakes it in.
- [x] Vercel → Settings → Build and Deployment: Root Directory = `apps/web`,
      and "Include files outside the Root Directory in the Build Step" on.
      Only new builds see it; the live deployment keeps serving. A push to
      `main` before the merge would fail to build (harmless — the old
      deployment stays live).
- [x] Push `replatform`; open the PR `replatform` → `main`
      ([#3](https://github.com/martin0x/polaris/pull/3)). The PR's preview
      build is the test run of the new layout on Vercel and must succeed. It
      skips the database step. First run failed on the Google Fonts flake
      (below); the retry built clean — same 24 routes as locally, no
      database step, checks green.

## Stage 3 — go live (don't use the app from here until the smoke test)

- [x] Top-up copy: feedback and expenses export → import → verify (Phase 1
      checklist §4, Phase 2 checklist §3). Every line `OK` (0 new rows).
- [x] Vercel → Environment Variables: replace `CRON_SECRET` (Production)
      with the value from the secrets file. Left until now so the current
      site's nightly job keeps working.
- [x] Merge the PR (merge commit `a2126d6`, 2026-10-17 14:57 UTC). Vercel builds `main`, then runs the
      database update that drops the four old sign-in tables — from here the
      old sign-in can't come back without restoring them from the backup.
- [x] Confirm `20260821031936_drop_nextauth_tables` is in production's
      `_prisma_migrations` (proves `VERCEL_ENV` reached the build). Built
      first, then applied; 0 of the 4 old tables left, 12 tables remain.
      Live site serves the new build (landing shows the Convex stack,
      `/dashboard` → `/auth/signin`, cron without secret → 401).

## Stage 4 — after it's live

- [x] Re-run both export → import → verify passes once more, before touching any
      imported expense in the app (the re-import would overwrite edits).
      15/15 and 9/9 `OK`, 0 new rows. No more re-imports from here.
- [x] Smoke test: sign in; capture an expense; trends month total; dashboard
      expenses tile; command palette finds an expense activity; create a
      journal entry. Cron already checked: `curl` with the new secret → 200
      `{"ok":true}`, metric count 418 → 419 on production Convex.
- [x] Remove the old sign-in settings from Vercel: `NEXTAUTH_SECRET`,
      `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`,
      and the first deploy's singular `ALLOWED_EMAIL`. Left: `NEXT_PUBLIC_CONVEX_URL`,
      `CRON_SECRET`, `DATABASE_URL`, `DIRECT_DATABASE_URL`.
- [x] Delete `~/.config/polaris/switch-over.env` and `apps/web/scripts/out/`.
      The backup stays in `~/Backups/polaris/`.

## If something goes wrong

- **Before the merge:** nothing live has changed. Clear the Root Directory
  setting if it was flipped; production Convex can be re-set up and
  re-imported at any time (imports are keyed on the old ids, so repeats are
  harmless).
- **After the merge, sign-in fails:** a Convex setting or the Google redirect
  is wrong. Fix it in the Convex dashboard; no data is lost.
- **After the merge, something else is broken:** Vercel → Deployments →
  the previous production deployment → Instant Rollback (it reuses the old
  build, so the Root Directory setting doesn't matter for it; clear the
  setting only if `main` itself gets reverted). The old build's sign-in needs
  its four tables back:
  restore `User`, `Account`, `Session`, `VerificationToken` from the backup
  with `pg_restore -t`. Expenses and feedback in Postgres were never touched.

## Known flaky build: Google Fonts

The first test build (PR #3, 2026-10-17) failed in `next build` with
`next/font/google queries have exactly one entry` on the landing page's IBM
Plex Sans. Cause: Google Fonts sometimes answers with extensionless
`/l/font?kit=…&skey=…` font URLs instead of `/s/…/*.woff2`, and Next.js 16.2.4
splits them at the `&` — Next.js issue
[#99114](https://github.com/vercel/next.js/issues/99114); the 16.x backport
[#100277](https://github.com/vercel/next.js/pull/100277) is still open. It is
intermittent (about 1 in 60 responses in one report, sometimes for 20 minutes
at a stretch) and can hit any of the five `next/font/google` families. A
probe build that fetched the same stylesheet from Vercel's machine a few
minutes later got normal URLs.

What it means here: a failed build is harmless — the build runs before the
database step, so nothing changes and the old deployment stays live; retry
the build. The lasting fix is to self-host the fonts with `next/font/local`
so builds stop fetching from Google.

## Follow-ups noticed on the way

- **Self-host the fonts** (`next/font/local`) so builds stop depending on
  Google Fonts — see the flaky-build section above.
- **Convex code is not deployed by Vercel.** The Vercel build only builds the
  web app. Whenever `packages/backend/convex` changes, run
  `bunx convex deploy --yes` from `packages/backend` *before* the merge to
  `main` ships web code that calls it — or wire `convex deploy --cmd` into
  `vercel-build` with a production deploy key.
- **Previews share production's database settings.** `DATABASE_URL` and
  `DIRECT_DATABASE_URL` are set for Preview too, so a preview build reads
  production Postgres while pre-rendering. The build guard stops previews
  from migrating; consider removing those two from Preview anyway.
- Preview's `CRON_SECRET` still has the old value. Harmless (cron jobs only
  run on production), but stale.

- The dashboard's expenses summary catches Next's "this page is dynamic"
  signal during `next build` and logs it as a failure. Harmless (the route is
  dynamic anyway) but noisy; `unstable_rethrow` in the catch would fix it.
