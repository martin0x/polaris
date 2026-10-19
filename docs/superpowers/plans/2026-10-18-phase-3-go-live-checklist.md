# Go-live checklist — journal on Convex (phase 3)

The journal moves from Postgres to Convex in one merge of `replatform` →
`main`. Habits stays on Postgres and writes into the journal through the
bridge until phase 4. This page is the order of work; it copies the shape of
`2026-10-17-switch-over-checklist.md`.

Production Convex is `rapid-lapwing-153`; dev is `exciting-wolf-282`.
Commands run from `apps/web` unless they say `packages/backend`.

## Secrets

The production database address goes in `~/.config/polaris/journal-switch.env`
(outside the repo, `chmod 600`), as `PROD_DATABASE_URL='…'` — the direct Neon
address (the pooled host minus `-pooler`), in single quotes: Neon addresses
contain `&`, which breaks loading the file if the value is unquoted. Load it with
`set -a; . ~/.config/polaris/journal-switch.env; set +a`, pass it as
`DATABASE_URL="$PROD_DATABASE_URL"` to one command at a time, and never print
it. Delete the file when this checklist is done.

## Stage 0 — search check on the real entries (dev; nothing live changes)

Every command here only *reads* production Postgres.

- [x] Clear dev's journal tables: from `apps/web`, `mkdir -p scripts/out &&
      printf '' > scripts/out/empty.jsonl` (`scripts/out` may not exist yet).
      Then from `packages/backend`: `bunx convex import --table <table>
      --replace -y ../../apps/web/scripts/out/empty.jsonl`, run once each for
      `entryTags`, `journalEntries`, `journalTopics` — no `--prod`, so this
      targets dev. The CLI accepts the empty file directly; no dashboard step
      needed.
- [x] Copy production's journal into dev: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/export-journal.ts`,
      then from `packages/backend`: `bun scripts/import-journal.ts ../../apps/web/scripts/out`.
- [x] Verify: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/verify-journal-import.ts` — every line `OK`.
- [x] Search check: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/journal-search-acceptance.ts`
      (add `--queries <file>` with searches you actually make, one per line).
      Read `scripts/out/search-acceptance.md`. Expect misses where you
      searched a different form of a word ("tests" vs "test") — Convex matches
      word beginnings, not word stems. Decide: accept, or ask for the fallback
      (a search index in the browser over the whole journal) before going on.
- [ ] Optional: sign in on a local dev server (`bun run dev`) and use the
      journal against the copy — it's your real data on dev.

## Stage 1 — prepare (nothing live changes)

- [x] `phase-3-journal` merged into `replatform`; every check green there
      (`bun run test`, the integration suite, `bun run build`, `bun run lint`).
- [ ] Back up production Postgres (Docker `postgres:17` image, `pg_dump`, as
      in the 2026-10-17 checklist) to `~/Backups/polaris/`.
- [ ] Push `replatform`; open the PR `replatform` → `main` (merge commit, not
      squash). Wait for the Vercel preview build to pass.

## Stage 2 — go live (don't use the journal or habits at all — no new entries, edits, task ticks, deletes, renames, or archives — until the top-up copy is verified)

- [ ] Pick a time away from 15:00 UTC (the new nightly job) and 23:00 UTC
      (the old Vercel cron, which fails once the next step removes the
      function it reports to — harmless, but noisy).
- [ ] From `packages/backend`, on a checkout of `replatform` at the commit
      being merged: `bunx convex deploy --yes` — so production Convex gets
      exactly the code that's about to go live. Adds the journal tables, the
      bridge, and the nightly job to production; removes
      `feedback.recordMetric`. The live site keeps working on Postgres; its
      journal usage metrics stop being recorded until the merge.
