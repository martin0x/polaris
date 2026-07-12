import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { getOptionalSession } from "@/platform/auth/session";
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
  const session = await getOptionalSession();
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${jakarta.variable} ${plexMono.variable}`}
    >
      <body className="antialiased">
        {session?.user ? (
          <PaletteProvider>{children}</PaletteProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
