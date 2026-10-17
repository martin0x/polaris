import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";
import { requireTestDatabase } from "@/test/db";

vi.mock("@convex-dev/auth/nextjs/server", () => ({
  isAuthenticatedNextjs: vi.fn(),
  // Read by the journal and expenses palette layers; a fake token is enough
  // since fetchQuery itself is mocked below.
  convexAuthNextjsToken: vi.fn(async () => "test-token"),
}));

// The journal and expenses layers call Convex directly; this suite has no live
// deployment, so fetchQuery answers per function from the fixtures below.
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn() }));

import { isAuthenticatedNextjs } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { POST } from "./route";

const POLARIS = { id: "topic-polaris", name: "Polaris", description: null, archived: false };
const NOTE = {
  id: "entry-1",
  topicId: POLARIS.id,
  topicName: "Polaris",
  title: null,
  body: "polaris ship note",
  tags: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/palette/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockedIsAuthenticated = vi.mocked(isAuthenticatedNextjs);
const mockedFetchQuery = vi.mocked(fetchQuery);

describe("POST /api/platform/palette/search", () => {
  beforeAll(() => requireTestDatabase()); // the habits layer still reads Postgres
  beforeEach(() => {
    mockedIsAuthenticated.mockReset();
    mockedIsAuthenticated.mockResolvedValue(true);
    mockedFetchQuery.mockReset();
    mockedFetchQuery.mockImplementation((async (ref: unknown) => {
      switch (getFunctionName(ref as never)) {
        case "journal/topics:search":
          return [POLARIS];
        case "journal/entries:search":
          return { entries: [NOTE] };
        default:
          return []; // expenses
      }
    }) as never);
  });

  it("returns 401 when there is no session", async () => {
    mockedIsAuthenticated.mockResolvedValueOnce(false);
    const res = await POST(jsonRequest({ query: "" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing the query field", async () => {
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("happy path: top-level empty query lists matched systems with layers", async () => {
    const res = await POST(jsonRequest({ query: "" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const journal = json.matchedSystems.find((s: { name: string }) => s.name === "journal");
    expect(journal.layers).toEqual([
      { name: "topics", singular: "topic" },
      { name: "notes", singular: "note" },
    ]);
  });

  it("happy path: top-level query returns layered journal results", async () => {
    const res = await POST(jsonRequest({ query: "polaris" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    const topicHit = json.results.find((r: { id: string }) => r.id === POLARIS.id);
    expect(topicHit).toMatchObject({
      systemName: "journal",
      layerIndex: 0,
      layerName: "topics",
      drillable: true,
      href: "/journal/topics/Polaris",
    });
    const noteHit = json.results.find((r: { id: string }) => r.id === NOTE.id);
    expect(noteHit).toMatchObject({ layerName: "notes", label: "polaris ship note" });
    expect(noteHit.href).toBe("/journal/topics/Polaris#entry-entry-1");
  });

  it("scoped query: passes the parent topic to journal search", async () => {
    const res = await POST(
      jsonRequest({
        query: "deploy",
        scope: { systemName: "journal", layerIndex: 1, parentId: POLARIS.id },
      })
    );
    const json = await res.json();
    expect(json.results.length).toBeGreaterThan(0);
    expect(json.results.every((r: { href: string }) => r.href.includes("/Polaris"))).toBe(true);
    const call = mockedFetchQuery.mock.calls.find(
      ([ref]) => getFunctionName(ref as never) === "journal/entries:search"
    );
    expect(call?.[1]).toEqual({ q: "deploy", topicId: POLARIS.id, limit: 20 });
  });
});
