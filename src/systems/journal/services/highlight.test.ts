import { describe, it, expect } from "vitest";
import { highlight } from "./highlight";

describe("highlight", () => {
  it("wraps each matching term in <mark class=\"hl\">", () => {
    expect(highlight("alpha beta gamma", "beta")).toBe(
      'alpha <mark class="hl">beta</mark> gamma'
    );
  });

  it("is case-insensitive", () => {
    expect(highlight("Alpha BETA gamma", "beta")).toBe(
      'Alpha <mark class="hl">BETA</mark> gamma'
    );
  });

  it("handles multi-token queries", () => {
    expect(highlight("alpha beta gamma", "alpha gamma")).toBe(
      '<mark class="hl">alpha</mark> beta <mark class="hl">gamma</mark>'
    );
  });

  it("escapes regex metacharacters in the query", () => {
    expect(highlight("a+b is hard", "a+b")).toBe(
      '<mark class="hl">a+b</mark> is hard'
    );
  });

  it("escapes HTML in the source text before injecting marks", () => {
    expect(highlight("<script>", "script")).toBe(
      '&lt;<mark class="hl">script</mark>&gt;'
    );
  });

  it("returns the original text when the query is empty", () => {
    expect(highlight("alpha beta", "  ")).toBe("alpha beta");
  });
});
