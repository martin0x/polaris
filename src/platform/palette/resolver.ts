import type { PaletteRegistry } from "./registry";
import type {
  ResolveQueryInput,
  ResolveQueryResult,
  PaletteResultWithMeta,
  MatchedSystem,
} from "./types";
import { rankResults } from "./rankResults";

const FALLBACK_LIMIT = 30;

export async function resolveQuery(
  registry: PaletteRegistry,
  input: ResolveQueryInput
): Promise<ResolveQueryResult> {
  const { query, scope } = input;

  if (!scope) {
    const matched = registry.matchSystems(query);
    const matchedSystems: MatchedSystem[] = matched.map((m) => {
      const sys = registry.getSystem(m.name);
      const layers = sys
        ? sys.palette.layers.map((l) => ({ name: l.name, singular: l.singular }))
        : [];
      return { ...m, layers };
    });

    const layerHits = await Promise.all(
      registry.allLayers().map(async ({ layer, systemName, systemDisplayName, layerIndex }) => {
        try {
          const raw = await layer.search(query, null);
          return raw.map<PaletteResultWithMeta>((r) => ({
            ...r,
            systemName,
            systemDisplayName,
            layerIndex,
            layerName: layer.name,
          }));
        } catch (err) {
          console.error(
            `palette: layer ${systemName}.${layer.name} failed`,
            err
          );
          return [];
        }
      })
    );

    const flat = layerHits.flat();
    const ranked = rankResults(flat, query).slice(0, FALLBACK_LIMIT);
    return { matchedSystems, results: ranked };
  }

  const sys = registry.getSystem(scope.systemName);
  if (!sys) return { results: [] };
  const layer = sys.palette.layers[scope.layerIndex];
  if (!layer) return { results: [] };

  try {
    const raw = await layer.search(query, scope.parentId);
    return {
      results: raw.map<PaletteResultWithMeta>((r) => ({
        ...r,
        systemName: scope.systemName,
        systemDisplayName: sys.manifest.displayName,
        layerIndex: scope.layerIndex,
        layerName: layer.name,
      })),
    };
  } catch (err) {
    console.error(
      `palette: layer ${scope.systemName}.${layer.name} failed`,
      err
    );
    return { results: [] };
  }
}
