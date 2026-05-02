// Temporary stubs satisfying the PaletteLayer interface. Real implementations
// land in Task 8 of the Global Command Palette plan.
import type { PaletteLayer } from "@/platform/palette/types";

export const topicsLayer: PaletteLayer = {
  name: "topics",
  singular: "topic",
  search: async () => [],
};

export const notesLayer: PaletteLayer = {
  name: "notes",
  singular: "note",
  search: async () => [],
};
