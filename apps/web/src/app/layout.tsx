import type { Metadata } from "next";
import localFont from "next/font/local";
import {
  ConvexAuthNextjsServerProvider,
  isAuthenticatedNextjs,
} from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "@/app/_components/ConvexClientProvider";
import { PaletteProvider } from "@/platform/palette/client/PaletteProvider";
import { SyncStatusProvider } from "@/app/_components/SyncStatus";
import { siteUrl } from "@/lib/site";
import "./globals.css";

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

// The app is private by default; the landing page (app/page.tsx) opts back
// into indexing and carries the Open Graph card.
export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Polaris",
  description: "A personal operating system.",
  icons: {
    icon: "/brand/polaris-glyph.svg",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = await isAuthenticatedNextjs();
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        className={`${fraunces.variable} ${jakarta.variable} ${plexMono.variable}`}
      >
        <body className="antialiased">
          <ConvexClientProvider>
            <SyncStatusProvider>
              {isAuthenticated ? (
                <PaletteProvider>{children}</PaletteProvider>
              ) : (
                children
              )}
            </SyncStatusProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
