import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.*s");

function setup() {
  const t = convexTest(schema, modules);
  return { t, asUser: t.withIdentity({ subject: "user1|session1" }) };
}

const bridge = api.journal.habitBridge;

describe("journal habit bridge", () => {
  it("requires sign-in", async () => {
    const { t } = setup();
    await expect(t.mutation(bridge.ensureTopic, { name: "Run" })).rejects.toThrow("Unauthorized");
    await expect(t.query(bridge.topicState, { ref: "x" })).rejects.toThrow("Unauthorized");
  });

  it("ensureTopic creates a topic once, then returns the same-name topic", async () => {
    const { asUser } = setup();
    const first = await asUser.mutation(bridge.ensureTopic, { name: " Run " });
    expect(await asUser.mutation(bridge.ensureTopic, { name: "Run" })).toBe(first);
    expect((await asUser.query(api.journal.topics.list, {})).map((t) => t.name)).toEqual(["Run"]);
    await expect(asUser.mutation(bridge.ensureTopic, { name: " " })).rejects.toThrow(
      "Topic name must be 1-80 characters"
    );
  });

  it("topicState resolves Convex ids and imported legacy cuids", async () => {
    const { t, asUser } = setup();
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    const legacy = await t.run((ctx) =>
      ctx.db.insert("journalTopics", {
        name: "Read", archived: true, createdAt: 1, updatedAt: 1, legacyId: "clegacy1",
      })
    );
    expect(await asUser.query(bridge.topicState, { ref: id })).toEqual({ id, name: "Run", archived: false });
    expect(await asUser.query(bridge.topicState, { ref: "clegacy1" })).toEqual({
      id: legacy, name: "Read", archived: true,
    });
    expect(await asUser.query(bridge.topicState, { ref: "gone" })).toBeNull();
  });

  it("renameTopic renames, reports a collision, and ignores missing or unchanged topics", async () => {
    const { asUser } = setup();
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    await asUser.mutation(bridge.ensureTopic, { name: "Taken" });
    expect(await asUser.mutation(bridge.renameTopic, { ref: id, name: "Jog" })).toEqual({ ok: true });
    expect((await asUser.query(bridge.topicState, { ref: id }))!.name).toBe("Jog");
    expect(await asUser.mutation(bridge.renameTopic, { ref: id, name: "Taken" })).toEqual({
      ok: false, reason: "collision",
    });
    expect((await asUser.query(bridge.topicState, { ref: id }))!.name).toBe("Jog");
    expect(await asUser.mutation(bridge.renameTopic, { ref: id, name: "Jog" })).toEqual({ ok: true });
    expect(await asUser.mutation(bridge.renameTopic, { ref: "gone", name: "Any" })).toEqual({ ok: true });
  });

  it("setTopicArchived archives and unarchives, and ignores a missing topic", async () => {
    const { t, asUser } = setup();
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    await asUser.mutation(bridge.setTopicArchived, { ref: id, archived: true });
    let doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc!.archived).toBe(true);
    expect(typeof doc!.archivedAt).toBe("number");
    await asUser.mutation(bridge.setTopicArchived, { ref: id, archived: false });
    doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc!.archived).toBe(false);
    expect(doc!.archivedAt).toBeUndefined();
    expect(await asUser.mutation(bridge.setTopicArchived, { ref: "gone", archived: true })).toBeNull();
  });

  it("createLog refuses missing and archived topics", async () => {
    const { asUser } = setup();
    expect(await asUser.mutation(bridge.createLog, { ref: "gone", body: "x" })).toEqual({
      ok: false, reason: "missing",
    });
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    await asUser.mutation(bridge.setTopicArchived, { ref: id, archived: true });
    expect(await asUser.mutation(bridge.createLog, { ref: id, body: "x" })).toEqual({
      ok: false, reason: "archived",
    });
  });

  it("createLog writes a backdated, unedited entry with tags and records journal metrics", async () => {
    vi.useFakeTimers();
    const { t, asUser } = setup();
    const id = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    const when = Date.UTC(2026, 9, 15, 4, 0); // noon Manila
    const result = await asUser.mutation(bridge.createLog, {
      ref: id, title: "Felt strong", body: "5k in the rain #cardio", createdAt: when,
    });
    expect(result).toMatchObject({ ok: true, entry: { title: "Felt strong", body: "5k in the rain #cardio", createdAt: when } });
    const entryId = (result as { entry: { id: string } }).entry.id;
    const doc = await t.run((ctx) => ctx.db.get(entryId as never));
    expect(doc).toMatchObject({ topicId: id, tags: ["cardio"], createdAt: when, updatedAt: when });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const names = (await t.run((ctx) => ctx.db.query("systemMetrics").collect())).map((m) => m.name);
    expect(names).toEqual(["entry_created", "words_per_entry"]);
  });

  it("topicEntries returns one topic's live entries in [fromMs, toMs), oldest first", async () => {
    const { t, asUser } = setup();
    const run = await asUser.mutation(bridge.ensureTopic, { name: "Run" });
    const read = await asUser.mutation(bridge.ensureTopic, { name: "Read" });
    await t.run(async (ctx) => {
      await ctx.db.patch(run, { legacyId: "crun" });
    });
    const at = async (ref: string, createdAt: number, body: string) =>
      (await asUser.mutation(bridge.createLog, { ref, body, createdAt })) as { ok: true; entry: { id: string } };
    const inside2 = await at(run, 2_000, "b");
    const inside1 = await at(run, 1_000, "a");
    await at(run, 3_000, "edge — excluded");
    await at(read, 1_500, "other topic");
    const gone = await at(run, 1_200, "deleted");
    await asUser.mutation(api.journal.entries.remove, { id: gone.entry.id as never });

    const rows = await asUser.query(bridge.topicEntries, { ref: "crun", fromMs: 1_000, toMs: 3_000 });
    expect(rows.map((r) => r.id)).toEqual([inside1.entry.id, inside2.entry.id]);
    expect(rows[0]).toEqual({ id: inside1.entry.id, title: null, body: "a", createdAt: 1_000 });
    expect(await asUser.query(bridge.topicEntries, { ref: "gone", fromMs: 0, toMs: 9 })).toEqual([]);
  });
});
