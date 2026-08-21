import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createEntry as createEntryRoute, listEntries, updateEntry, deleteEntry } from "./entries";
import { createTopic } from "../services/topics";

vi.mock("@/platform/feedback", () => ({
  feedback: { recordMetric: vi.fn().mockResolvedValue(undefined) },
}));
import { feedback } from "@/platform/feedback";
const mockedRecordMetric = vi.mocked(feedback.recordMetric);

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/systems/journal/entries", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/systems/journal/entries${query}`, {
    method: "GET",
  });
}

describe("entries routes", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(async () => {
    mockedRecordMetric.mockClear();
    await withCleanJournalTables();
  });

  it("POST /entries creates and records both metrics", async () => {
    const topic = await createTopic({ name: "Polaris" });

    const res = await createEntryRoute(
      jsonRequest("POST", { topicId: topic.id, body: "first #milestone" }),
      {}
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.entry.tags).toEqual(["milestone"]);

    expect(mockedRecordMetric).toHaveBeenCalledWith("journal", "entry_created", 1);
    expect(mockedRecordMetric).toHaveBeenCalledWith("journal", "words_per_entry", 2);
  });

  it("POST /entries returns 400 for invalid body", async () => {
    const res = await createEntryRoute(
      jsonRequest("POST", { topicId: "" }),
      {}
    );
    expect(res.status).toBe(400);
  });

  it("PATCH /entries/:id re-records words_per_entry", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const created = await createEntryRoute(
      jsonRequest("POST", { topicId: topic.id, body: "two words" }),
      {}
    );
    const { entry } = await created.json();

    const res = await updateEntry(
      jsonRequest("PATCH", { body: "now we have four words total" }),
      { id: entry.id }
    );
    expect(res.status).toBe(200);

    const wordsPerEntryCalls = mockedRecordMetric.mock.calls
      .filter(([, name]) => name === "words_per_entry")
      .map(([, , value]) => value);
    expect(wordsPerEntryCalls).toEqual([2, 6]);
  });

  it("DELETE /entries/:id soft-deletes and is idempotent", async () => {
    const topic = await createTopic({ name: "Polaris" });
    const created = await createEntryRoute(
      jsonRequest("POST", { topicId: topic.id, body: "x" }),
      {}
    );
    const { entry } = await created.json();

    const first = await deleteEntry(jsonRequest("DELETE", {}), { id: entry.id });
    const second = await deleteEntry(jsonRequest("DELETE", {}), { id: entry.id });
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);

    const list = await listEntries(listRequest(), {});
    const json = await list.json();
    expect(json.entries).toHaveLength(0);
  });

  it("GET /entries supports q (FTS) path", async () => {
    const topic = await createTopic({ name: "Polaris" });
    await createEntryRoute(jsonRequest("POST", { topicId: topic.id, body: "alpha" }), {});
    await createEntryRoute(jsonRequest("POST", { topicId: topic.id, body: "beta" }), {});

    const res = await listEntries(listRequest("?q=alpha"), {});
    const json = await res.json();
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].body).toBe("alpha");
  });
});
