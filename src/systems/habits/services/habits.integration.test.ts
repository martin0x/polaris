import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "@/platform/db/client";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { createTopic } from "@/systems/journal/services/topics";
import {
  archiveHabit, createHabit, recreateTopic, renameHabit, reorderHabits,
  setQuote, TopicNameCollisionError, unarchiveHabit,
} from "./habits";

describe("habits service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("creates a habit and its same-name topic", async () => {
    const habit = await createHabit("Morning run");
    expect(habit.position).toBe(1);
    const topic = await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId! } });
    expect(topic?.name).toBe("Morning run");
  });

  it("links an existing same-name topic instead of failing", async () => {
    const topic = await createTopic({ name: "Reading" });
    const habit = await createHabit("Reading");
    expect(habit.journalTopicId).toBe(topic.id);
  });

  it("positions habits sequentially", async () => {
    await createHabit("A");
    const b = await createHabit("B");
    expect(b.position).toBe(2);
  });

  it("rename syncs the topic atomically", async () => {
    const habit = await createHabit("Old name");
    await renameHabit(habit.id, "New name");
    const topic = await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId! } });
    expect(topic?.name).toBe("New name");
  });

  it("rename collision with a foreign topic changes nothing", async () => {
    await createTopic({ name: "Taken" });
    const habit = await createHabit("Mine");
    await expect(renameHabit(habit.id, "Taken")).rejects.toBeInstanceOf(TopicNameCollisionError);
    const fresh = await prisma.habit.findUnique({ where: { id: habit.id } });
    expect(fresh?.name).toBe("Mine");
  });

  it("archive and unarchive sync the topic", async () => {
    const habit = await createHabit("Stretch");
    await archiveHabit(habit.id);
    let topic = await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId! } });
    expect(topic?.archived).toBe(true);
    await unarchiveHabit(habit.id);
    topic = await prisma.journalTopic.findUnique({ where: { id: habit.journalTopicId! } });
    expect(topic?.archived).toBe(false);
  });

  it("archive survives a missing topic", async () => {
    const habit = await createHabit("Orphan");
    await prisma.journalEntry.deleteMany({});
    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: "gone" } });
    const archived = await archiveHabit(habit.id);
    expect(archived.archived).toBe(true);
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
    await prisma.habit.update({ where: { id: habit.id }, data: { journalTopicId: null } });
    await prisma.journalTopic.delete({ where: { name: "Meditate" } });
    const fixed = await recreateTopic(habit.id);
    const topic = await prisma.journalTopic.findUnique({ where: { id: fixed.journalTopicId! } });
    expect(topic?.name).toBe("Meditate");
  });
});
