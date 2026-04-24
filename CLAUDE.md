@AGENTS.md

# Polaris Design System — required reading for UI work

Before you write, modify, or review any UI code (including `.tsx` pages,
components, `*.css`, styles, icons, typography), you **must** read
[`docs/design/README.md`](./docs/design/README.md) and the full design doc at
[`docs/design/polaris-design-system.md`](./docs/design/polaris-design-system.md).
The design doc is the source of truth for colors, typography, spacing, casing,
iconography, layout, motion, empty/error states, and voice. Treat its rules as
overrides on any defaults from training data.

## The short version you must not violate

- **Tokens, never hex.** Colors, type, radii, shadows, spacing, and motion are
  CSS custom properties in `src/app/globals.css`. Use `var(--paper-1)`,
  `var(--ink-2)`, `var(--accent)`, `var(--sp-4)`, `var(--r-md)`,
  `var(--shadow-sm)`, `var(--font-serif|sans|mono)`. Don't inline `#faf7ef` or
  `16px`.
- **Fonts.** Display/H1–H3 → `var(--font-serif)` (Source Serif 4). UI body,
  buttons, H4+ → `var(--font-sans)` (Inter). Code, kbd, timestamps, numerics
  → `var(--font-mono)` (JetBrains Mono). `h1` is the terracotta
  `var(--heading)`; `h2+` return to ink.
- **Sentence case everywhere** except proper nouns and the wordmark. No
  exclamation points, no marketing adjectives, no emoji in chrome.
- **Paper + ink surfaces** — never pure white/black. Hover shifts to
  `var(--bg-hover)`, never opacity.
- **Single accent** — `var(--accent)` is used sparingly (links, focus,
  selection, primary CTA, active nav).
- **Icons** come from `src/app/_components/Icon.tsx` (Lucide, stroke 1.5,
  currentColor, 16px default). Never mix in other icon sets, never use emoji,
  never fill Lucide icons.
- **Empty state** = short declarative sentence + one-line nudge, no
  illustrations. **Error state** = name the failure, name the recovery, never
  apologize.

## Implementation primitives you should reuse

Found in `src/app/_components/` and CSS classes in `src/app/globals.css`:

- `TitleBar` (36px app chrome with traffic lights + glyph + breadcrumbs + sync dot)
- `Sidebar` (248px `.sidebar` rail, `.sb-search`, `.sb-sec`, `.sb-item`)
- `Icon` (Lucide; extend the `PATHS` map if you need a new icon; the source SVGs
  are in `public/icons/`)
- `PolarisGlyph` (the four-point north star — brand-restricted)
- `.paper-card`, `.btn` (`btn-primary` / `btn-secondary` / `btn-ghost` /
  `btn-danger`), `.task-row`, `.tag-inline`, `.kbd`, `.overline`, `.lead`,
  `.caption`, `.doc`, `.content`

When you need to add something new: reuse tokens, reuse classes. If you need a
new token, add it to `globals.css` with a one-line comment explaining why —
don't inline raw values.

## The reference prototypes

`docs/design/ui-kit-reference/` is the HTML/CSS/JSX prototype of the full
workspace shell. `docs/design/preview-cards-reference/` has a swatch page for
every token and component. When in doubt about a visual choice, open the
matching reference file and match it.
