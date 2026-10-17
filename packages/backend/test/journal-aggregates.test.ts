import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import crons from "../convex/crons";

const modules = import.meta.glob("../convex/**/*.*s");
const DAY = 86_400_000;

async function setup() {
  const t = convexTest(schema, modules);
  const asUser = t.withIdentity({ subject: "user1|session1" });
  const polaris = await asUser.mutation(api.journal.topics.create, { name: "Polaris" });
  const other = await asUser.mutation(api.journal.topics.create, { name: "Other" });
  const make = async (topicId: typeof polaris.id, body: string, at: number) => {
    vi.setSystemTime(at);
    return asUser.mutation(api.journal.entries.create, { topicId, body });
  };
  return { t, asUser, polaris, other, make };
}

describe("journal aggregates", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("listWithStats counts live entries and the latest entry per topic", async () => {
    const { asUser, polaris, other, make } = await setup();
    await make(polaris.id, "a", 1_000);
    await make(polaris.id, "b", 3_000);
    const gone = await make(polaris.id, "c", 5_000);
    await asUser.mutation(api.journal.entries.remove, { id: gone });
    const archived = await asUser.mutation(api.journal.topics.create, { name: "Zed" });
    await asUser.mutation(api.journal.topics.update, { id: archived.id, archived: true });

    const stats = await asUser.query(api.journal.topics.listWithStats, {});
    expect(stats.map((s) => [s.name, s.entryCount, s.lastEntryAt])).toEqual([
      ["Other", 0, null],
      ["Polaris", 2, 3_000],
    ]);
    expect(stats[0].id).toBe(other.id);
    expect(await asUser.query(api.journal.topics.listWithStats, { includeArchived: true })).toHaveLength(3);
  });

  it("tags.list counts live entries per tag, sorted by tag", async () => {
    const { asUser, polaris, make } = await setup();
    await make(polaris.id, "#zeta #alpha", 1_000);
    const two = await make(polaris.id, "#alpha", 2_000);
    const gone = await make(polaris.id, "#beta", 3_000);
    await asUser.mutation(api.journal.entries.remove, { id: gone });
    expect(await asUser.query(api.journal.tags.list, {})).toEqual([
      { tag: "alpha", count: 2 },
      { tag: "zeta", count: 1 },
    ]);
    await asUser.mutation(api.journal.entries.update, { id: two, body: "#zeta" });
    expect(await asUser.query(api.journal.tags.list, {})).toEqual([
      { tag: "alpha", count: 1 },
      { tag: "zeta", count: 2 },
    ]);
  });

  it("dashboard counts entries in the Manila day and yesterday, with the last entry", async () => {
    const { asUser, polaris, make } = await setup();
    const now = Date.UTC(2026, 9, 18, 2, 0); // 10:00 Manila, Oct 18
    const todayStart = Date.UTC(2026, 9, 17, 16, 0); // 00:00 Manila, Oct 18
    await make(polaris.id, "two days ago", todayStart - DAY - 1);
    await make(polaris.id, "yesterday", todayStart - 1);
    await make(polaris.id, "today early", todayStart);
    const last = await make(polaris.id, "today late", now);
    const summary = await asUser.query(api.journal.dashboard.summary, { now });
    expect(summary.todayCount).toBe(2);
    expect(summary.yesterdayCount).toBe(1);
    expect(summary.lastEntry).toMatchObject({ id: last, topicName: "Polaris", body: "today late" });
  });

  it("dashboard is empty-safe", async () => {
    const { asUser } = await setup();
    expect(await asUser.query(api.journal.dashboard.summary, { now: Date.now() })).toEqual({
      todayCount: 0,
      yesterdayCount: 0,
      lastEntry: null,
    });
  });
});

describe("journal nightly job", () => {
  it("counts topics with live entries in the last 7 days and records the metric", async () => {
    vi.useFakeTimers();
    const { t, asUser, polaris, other, make } = await setup();
    const now = Date.UTC(2026, 9, 18, 15, 0);
    await make(polaris.id, "recent", now - DAY);
    await make(polaris.id, "recent too", now - 2 * DAY);
    await make(other.id, "too old", now - 8 * DAY);
    const deleted = await make(other.id, "deleted", now - DAY);
    await asUser.mutation(api.journal.entries.remove, { id: deleted });

    expect(await t.mutation(internal.journal.activeTopics.compute, { now })).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const metrics = await t.run((ctx) => ctx.db.query("systemMetrics").collect());
    expect(metrics.filter((m) => m.name === "active_topic_count").map((m) => m.value)).toEqual([1]);
  });

  it("runs daily at 15:00 UTC (23:00 Manila)", () => {
    const job = (crons as unknown as { crons: Record<string, { name: string; schedule: unknown }> }).crons[
      "journal active topics"
    ];
    expect(job.schedule).toEqual({ type: "daily", hourUTC: 15, minuteUTC: 0 });
    expect(job.name).toBe("journal/activeTopics:compute");
  });
});
