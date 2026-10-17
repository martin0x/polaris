import { describe, expect, it } from "vitest";
import { buildQuerySet, compareResults, overallRecall, summarize } from "./searchQueries";

const entries = [
  { id: "1", title: "Deploy day", body: "deploying convex search index", tags: ["ops"] },
  { id: "2", title: null, body: "convex search is fast; search again", tags: ["ops", "convex"] },
  { id: "3", title: null, body: "reading about postgres with coffee", tags: [] },
];

describe("buildQuerySet", () => {
  it("draws frequent words, tags, co-occurring pairs, prefixes, then extras, without duplicates", () => {
    const set = buildQuerySet(entries, ["  my query ", ""]);
    expect(set.slice(0, 2)).toEqual(["convex", "search"]); // the only words in two entries
    expect(set).toContain("ops");
    expect(set).toContain("convex search");
    expect(set).toContain("depl"); // 4-letter prefix of "deploying"
    expect(set.at(-1)).toBe("my query");
    expect(new Set(set).size).toBe(set.length);
    expect(set).not.toContain("about"); // stopword
    expect(set).not.toContain("day"); // under 4 letters
  });
});

describe("compareResults and overallRecall", () => {
  it("splits shared and one-sided hits and pools recall across queries", () => {
    const a = compareResults("q1", ["1", "2", "3"], ["2", "3", "4"]);
    expect(a).toMatchObject({ shared: 2, onlyPostgres: ["1"], onlyConvex: ["4"] });
    const b = compareResults("q2", [], ["5"]);
    expect(overallRecall([a, b])).toBeCloseTo(2 / 3);
    expect(overallRecall([b])).toBe(1);
  });
});

describe("summarize", () => {
  it("only judges queries Postgres answered, and tracks Postgres-empty queries separately", () => {
    const judgedWithMiss = compareResults("q1", ["1", "2"], ["2"]); // onlyPostgres: ["1"]
    const judgedNoMiss = compareResults("q2", ["3"], ["3", "4"]); // onlyPostgres: []
    const postgresEmptyWithConvexHit = compareResults("q3", [], ["5"]);
    const postgresEmptyNoConvexHit = compareResults("q4", [], []);
    const s = summarize([
      judgedWithMiss,
      judgedNoMiss,
      postgresEmptyWithConvexHit,
      postgresEmptyNoConvexHit,
    ]);
    expect(s).toMatchObject({
      judged: 2,
      missesNothing: 1,
      postgresEmpty: 2,
      convexOnlyWhenPostgresEmpty: 1,
    });
    expect(s.recall).toBeCloseTo(2 / 3); // shared 1+1 over postgres hits 2+1
  });
});
