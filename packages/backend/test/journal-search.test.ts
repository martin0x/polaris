import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const polaris = await asUser.mutation(api.journal.topics.create, { name: "Polaris" });
  const other = await asUser.mutation(api.journal.topics.create, { name: "Other" });
  const make = async (topicId: typeof polaris.id, body: string, title?: string, at = Date.now()) => {
    vi.setSystemTime(at);
    return asUser.mutation(api.journal.entries.create, { topicId, body, ...(title ? { title } : {}) });
  };
  return { t, asUser, polaris, other, make };
}

const sorted = (ids: string[]) => [...ids].sort();

describe("journal search", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("keeps only entries containing every term", async () => {
    const { asUser, polaris, make } = await setup();
    const both = await make(polaris.id, "react hooks are neat");
    await make(polaris.id, "react only here");
    await make(polaris.id, "hooks only here");
    const { entries } = await asUser.query(api.journal.entries.search, { q: "react hooks" });
    expect(entries.map((e) => e.id)).toEqual([both]);
    expect(entries[0].topicName).toBe("Polaris");
  });

  it("matches terms as word prefixes, case-insensitively, including the title", async () => {
    const { asUser, polaris, make } = await setup();
    const deploy = await make(polaris.id, "deploying the app");
    const titled = await make(polaris.id, "nothing here", "Deploy notes");
    await make(polaris.id, "redeploy later");
    const { entries } = await asUser.query(api.journal.entries.search, { q: "DEPLO" });
    expect(sorted(entries.map((e) => e.id))).toEqual(sorted([deploy, titled]));
  });

  it("scopes to a topic and never returns deleted entries", async () => {
    const { asUser, polaris, other, make } = await setup();
    const keep = await make(polaris.id, "deploy ship note");
    await make(other.id, "deploy elsewhere");
    const gone = await make(polaris.id, "deploy removed");
    await asUser.mutation(api.journal.entries.remove, { id: gone });
    const { entries } = await asUser.query(api.journal.entries.search, { q: "deploy", topicId: polaris.id });
    expect(entries.map((e) => e.id)).toEqual([keep]);
  });

  it("an empty query lists the newest live entries (palette browse), topic-scoped too", async () => {
    const { asUser, polaris, other, make } = await setup();
    const a = await make(polaris.id, "first", undefined, 1_000);
    const b = await make(other.id, "second", undefined, 2_000);
    const c = await make(polaris.id, "third", undefined, 3_000);
    expect((await asUser.query(api.journal.entries.search, { q: "  " })).entries.map((e) => e.id)).toEqual([c, b, a]);
    expect(
      (await asUser.query(api.journal.entries.search, { q: "", topicId: polaris.id })).entries.map((e) => e.id)
    ).toEqual([c, a]);
  });

  it("a punctuation-only query matches nothing", async () => {
    const { asUser, polaris, make } = await setup();
    await make(polaris.id, "anything");
    expect((await asUser.query(api.journal.entries.search, { q: "!!! --" })).entries).toEqual([]);
  });

  it("respects the limit and requires sign-in", async () => {
    const { t, asUser, polaris, make } = await setup();
    for (let i = 0; i < 5; i++) await make(polaris.id, `deploy number ${i}`);
    expect((await asUser.query(api.journal.entries.search, { q: "deploy", limit: 2 })).entries).toHaveLength(2);
    await expect(t.query(api.journal.entries.search, { q: "deploy" })).rejects.toThrow("Unauthorized");
  });
});
