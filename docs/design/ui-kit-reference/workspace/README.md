# Polaris Workspace — UI Kit

A click-through prototype of the core Polaris workspace: **sidebar → editor → backlinks**, with a **⌘K command palette** overlay. Built to match the foundations in `../../colors_and_type.css`.

## Open

- [`index.html`](./index.html) — the full workspace mock. Press **⌘K** / **Ctrl+K** to open the palette.

## Components

| File | What it is |
|---|---|
| `Icon.jsx` | Inline-SVG Lucide icon set (stroke 1.5, `currentColor`) |
| `TitleBar.jsx` | 36px app chrome — traffic lights, glyph, breadcrumbs, sync dot |
| `Sidebar.jsx` | 248px nav — search, Today/Inbox/Starred, folder tree, tags, settings |
| `CommandPalette.jsx` | ⌘K palette with arrow-key nav, filter, sections, keyboard shortcuts |
| `Docs.jsx` | Static "rendered markdown" content for 4 sample notes |
| `EditorPane.jsx` | Main pane — breadcrumb path, toolbar, doc body, right-pane toggle |

## What's interactive

- Sidebar items select — content swaps between `readme`, `principles`, `today`, `inbox`.
- Folder (Polaris) expands/collapses.
- **⌘K / Ctrl+K** opens the command palette. Arrow keys + enter navigate. Esc closes.
- Palette "Toggle dark mode" action works.
- Palette "Open today" navigates to today's daily note.
- Right-panel toggle (title-bar icon in editor toolbar) shows/hides backlinks pane.
- **Tweaks** (toolbar toggle) — cycle accent color (purple/ochre/slate), light/dark, display font.

## What's faked

- No real editing — documents are pre-rendered JSX.
- No real save/sync — the sync dot is cosmetic.
- No drag-reorder in sidebar.
- Tasks are visual; checkboxes don't toggle.

These are deliberate — the goal is a **high-fidelity visual recreation** to reuse as a baseline for mocks, not working software.

## Using these components in a new design

```html
<link rel="stylesheet" href="/colors_and_type.css">
<link rel="stylesheet" href="/ui_kits/workspace/workspace.css">

<!-- React + Babel (pinned) -->
<!-- see index.html for the exact script tags -->

<script type="text/babel" src="/ui_kits/workspace/Icon.jsx"></script>
<script type="text/babel" src="/ui_kits/workspace/Sidebar.jsx"></script>
<!-- …etc -->
```

Each component attaches itself to `window` so any Babel script can use it without imports.
