import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveQuery } from "../resolver";
import type { PaletteRegistry } from "../registry";
import type { PaletteLayer, PaletteResult } from "../types";

function layer(
  name: string,
  singular: string,
  results: PaletteResult[] = [],
  opts: { throwOn?: string } = {}
): PaletteLayer {
  return {
    name,
    singular,
    search: async (query) => {
      if (opts.throwOn !== undefined && query === opts.throwOn) {
        throw new Error(`boom from ${name}`);
      }
      return results;
    },
  };
}

function makeRegistry(opts: {
  systems: Array<{
    name: string;
    displayName: string;
    icon?: string;
    layers: PaletteLayer[];
  }>;
  matchedNames?: string[];
}): PaletteRegistry {
  const flat = opts.systems.flatMap((s) =>
    s.layers.map((layer, layerIndex) => ({
      systemName: s.name,
      systemDisplayName: s.displayName,
      layerIndex,
      layer,
    }))
  );
  return {
    getSystem(name) {
      const s = opts.systems.find((x) => x.name === name);
      if (!s) return null;
      return {
        manifest: {
          name: s.name,
          displayName: s.displayName,
          description: "",
          routes: {},
          nav: { label: s.displayName, icon: s.icon ?? "folder", href: `/${s.name}` },
          palette: { layers: s.layers },
        },
        palette: { layers: s.layers },
      };
    },
    matchSystems(query) {
      const subset = opts.matchedNames
        ? opts.systems.filter((s) => opts.matchedNames!.includes(s.name))
        : opts.systems.filter(
            (s) =>
              !query ||
              s.name.toLowerCase().includes(query.toLowerCase()) ||
              s.displayName.toLowerCase().includes(query.toLowerCase())
          );
      return subset.map((s) => ({
        name: s.name,
        displayName: s.displayName,
        icon: s.icon as never,
      }));
    },
    allLayers() {
      return flat;
    },
  };
}

const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
afterEach(() => errSpy.mockClear());

describe("resolveQuery", () => {
  beforeEach(() => errSpy.mockClear());

  it("top-level query: returns matchedSystems with layer metadata + ranked cross-system results", async () => {
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [
            layer("topics", "topic", [
              { id: "t1", label: "Polaris", href: "/journal/topics/Polaris", drillable: true },
            ]),
            layer("notes", "note", [
              { id: "n1", label: "Polaris ship note", href: "/journal/topics/Polaris#entry-n1" },
            ]),
          ],
        },
      ],
    });
    const out = await resolveQuery(reg, { query: "journ" });
    expect(out.matchedSystems).toEqual([
      {
        name: "journal",
        displayName: "Engineering Journal",
        icon: undefined,
        layers: [
          { name: "topics", singular: "topic" },
          { name: "notes", singular: "note" },
        ],
      },
    ]);
    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({
      id: "t1",
      systemName: "journal",
      systemDisplayName: "Engineering Journal",
      layerIndex: 0,
      layerName: "topics",
    });
    expect(out.results[1]).toMatchObject({ id: "n1", layerName: "notes" });
  });

  it("scoped query: routes to the correct layer with the correct parentId", async () => {
    const search = vi.fn(async (_q: string, _p: string | null) => [
      { id: "n1", label: "scoped result", href: "/x" } as PaletteResult,
    ]);
    const scoped: PaletteLayer = { name: "notes", singular: "note", search };
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [layer("topics", "topic"), scoped],
        },
      ],
    });
    const out = await resolveQuery(reg, {
      query: "deploy",
      scope: { systemName: "journal", layerIndex: 1, parentId: "topic-123" },
    });
    expect(search).toHaveBeenCalledWith("deploy", "topic-123");
    expect(out.matchedSystems).toBeUndefined();
    expect(out.results).toEqual([
      {
        id: "n1",
        label: "scoped result",
        href: "/x",
        systemName: "journal",
        systemDisplayName: "Engineering Journal",
        layerIndex: 1,
        layerName: "notes",
      },
    ]);
  });

  it("scoped query with unknown system returns empty results", async () => {
    const reg = makeRegistry({ systems: [] });
    const out = await resolveQuery(reg, {
      query: "x",
      scope: { systemName: "ghost", layerIndex: 0, parentId: null },
    });
    expect(out.results).toEqual([]);
  });

  it("layer errors are isolated — other layers still return", async () => {
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [
            layer("topics", "topic", [
              { id: "t1", label: "Polaris", href: "/x" },
            ]),
            layer("notes", "note", [], { throwOn: "polaris" }),
          ],
        },
      ],
    });
    const out = await resolveQuery(reg, { query: "polaris" });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].id).toBe("t1");
    expect(errSpy).toHaveBeenCalled();
  });

  it("scoped query with throwing layer returns empty (not 500)", async () => {
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [layer("notes", "note", [], { throwOn: "boom" })],
        },
      ],
    });
    const out = await resolveQuery(reg, {
      query: "boom",
      scope: { systemName: "journal", layerIndex: 0, parentId: null },
    });
    expect(out.results).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
  });

  it("empty top-level query: returns all matched systems with layers", async () => {
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [layer("topics", "topic", [])],
        },
      ],
    });
    const out = await resolveQuery(reg, { query: "" });
    expect(out.matchedSystems).toHaveLength(1);
    expect(out.matchedSystems![0].layers).toEqual([
      { name: "topics", singular: "topic" },
    ]);
    expect(out.results).toEqual([]);
  });

  it("caps cross-system fallback at 30 results", async () => {
    const many: PaletteResult[] = Array.from({ length: 50 }, (_, i) => ({
      id: `n${i}`,
      label: `note ${i}`,
      href: `/x/${i}`,
    }));
    const reg = makeRegistry({
      systems: [
        {
          name: "journal",
          displayName: "Engineering Journal",
          layers: [layer("notes", "note", many)],
        },
      ],
    });
    const out = await resolveQuery(reg, { query: "note" });
    expect(out.results).toHaveLength(30);
  });
});
