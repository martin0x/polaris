# Font stack: Fraunces / Plus Jakarta Sans / IBM Plex Mono

**Date:** July 2026 · **Status:** shipped

The v1 stack (Source Serif 4 / Inter / JetBrains Mono) shipped with an
explicit invitation in the design doc: Inter was "a neutral choice; swap for
something more distinctive if you want more character." This decision took it.

## What was compared

Four complete trios plus the v1 baseline, each applied to the **live app** via
CSS-variable overrides (no code changes) and screenshotted on the same three
screens (dashboard, journal topic page, topics shelf):

1. **Baseline** — Source Serif 4 + Inter + JetBrains Mono
2. **IBM Plex trio** — Plex Serif + Plex Sans + Plex Mono. One superfamily,
   crisp developer-tool coherence; cooler than the paper mood wants.
3. **Fraunces + Plus Jakarta Sans + IBM Plex Mono** — warm old-style display
   serif with real character; rounder, friendlier UI face. ← **shipped**
4. **Newsreader + Albert Sans + JetBrains Mono** — literary and refined, but
   visually closest to the baseline; least payoff for a switch.
5. **Literata + Karla + Spline Sans Mono** — bookish long-reading feel;
   subtler personality shift.

See [`font-stack-comparison-topic.png`](./font-stack-comparison-topic.png)
for all five rendered on the topic page (the dashboard and shelf sheets were
reviewed too but only this one is checked in).

## Why Fraunces won

- The display serif is where Polaris shows its face (H1–H3, blockquotes, the
  dashboard daily line); Fraunces makes it unmistakable while staying warm.
- Plus Jakarta Sans keeps UI text quiet but sheds Inter's anonymity.
- IBM Plex Mono reads slightly softer than JetBrains Mono next to the
  old-style serif.

## Implementation notes

- Loaded via `next/font` in `src/app/layout.tsx`: Fraunces with
  `axes: ["opsz"]` and true italics (entry blockquotes are italic serif —
  don't let the browser synthesize); IBM Plex Mono is a static family and
  needs explicit weights (400/500/600).
- Token fallbacks updated in `src/app/globals.css`
  (`--font-serif/sans/mono`); nothing else in the app changes — every
  component reads the tokens.
- To re-run the comparison, see the harness described in the session that
  produced it: override `--font-serif/sans/mono` in `:root` with a Google
  Fonts `@import` via an injected style tag, wait for `document.fonts.ready`,
  screenshot.
