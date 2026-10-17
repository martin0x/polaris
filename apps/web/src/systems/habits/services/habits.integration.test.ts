import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { prisma } from "@/platform/db/client";
import { Prisma } from "@/generated/prisma/client";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { fakeJournal } from "@/test/fakeJournal";
import {
  archiveHabit, createHabit, recreateTopic, renameHabit, reorderHabits,
  setQuote, TopicNameCollisionError, unarchiveHabit,
} from "./habits";

// Habits reaches the journal (Convex) only through journalBridge; the
// in-memory fake keeps these tests off the network.
vi.mock("@/systems/habits/services/journalBridge", () => import("@/test/fakeJournal"));

describe("habits service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(async () => { fakeJournal.reset(); await withCleanHabitTables(); });

  it("creates a habit and its same-name topic", async () => {
    const habit = await createHabit("Morning run");
    expect(habit.position).toBe(1);
    expect(fakeJournal.topic(habit.journalTopicId!)?.name).toBe("Morning run");
  });

  it("links an existing same-name topic instead of failing", async () => {
    const topicId = fakeJournal.addTopic("Reading");
    const habit = await createHabit("Reading");
    expect(habit.journalTopicId).toBe(topicId);
  });

  it("positions habits sequentially", async () => {
    await createHabit("A");
    const b = await createHabit("B");
    expect(b.position).toBe(2);
  });

  it("rename syncs the topic", async () => {
    const habit = await createHabit("Old name");
    await renameHabit(habit.id, "New name");
    expect(fakeJournal.topic(habit.journalTopicId!)?.name).toBe("New name");
  });

  it("rename collision with a foreign topic changes nothing", async () => {
    fakeJournal.addTopic("Taken");
    const habit = await createHabit("Mine");
    await expect(renameHabit(habit.id, "Taken")).rejects.toBeInstanceOf(TopicNameCollisionError);
    const fresh = await prisma.habit.findUnique({ where: { id: habit.id } });
    expect(fresh?.name).toBe("Mine");
    expect(fakeJournal.topic(habit.journalTopicId!)?.name).toBe("Mine");
  });

  it("orphaned-habit rename collision is a habit error, not a topic error", async () => {
    await createHabit("Live");
    const orphan = await createHabit("Orphan");
    await prisma.habit.update({ where: { id: orphan.id }, data: { journalTopicId: null } });
    const err = await renameHabit(orphan.id, "Live").catch((e) => e);
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(err).not.toBeInstanceOf(TopicNameCollisionError);
  });

  it("archive and unarchive sync the topic", async () => {
    const habit = await createHabit("Stretch");
    await archiveHabit(habit.id);
    expect(fakeJournal.topic(habit.journalTopicId!)?.archived).toBe(true);
    await unarchiveHabit(habit.id);
    expect(fakeJournal.topic(habit.journalTopicId!)?.archived).toBe(false);
  });

  it("archive survives a missing topic", async () => {
    const habit = await createHabit("Orphan");
    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: "gone" } });
    expect((await archiveHabit(habit.id)).archived).toBe(true);
  });

  it("reorder rewrites positions and rejects bad lists", async () => {
    const a = await createHabit("A");
    const b = await createHabit("B");
    await reorderHabits([b.id, a.id]);
    const rows = await prisma.habit.findMany({ orderBy: { position: "asc" } });
    expect(rows.map((r) => r.name)).toEqual(["B", "A"]);
    await expect(reorderHabits([a.id])).rejects.toThrow("reorder list mismatch");
  });

  it("stores and clears the quote", async () => {
    const habit = await createHabit("Write");
    await setQuote(habit.id, "Little and often.");
    await setQuote(habit.id, null);
    const fresh = await prisma.habit.findUnique({ where: { id: habit.id } });
    expect(fresh?.quote).toBeNull();
  });

  it("recreates a lost topic", async () => {
    const habit = await createHabit("Meditate");
    fakeJournal.removeTopic(habit.journalTopicId!);
    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: null } });
    const fixed = await recreateTopic(habit.id);
    expect(fakeJournal.topic(fixed.journalTopicId!)?.name).toBe("Meditate");
  });
});
