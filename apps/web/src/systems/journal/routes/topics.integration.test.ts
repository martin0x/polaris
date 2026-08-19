import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { requireTestDatabase, withCleanJournalTables } from "@/test/db";
import { createTopic, listTopics, updateTopic, getTopic } from "./topics";
import { listTags } from "./tags";

function req(method: string, body?: unknown, url = "http://localhost/api/systems/journal/topics") {
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("topics routes", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanJournalTables());

  it("POST /topics creates a topic and 409s on duplicate name", async () => {
    const first = await createTopic(req("POST", { name: "Polaris" }), {});
    expect(first.status).toBe(201);

    const dup = await createTopic(req("POST", { name: "Polaris" }), {});
    expect(dup.status).toBe(409);
  });

  it("PATCH /topics/:id renames", async () => {
    const created = await createTopic(req("POST", { name: "Old" }), {});
    const { topic } = await created.json();

    const renamed = await updateTopic(req("PATCH", { name: "New" }), { id: topic.id });
    expect(renamed.status).toBe(200);
    const json = await renamed.json();
    expect(json.topic.name).toBe("New");
  });

  it("PATCH /topics/:id archives when archived=true", async () => {
    const created = await createTopic(req("POST", { name: "Polaris" }), {});
    const { topic } = await created.json();

    const res = await updateTopic(
      req("PATCH", { archived: true }),
      { id: topic.id }
    );
    const json = await res.json();
    expect(json.topic.archived).toBe(true);
    expect(json.topic.archivedAt).not.toBeNull();
  });

  it("GET /topics excludes archived by default", async () => {
    await createTopic(req("POST", { name: "alpha" }), {});
    const beta = await createTopic(req("POST", { name: "beta" }), {});
    const { topic } = await beta.json();
    await updateTopic(req("PATCH", { archived: true }), { id: topic.id });

    const list = await listTopics(req("GET", undefined, "http://localhost/api/systems/journal/topics"), {});
    const json = await list.json();
    expect(json.topics.map((t: { name: string }) => t.name)).toEqual(["alpha"]);
  });

  it("GET /topics?archived=true includes archived", async () => {
    await createTopic(req("POST", { name: "alpha" }), {});
    const beta = await createTopic(req("POST", { name: "beta" }), {});
    const { topic } = await beta.json();
    await updateTopic(req("PATCH", { archived: true }), { id: topic.id });

    const list = await listTopics(
      req("GET", undefined, "http://localhost/api/systems/journal/topics?archived=true"),
      {}
    );
    const json = await list.json();
    expect(json.topics).toHaveLength(2);
  });

  it("GET /topics/:id returns the topic", async () => {
    const res = await createTopic(req("POST", { name: "Polaris" }), {});
    const { topic } = await res.json();

    const got = await getTopic(req("GET"), { id: topic.id });
    expect(got.status).toBe(200);
    const json = await got.json();
    expect(json.topic.name).toBe("Polaris");
  });

  it("GET /tags returns tag counts (read-only)", async () => {
    const tags = await listTags(req("GET", undefined, "http://localhost/api/systems/journal/tags"), {});
    expect(tags.status).toBe(200);
    const json = await tags.json();
    expect(json.tags).toEqual([]);
  });
});
