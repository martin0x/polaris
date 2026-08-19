import { describe, it, expect } from "vitest";
import { extractTags, wordCount } from "./parser";

describe("extractTags", () => {
  it("returns the lowercased, deduplicated set of #tags", () => {
    const body = "working on #journal and #JOURNAL and #search";
    expect(extractTags(body)).toEqual(["journal", "search"]);
  });

  it("ignores tags inside fenced code blocks", () => {
    const body = "Real tag #real\n```\n#fakeincode\n```\n";
    expect(extractTags(body)).toEqual(["real"]);
  });

  it("ignores tags inside inline code", () => {
    const body = "use the `#fake` directive but #real-tag matters";
    expect(extractTags(body)).toEqual(["real-tag"]);
  });

  it("ignores a lone hash", () => {
    expect(extractTags("nothing here # alone")).toEqual([]);
  });

  it("ignores hash sequences in the middle of a word", () => {
    expect(extractTags("issue#123 is mid-word, #real is not")).toEqual(["real"]);
  });

  it("returns an empty array for empty input", () => {
    expect(extractTags("")).toEqual([]);
  });
});

describe("wordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(wordCount("one two three")).toBe(3);
  });

  it("strips fenced code before counting", () => {
    expect(wordCount("hello\n```\nfunction noisy(x) { return x }\n```\nworld")).toBe(2);
  });

  it("strips inline code before counting", () => {
    expect(wordCount("hello `noisy(x)` world")).toBe(2);
  });

  it("returns 0 for empty input", () => {
    expect(wordCount("")).toBe(0);
  });
});
