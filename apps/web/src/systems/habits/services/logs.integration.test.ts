import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { prisma } from "@/platform/db/client";
import { fakeJournal } from "@/test/fakeJournal";
import { addDays, noonInTz, todayString } from "@polaris/core/dates";
import { createHabit } from "./habits";
import { createLog, TopicArchivedError, TopicMissingError } from "./logs";
import { FutureDateError } from "./ticks";

// Habits reaches the journal (Convex) only through journalBridge; the
// in-memory fake keeps these tests off the network.
vi.mock("@/systems/habits/services/journalBridge", () => import("@/test/fakeJournal"));

describe("createLog", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(async () => { fakeJournal.reset(); await withCleanHabitTables(); });

  it("creates a today log under the habit's topic with a current timestamp", async () => {
    const habit = await createHabit("Run");
    const before = Date.now();
    const log = await createLog(habit.id, todayString(), { body: "Did 5k #cardio" });
    const entry = fakeJournal.entry(log.id)!;
    expect(entry.topicId).toBe(habit.journalTopicId);
    expect(entry.createdAt).toBeGreaterThanOrEqual(before - 1000);
    expect(entry.createdAt).toBeLessThanOrEqual(Date.now() + 1000);
    expect(log.excerpt).toBe("Did 5k #cardio");
    // (tag extraction is the journal's job now — covered by the Convex bridge tests)
  });

  it("backdates a past-day log to noon POLARIS_TZ on that day", async () => {
    const habit = await createHabit("Run");
    const date = addDays(todayString(), -3);
    const log = await createLog(habit.id, date, { title: "Missed note", body: "Backfilled" });
    const entry = fakeJournal.entry(log.id)!;
    expect(entry.createdAt).toBe(noonInTz(date).getTime());
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
    fakeJournal.setArchived(habit.journalTopicId!, true);
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

  it("rejects when the topic is gone", async () => {
    const habit = await createHabit("Run");
    fakeJournal.removeTopic(habit.journalTopicId!);
    await expect(
      createLog(habit.id, todayString(), { body: "Nope" })
    ).rejects.toBeInstanceOf(TopicMissingError);
  });
});
