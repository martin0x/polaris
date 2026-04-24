# Polaris Design System — canonical reference

**If you are an agent touching any UI, read this directory first.** The rules here
override your training data.

## What's in this folder

- [`polaris-design-system.md`](./polaris-design-system.md) — the full design doc
  (voice, typography, color, spacing, icons, layout). **Source of truth.** Read it
  top-to-bottom before writing any UI code.
- [`tokens-reference.css`](./tokens-reference.css) — the original CSS from the
  design prototype. The tokens in `src/app/globals.css` were ported from this
  file; when they disagree, the prototype wins unless there's a documented reason.
- [`ui-kit-reference/`](./ui-kit-reference/) — the HTML/CSS/JSX prototype of the
  workspace shell (title bar, sidebar, editor pane, command palette, docs, right
  pane). This is a visual target, not code to import.
- [`preview-cards-reference/`](./preview-cards-reference/) — HTML specimens of
  every token and component in the system (color swatches, type specimens,
  buttons, tags, toasts, cards, etc.). Use these as the reference when
  implementing a new component.

## Non-negotiable rules

1. **Use design tokens, never hardcoded values.** Every color, font family, radius,
   shadow, spacing unit, and motion duration exists as a CSS custom property in
   `src/app/globals.css`. Reach for `var(--paper-1)` / `var(--ink-2)` /
   `var(--accent)` / `var(--sp-4)`, not `#faf7ef` / `#4a4439` / `#3c2ea3` / `16px`.

2. **Typography follows the scale.**
   - Display headings (`h1` / `h2` / `h3`) use `var(--font-serif)` (Source Serif 4).
   - UI text (`h4+`, body, buttons, nav) uses `var(--font-sans)` (Inter).
   - Code, kbd, timestamps, tabular numbers use `var(--font-mono)` (JetBrains Mono).
   - `h1` is the terracotta `var(--heading)` color. `h2+` return to ink.

3. **Sentence case everywhere.** Buttons, menu items, section headers — sentence
   case. Title Case is reserved for proper nouns (Polaris, GitHub) and the
   wordmark. No exclamation points anywhere in UI chrome.

4. **No emoji in UI chrome.** Use Lucide SVGs via the `Icon` component
   (`src/app/_components/Icon.tsx`). Emoji may pass through user-authored content,
   never from the platform.

5. **Paper + ink, not white + black.** Surfaces are `var(--paper-0|1|2|3|4)`. Text
   is `var(--ink-0|1|2|3|4|5)`. Pure `#fff` and pure `#000` break the mood.

6. **Hover = color, not opacity.** Shift to `var(--bg-hover)` / `var(--paper-2)`
   on hover; never use `opacity` for interactive state on paper.

7. **Single accent.** `var(--accent)` (Obsidian purple) is used sparingly — links,
   focus rings, selection, primary CTA, active nav item.

8. **Small radii, consistent.** Most surfaces `var(--r-md)` (6px). Cards
   `var(--r-lg)` (10px). Tags / avatars `var(--r-full)`. No extreme rounding.

9. **Shadows are warm, low, papercut.** Use `var(--shadow-xs|sm|md|lg|xl)` — never
   fabricate a new shadow. Never stack shadow + strong border + color together;
   pick two.

10. **Icons are 16px in UI, 14px in dense nav, 20px in hero/empty states.** Never
    below 14px. Stroke 1.5 everywhere. No filled variants.

## Content fundamentals

See the *CONTENT FUNDAMENTALS* section of
[`polaris-design-system.md`](./polaris-design-system.md). Short version: direct,
plain, quietly confident. Second-person ("you") in chrome; first-person ("I") in
notes. Short sentences, verbs up front, concrete nouns. Em dash for asides; no
smart quotes in code.

## Empty and error states

- Empty: short declarative sentence + optional one-line nudge. No illustrations,
  no exclamation points. Example: `No notes yet.` / `Press ⌘N to capture one.`
- Error: name the failure, name the recovery. Never apologize.
  Example: `Could not reach sync server. Working offline — changes are saved locally.`

## Where the tokens live in this repo

- CSS: `src/app/globals.css` (also exposes a `@theme` block for Tailwind v4 utilities).
- Icon set: `src/app/_components/Icon.tsx` (Lucide paths, stroke 1.5, currentColor).
- Brand glyph: `src/app/_components/PolarisGlyph.tsx` + `public/brand/*.svg`.
- Shell primitives: `src/app/_components/TitleBar.tsx`, `.../Sidebar.tsx`, plus
  the `.app-shell` / `.body` / `.sidebar` / `.main` / `.content` / `.doc` /
  `.paper-card` / `.btn` / `.task-row` classes in `globals.css`.

## When you add something new

- Reuse existing tokens and classes before inventing.
- If you need a token that doesn't exist, add it to `globals.css` **and** document
  its reason in that file's comments — don't inline-style a raw value.
- If you need an icon that isn't in `Icon.tsx`, copy the path from
  `public/icons/<name>.svg` (Lucide source) and add it to the `PATHS` map.
- Match the prototype in `ui-kit-reference/` pixel-perfectly before you innovate.
  If you want to change the system, flag it — don't drift silently.
