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
- [x] Make the Vercel build safe: `vercel-build` now builds first and only
      then updates the database, and preview builds never update it. Before,
      a failed build could still drop the old sign-in tables, and any preview
      build could change the production database.
- [ ] Back up the production database to `~/Backups/polaris/` (no local
      `pg_dump`; it runs inside the `postgres:17` Docker image). Needs
      `NEON_DIRECT_URL` in the secrets file.
- [ ] Remaining production Convex settings: `AUTH_GOOGLE_ID` and
      `AUTH_GOOGLE_SECRET` (copied from dev — same Google client), `CRON_SECRET`
      (freshly generated, also goes into Vercel in stage 3), `ALLOWED_EMAILS`,
      `SITE_URL`.
- [ ] Google Cloud Console: add
      `https://rapid-lapwing-153.convex.site/api/auth/callback/google` to the
      OAuth client's authorized redirect URIs.
- [ ] Sign-in rehearsal: point production Convex `SITE_URL` at
      `http://localhost:3000`, run the web app locally against production
      Convex, sign in. Then set `SITE_URL` to the real address.

## Stage 2 — copy the data (don't use the app from here until stage 4)

- [ ] Feedback: export → import → verify (Phase 1 checklist §4). Every line `OK`.
- [ ] Expenses: export → import → verify (Phase 2 checklist §3). Every line `OK`.

## Stage 3 — go live

- [ ] Vercel → Settings → Environment Variables: add `NEXT_PUBLIC_CONVEX_URL`
      = `https://rapid-lapwing-153.convex.cloud` (Production and Preview), and
      replace `CRON_SECRET` (Production) with the value from the secrets file.
      Must happen before the merge: the merge starts the build, and the build
      bakes `NEXT_PUBLIC_CONVEX_URL` in.
- [ ] Push `replatform`; open the PR `replatform` → `main`.
- [ ] Vercel → Settings → Build and Deployment: Root Directory = `apps/web`,
      and "Include files outside the Root Directory" on.
- [ ] Redeploy the PR's preview. It must build. This is the dry run of the new
      layout on Vercel; previews no longer touch the database.
- [ ] Merge the PR (merge commit). Vercel builds `main`, then runs the
      database update that drops the four old sign-in tables — from here the
      old sign-in can't come back without restoring them from the backup.

## Stage 4 — after it's live

- [ ] Re-run both export → import → verify passes, before touching any
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
