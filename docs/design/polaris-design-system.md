# Polaris Design System

> **Polaris** is a personal operating system — a continuously evolving, developer-owned platform for building and refining productivity systems tailored to one person's life. In the era of LLMs and AI-assisted development, software is cheap to write and rewrite. Polaris leans into that by being customizable at the source-code level: no plugins, no config files — just well-organized code you modify directly.

This document is the design system for Polaris: the foundations (colors, type, spacing), the visual + content rules, and a reusable UI kit for mocking new ideas fast.

---

## Sources

This system was designed from scratch against **three stated inspirations** — no existing codebase, Figma, or brand materials were provided. If these resources exist and you're reviewing this doc, please re-attach and we'll re-ground the system.

- **Notion** — interactivity and simplicity (sidebar + document layout, slash-commands, quiet chrome).
- **Obsidian** — default markdown color palette (warm terracotta H1, purple accent, pink tags, blue wikilinks, warm paper background in some themes).
- **Anthropic** — editorial humanist warmth (Source Serif-style display, cream tones, restrained utilitarian UI).

**Polaris identity (as of this v1):** warm paper + ink, Obsidian-purple accent, humanist serif headings over a clean sans UI, crisp developer-tool energy, medium density, subtle iconography only.

---

## At a glance

| | |
|---|---|
| **Mood** | Crisp, utilitarian, developer-owned — a library you live in |
| **Primary surface** | Light (warm paper `#fbf9f4`); dark (`#1c1b20`) is secondary |
| **Accent** | Obsidian purple `#7c6cf0` |
| **Display face** | Source Serif 4 (humanist) |
| **UI face** | Inter (sans) |
| **Mono face** | JetBrains Mono |
| **Density** | Medium (Notion-like) |
| **Illustration** | None — subtle iconography only |

---

## Index / Manifest

**Root**
- [`README.md`](./README.md) — this doc
- [`colors_and_type.css`](./colors_and_type.css) — all CSS custom properties + semantic element styles. Import this anywhere.
- [`SKILL.md`](./SKILL.md) — Agent Skills manifest (for Claude Code compatibility)

**Assets** — `assets/`
- `polaris-glyph.svg` — the four-point north-star mark (square)
- `polaris-wordmark.svg` — glyph + "Polaris" wordmark (light)
- `polaris-wordmark-dark.svg` — dark-mode wordmark
- `icons/` — Lucide SVG set (used throughout)

**Preview cards** — `preview/`
- Individual HTML cards registered in the Design System tab (palette swatches, type specimens, components, etc).

**UI Kit** — `ui_kits/workspace/`
- `index.html` — interactive click-through prototype of the core Polaris workspace
- `*.jsx` — modular React components (sidebar, editor, command palette, etc.)
- `README.md` — inventory + how to compose

---

## CONTENT FUNDAMENTALS

Polaris is software for **one person** — the developer-owner. The voice should sound like something you'd write in your own notes, not marketing copy. Think: a friend who also happens to be an engineer, talking to future-you.

### Voice
- **Direct, plain, quietly confident.** No marketing adjectives. No hype.
- **Second-person ("you") in in-product copy, first-person ("I") in notes/journal surfaces.** The app talks to you; your notes are in your voice.
- **Short sentences. Verbs up front.** "Capture a thought." — not "Start capturing thoughts today."
- **Prefer concrete nouns** over abstract ones. "Note," "task," "log" — not "item," "entry," "record."

### Casing
- **Sentence case everywhere.** Buttons, menu items, section headers. Not Title Case.
- The **only** Title Case exceptions: proper nouns (Polaris, GitHub), acronyms (API, JSON, URL), the wordmark.
- Overlines / eyebrow labels use UPPERCASE with wide tracking — reserved for a max of 2–3 per screen.

### Examples

| ✅ do | ❌ avoid |
|---|---|
| `Capture a thought` | `Start Capturing Your Thoughts!` |
| `Open note` | `Open This Note` |
| `7 tasks due today` | `You have 7 tasks that are due today` |
| `# inbox` (a tag) | `#Inbox` |
| `Ready when you are.` (empty state) | `🎉 Get started by clicking below!` |
| `Could not sync — retrying` | `Oops! Something went wrong 😕` |

### Emoji & punctuation
- **No emoji in UI chrome.** Icons are SVG. Emoji may appear in a user's own notes because users type them — but the product never emits them.
- **Em dash** (`—`) for asides, not parentheticals. **En dash** for ranges (`Mon–Fri`).
- Smart quotes (`“ ” ’`) in display serif; straight quotes are fine in code/mono.
- Oxford commas, always.

