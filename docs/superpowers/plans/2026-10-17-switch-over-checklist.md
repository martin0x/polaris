# Switch-over checklist — replatform goes live (2026-10-17)

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

- [ ] Vercel → Settings → Environment Variables: add `NEXT_PUBLIC_CONVEX_URL`
      = `https://rapid-lapwing-153.convex.cloud` (Production and Preview).
      Harmless to the live site — today's `main` doesn't read it — and it must
      be there before the merge, because the build bakes it in.
- [ ] Vercel → Settings → Build and Deployment: Root Directory = `apps/web`,
      and "Include files outside the Root Directory in the Build Step" on.
      Only new builds see it; the live deployment keeps serving. A push to
      `main` before the merge would fail to build (harmless — the old
      deployment stays live).
- [ ] Push `replatform`; open the PR `replatform` → `main`. The PR's preview
      build is the test run of the new layout on Vercel and must succeed. It
      skips the database step.

## Stage 3 — go live (don't use the app from here until the smoke test)

- [ ] Top-up copy: feedback and expenses export → import → verify (Phase 1
      checklist §4, Phase 2 checklist §3). Every line `OK`.
- [ ] Vercel → Environment Variables: replace `CRON_SECRET` (Production)
      with the value from the secrets file. Left until now so the current
      site's nightly job keeps working.
- [ ] Merge the PR (merge commit). Vercel builds `main`, then runs the
      database update that drops the four old sign-in tables — from here the
      old sign-in can't come back without restoring them from the backup.
- [ ] Confirm `20260821031936_drop_nextauth_tables` is in production's
      `_prisma_migrations` (proves `VERCEL_ENV` reached the build).

## Stage 4 — after it's live

- [ ] Re-run both export → import → verify passes once more, before touching any
      imported expense in the app (the re-import would overwrite edits).
- [ ] Smoke test: sign in; capture an expense; trends month total; dashboard
      expenses tile; command palette finds an expense activity; create a
      journal entry; run the cron job from Vercel → Settings → Cron Jobs and
      confirm `journal/active_topic_count` shows on `/dashboard`.
- [ ] Remove the old sign-in settings from Vercel: `NEXTAUTH_SECRET`,
      `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`.
- [ ] Delete `~/.config/polaris/switch-over.env` and `apps/web/scripts/out/`.

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

## Follow-ups noticed on the way

- The dashboard's expenses summary catches Next's "this page is dynamic"
  signal during `next build` and logs it as a failure. Harmless (the route is
  dynamic anyway) but noisy; `unstable_rethrow` in the catch would fix it.
