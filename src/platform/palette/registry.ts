import type { SystemManifest } from "@/systems/types";
import type { IconName } from "@/app/_components/Icon";
import type { PaletteLayer, PaletteSystemConfig } from "./types";

interface FlatLayer {
  systemName: string;
  systemDisplayName: string;
  layerIndex: number;
  layer: PaletteLayer;
}

export interface PaletteRegistry {
  getSystem(
    name: string
  ): { manifest: SystemManifest; palette: PaletteSystemConfig } | null;
  matchSystems(
    query: string
  ): Array<{ name: string; displayName: string; icon?: IconName }>;
  allLayers(): FlatLayer[];
}

export function buildPaletteRegistry(
  manifests: SystemManifest[]
): PaletteRegistry {
  const withPalette = manifests.filter(
    (m): m is SystemManifest & { palette: PaletteSystemConfig } => !!m.palette
  );

  const flat: FlatLayer[] = [];
  for (const m of withPalette) {
    m.palette.layers.forEach((layer, layerIndex) => {
      flat.push({
        systemName: m.name,
        systemDisplayName: m.displayName,
        layerIndex,
        layer,
      });
    });
  }

  return {
    getSystem(name) {
      const m = manifests.find((x) => x.name === name);
      if (!m || !m.palette) return null;
      return { manifest: m, palette: m.palette };
    },
    matchSystems(query) {
      const q = query.toLowerCase();
      if (!q) {
        return withPalette.map((m) => ({
          name: m.name,
          displayName: m.displayName,
          icon: m.nav.icon as IconName,
        }));
      }
      return manifests
        .filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.displayName.toLowerCase().includes(q)
        )
        .map((m) => ({
          name: m.name,
          displayName: m.displayName,
          icon: m.nav.icon as IconName,
        }));
    },
    allLayers() {
      return flat;
    },
  };
}
