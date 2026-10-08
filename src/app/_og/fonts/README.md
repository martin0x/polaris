# Social card fonts

Static TrueType cuts of the app's three faces, used only by
`../socialCard.tsx` to render the Open Graph / X card. The app itself loads
these families through `next/font` (woff2), which Satori can't read.

| File | Family | Cut |
|---|---|---|
| `Fraunces-Display-Medium.ttf` | Fraunces | wght 500, opsz 144 |
| `Fraunces-Text-Regular.ttf` | Fraunces | wght 400, opsz 36 |
| `PlusJakartaSans-Regular.ttf` | Plus Jakarta Sans | wght 400 |
| `PlusJakartaSans-SemiBold.ttf` | Plus Jakarta Sans | wght 600 |
| `IBMPlexMono-Medium.ttf` | IBM Plex Mono | wght 500 |

Downloaded from the Google Fonts CSS API (`fonts.googleapis.com/css2`), which
serves static TTF instances to non-browser clients. All three families are
licensed under the SIL Open Font License 1.1.