### Empty states
Short declarative sentence + optional one-line nudge. No illustrations, no exclamation points.
> `No notes yet.` <br> `Press ⌘N to capture one.`

### Error copy
Name the failure, name the recovery. Never apologize.
> `Could not reach sync server. Working offline — changes are saved locally.`

---

## VISUAL FOUNDATIONS

Polaris looks like a **warm paper notebook rendered by a command-line tool**. Every choice bends toward that.

### Color
- **Paper series** (`--paper-0` → `--paper-4`): warm ivory base. `#fbf9f4` is page; `#f6f2e9` is raised; progressively warmer/deeper from there. These are intentionally off-white — a pure `#fff` breaks the mood.
- **Ink series** (`--ink-0` → `--ink-5`): near-black with a **warm bias** (hex starts `#1d1b17`, not `#000`). Muted greys tint warm too.
- **Accent**: single Obsidian purple `#7c6cf0`. One accent, used sparingly — links, focus rings, selection, primary CTA, active nav item.
- **Semantic colors lifted from Obsidian's markdown palette**: terracotta H1 (`--heading`), pink tags (`--tag`), slate-blue wikilinks (`--link`), ochre highlights (`--mark`). This is the single biggest branding move.
- **Dark mode is secondary.** Same hues, shifted onto a neutral near-black with slight violet cast (`#1c1b20`). Not pure black.

### Type
- **Display = Source Serif 4** (humanist serif, warm, readable at large sizes). Used for H1–H3 and blockquotes.
- **UI = Inter** — headings H4+, body, buttons, labels, form controls.
- **Mono = JetBrains Mono** — code, kbd chips, shortcuts, any tabular data.
- H1 is the **warm terracotta** from Obsidian (`--heading: #8a5a3a`), not neutral ink. H2+ return to ink.
- Scale is a light 1.2 ratio (see `--fs-*`). Body is 14.5px (medium density).
- `text-wrap: pretty` on prose. Tight tracking on display, normal on body.

### Spacing
- **4px base grid.** Tokens `--sp-0` through `--sp-20`. Favor multiples of 4.
- Medium density: card padding `--sp-4` (16px), section gaps `--sp-8` (32px), full-page gutter `--sp-10` (40px).
- Row height for list items: 28–32px. Nav item: 28px.

### Backgrounds
- **Solid paper**, always. No full-bleed imagery. No photography. No illustration.
- **No gradients** in surfaces. Exception: a subtle radial vignette on marketing hero if ever needed (low priority).
- **No repeating patterns or textures.** The warmth comes from the color itself, not a noise overlay.

### Borders & dividers
- **1px solid `--border` (`#e7dfcd`)** — low-contrast, inherits the paper warmth.
- **Rarely use dividers** — whitespace first, divider second.
- Inside inputs: 1px `--border-strong`. Focused: 1px `--accent` + `--ring`.

### Corner radii
- **Small radii, consistent.** Most surfaces `--r-md: 6px`. Cards `--r-lg: 10px`. Buttons `--r-md: 6px`. Inputs `--r-md: 6px`. Tags `--r-full`. Avatars `--r-full`. Code inline `--r-xs: 3px`.
- **No extreme rounding** — we are a tool, not a toy.

### Shadows
- **Warm, low, papercut.** Shadows are tinted (`rgba(40, 32, 20, X)`) not black. See `--shadow-xs` → `--shadow-xl`.
- Cards rest at `--shadow-sm`. Popovers at `--shadow-md`. Modal at `--shadow-lg`. Everything else at `--shadow-xs` or none.
- **Inner shadow** (`--shadow-inset`) on sunken inputs for a slight press-in effect — subtle.

### Cards
- Background: `--bg-raised` (`--paper-1`).
- Border: 1px `--border`.
- Radius: `--r-lg` (10px).
- Shadow: `--shadow-sm`.
- Padding: `--sp-4` (16px) small, `--sp-6` (24px) comfortable.
- **Never** use shadow + strong border + color at once. Pick two.

### Hover states
- **Backgrounds:** shift to `--bg-hover` (`--paper-2`) — one step warmer/darker.
- **Text links:** darken to `--link-hover`.
- **Icon buttons:** background fills to `--bg-hover`, icon color unchanged.
- **Never use opacity** for hover — it feels washed out on paper. Always a real color.

### Active / pressed states
- **Background:** `--bg-active` (`--paper-3`) — one step deeper than hover.
- **No shrink / scale transforms.** A subtle 1px translate-y is OK on big CTAs. Not on everyday buttons.
- Press produces *color* change, not geometry change.

### Focus states
- **Always `--ring`** — 3px `rgba(124, 108, 240, 0.25)` halo. Never a chunky border swap.
- Focus outline is **visible on keyboard nav only** (`:focus-visible`).

