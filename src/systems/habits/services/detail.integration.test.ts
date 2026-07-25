import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { addDays, todayString } from "../lib/dates";
import { archiveHabit, createHabit } from "./habits";
import { upsertTick } from "./ticks";
import { getHabitDetail } from "./detail";

describe("habit detail", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("returns the last-30 window, entries, and topic state", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, today, "COMPLETE");
    await upsertTick(habit.id, addDays(today, -29), "PARTIAL");

    await prisma.journalEntry.create({
      data: { topicId: habit.journalTopicId!, title: "Felt strong", body: "5k in the rain" },
    });
    await prisma.journalEntry.create({
      data: { topicId: habit.journalTopicId!, title: null, body: "Short one.\nMore detail here." },
    });

    const detail = (await getHabitDetail(habit.id, today))!;
    expect(detail.topicState).toBe("ok");
    expect(detail.topicName).toBe("Run");
    expect(detail.summary).toBeNull();
    expect(detail.last30).toHaveLength(2);
    expect(detail.entries).toHaveLength(2);
    const untitled = detail.entries.find((e) => e.title === null)!;
    expect(untitled.excerpt).toBe("Short one.");
  });

  it("excludes soft-deleted entries and ticks outside the window", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, addDays(today, -30), "COMPLETE"); // one day too old
    await prisma.journalEntry.create({
      data: { topicId: habit.journalTopicId!, body: "gone", deletedAt: new Date() },
    });
    const detail = (await getHabitDetail(habit.id, today))!;
    expect(detail.last30).toEqual([]);
    expect(detail.entries).toEqual([]);
  });

  it("reports archived and missing topics", async () => {
    const habit = await createHabit("Run");
    await archiveHabit(habit.id);
    let detail = (await getHabitDetail(habit.id, todayString()))!;
    expect(detail.topicState).toBe("archived");

    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: null, archived: false } });
    detail = (await getHabitDetail(habit.id, todayString()))!;
    expect(detail.topicState).toBe("missing");
    expect(detail.entries).toEqual([]);
  });

  it("returns null for an unknown habit", async () => {
    expect(await getHabitDetail("nope", todayString())).toBeNull();
  });
});
