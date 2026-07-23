import { describe, it, expect } from "vitest";
import {
  countLapses, creditOf, currentStreak, dayOfWeekMeans, isEligibleWeek,
  longestStreak, type TickStatus,
} from "./stats";

const m = (entries: Array<[string, TickStatus]>) => new Map<string, TickStatus>(entries);

describe("creditOf", () => {
  it("scores complete 1, partial 0.5, off 0", () => {
    expect(creditOf("COMPLETE")).toBe(1);
    expect(creditOf("PARTIAL")).toBe(0.5);
    expect(creditOf(undefined)).toBe(0);
  });
});

describe("currentStreak", () => {
  it("counts consecutive days ending today", () => {
    const t = m([["2026-07-21", "PARTIAL"], ["2026-07-22", "COMPLETE"], ["2026-07-23", "COMPLETE"]]);
    expect(currentStreak(t, "2026-07-23")).toBe(3);
  });

  it("does not break on an unticked today", () => {
    const t = m([["2026-07-21", "COMPLETE"], ["2026-07-22", "COMPLETE"]]);
    expect(currentStreak(t, "2026-07-23")).toBe(2);
  });

  it("is zero after a gap", () => {
    const t = m([["2026-07-20", "COMPLETE"]]);
    expect(currentStreak(t, "2026-07-23")).toBe(0);
  });
});

describe("longestStreak", () => {
  it("finds the longest run anywhere", () => {
    const t = m([
      ["2026-07-01", "COMPLETE"], ["2026-07-02", "PARTIAL"], ["2026-07-03", "COMPLETE"],
      ["2026-07-10", "COMPLETE"], ["2026-07-11", "COMPLETE"],
    ]);
    expect(longestStreak(t)).toBe(3);
  });

  it("is zero with no ticks", () => {
    expect(longestStreak(m([]))).toBe(0);
  });
});

describe("countLapses", () => {
  it("counts runs of two or more missed days", () => {
    // window Jul 1–10; ticks on 1,2,5,8 → misses: 3-4 (lapse), 6-7 (lapse), 9-10 (lapse)
    const t = m([
      ["2026-07-01", "COMPLETE"], ["2026-07-02", "COMPLETE"],
      ["2026-07-05", "PARTIAL"], ["2026-07-08", "COMPLETE"],
    ]);
    expect(countLapses(t, "2026-07-01", "2026-07-10")).toBe(3);
  });

  it("ignores single missed days", () => {
    const t = m([["2026-07-01", "COMPLETE"], ["2026-07-03", "COMPLETE"], ["2026-07-04", "COMPLETE"]]);
    expect(countLapses(t, "2026-07-01", "2026-07-04")).toBe(0);
  });
});

describe("isEligibleWeek", () => {
  it("requires existence before week end and no archive before week start", () => {
    expect(isEligibleWeek("2026-07-22", null, "2026-07-20")).toBe(true);   // created mid-week
    expect(isEligibleWeek("2026-07-27", null, "2026-07-20")).toBe(false);  // created after week
    expect(isEligibleWeek("2026-01-01", "2026-07-19", "2026-07-20")).toBe(false); // archived before
    expect(isEligibleWeek("2026-01-01", "2026-07-22", "2026-07-20")).toBe(true);  // archived mid-week
  });
});

describe("dayOfWeekMeans", () => {
  it("averages credit per weekday, Monday first", () => {
    // Two weeks, Mon Jul 13 & Mon Jul 20: Mondays complete, Tuesdays one partial
    const t = m([
      ["2026-07-13", "COMPLETE"], ["2026-07-20", "COMPLETE"],
      ["2026-07-14", "PARTIAL"],
    ]);
    const means = dayOfWeekMeans(t, "2026-07-13", "2026-07-26");
    expect(means[0]).toBe(1);     // both Mondays complete
    expect(means[1]).toBe(0.25);  // one partial of two Tuesdays
    expect(means[6]).toBe(0);     // Sundays untouched
  });
});
