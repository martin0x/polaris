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
