# Landing page type: IBM Plex

**Date:** October 2026 · **Status:** shipped

The public landing page at `/` (and its Open Graph / X card) sets in the
**IBM Plex trio** — Plex Serif, Plex Sans, Plex Mono — while the rest of the
app keeps the platform stack from
[`font-stack-fraunces.md`](./font-stack-fraunces.md).

## What was compared

The owner picked from the July shortlist (Plex trio, Newsreader + Albert
Sans, Literata + Karla, and the v1 Source Serif 4 + Inter) for the landing
page only, keeping the app as is. The Plex trio was the one July set aside as
"cooler than the paper mood wants" inside the app; on a portfolio-facing page
its crisp developer-tool coherence is the point.

## Implementation notes

- Plex Serif (400/500) and Plex Sans (400/500/600) load via `next/font` in
  `src/app/page.tsx`, so only `/` downloads them. They include `latin-ext`
  for the ₱ glyph. Plex Mono comes from the root layout, as everywhere.
- `.lp` in `globals.css` points `--font-serif` / `--font-sans` at them and
  resets `font-family`, so the shared classes on the page (`.lead`, `.btn`,
  `.overline`) follow without per-component changes.
- The card renders from subset static TTFs in `src/app/_og/fonts/` (see its
  README).
- Everything else about the system (tokens, casing, color, the h1 terracotta)
  is unchanged on the landing page.
