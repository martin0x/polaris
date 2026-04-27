// Palette layers for the Global Command Palette (separate spec).
// The shape is intentionally loose for v1: the palette consumer reads `name`
// to identify the layer. The full layer interface lands with that spec.

export const topicsLayer = {
  name: "journal:topics",
};

export const notesLayer = {
  name: "journal:notes",
};
