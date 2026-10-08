# Social card fonts

Static TrueType cuts of the landing page's IBM Plex faces, used only by
`../socialCard.tsx` to render the Open Graph / X card. The page itself loads
these families through `next/font` (woff2), which Satori can't read. The app
outside the landing page uses the Fraunces stack instead.

| File | Family | Cut |
|---|---|---|
| `IBMPlexSerif-Regular.ttf` | IBM Plex Serif | wght 400 |
| `IBMPlexSerif-Medium.ttf` | IBM Plex Serif | wght 500 |
| `IBMPlexSans-Regular.ttf` | IBM Plex Sans | wght 400 |
| `IBMPlexSans-SemiBold.ttf` | IBM Plex Sans | wght 600 |
| `IBMPlexMono-Medium.ttf` | IBM Plex Mono | wght 500 |

Downloaded from the Google Fonts CSS API (`fonts.googleapis.com/css2`), which
serves static TTF instances to non-browser clients. The Serif and Sans files
are subset with fontTools to Basic Latin, Latin-1, General Punctuation, ₱,
and arrows:

```sh
pyftsubset IBMPlexSans-Regular.ttf --layout-features='*' \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2000-206F,U+20B1,U+2190-2193,U+2212"
```

Card copy outside that range would render without glyphs — re-subset if the
card ever needs more. IBM Plex is licensed under the SIL Open Font License 1.1.
