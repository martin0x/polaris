import { describe, it, expect } from "vitest";
import {
  addDays, formatWeekRange, isDateString, mondayOf, toDateString,
  todayString, toUtcDate, weekDates,
} from "./dates";

describe("dates", () => {
  it("validates date strings", () => {
    expect(isDateString("2026-07-23")).toBe(true);
    expect(isDateString("2026-7-23")).toBe(false);
    expect(isDateString("garbage")).toBe(false);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-04-31")).toBe(false);
    expect(isDateString("2024-02-29")).toBe(true); // leap day
  });

  it("round-trips through UTC", () => {
    expect(toDateString(toUtcDate("2026-07-23"))).toBe("2026-07-23");
  });

  it("adds days across month and year bounds", () => {
    expect(addDays("2026-07-23", 1)).toBe("2026-07-24");
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("finds the ISO Monday", () => {
    expect(mondayOf("2026-07-23")).toBe("2026-07-20"); // Thursday → Monday
    expect(mondayOf("2026-07-20")).toBe("2026-07-20"); // Monday is fixed point
    expect(mondayOf("2026-07-26")).toBe("2026-07-20"); // Sunday belongs to prior Monday
  });

  it("lists the week's dates", () => {
    const w = weekDates("2026-07-20");
    expect(w).toHaveLength(7);
    expect(w[0]).toBe("2026-07-20");
    expect(w[6]).toBe("2026-07-26");
  });

  it("today respects the timezone", () => {
    // 2026-07-23T20:00:00Z is already the 24th in Manila (UTC+8)
    const real = Date.now;
    Date.now = () => new Date("2026-07-23T20:00:00Z").getTime();
    try {
      expect(todayString("Asia/Manila")).toBe("2026-07-24");
      expect(todayString("UTC")).toBe("2026-07-23");
    } finally {
      Date.now = real;
    }
  });

  it("formats week ranges", () => {
    expect(formatWeekRange("2026-07-20")).toBe("Jul 20–26, 2026");
    expect(formatWeekRange("2026-06-29")).toBe("Jun 29 – Jul 5, 2026");
    expect(formatWeekRange("2025-12-29")).toBe("Dec 29, 2025 – Jan 4, 2026");
  });
});
