import { describe, expect, test } from "vitest";
import { isEmailAllowed, parseAllowlist } from "./allowlist";

describe("parseAllowlist", () => {
  test("splits on commas, trims, and lowercases", () => {
    expect(parseAllowlist(" A@Example.com , b@example.com,")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  test("returns an empty list when unset", () => {
    expect(parseAllowlist(undefined)).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  test("accepts an email present in a comma-separated list", () => {
    expect(isEmailAllowed("b@example.com", "a@example.com,b@example.com")).toBe(
      true,
    );
  });

  test("accepts the email when the list has a single entry", () => {
    expect(isEmailAllowed("a@example.com", "a@example.com")).toBe(true);
  });

  test("ignores whitespace around entries", () => {
    expect(isEmailAllowed("b@example.com", "a@example.com, b@example.com ")).toBe(
      true,
    );
  });

  test("matches case-insensitively", () => {
    expect(isEmailAllowed("A@Example.com", "a@example.com")).toBe(true);
  });

  test("rejects an email not in the list", () => {
    expect(isEmailAllowed("c@example.com", "a@example.com,b@example.com")).toBe(
      false,
    );
  });

  test("rejects everyone when the allowlist is unset", () => {
    expect(isEmailAllowed("a@example.com", undefined)).toBe(false);
  });

  test("rejects everyone when the allowlist is empty", () => {
    expect(isEmailAllowed("a@example.com", "")).toBe(false);
  });

  test("rejects a null email", () => {
    expect(isEmailAllowed(null, "a@example.com")).toBe(false);
  });
});
