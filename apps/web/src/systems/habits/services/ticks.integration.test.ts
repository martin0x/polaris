import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { addDays, todayString } from "../lib/dates";
import { createHabit, archiveHabit } from "./habits";
import { FutureDateError, getWeek, removeTick, upsertTick } from "./ticks";

describe("ticks service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("getWeek normalizes to Monday and returns habits + ticks + archived", async () => {
    const habit = await createHabit("Run");
    const other = await createHabit("Old");
    await archiveHabit(other.id);
    const today = todayString();
    await upsertTick(habit.id, today, "PARTIAL");

    const week = await getWeek(today); // any day in the week
    expect(week.monday <= today).toBe(true);
    expect(week.habits.map((h) => h.name)).toEqual(["Run"]);
    expect(week.archivedHabits.map((h) => h.name)).toEqual(["Old"]);
    expect(week.ticks).toEqual([{ habitId: habit.id, date: today, status: "PARTIAL" }]);
  });

  it("upsert overwrites the status for the same day", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, today, "PARTIAL");
    const tick = await upsertTick(habit.id, today, "COMPLETE");
    expect(tick.status).toBe("COMPLETE");
    const week = await getWeek(today);
    expect(week.ticks).toHaveLength(1);
  });

  it("rejects future dates", async () => {
    const habit = await createHabit("Run");
    const tomorrow = addDays(todayString(), 1);
    await expect(upsertTick(habit.id, tomorrow, "PARTIAL")).rejects.toBeInstanceOf(FutureDateError);
  });

  it("removeTick deletes and tolerates absence", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, today, "COMPLETE");
    await removeTick(habit.id, today);
    await removeTick(habit.id, today); // second delete is a no-op
    const week = await getWeek(today);
    expect(week.ticks).toEqual([]);
  });
});
