import { describe, it, expect } from "vitest";
import { rankResults } from "../rankResults";
import type { PaletteResultWithMeta } from "../types";

function r(label: string, sublabel?: string): PaletteResultWithMeta {
  return {
    id: label,
    label,
    sublabel,
    href: `/x/${label}`,
    systemName: "journal",
    systemDisplayName: "Engineering Journal",
    layerIndex: 0,
    layerName: "topics",
  };
}

describe("rankResults", () => {
  it("exact-prefix match outranks substring on label", () => {
    const out = rankResults([r("Polaris milestone"), r("Hello Polaris")], "polaris");
    expect(out.map((x) => x.label)).toEqual(["Polaris milestone", "Hello Polaris"]);
  });

  it("substring on label outranks substring on sublabel", () => {
    const out = rankResults(
      [r("Hello world", "polaris note"), r("Polaris quick")],
      "polaris"
    );
    expect(out.map((x) => x.label)).toEqual(["Polaris quick", "Hello world"]);
  });

  it("preserves input order within the same tier (stable sort)", () => {
    const out = rankResults([r("Alpha"), r("Beta"), r("Gamma")], "");
    expect(out.map((x) => x.label)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("preserves input order for two equally-tiered substring matches", () => {
    const out = rankResults(
      [r("apple polaris"), r("banana polaris")],
      "polaris"
    );
    expect(out.map((x) => x.label)).toEqual(["apple polaris", "banana polaris"]);
  });

  it("no-match items sink to the bottom", () => {
    const out = rankResults([r("Banana"), r("polaris")], "polaris");
    expect(out.map((x) => x.label)).toEqual(["polaris", "Banana"]);
  });

  it("empty query returns input unchanged", () => {
    const items = [r("z"), r("a"), r("m")];
    expect(rankResults(items, "").map((x) => x.label)).toEqual(["z", "a", "m"]);
  });
});
