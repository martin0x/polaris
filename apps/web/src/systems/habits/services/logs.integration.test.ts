import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { prisma } from "@/platform/db/client";
import { addDays, noonInTz, todayString } from "../lib/dates";
import { createHabit } from "./habits";
import { createLog, TopicArchivedError, TopicMissingError } from "./logs";
import { FutureDateError } from "./ticks";

describe("createLog", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("creates a today log under the habit's topic with a current timestamp", async () => {
    const habit = await createHabit("Run");
    const before = Date.now();
    const log = await createLog(habit.id, todayString(), { body: "Did 5k #cardio" });
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id: log.id } });
    expect(entry.topicId).toBe(habit.journalTopicId);
    expect(entry.tags).toContain("cardio");
    expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(entry.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(log.excerpt).toBe("Did 5k #cardio");
  });

  it("backdates a past-day log to noon POLARIS_TZ on that day", async () => {
    const habit = await createHabit("Run");
    const date = addDays(todayString(), -3);
    const log = await createLog(habit.id, date, { title: "Missed note", body: "Backfilled" });
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id: log.id } });
    expect(entry.createdAt.toISOString()).toBe(noonInTz(date).toISOString());
    expect(entry.title).toBe("Missed note");
  });

  it("rejects future dates", async () => {
    const habit = await createHabit("Run");
    await expect(
      createLog(habit.id, addDays(todayString(), 1), { body: "Nope" })
    ).rejects.toBeInstanceOf(FutureDateError);
  });

  it("rejects when the topic is archived", async () => {
    const habit = await createHabit("Run");
    await prisma.journalTopic.update({
      where: { id: habit.journalTopicId! },
      data: { archived: true },
    });
    await expect(
      createLog(habit.id, todayString(), { body: "Nope" })
    ).rejects.toBeInstanceOf(TopicArchivedError);
  });

  it("rejects when the habit has no topic", async () => {
    const habit = await createHabit("Run");
    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: null } });
    await expect(
      createLog(habit.id, todayString(), { body: "Nope" })
    ).rejects.toBeInstanceOf(TopicMissingError);
  });
});
