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

Google's Fraunces file defaults to its wght 900 instance, so `next/font/local`
would otherwise measure a fallback font from that heavy instance — about 10%
too large. That's why `app/layout.tsx` turns off `adjustFontFallback` for
Fraunces and `globals.css` declares a `Fraunces Fallback` `@font-face` by hand
instead, using `next/font/google`'s own precomputed Fraunces metrics (Next.js
16.2.4).

**Landing-page fonts** — the landing page needs `latin` and `latin-ext` (for
₱), and `next/font/local` takes one file per weight, so these are cut from
the [google/fonts](https://github.com/google/fonts) sources with fontTools
4.67 (`pip install fonttools brotli`):

```sh
# Google's unicode-range values for its latin and latin-ext subsets, joined
U="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF"
fonttools varLib.instancer 'IBMPlexSans[wdth,wght].ttf' wdth=100 -o IBMPlexSans-wdth100.ttf
pyftsubset IBMPlexSans-wdth100.ttf --unicodes="$U" --layout-features='*' --name-IDs='*' \
  --flavor=woff2 --output-file=IBMPlexSans-latin-latinext.woff2
pyftsubset IBMPlexSerif-Regular.ttf --unicodes="$U" --layout-features='*' --name-IDs='*' \
  --flavor=woff2 --output-file=IBMPlexSerif-Regular-latin-latinext.woff2
# …and the same for IBMPlexSerif-Medium.ttf
#
# --name-IDs='*' keeps all name table records, not just pyftsubset's default
# 0–6: without it, licence/designer records (IDs 7–9, 11–14 — the OFL text
# and its URL) get dropped from the subset.
```

## Licence

All three families are under the SIL Open Font License 1.1 — see
`OFL-Fraunces.txt`, `OFL-PlusJakartaSans.txt`, and `OFL-IBMPlex.txt` (one
licence covers IBM Plex Sans, Serif, and Mono). The social card's TrueType
cuts live separately in `../_og/fonts/`. Under the OFL FAQ, a subset webfont
is a Modified Version, so strictly it shouldn't keep the Reserved Font Name
"Plex"; like Google's own CDN cuts, these keep it, with the licence metadata
preserved in the files.
