import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createTopic } from "@/systems/journal/services/topics";
import { createEntry } from "@/systems/journal/services/entries";

vi.mock("@/platform/auth/config", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/platform/auth/config";
import { POST } from "./route";

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/palette/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockedAuth = vi.mocked(auth);

describe("POST /api/platform/palette/search", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(async () => {
    mockedAuth.mockReset();
    await withCleanJournalTables();
  });

  it("returns 401 when there is no session", async () => {
    mockedAuth.mockResolvedValueOnce(null as never);
    const res = await POST(jsonRequest({ query: "" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing the query field", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: "test@example.com" } } as never);
    const res = await POST(jsonRequest({}));
    expect(res.status).toBe(400);
  });

  it("happy path: top-level empty query lists matched systems with layers", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { email: "test@example.com" } } as never);
    const res = await POST(jsonRequest({ query: "" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matchedSystems).toBeDefined();
    const journal = json.matchedSystems.find(
      (s: { name: string }) => s.name === "journal"
    );
    expect(journal).toBeDefined();
    expect(journal.layers).toEqual([
      { name: "topics", singular: "topic" },
      { name: "notes", singular: "note" },
    ]);
  });

  it("happy path: top-level query with topic + entry returns layered results", async () => {
    mockedAuth.mockResolvedValue({ user: { email: "test@example.com" } } as never);
    const topic = await createTopic({ name: "Polaris" });
    await createEntry({ topicId: topic.id, body: "polaris ship note" });

    const res = await POST(jsonRequest({ query: "polaris" }));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.results.some((r: { id: string }) => r.id === topic.id)).toBe(true);
    expect(
      json.results.some(
        (r: { layerName: string; label: string }) =>
          r.layerName === "notes" && r.label.includes("polaris")
      )
    ).toBe(true);

    const topicHit = json.results.find((r: { id: string }) => r.id === topic.id);
    expect(topicHit).toMatchObject({
      systemName: "journal",
      layerIndex: 0,
      layerName: "topics",
      drillable: true,
    });
    expect(topicHit.href).toBe("/journal/topics/Polaris");
  });

  it("scoped query: routes to a specific layer with parentId", async () => {
    mockedAuth.mockResolvedValue({ user: { email: "test@example.com" } } as never);
    const polaris = await createTopic({ name: "Polaris" });
    const otherTopic = await createTopic({ name: "Other" });
    await createEntry({ topicId: polaris.id, body: "deploy ship note" });
    await createEntry({ topicId: otherTopic.id, body: "deploy elsewhere" });

    const res = await POST(
      jsonRequest({
        query: "deploy",
        scope: { systemName: "journal", layerIndex: 1, parentId: polaris.id },
      })
    );
    const json = await res.json();
    expect(json.results.length).toBeGreaterThan(0);
    expect(
      json.results.every((r: { href: string }) => r.href.includes("/Polaris"))
    ).toBe(true);
  });
});
