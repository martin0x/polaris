import type { IconName } from "@/app/_components/Icon";

export interface PaletteResult {
  id: string;
  label: string;
  sublabel?: string;
  icon?: IconName;
  href: string;
  drillable?: boolean;
}

export interface PaletteLayer {
  /** Plural — used in the breadcrumb. */
  name: string;
  /** Singular — used in placeholder/empty-state copy. */
  singular: string;
  search(query: string, parentId: string | null): Promise<PaletteResult[]>;
}

export interface PaletteSystemConfig {
  layers: PaletteLayer[];
}

export interface PaletteResultWithMeta extends PaletteResult {
  systemName: string;
  systemDisplayName: string;
  layerIndex: number;
  layerName: string;
}

export interface PaletteScope {
  systemName: string;
  layerIndex: number;
  parentId: string | null;
}

export interface MatchedSystem {
  name: string;
  displayName: string;
  icon?: IconName;
  layers: Array<{ name: string; singular: string }>;
}

export interface ResolveQueryInput {
  query: string;
  scope?: PaletteScope;
}

export interface ResolveQueryResult {
  results: PaletteResultWithMeta[];
  matchedSystems?: MatchedSystem[];
}
