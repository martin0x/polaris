# Self-host fonts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polaris builds never fetch Google Fonts: all five families load through `next/font/local` from files committed in `apps/web/src/app/_fonts/`, with the same rendering as today.

**Architecture:** The three app fonts (Fraunces, Plus Jakarta Sans, IBM Plex Mono) only ever used Google's `latin` subset, so their committed files are Google's own `latin` woff2 files, byte for byte. The two landing-page fonts (IBM Plex Serif, IBM Plex Sans) used `latin` + `latin-ext` (for ₱), and `next/font/local` can't split one weight across unicode-range files, so those are cut once with fontTools from the google/fonts repo sources into single files covering both ranges. A vitest guard fails if any source file imports `next/font/google` again.

**Tech Stack:** Next.js 16.2.4 (`next/font/local`), Bun workspaces, Vitest, fontTools 4.67 + brotli (one-off, in a scratch venv — not a project dependency), headless Chrome for before/after screenshots.

**Spec:** the problem and decision are recorded in `docs/superpowers/plans/2026-10-17-switch-over-checklist.md` → "Known flaky build: Google Fonts" (Next.js [#99114](https://github.com/vercel/next.js/issues/99114): Google Fonts sometimes returns `/l/font?kit=…&skey=…` URLs and Next 16.2.4 fails the build on them).

## Global Constraints

- Branch `self-host-fonts` off `replatform`; merge back into `replatform`. Never commit to `main`.
- UI rules (read `docs/design/README.md` and `docs/design/polaris-design-system.md` first): tokens only, no new raw values in CSS; the font tokens `--font-serif/sans/mono` in `apps/web/src/app/globals.css` keep reading the same CSS variables.
- The CSS variable names do not change: `--font-fraunces`, `--font-jakarta`, `--font-plex-mono`, `--font-plex-serif`, `--font-plex-sans`.
- Next.js docs for this version are in `node_modules/.bun/next@16.2.4*/node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` — `next/font/local` takes `src` (string, or `Array<{path, weight?, style?}>`), `weight` (`"100 900"` for a variable range), `variable`, `display`, `adjustFontFallback` (`"Arial"` default, or `"Times New Roman"`).
- Unicode ranges, copied verbatim from Google's CSS today:
  - `latin` = `U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD`
  - `latin-ext` = `U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF`
- Commands: `bun run test` (never `bun test`); web suite only: `bun run --cwd apps/web test`.
- Work directory for downloads, the venv, and screenshots (never committed):
  `WORK=/private/tmp/claude-501/-Users-raymartvillos-Projects-polaris/6581d234-b4c3-42f3-9ead-62ed7f42fc86/scratchpad/fonts-work`

## File structure

| Path | Responsibility |
|---|---|
| `apps/web/src/app/_fonts/*.woff2` (9 files) | The self-hosted font files |
| `apps/web/src/app/_fonts/OFL-*.txt` (3 files) | SIL Open Font License for each family (required to redistribute) |
| `apps/web/src/app/_fonts/README.md` | What each file is, where it came from, how to regenerate it |
| `apps/web/src/app/_fonts/fonts.test.ts` | Guard: every file is woff2; nothing imports `next/font/google` |
| `apps/web/src/app/layout.tsx` | App fonts → `next/font/local` |
| `apps/web/src/app/page.tsx` | Landing fonts → `next/font/local` |
| `apps/web/src/app/globals.css` | Comment only (line 84–85) |
| `docs/design/polaris-design-system.md`, `docs/design/decisions/font-stack-fraunces.md`, `docs/design/decisions/landing-page-plex.md` | Say the fonts are self-hosted now |

The nine font files:

| File | Family | Coverage | Axes / weight | Source |
|---|---|---|---|---|
| `Fraunces-latin.woff2` | Fraunces | latin | opsz 9–144, wght 100–900 | Google CSS API, verbatim |
| `Fraunces-Italic-latin.woff2` | Fraunces italic | latin | opsz 9–144, wght 100–900 | Google CSS API, verbatim |
| `PlusJakartaSans-latin.woff2` | Plus Jakarta Sans | latin | wght 200–800 | Google CSS API, verbatim |
| `IBMPlexMono-Regular-latin.woff2` | IBM Plex Mono | latin | 400 | Google CSS API, verbatim |
| `IBMPlexMono-Medium-latin.woff2` | IBM Plex Mono | latin | 500 | Google CSS API, verbatim |
| `IBMPlexMono-SemiBold-latin.woff2` | IBM Plex Mono | latin | 600 | Google CSS API, verbatim |
| `IBMPlexSans-latin-latinext.woff2` | IBM Plex Sans | latin + latin-ext | wght 100–700 (wdth pinned 100) | google/fonts `ofl/ibmplexsans/IBMPlexSans[wdth,wght].ttf`, cut |
| `IBMPlexSerif-Regular-latin-latinext.woff2` | IBM Plex Serif | latin + latin-ext | 400 | google/fonts `ofl/ibmplexserif/IBMPlexSerif-Regular.ttf`, cut |
| `IBMPlexSerif-Medium-latin-latinext.woff2` | IBM Plex Serif | latin + latin-ext | 500 | google/fonts `ofl/ibmplexserif/IBMPlexSerif-Medium.ttf`, cut |

---

### Task 1: Commit the font files, licences, and README

**Files:**
- Create: `apps/web/src/app/_fonts/` — the 9 woff2 files above, `OFL-Fraunces.txt`, `OFL-PlusJakartaSans.txt`, `OFL-IBMPlex.txt`, `README.md`
- Test: `apps/web/src/app/_fonts/fonts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the nine file names in the table above, exactly as spelled, in `apps/web/src/app/_fonts/`. Task 2's loaders reference them by these paths.

- [ ] **Step 1: Branch, and capture "before" screenshots (the current Google-loaded fonts)**

```bash
cd /Users/raymartvillos/Projects/polaris && git switch -c self-host-fonts replatform
WORK=/private/tmp/claude-501/-Users-raymartvillos-Projects-polaris/6581d234-b4c3-42f3-9ead-62ed7f42fc86/scratchpad/fonts-work
mkdir -p "$WORK"
cd apps/web && bun run build   # if it fails with "queries have exactly one entry", that's the Google flake — rerun
(bunx next start -p 3100 > "$WORK/start-before.log" 2>&1 &) ; sleep 4
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for p in "/:landing" "/auth/signin:signin"; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,2400 \
    --virtual-time-budget=8000 --screenshot="$WORK/before-${p##*:}.png" "http://localhost:3100${p%%:*}" 2>/dev/null
done
pkill -f "next start -p 3100"
ls -la "$WORK"/before-*.png
```

Expected: `before-landing.png` and `before-signin.png`, each tens of KB or more.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/app/_fonts/fonts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FONTS_DIR = dirname(fileURLToPath(import.meta.url));

// Every file the loaders in app/layout.tsx and app/page.tsx point at.
const FONT_FILES = [
  "Fraunces-latin.woff2",
  "Fraunces-Italic-latin.woff2",
  "PlusJakartaSans-latin.woff2",
  "IBMPlexMono-Regular-latin.woff2",
  "IBMPlexMono-Medium-latin.woff2",
  "IBMPlexMono-SemiBold-latin.woff2",
  "IBMPlexSans-latin-latinext.woff2",
  "IBMPlexSerif-Regular-latin-latinext.woff2",
  "IBMPlexSerif-Medium-latin-latinext.woff2",
];

describe("self-hosted fonts", () => {
  it.each(FONT_FILES)("%s is a woff2 file", (name) => {
    const bytes = readFileSync(join(FONTS_DIR, name));
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run --cwd apps/web test -- src/app/_fonts/fonts.test.ts`
Expected: FAIL — 9 failures with `ENOENT: no such file or directory`.

- [ ] **Step 4: Set up the fontTools venv**

```bash
WORK=/private/tmp/claude-501/-Users-raymartvillos-Projects-polaris/6581d234-b4c3-42f3-9ead-62ed7f42fc86/scratchpad/fonts-work
python3 -m venv "$WORK/venv" && "$WORK/venv/bin/pip" install -q fonttools==4.67.0 brotli pillow
"$WORK/venv/bin/python" -c "import fontTools, brotli, PIL; print('ok', fontTools.version)"
```

Expected: `ok 4.67.0`

- [ ] **Step 5: Download the six app-font files verbatim from Google**

Save as `$WORK/fetch_app_fonts.py` and run it. It requests exactly the URLs Next 16.2.4's `next/font/google` builds for today's config, with Next's User-Agent, and keeps only the `/* latin */` faces. It refuses `/l/font?kit=` URLs (the flaky shape) — just rerun if that happens.

```python
import re, sys, urllib.request
OUT = sys.argv[1]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36"
WANT = {
    # css2 family query -> {(style, weight): output file}
    "Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900": {
        ("normal", "100 900"): "Fraunces-latin.woff2",
        ("italic", "100 900"): "Fraunces-Italic-latin.woff2",
    },
    "Plus+Jakarta+Sans:wght@200..800": {("normal", "200 800"): "PlusJakartaSans-latin.woff2"},
    "IBM+Plex+Mono:wght@400;500;600": {
        ("normal", "400"): "IBMPlexMono-Regular-latin.woff2",
        ("normal", "500"): "IBMPlexMono-Medium-latin.woff2",
        ("normal", "600"): "IBMPlexMono-SemiBold-latin.woff2",
    },
}
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})).read()
for query, files in WANT.items():
    css = get(f"https://fonts.googleapis.com/css2?family={query}&display=swap").decode()
    for subset, body in re.findall(r"/\* (\S+) \*/\s*@font-face \{(.*?)\}", css, re.S):
        if subset != "latin":
            continue
        key = (re.search(r"font-style: (\w+)", body)[1], re.search(r"font-weight: ([\d ]+);", body)[1])
        if key not in files:
            continue
        url = re.search(r"url\((.*?)\)", body)[1]
        if "/l/font" in url:
            sys.exit(f"Google returned a kit URL for {files[key]} — rerun")
        data = get(url)
        assert data[:4] == b"wOF2", files[key]
        open(f"{OUT}/{files.pop(key)}", "wb").write(data)
        print("saved", url.rsplit("/", 1)[1][-16:], "->", key)
    assert not files, f"missing from Google's CSS: {files}"
```

```bash
cd /Users/raymartvillos/Projects/polaris
"$WORK/venv/bin/python" "$WORK/fetch_app_fonts.py" apps/web/src/app/_fonts
```

Expected: six `saved … -> (style, weight)` lines.

- [ ] **Step 6: Cut the three landing-font files from the google/fonts sources**

```bash
cd "$WORK"
RAW=https://raw.githubusercontent.com/google/fonts/main/ofl
curl -sfL -o IBMPlexSans-VF.ttf      "$RAW/ibmplexsans/IBMPlexSans%5Bwdth,wght%5D.ttf"
curl -sfL -o IBMPlexSerif-Regular.ttf "$RAW/ibmplexserif/IBMPlexSerif-Regular.ttf"
curl -sfL -o IBMPlexSerif-Medium.ttf  "$RAW/ibmplexserif/IBMPlexSerif-Medium.ttf"
U="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF"
DEST=/Users/raymartvillos/Projects/polaris/apps/web/src/app/_fonts
"$WORK/venv/bin/fonttools" varLib.instancer IBMPlexSans-VF.ttf wdth=100 -o IBMPlexSans-wdth100.ttf -q
"$WORK/venv/bin/pyftsubset" IBMPlexSans-wdth100.ttf --unicodes="$U" --layout-features='*' --flavor=woff2 --output-file="$DEST/IBMPlexSans-latin-latinext.woff2"
"$WORK/venv/bin/pyftsubset" IBMPlexSerif-Regular.ttf --unicodes="$U" --layout-features='*' --flavor=woff2 --output-file="$DEST/IBMPlexSerif-Regular-latin-latinext.woff2"
"$WORK/venv/bin/pyftsubset" IBMPlexSerif-Medium.ttf  --unicodes="$U" --layout-features='*' --flavor=woff2 --output-file="$DEST/IBMPlexSerif-Medium-latin-latinext.woff2"
```

Expected: no errors (a `meta NOT subset … dropped` warning is fine).

- [ ] **Step 7: Check every file's axes and coverage**

```bash
cd /Users/raymartvillos/Projects/polaris/apps/web/src/app/_fonts
"$WORK/venv/bin/python" - <<'EOF'
import glob, os
from fontTools.ttLib import TTFont
for f in sorted(glob.glob("*.woff2")):
    t = TTFont(f); cmap = t.getBestCmap()
    axes = ", ".join(f"{a.axisTag} {a.minValue:g}-{a.maxValue:g}" for a in t["fvar"].axes) if "fvar" in t else "static"
    print(f"{f:44} {os.path.getsize(f)//1024:3d} KB  {axes:28} A:{0x41 in cmap} ₱:{0x20B1 in cmap} ā:{0x101 in cmap}")
EOF
```

Expected (sizes approximate):
- `Fraunces-*-latin` — `opsz 9-144, wght 100-900`, A True, ₱ False, ā False
- `PlusJakartaSans-latin` — `wght 200-800`, A True, ₱ False
- `IBMPlexMono-*-latin` — `static`, A True, ₱ False
- `IBMPlexSans-latin-latinext` — `wght 100-700` (no `wdth`), ~66 KB, A True, ₱ True, ā True
- `IBMPlexSerif-*-latin-latinext` — `static`, ~27 KB each, A True, ₱ True, ā True

(₱ missing from the app fonts is today's behavior too — they only ever loaded `latin`.)

- [ ] **Step 8: Add the licences**

```bash
cd /Users/raymartvillos/Projects/polaris/apps/web/src/app/_fonts
RAW=https://raw.githubusercontent.com/google/fonts/main/ofl
curl -sfL -o OFL-Fraunces.txt        "$RAW/fraunces/OFL.txt"
curl -sfL -o OFL-PlusJakartaSans.txt "$RAW/plusjakartasans/OFL.txt"
curl -sfL -o OFL-IBMPlex.txt         "$RAW/ibmplexsans/OFL.txt"
for f in ibmplexserif ibmplexmono; do curl -sfL "$RAW/$f/OFL.txt" | diff -q - OFL-IBMPlex.txt && echo "$f: same licence"; done
head -1 OFL-*.txt
```

Expected: both `same licence` lines (one IBM Plex licence covers Sans, Serif, and Mono); each file's first line is a copyright line.

- [ ] **Step 9: Write `apps/web/src/app/_fonts/README.md`**

````markdown
# Self-hosted fonts

Every font Polaris uses, loaded with `next/font/local` from this folder, so
builds never fetch Google Fonts. Google sometimes answers with
`/l/font?kit=…&skey=…` font URLs that make Next.js 16.2.4 fail the build
(Next.js [#99114](https://github.com/vercel/next.js/issues/99114)).

| File | Family | Coverage | Axes / weight | Used by |
|---|---|---|---|---|
| `Fraunces-latin.woff2` | Fraunces | latin | opsz 9–144, wght 100–900 | `app/layout.tsx` |
| `Fraunces-Italic-latin.woff2` | Fraunces italic | latin | opsz 9–144, wght 100–900 | `app/layout.tsx` |
| `PlusJakartaSans-latin.woff2` | Plus Jakarta Sans | latin | wght 200–800 | `app/layout.tsx` |
| `IBMPlexMono-Regular-latin.woff2` | IBM Plex Mono | latin | 400 | `app/layout.tsx` |
| `IBMPlexMono-Medium-latin.woff2` | IBM Plex Mono | latin | 500 | `app/layout.tsx` |
| `IBMPlexMono-SemiBold-latin.woff2` | IBM Plex Mono | latin | 600 | `app/layout.tsx` |
| `IBMPlexSans-latin-latinext.woff2` | IBM Plex Sans | latin + latin-ext | wght 100–700 | `app/page.tsx` |
| `IBMPlexSerif-Regular-latin-latinext.woff2` | IBM Plex Serif | latin + latin-ext | 400 | `app/page.tsx` |
| `IBMPlexSerif-Medium-latin-latinext.woff2` | IBM Plex Serif | latin + latin-ext | 500 | `app/page.tsx` |

## Where they came from (2026-10-17)

**App fonts** — Google's own `latin` files, byte for byte: the ones
`next/font/google` downloaded for the previous config. Fetched from
`fonts.googleapis.com/css2` with Next's User-Agent (Chrome 104), keeping the
`/* latin */` faces of:

- `Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900`
- `Plus+Jakarta+Sans:wght@200..800`
- `IBM+Plex+Mono:wght@400;500;600`

They cover only Google's `latin` range, as before — ₱ falls back to the next
font in the token stack, as it always has in the app.

**Landing-page fonts** — the landing page needs `latin` and `latin-ext` (for
₱), and `next/font/local` takes one file per weight, so these are cut from
the [google/fonts](https://github.com/google/fonts) sources with fontTools
4.67 (`pip install fonttools brotli`):

```sh
# Google's unicode-range values for its latin and latin-ext subsets, joined
U="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF"
fonttools varLib.instancer 'IBMPlexSans[wdth,wght].ttf' wdth=100 -o IBMPlexSans-wdth100.ttf
pyftsubset IBMPlexSans-wdth100.ttf --unicodes="$U" --layout-features='*' \
  --flavor=woff2 --output-file=IBMPlexSans-latin-latinext.woff2
pyftsubset IBMPlexSerif-Regular.ttf --unicodes="$U" --layout-features='*' \
  --flavor=woff2 --output-file=IBMPlexSerif-Regular-latin-latinext.woff2
# …and the same for IBMPlexSerif-Medium.ttf
```

## Licence

All three families are under the SIL Open Font License 1.1 — see
`OFL-Fraunces.txt`, `OFL-PlusJakartaSans.txt`, and `OFL-IBMPlex.txt` (one
licence covers IBM Plex Sans, Serif, and Mono). The social card's TrueType
cuts live separately in `../_og/fonts/`.
````

- [ ] **Step 10: Run the test to verify it passes**

Run: `bun run --cwd apps/web test -- src/app/_fonts/fonts.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 11: Commit**

```bash
cd /Users/raymartvillos/Projects/polaris
git add apps/web/src/app/_fonts
git commit -m "feat(web): commit self-hosted font files for next/font/local

Google's own latin woff2 files for Fraunces, Plus Jakarta Sans, and IBM Plex
Mono, and latin + latin-ext cuts of IBM Plex Sans and Serif for the landing
page, with their OFL licences and a README on provenance. Not wired up yet.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Load every font with next/font/local

**Files:**
- Modify: `apps/web/src/app/layout.tsx:2` (import) and `:14-37` (the three loaders)
- Modify: `apps/web/src/app/page.tsx:3` (import) and `:42-58` (the two loaders + comment)
- Modify: `apps/web/src/app/globals.css:84-85` (comment)
- Modify: `docs/design/polaris-design-system.md:235-251`, `docs/design/decisions/font-stack-fraunces.md` (Implementation notes), `docs/design/decisions/landing-page-plex.md` (Implementation notes), `docs/superpowers/plans/2026-10-17-switch-over-checklist.md` (Follow-ups)
- Test: `apps/web/src/app/_fonts/fonts.test.ts` (add the guard)

**Interfaces:**
- Consumes: the nine files in `apps/web/src/app/_fonts/` from Task 1, by exact name.
- Produces: the same CSS variables as before — `--font-fraunces`, `--font-jakarta`, `--font-plex-mono` (on `<html>` via `layout.tsx`), `--font-plex-serif`, `--font-plex-sans` (on `.lp` via `page.tsx`).

- [ ] **Step 1: Write the failing guard test**

Append to `apps/web/src/app/_fonts/fonts.test.ts` (add `readdirSync` to the `node:fs` import):

```ts
// The module specifier is split so this file doesn't match its own check.
const GOOGLE_LOADER = "next/font/" + "google";
const SRC_DIR = join(FONTS_DIR, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("font loading", () => {
  it("never fetches from Google Fonts at build time", () => {
    const offenders = sourceFiles(SRC_DIR).filter((file) =>
      readFileSync(file, "utf8").includes(GOOGLE_LOADER)
    );
    expect(offenders.map((f) => f.slice(SRC_DIR.length + 1))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run --cwd apps/web test -- src/app/_fonts/fonts.test.ts`
Expected: FAIL — `expected [ 'app/layout.tsx', 'app/page.tsx' ] to deeply equal []` (order may differ).

- [ ] **Step 3: Switch the app fonts in `apps/web/src/app/layout.tsx`**

Replace line 2 `import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";` with:

```ts
import localFont from "next/font/local";
```

Replace the comment and three loaders (from `// The Fraunces type stack` through the `plexMono` loader's closing `});`) with:

```ts
// The Fraunces type stack (chosen July 2026 over IBM Plex, Newsreader, and
// Literata trios — see docs/design/decisions/). Self-hosted from _fonts/ so
// builds never fetch Google Fonts — see its README. Italic loads too: entry
// blockquotes are italic serif and must not be synthesized.
const fraunces = localFont({
  src: [
    { path: "./_fonts/Fraunces-latin.woff2", weight: "100 900", style: "normal" },
    { path: "./_fonts/Fraunces-Italic-latin.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const jakarta = localFont({
  src: "./_fonts/PlusJakartaSans-latin.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
  display: "swap",
});

// IBM Plex Mono is a static family — one file per weight.
const plexMono = localFont({
  src: [
    { path: "./_fonts/IBMPlexMono-Regular-latin.woff2", weight: "400", style: "normal" },
    { path: "./_fonts/IBMPlexMono-Medium-latin.woff2", weight: "500", style: "normal" },
    { path: "./_fonts/IBMPlexMono-SemiBold-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});
```

(`adjustFontFallback: "Times New Roman"` on the serif matches what `next/font/google` picked for serif families; the others keep the `"Arial"` default, as before. `fraunces.variable`, `jakarta.variable`, `plexMono.variable` keep being used on `<html>` unchanged.)

- [ ] **Step 4: Switch the landing fonts in `apps/web/src/app/page.tsx`**

Replace line 3 `import { IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";` with:

```ts
import localFont from "next/font/local";
```

Replace the comment and two loaders (from `// The landing page sets in IBM Plex` through the `plexSans` loader's closing `});`) with:

```ts
// The landing page sets in IBM Plex — Serif and Sans here, Mono from the root
// layout — while the app keeps the Fraunces stack. Loaded in this module so
// only "/" downloads them; these cuts cover latin + latin-ext, which carries
// the ₱ glyph (see _fonts/README.md). `.lp` in globals.css points the font
// tokens at these variables.
const plexSerif = localFont({
  src: [
    { path: "./_fonts/IBMPlexSerif-Regular-latin-latinext.woff2", weight: "400", style: "normal" },
    { path: "./_fonts/IBMPlexSerif-Medium-latin-latinext.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const plexSans = localFont({
  src: "./_fonts/IBMPlexSans-latin-latinext.woff2",
  weight: "100 700",
  variable: "--font-plex-sans",
  display: "swap",
});
```

- [ ] **Step 5: Run the guard test to verify it passes**

Run: `bun run --cwd apps/web test -- src/app/_fonts/fonts.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 6: Update the CSS comment in `apps/web/src/app/globals.css:84-85`**

Replace:

```css
  /* Next.js next/font injects --font-fraunces, --font-jakarta,
     --font-plex-mono (Fraunces stack, July 2026 — see design decisions). */
```

with:

```css
  /* next/font/local injects --font-fraunces, --font-jakarta,
     --font-plex-mono from the self-hosted files in app/_fonts/ (Fraunces
     stack, July 2026 — see design decisions). */
```

- [ ] **Step 7: Build, lint, and run the whole suite**

```bash
cd /Users/raymartvillos/Projects/polaris
bun run test 2>&1 | grep -E "Test Files|Tests "
bun run --cwd apps/web build 2>&1 | tee "$WORK/build-after.log" | grep -E "Compiled|Build error|fonts.g"
bun run lint
grep -c "fonts.googleapis\|fonts.gstatic" "$WORK/build-after.log"
grep -rl "fonts.gstatic.com\|fonts.googleapis.com" apps/web/.next/static apps/web/.next/server 2>/dev/null | wc -l
```

Expected: core 83 / backend 62 / web 60 tests pass (50 before + 10 new); `✓ Compiled successfully`; lint exits 0; both `grep` counts print `0` (no Google font URL anywhere in the build output).

- [ ] **Step 8: Capture "after" screenshots and compare with "before"**

```bash
cd /Users/raymartvillos/Projects/polaris/apps/web
(bunx next start -p 3100 > "$WORK/start-after.log" 2>&1 &) ; sleep 4
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for p in "/:landing" "/auth/signin:signin"; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,2400 \
    --virtual-time-budget=8000 --screenshot="$WORK/after-${p##*:}.png" "http://localhost:3100${p%%:*}" 2>/dev/null
done
pkill -f "next start -p 3100"
"$WORK/venv/bin/python" - "$WORK" <<'EOF'
import sys
from PIL import Image, ImageChops
w = sys.argv[1]
for page in ["signin", "landing"]:
    a = Image.open(f"{w}/before-{page}.png").convert("RGB")
    b = Image.open(f"{w}/after-{page}.png").convert("RGB")
    diff = ImageChops.difference(a, b)
    changed = sum(1 for px in diff.getdata() if px != (0, 0, 0))
    print(f"{page}: {a.size} vs {b.size}, changed pixels {changed} ({100 * changed / (a.size[0] * a.size[1]):.3f}%), bbox {diff.getbbox()}")
    if changed:
        diff.point(lambda v: 255 if v else 0).save(f"{w}/diff-{page}.png")
EOF
```

Expected: `signin` — 0 changed pixels (its fonts are byte-identical files). `landing` — 0 or a small share: the Plex Sans/Serif cuts come from the google/fonts sources rather than Google's served files. Open `diff-landing.png` (and both screenshots) if any pixels changed: differences must be sub-pixel glyph rendering, not a different face, weight, or layout shift. Anything bigger — stop and report.

- [ ] **Step 9: Update the design docs**

In `docs/design/polaris-design-system.md`, replace the whole "Font substitutions — flag for the user" section (from the heading through `@import`; still no local font files.`) with:

```markdown
## Fonts — self-hosted

All fonts are **self-hosted** in `apps/web/src/app/_fonts/` and load through
`next/font/local` — builds never fetch Google Fonts (Google sometimes returns
font URLs that fail the Next.js build; see that folder's README). The files
are Google Fonts' own cuts, so rendering matches what Google serves.

| Role | Using | Alternatives considered |
|---|---|---|
| Display serif | **Fraunces** (self-hosted, `next/font/local`) | Source Serif 4 (v1), IBM Plex Serif, Newsreader, Literata |
| UI sans | **Plus Jakarta Sans** (self-hosted, `next/font/local`) | Inter (v1), IBM Plex Sans, Albert Sans, Karla |
| Mono | **IBM Plex Mono** (self-hosted, `next/font/local`) | JetBrains Mono (v1), Spline Sans Mono |

The v1 stack (Source Serif 4 / Inter / JetBrains Mono) shipped with the note
that Inter was "a neutral choice; swap for something more distinctive."
July 2026 did exactly that: four full trios were rendered on live screens and
compared side by side (see `decisions/`), and the Fraunces stack won for
being the warmest and most distinctive while staying inside the paper+ink
mood. The fonts load in `src/app/layout.tsx`; the landing page's IBM Plex
Serif and Sans load in `src/app/page.tsx`.
```

In `docs/design/decisions/font-stack-fraunces.md` → "Implementation notes", replace the first bullet (the four lines from `- Loaded via` through `needs explicit weights (400/500/600).`) with:

```markdown
- Loaded via `next/font/local` in `src/app/layout.tsx` from the self-hosted
  files in `src/app/_fonts/` (October 2026 — Google Fonts was failing
  builds; see that folder's README). Fraunces is one variable file per style
  with its optical-size axis, plus true italics (entry blockquotes are italic
  serif — don't let the browser synthesize); IBM Plex Mono is a static
  family, one file per weight (400/500/600).
```

In `docs/design/decisions/landing-page-plex.md` → "Implementation notes", replace the first bullet with:

```markdown
- Plex Serif (400/500) and Plex Sans (variable, 100–700) load via
  `next/font/local` in `src/app/page.tsx`, so only `/` downloads them. Their
  files in `src/app/_fonts/` are cut to `latin` + `latin-ext` for the ₱
  glyph. Plex Mono comes from the root layout, as everywhere.
```

In `docs/superpowers/plans/2026-10-17-switch-over-checklist.md` → "Follow-ups noticed on the way", replace the first bullet (two lines, `- **Self-host the fonts** …` through `flaky-build section above.`) with:

```markdown
- **Self-host the fonts** — done 2026-10-17
  (`docs/superpowers/plans/2026-10-17-self-host-fonts.md`).
```

- [ ] **Step 10: Commit**

```bash
cd /Users/raymartvillos/Projects/polaris
git add apps/web/src/app/layout.tsx apps/web/src/app/page.tsx apps/web/src/app/globals.css apps/web/src/app/_fonts/fonts.test.ts docs/design docs/superpowers/plans/2026-10-17-switch-over-checklist.md
git commit -m "fix(web): load every font with next/font/local

Builds no longer fetch Google Fonts, whose occasional /l/font?kit=… URLs fail
Next.js 16.2.4 builds (vercel/next.js#99114). Same CSS variables, same files
for the app fonts; a guard test fails if next/font/google comes back.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 11: Prove it on Vercel**

```bash
git push -u origin self-host-fonts
# wait for the branch's preview, then:
SHA=$(git rev-parse HEAD)
gh api "repos/martin0x/polaris/commits/$SHA/statuses" --jq '[.[] | select(.context=="Vercel")][0] | "\(.state) \(.target_url)"'
```

Expected: `success …`. Preview builds skip the database step (`VERCEL_ENV` guard in `vercel-build`), so this is safe. Read the log with `bunx vercel inspect <url> --logs --scope raymarts-projects-c114a093` and confirm `✓ Compiled successfully` and no `fonts.g` lines.
