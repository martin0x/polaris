import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { buildPaletteRegistry } from "../registry";
import type { SystemManifest } from "@/systems/types";
import type { PaletteLayer } from "../types";

const noop = async () => NextResponse.json({});

function layer(name: string, singular: string): PaletteLayer {
  return { name, singular, search: async () => [] };
}

function manifest(opts: {
  name: string;
  displayName: string;
  withPalette?: PaletteLayer[];
}): SystemManifest {
  return {
    name: opts.name,
    displayName: opts.displayName,
    description: "",
    routes: { "GET /x": noop },
    jobs: {},
    nav: { label: opts.displayName, icon: "folder", href: `/${opts.name}` },
    ...(opts.withPalette ? { palette: { layers: opts.withPalette } } : {}),
  };
}

describe("buildPaletteRegistry", () => {
  const journal = manifest({
    name: "journal",
    displayName: "Engineering Journal",
    withPalette: [layer("topics", "topic"), layer("notes", "note")],
  });
  const budgeting = manifest({
    name: "budgeting",
    displayName: "Budgeting",
    withPalette: [layer("accounts", "account")],
  });
  const settings = manifest({ name: "settings", displayName: "Settings" });

  it("getSystem returns a system by name when it has a palette block", () => {
    const reg = buildPaletteRegistry([journal, budgeting]);
    const got = reg.getSystem("journal");
    expect(got?.manifest.name).toBe("journal");
    expect(got?.palette.layers).toHaveLength(2);
  });

  it("getSystem returns null for systems without a palette block", () => {
    const reg = buildPaletteRegistry([settings]);
    expect(reg.getSystem("settings")).toBeNull();
  });

  it("getSystem returns null for unknown system", () => {
    const reg = buildPaletteRegistry([journal]);
    expect(reg.getSystem("unknown")).toBeNull();
  });

  it("matchSystems empty query returns only systems with palette block", () => {
    const reg = buildPaletteRegistry([journal, budgeting, settings]);
    const got = reg.matchSystems("");
    expect(got.map((s) => s.name).sort()).toEqual(["budgeting", "journal"]);
  });

  it("matchSystems substring matches name and displayName, case-insensitive", () => {
    const reg = buildPaletteRegistry([journal, budgeting]);
    expect(reg.matchSystems("JOUR").map((s) => s.name)).toEqual(["journal"]);
    expect(reg.matchSystems("engin").map((s) => s.name)).toEqual(["journal"]);
    expect(reg.matchSystems("budg").map((s) => s.name)).toEqual(["budgeting"]);
  });

  it("matchSystems with a non-matching query returns empty", () => {
    const reg = buildPaletteRegistry([journal]);
    expect(reg.matchSystems("xyz")).toEqual([]);
  });

  it("allLayers returns flat layer list with system metadata", () => {
    const reg = buildPaletteRegistry([journal, budgeting]);
    const layers = reg.allLayers();
    expect(layers).toHaveLength(3);
    expect(layers[0]).toMatchObject({
      systemName: "journal",
      systemDisplayName: "Engineering Journal",
      layerIndex: 0,
    });
    expect(layers[0].layer.name).toBe("topics");
    expect(layers[1].layer.name).toBe("notes");
    expect(layers[2].systemName).toBe("budgeting");
  });

  it("allLayers skips systems without a palette block", () => {
    const reg = buildPaletteRegistry([journal, settings]);
    expect(reg.allLayers().every((l) => l.systemName === "journal")).toBe(true);
  });
});
