import { describe, expect, it } from "vitest";
import { chunkRows, parseConvexRunResult, parseJsonl } from "../scripts/lib/batching";

describe("chunkRows", () => {
  it("splits by row count", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2, 1000)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("splits by encoded size", () => {
    const rows = ["a".repeat(40), "b".repeat(40), "c".repeat(40)]; // 42 bytes of JSON + 1 each
    expect(chunkRows(rows, 200, 100)).toEqual([[rows[0], rows[1]], [rows[2]]]);
  });

  it("counts multi-byte characters by their UTF-8 size", () => {
    const rows = ["é".repeat(20), "é".repeat(20)]; // 40 bytes + 2 quotes + 1 each
    expect(chunkRows(rows, 200, 60)).toEqual([[rows[0]], [rows[1]]]);
  });

  it("throws on one row over the byte limit, and returns no batches for no rows", () => {
    expect(() => chunkRows(["x".repeat(100)], 200, 50)).toThrow("over the 50-byte batch limit");
    expect(chunkRows([], 2, 10)).toEqual([]);
  });
});

describe("parseConvexRunResult", () => {
  it("parses a pretty-printed object after log lines", () => {
    const out = '[CONVEX Q] a log line\n{\n  "inserted": 2,\n  "nested": {\n    "a": 1\n  }\n}\n';
    expect(parseConvexRunResult(out)).toEqual({ inserted: 2, nested: { a: 1 } });
  });

  it("parses a pretty-printed array and a one-line value", () => {
    expect(parseConvexRunResult('note\n[\n  "a",\n  "b"\n]')).toEqual(["a", "b"]);
    expect(parseConvexRunResult("log\n42")).toBe(42);
  });

  it("throws when there is no JSON", () => {
    expect(() => parseConvexRunResult("just logs\nmore logs")).toThrow("No JSON result");
  });
});

describe("parseJsonl", () => {
  it("skips blank lines", () => {
    expect(parseJsonl('{"a":1}\n\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
