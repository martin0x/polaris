# Design decisions

Records of visual/UI decisions where more than one option was seriously weighed.
Each entry captures what was compared and which option shipped, so the trade-off
doesn't have to be re-argued from memory.

- [`font-stack-fraunces.md`](./font-stack-fraunces.md) — the platform type
  stack: five trios rendered on live screens and compared side by side.
  **Fraunces + Plus Jakarta Sans + IBM Plex Mono shipped** (July 2026),
  replacing Source Serif 4 + Inter + JetBrains Mono.
- [`trends-chart-svg-vs-recharts.html`](./trends-chart-svg-vs-recharts.html) —
  Expenses Trends chart: a custom ~100-line SVG we'd own vs. Recharts, rendered
  side by side on the same sample data. **Recharts shipped** (June 2026); the live
  component is `src/systems/expenses/components/TrendsChart.tsx`. Open the file in a
  browser to compare (it loads Recharts and fonts from CDNs).
