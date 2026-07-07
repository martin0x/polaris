# Command palette v1 — design reference

Interactive prototype for the global command palette
(`docs/superpowers/specs/2026-04-26-global-command-palette-design.md`). The
ui-kit's `CommandPalette.jsx` predates that spec — it's a workflow launcher
with none of the drill/scope model. This reference supersedes it for the
palette build; the `.pal-*` visual language carries over.

Open `index.html` in a browser (tokens load from `../tokens-reference.css`,
fonts from Google Fonts — needs network). Everything works from the keyboard:
`⌘K` / `Ctrl-K` toggles, type to search, `↑↓` move, `⇥` drills into the
selected system or topic, `↵` opens (shown as a toast with the target href),
`⌫` on an empty input pops one scope level, `esc` closes. Fixture data mirrors
the real layers: journal `topics → notes`, expenses `activities`.

`?state=` presets for review and screenshots:
`closed · home · query · system · scoped · deep · deep-query · none · loading`

## Design decisions

- **The scope trail is the signature.** `→` in accent, segments in mono; the
  deepest segment is an `--accent-wash` capsule. A `⌫` glyph fades in on the
  capsule only while the input is empty — exactly when Backspace will pop it.
  Same grammar on rows: the active row shows `↵`, a drillable active row adds
  `⇥`. Every keyboard verb surfaces only when it's actually available.
- **Mono owns wayfinding, sans owns content.** Scope trail, group headers,
  provenance meta, and key chips are JetBrains Mono; labels, sublabels, and
  the input are Inter. No serif — the palette is the "command-line" half of
  the brand.
- **System rows show their layer chain** (`topics › notes`) as right-side
  meta, so a system's depth is visible before you drill.
- **Provenance meta (`Engineering Journal · topics`) only at top level.**
  Once scoped, every row shares the same provenance and the trail already
  says it, so scoped rows drop the meta. (Delta from the spec's single row
  template, which always includes it.)
- **Loading is a pulsing accent dot** beside `esc`, echoing the TitleBar sync
  dot, with stale results held per spec. (Delta: spec says "loading spinner.")
- **Empty top-level query shows systems + the hint line only** — no
  cross-system fallback wall of recents (recents are explicitly out of scope
  for v1). Recommendation: the client should skip the fallback fetch when the
  top-level query is empty. Scoped empty queries do show layer defaults
  (recent topics/notes), matching what the real layers return.
- **No trailing `·`** after the last breadcrumb segment (the spec writes
  `→ Engineering Journal · Polaris ·`; the dangling separator reads as a typo
  next to a live input).
- **640px width** per spec (ui-kit CSS says 560px), top at `15vh` per the
  ui-kit shell (the design doc says "40% down the viewport" — flagging the
  discrepancy rather than resolving it silently).
- Motion: 160ms `--ease-spring` pop-in (the system's sanctioned playful
  moment), 120ms list fade on drill/pop, all disabled under
  `prefers-reduced-motion`.

## Implementation notes

- Both shipped systems already declare real layers
  (`src/systems/journal/palette.ts`, `src/systems/expenses/palette.ts`) and
  every icon they reference (`spool`, `file-text`, `receipt`, `book-open`)
  exists in `Icon.tsx`.
- The prototype models the a11y contract: `role="dialog"` + `aria-modal`,
  `role="listbox"`/`role="option"` with `aria-selected`, and
  `aria-activedescendant` on the input, which keeps focus at all times.
- Dark mode not prototyped (secondary per the design doc); every color here
  is a token, so night values come along for free.