### Transparency & blur
- **Rarely.** Reserved for modal scrims (`rgba(29, 27, 23, 0.4)`) and command-palette backdrops.
- **No glass / frosted-blur chrome.** It conflicts with paper.

### Animation
- **Fast, quiet, purposeful.** `--dur-fast: 120ms` for hover/press, `--dur-med: 200ms` for UI transitions, `--dur-slow: 320ms` for entrance.
- **Easing:** `--ease-out` for reveals, `--ease-in-out` for state changes, `--ease-spring` sparingly for playful moments (command palette pop-in).
- **No bounce on everyday elements.** No parallax. No ambient motion.
- Page-level fades: never longer than 320ms.

### Layout
- **Sidebar + content** is the canonical shape. Sidebar 240–280px.
- **Command palette** centered, max-width 640px, 40% down the viewport.
- **Max content width: 720px** for prose; unbounded for tool views.
- Fixed elements: the **title bar** (app chrome, 36px) and the **sidebar**. Everything else scrolls.
- Sticky headers on long documents: `position: sticky; top: 36px; background: var(--bg); border-bottom: 1px solid var(--border)`.

### Imagery (when it exists)
- Avoid. If unavoidable (e.g. embedded links): **warm cast**, slight desaturation (~85%), no grain overlays. Black-and-white is preferred to full color.

### Protection gradients vs capsules
- **Capsules** — tags, status pills, kbd chips. Always with a solid or wash background, never gradient.
- **Protection gradients** — not used. If text needs to sit on a non-solid surface, we use a solid scrim, not a fade.

---

## ICONOGRAPHY

Polaris uses **[Lucide](https://lucide.dev)** icons as its baseline set.

### Why Lucide
- Consistent 1.5px stroke — matches the crisp utilitarian mood.
- Large set (1500+), actively maintained.
- Optically close to the Obsidian icon language (which is also Lucide-based!) — this is a meaningful alignment, not a coincidence.

### Rules
- **Default size:** 16px in UI (matches `--fs-md`). 14px in dense nav. 20px in hero/empty states. Never below 14px.
- **Stroke width:** 1.5px everywhere. Do not mix weights.
- **Color:** `currentColor` — icons inherit from text. `--fg-muted` in nav, `--fg` on hover, `--accent` when active.
- **Never fill.** Lucide is a stroke set; filled variants break the rhythm.
- **No emoji in UI chrome.** Emoji are allowed to pass through user-authored note content, but we never emit them.
- **No unicode as icons** (⌘ and ↵ excepted — they appear in kbd chips because they *are* the keys).

### Source
- CDN-available, no substitution needed: `https://unpkg.com/lucide-static@latest/icons/<name>.svg`
- A curated subset is copied to `assets/icons/` so UI kits load offline.

### Starter set used throughout
`search`, `plus`, `settings`, `sidebar`, `file-text`, `folder`, `hash` (tags), `link-2` (wikilinks), `star`, `command`, `arrow-right`, `chevron-down`, `chevron-right`, `check`, `x`, `circle`, `square`, `list`, `calendar`, `clock`, `terminal`, `git-branch`, `more-horizontal`.

### Logos
- `assets/polaris-glyph.svg` — the north-star compass rose. Four-point star with a tiny inner dot (horizon point). Single color, flat.
- `assets/polaris-wordmark.svg` — glyph + "Polaris" in Source Serif 4.
- `assets/polaris-wordmark-dark.svg` — inverted for dark surfaces.

**The glyph is the single most important brand asset.** It's a literal "polaris" (north star) — reference to finding your way — rendered in the one accent color. Use it:
- At 16px in app title bar.
- At 32–64px on loading/splash.
- Never skewed, gradient-filled, or recolored outside the accent family.

---

## Typography specimens and palette swatches

See the Design System tab for live cards — each is also a file in `preview/`.

---

## Font substitutions — flag for the user

These fonts are loaded from **Google Fonts** (no local `.ttf` files bundled). If you have licensed files you'd prefer to self-host, drop them in `fonts/` and swap the `@import` in `colors_and_type.css`.

| Role | Using | Alternatives considered |
|---|---|---|
| Display serif | **Source Serif 4** (Google Fonts) | iA Quattro, Charter, Iowan Old Style |
| UI sans | **Inter** (Google Fonts) | IBM Plex Sans, SF Pro |
| Mono | **JetBrains Mono** (Google Fonts) | Berkeley Mono, iA Mono, Cascadia |

Source Serif 4 is the closest humanist match to Anthropic's editorial feel available on Google Fonts. Inter is a neutral choice; swap for something more distinctive if you want more character. All three are sitting on the CDN — no local font files yet.
