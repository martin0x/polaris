import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { addDays, mondayOf, todayString } from "../lib/dates";
import { createHabit } from "./habits";
import { upsertTick } from "./ticks";
import { getChartsData } from "./charts";

describe("charts service", () => {
  beforeAll(() => requireTestDatabase());
  beforeEach(() => withCleanHabitTables());

  it("is empty-safe", async () => {
    const data = await getChartsData();
    expect(data.hasTicks).toBe(false);
    expect(data.weeks).toHaveLength(12);
    expect(data.calendar).toHaveLength(91);
    expect(data.streaks).toEqual([]);
  });

  it("computes streaks, weekday means, and calendar intensity", async () => {
    const habit = await createHabit("Run");
    const today = todayString();
    await upsertTick(habit.id, today, "COMPLETE");
    await upsertTick(habit.id, addDays(today, -1), "PARTIAL");

    const data = await getChartsData();
    expect(data.hasTicks).toBe(true);
    const s = data.streaks.find((x) => x.id === habit.id)!;
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
    expect(data.calendar.at(-1)).toEqual({ date: today, intensity: 1 });
    expect(data.calendar.at(-2)!.intensity).toBe(0.5);
    // this week's bar includes 1 complete + 0.5 partial credit of 7 days
    const last = data.weeks.at(-1)!;
    const sameWeek = mondayOf(addDays(today, -1)) === mondayOf(today);
    expect(last.complete).toBe(Math.round((1 / 7) * 100));
    expect(last.partial).toBe(sameWeek ? Math.round((0.5 / 7) * 100) : 0);
    if (!sameWeek) {
      // when today is a Monday, yesterday's partial tick falls in the previous week's bar
      expect(data.weeks.at(-2)!.partial).toBe(Math.round((0.5 / 7) * 100));
    }
  });

  it("counts backdated ticks from before the habit's creation day", async () => {
    const habit = await createHabit("Backfill");
    const today = todayString();
    const prevMonday = addDays(mondayOf(today), -7);
    await upsertTick(habit.id, prevMonday, "COMPLETE");

    const data = await getChartsData();
    const prevWeek = data.weeks.at(-2)!;
    expect(prevWeek.complete).toBeGreaterThan(0);
    const cal = data.calendar.find((c) => c.date === prevMonday)!;
    expect(cal.intensity).toBeGreaterThan(0);
  });
});
