import { describe, it, expect } from "vitest";
import { findTaskLines, toggleTaskAtLine } from "./tasks";

describe("findTaskLines", () => {
  it("returns empty array when there are no task markers", () => {
    expect(findTaskLines("just text\n- a regular bullet")).toEqual([]);
  });

  it("finds an unchecked task on a single line", () => {
    expect(findTaskLines("- [ ] todo")).toEqual([
      { line: 0, checked: false, raw: "- [ ] todo" },
    ]);
  });

  it("finds a checked task and recognizes uppercase X", () => {
    const out = findTaskLines("- [x] one\n- [X] two");
    expect(out).toEqual([
      { line: 0, checked: true, raw: "- [x] one" },
      { line: 1, checked: true, raw: "- [X] two" },
    ]);
  });

  it("finds tasks mixed with other content and records correct line numbers", () => {
    const body = "intro\n\n- [ ] a\n- regular bullet\n- [x] b\n\n# heading";
    expect(findTaskLines(body)).toEqual([
      { line: 2, checked: false, raw: "- [ ] a" },
      { line: 4, checked: true, raw: "- [x] b" },
    ]);
  });

  it("recognizes indented (nested) task items", () => {
    expect(findTaskLines("- [ ] parent\n  - [ ] child")).toEqual([
      { line: 0, checked: false, raw: "- [ ] parent" },
      { line: 1, checked: false, raw: "  - [ ] child" },
    ]);
  });

  it("does not match escaped or inline [ ] text", () => {
    const body = "see [ ] here\n- \\[ \\] escaped\n- [ ] real";
    expect(findTaskLines(body)).toEqual([
      { line: 2, checked: false, raw: "- [ ] real" },
    ]);
  });
});

describe("toggleTaskAtLine", () => {
  it("flips unchecked to checked", () => {
    expect(toggleTaskAtLine("- [ ] todo", 0)).toBe("- [x] todo");
  });

  it("flips checked to unchecked", () => {
    expect(toggleTaskAtLine("- [x] done", 0)).toBe("- [ ] done");
  });

  it("accepts uppercase X as checked and writes lowercase x back", () => {
    expect(toggleTaskAtLine("- [X] done", 0)).toBe("- [ ] done");
    expect(toggleTaskAtLine("- [ ] todo", 0)).toBe("- [x] todo");
  });

  it("only modifies the specified line", () => {
    const body = "- [ ] a\n- [ ] b\n- [ ] c";
    expect(toggleTaskAtLine(body, 1)).toBe("- [ ] a\n- [x] b\n- [ ] c");
  });

  it("preserves indentation on nested items", () => {
    expect(toggleTaskAtLine("- [ ] parent\n  - [ ] child", 1)).toBe(
      "- [ ] parent\n  - [x] child"
    );
  });

  it("throws when the line is not a task marker", () => {
    expect(() => toggleTaskAtLine("- [ ] a\nregular text", 1)).toThrow();
  });

  it("throws when line number is out of range", () => {
    expect(() => toggleTaskAtLine("- [ ] only", 5)).toThrow();
  });
});
