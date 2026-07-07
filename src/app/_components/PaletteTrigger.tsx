"use client";

import { usePaletteOptional } from "@/platform/palette/client/PaletteProvider";

// Subtle ⌘K affordance in the title bar — the palette's only visible
// trigger, and the only way to open it on touch.
export function PaletteTrigger() {
  const palette = usePaletteOptional();
  if (!palette) return null;
  return (
    <button
      type="button"
      className="palette-trigger"
      onClick={palette.open}
      aria-label="Open command palette"
    >
      <kbd>⌘K</kbd>
    </button>
  );
}
