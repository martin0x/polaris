import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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
