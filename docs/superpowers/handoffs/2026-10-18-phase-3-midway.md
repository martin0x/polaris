# Handoff — Phase 3 (journal on Convex), paused after Task 10 (2026-10-18)

Read this first. Supersedes `2026-10-18-replatform-next-step.md` for Phase 3
work. The previous session wrote the Phase 3 plan and executed Tasks 1–10 of
14 with `superpowers:subagent-driven-development`; it paused for a
fresh context, not because anything is wrong.

## Resume in one paragraph

Work happens in the worktree `.claude/worktrees/phase-3-journal` (branch
`phase-3-journal`, off `replatform` 33158d3). Invoke
`superpowers:subagent-driven-development` on
`docs/superpowers/plans/2026-10-18-phase-3-journal.md`. Its ledger,
`.superpowers/sdd/2026-10-18-phase-3-journal/progress.md` (inside the
worktree, git-ignored), has `Task <N>: complete` lines for Tasks 1–10 — don't
re-dispatch those. Resume at **Task 11**; record BASE as `git rev-parse HEAD` at dispatch time
(this handoff's own commit sits on top of Task 10's `2b5c42e`; Task 11's first
implementer was stopped before writing anything, so the tree is clean). Then
Tasks 12–14, the final whole-branch review, and
`superpowers:finishing-a-development-branch` (merge target `replatform`,
never `main`).

## Where things stand

| Task | What | State |
|---|---|---|
| 1 | `@polaris/core/search`, `manilaDayStartMs` | complete (bd4e32f) |
| 2 | journal schema, `convex/lib/auth.ts`, topics | complete (272e563) |
| 3 | entries list/create/update/remove | complete (e5aa633) |
| 4 | search | complete (0986c00) |
| 5 | topic stats, tag counts, dashboard, `crons.ts` | complete (828e83c) |
| 6 | `convex/journal/habitBridge.ts` | complete (79c9f18) |
| 7 | `convex/journal/migrations.ts` | complete (cb6c2e4) |
| 8 | copy scripts (driver, import, export, verify) | complete (b5b5af8) |
| 9 | search acceptance script, rehearsal seed | complete (47faf74, one fix round) |
| 10 | palette, dashboard, search/topics/tags pages on Convex | complete (2b5c42e) |
| 11 | reactive Today/topic/tag feeds; writes via Convex | **next** |
| 12 | habits → journal bridge on the web side + test fake | to do |
| 13 | delete Postgres journal code, Vercel cron, `CRON_SECRET` | to do |
| 14 | rehearsal on dev, playbook notes, go-live checklist | to do |

Suites at 2b5c42e: core 91, backend 113, web unit 63, integration 14 files /
84 tests; web build and lint clean. The dev Convex deployment
(`exciting-wolf-282`) holds the journal schema, functions, the nightly cron,
and a copy of the 3 local journal entries (from Task 8's smoke run). Local
Postgres also holds 48 seeded "Rehearsal ·" entries (Task 9) — expected.

## How the previous session ran the loop (keep doing this)

- Briefs: `scripts/task-brief PLAN N` → `task-N-brief.md` in the workspace.
  Every dispatch also points at `constraints.md` in the workspace (the plan's
  Global Constraints + decision log, extracted once) instead of pasting them.
- Implementers on `sonnet` (Task 1 used `haiku`), reviewers on `sonnet`; final
  whole-branch review on the most capable model (`fable` was used for Phase 2's).
- Tell implementers to commit with two `-m` flags so the `Co-Authored-By`
  trailer sits after a blank line (Task 1's commit got it wrong — a deferred
  minor in the ledger).
- After each implementer: `scripts/review-package PLAN BASE HEAD`, dispatch the
  reviewer with brief + report + package paths, resolve any ⚠️ yourself, ledger
  minors as `Task N: minor (deferred): …`.
- The ledger's "Planning rulings" section and every `Ruling:` line must reach
  the user in the final message ("Rulings I made"), with what each costs if
  wrong.

## Things the next session must know

- **Task 11 is UI**: the implementer must read `docs/design/README.md` and
  `docs/design/polaris-design-system.md`; Next is 16.2.4 (check the in-repo
  Next docs before using an unfamiliar API). No component tests exist; the
  ruling is build + lint + the user's smoke test.
- **Task 12** rewrites six habits integration test files onto
  `src/test/fakeJournal.ts`; needs Docker Postgres on 5440 and
  `DATABASE_URL_TEST=postgresql://polaris:polaris@localhost:5440/polaris_test bun run test:integration`.
- **Task 13** removes `CRON_SECRET` from the **dev** Convex deployment only;
  production is the go-live checklist's job.
- **Task 14** rehearses on dev (seed → export → import → verify → acceptance →
  idempotent rerun → clean-slate copy) and writes
  `docs/superpowers/plans/2026-10-18-phase-3-go-live-checklist.md`.
- After the final review and merge into `replatform`, the user needs to do
  **Stage 0 of the go-live checklist**: put the production database address in
  `~/.config/polaris/journal-switch.env` (`chmod 600`, never in chat) so the
  search comparison can run on their real entries against dev. Nothing touches
  production before that.
- Deferred minors so far (all in the ledger) are small: commit-trailer
  formatting on bd4e32f, pre-existing `packages/core` typecheck errors in
  `dates.ts`, a few untested edge paths, the cron test reading a non-public
  field, the acceptance summary's "0 of 0" phrasing. The final review triages them.

## How to work with this user

Unchanged from `2026-10-18-replatform-next-step.md`: plain language, end every
turn that needs them with a numbered "What I need from you" (or "Nothing
needed from you right now" + whether the work is finished), merge commits not
squash, `main` only via a PR they ask for, secrets only in `chmod 600` files
outside the repo.
