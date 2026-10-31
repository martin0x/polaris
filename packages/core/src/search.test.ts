import { describe, expect, it } from "vitest";
import { matchesAllTerms, searchTerms } from "./search";

describe("searchTerms", () => {
  it("lowercases and splits on anything that is not a letter or digit", () => {
    expect(searchTerms("  React-Hooks, #convex_test!  ")).toEqual(["react", "hooks", "convex", "test"]);
  });

  it("keeps accented letters and digits inside a word", () => {
    expect(searchTerms("Café v2")).toEqual(["café", "v2"]);
  });

  it("drops duplicates, keeping first-seen order", () => {
    expect(searchTerms("deploy Deploy ship")).toEqual(["deploy", "ship"]);
  });

  it("returns [] for blank or punctuation-only input", () => {
    expect(searchTerms("   ")).toEqual([]);
    expect(searchTerms("!!! --")).toEqual([]);
  });
});

describe("matchesAllTerms", () => {
  const text = "Shipped the #convex search index\nDeploying tomorrow";

  it("requires every term", () => {
    expect(matchesAllTerms(text, ["convex", "search"])).toBe(true);
    expect(matchesAllTerms(text, ["convex", "postgres"])).toBe(false);
  });

  it("matches each term as the start of a word", () => {
    expect(matchesAllTerms(text, ["deploy", "ship"])).toBe(true);
    expect(matchesAllTerms(text, ["hipped"])).toBe(false);
  });

  it("is case-insensitive through searchTerms, and an empty term list matches nothing", () => {
    expect(matchesAllTerms(text, searchTerms("CONVEX"))).toBe(true);
    expect(matchesAllTerms(text, [])).toBe(false);
  });
});
