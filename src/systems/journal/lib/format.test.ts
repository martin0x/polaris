import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { firstLine, relativeTime } from "./format";

describe("firstLine", () => {
  it("returns the first non-blank line trimmed", () => {
    expect(firstLine("\n\nhello world\nsecond", 80)).toBe("hello world");
  });

  it("truncates with an ellipsis when over the max length", () => {
    expect(firstLine("a".repeat(100), 10)).toBe("aaaaaaaaa…");
  });

  it("does not truncate when under the max length", () => {
    expect(firstLine("short", 10)).toBe("short");
  });

  it("returns empty string for empty body", () => {
    expect(firstLine("", 10)).toBe("");
  });

  it("returns empty string when only whitespace", () => {
    expect(firstLine("\n   \n", 10)).toBe("");
  });
});

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("formats minutes", () => {
    expect(relativeTime(new Date("2026-04-26T11:50:00Z"))).toContain("minute");
  });

  it("formats hours", () => {
    expect(relativeTime(new Date("2026-04-26T08:00:00Z"))).toContain("hour");
  });

  it("formats days", () => {
    expect(relativeTime(new Date("2026-04-23T12:00:00Z"))).toContain("day");
  });
});
