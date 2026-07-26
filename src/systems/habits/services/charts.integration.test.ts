import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { requireTestDatabase, withCleanHabitTables } from "@/test/db";
import { addDays, todayString } from "../lib/dates";
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
    expect(last.complete).toBe(Math.round((1 / 7) * 100));
    expect(last.partial).toBe(Math.round((0.5 / 7) * 100));
  });
});
