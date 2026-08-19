import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import {
  ConvexAuthNextjsServerProvider,
  isAuthenticatedNextjs,
} from "@convex-dev/auth/nextjs/server";
import ConvexClientProvider from "@/app/_components/ConvexClientProvider";
import { PaletteProvider } from "@/platform/palette/client/PaletteProvider";
import "./globals.css";

// The Fraunces type stack (chosen July 2026 over IBM Plex, Newsreader, and
// Literata trios — see docs/design/decisions/). Italic loads too: entry
// blockquotes are italic serif and must not be synthesized.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

// IBM Plex Mono is a static family — weights must be listed explicitly.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
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
            {isAuthenticated ? (
              <PaletteProvider>{children}</PaletteProvider>
            ) : (
              children
            )}
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