- [ ] Copy: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/export-journal.ts`,
      then from `packages/backend`: `bun scripts/import-journal.ts ../../apps/web/scripts/out --prod`.
- [ ] Verify: `DATABASE_URL="$PROD_DATABASE_URL" bun scripts/verify-journal-import.ts --prod` — every line `OK`.
- [ ] Merge the PR. Vercel builds `main`; there is no database migration in
      this release.
- [ ] Top-up copy straight after the deploy is live: export → import `--prod`
      → verify `--prod` again (picks up anything written to Postgres between
      the copy and the merge). Every line `OK`. **No more copies after
      this** — a copy would overwrite any entries, edits, task ticks,
      deletes, renames, or archives made on the live site in the meantime.
      If `topic rows` or `entry rows` comes back `FAIL` while every
      `live entries in topic ...` line is `OK`, that means rows were created
      natively in Convex since the merge (the counts include those), not a
      bad copy.

## Stage 3 — after it's live

- [ ] Smoke test: Today page shows today's entries; write an entry with a
      `#tag`; tick a task checkbox; edit the entry; delete it; open a topic,
      flip the sort; tags page and a tag page; search a word; ⌘K finds a
      topic and a note (and drills into a topic); dashboard journal card;
      habits: log from the tracker, see it under the habit's topic and as a
      diamond in the habit's row; rename a habit and see the topic renamed.
- [ ] Vercel → Settings → Cron Jobs: none left. Vercel → Environment
      Variables: delete `CRON_SECRET` (Production and Preview).
- [ ] From `packages/backend`: `bunx convex env remove CRON_SECRET --prod`.
- [ ] The day after: the dashboard's System health shows a new
      `active topic count` metric after 15:00 UTC.
- [ ] Delete `~/.config/polaris/journal-switch.env` and `apps/web/scripts/out/`,
      and remove the dead `CRON_SECRET=` line from your local `apps/web/.env`.
      The backup stays.

## If something goes wrong

- **Before the merge:** the live site still runs on Postgres. Production
  Convex has extra journal tables, which is harmless; repeated copies are
  safe (keyed on the old ids). To bring back `feedback.recordMetric` for the
  old site, run `bunx convex deploy --yes` from `packages/backend` on a
  checkout of `main`.
- **After the merge:** Vercel → Deployments → the previous production
  deployment → Instant Rollback, then run `bunx convex deploy --yes` from
  `packages/backend` on a checkout of the pre-merge `main` so the old site's
  metric calls work again. Postgres still has every journal row up to the
  top-up copy; entries written in Convex after the merge have to be copied
  back by hand (there will be few). Habits created after the merge store a
  Convex topic id in `journalTopicId`; on the rolled-back site that shows as
  "Journal topic is missing.", and its "Recreate topic" button creates a new
  Postgres topic rather than finding the Convex one.

## Rehearsal record

Dev rehearsal on 2026-10-18: export found 6 topics, 1 parent link, 51
entries (matches ≈ 6 / 1 / ≈ 51). First import/verify: 39/39 `OK`, exit 0.
Idempotent rerun: every import line `inserted=0`, verify still 39/39 `OK`.
Clean-slate copy: `bunx convex import --table <table> --replace -y` against
an empty file worked directly (no dashboard needed) for all three tables;
reimport showed everything `inserted=`, verify 39/39 `OK` again. Search
acceptance (synthetic seed text — proves the tooling, not the search):
100% recall, 21 of 21 Postgres-nonempty queries missed nothing.

## Stage 0 record

Done on 2026-10-19 against dev. Production's journal exported as 16 topics,
0 parent links, 35 entries (33 live); import inserted 16 + 35; verify 49/49
`OK`, topic and entry rows equal. Search check over 24 queries: Convex found
97% of what Postgres found; 16 of 17 queries with Postgres results missed
nothing. The one miss was "planning" (5 of 7 — the other two use another form of the word,
such as "plan" or "planned"; searching "plan" finds all 7). Convex also found prefixes
("tran", "camp") and words inside links that Postgres missed. Search
accepted.
