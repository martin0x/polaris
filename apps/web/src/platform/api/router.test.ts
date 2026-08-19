import { describe, it, expect } from "vitest";
import { matchRoute } from "./router";

describe("matchRoute", () => {
  it("matches an exact static route", () => {
    const result = matchRoute("GET /items", "GET", ["items"]);
    expect(result).toEqual({});
  });

  it("rejects wrong method", () => {
    const result = matchRoute("POST /items", "GET", ["items"]);
    expect(result).toBeNull();
  });

  it("matches a route with one param", () => {
    const result = matchRoute("GET /items/:id", "GET", ["items", "abc123"]);
    expect(result).toEqual({ id: "abc123" });
  });

  it("matches a route with multiple params", () => {
    const result = matchRoute(
      "GET /items/:id/comments/:commentId",
      "GET",
      ["items", "abc", "comments", "xyz"]
    );
    expect(result).toEqual({ id: "abc", commentId: "xyz" });
  });

  it("rejects mismatched path length", () => {
    const result = matchRoute("GET /items/:id", "GET", ["items"]);
    expect(result).toBeNull();
  });

  it("rejects mismatched static segment", () => {
    const result = matchRoute("GET /items/:id", "GET", ["users", "abc"]);
    expect(result).toBeNull();
  });
});
