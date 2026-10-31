import { describe, expect, it } from "vitest";
import {
  lastNMonthKeys,
  manilaMonthKey,
  manilaMonthKeyFromMs,
  manilaDayKeyFromMs,
  lastNMonthKeysFromMs,
  manilaMonthStartMs,
  manilaMonthStart,
  manilaDayStartMs,
} from "./months";

describe("manilaMonthKey", () => {
  it("formats YYYY-MM in Manila time", () => {
    expect(manilaMonthKey(new Date("2026-06-12T03:00:00Z"))).toBe("2026-06");
  });
  it("rolls into the next month across the UTC boundary", () => {
    // 2026-05-31 17:00 UTC is 2026-06-01 01:00 in Manila
    expect(manilaMonthKey(new Date("2026-05-31T17:00:00Z"))).toBe("2026-06");
  });
});

describe("lastNMonthKeys", () => {
  const now = new Date("2026-06-12T03:00:00Z");
  it("returns n buckets ending at the current Manila month", () => {
    const keys = lastNMonthKeys(3, now);
    expect(keys.map((k) => k.key)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(keys.map((k) => k.label)).toEqual(["Apr", "May", "Jun"]);
  });
  it("wraps across a year boundary", () => {
    const keys = lastNMonthKeys(6, new Date("2026-02-10T03:00:00Z"));
    expect(keys[0].key).toBe("2025-09");
    expect(keys[5].key).toBe("2026-02");
  });
});

describe("Intl-free Manila helpers", () => {
  // Sample instants that cross Manila boundaries: late-night UTC rolls into
  // the next Manila day/month.
  const samples = [
    Date.UTC(2026, 5, 30, 15, 59, 59), // 2026-06-30 23:59:59 Manila
    Date.UTC(2026, 5, 30, 16, 0, 0),   // 2026-07-01 00:00:00 Manila
    Date.UTC(2026, 0, 31, 20, 0, 0),   // 2026-02-01 Manila
    Date.UTC(2025, 11, 31, 15, 0, 0),  // 2025-12-31 23:00 Manila
    Date.UTC(2025, 11, 31, 17, 30, 0), // 2026-01-01 01:30 Manila
  ];

  it("manilaMonthKeyFromMs matches manilaMonthKey", () => {
    for (const ms of samples) {
      expect(manilaMonthKeyFromMs(ms)).toBe(manilaMonthKey(new Date(ms)));
    }
  });

  it("manilaDayKeyFromMs formats the Manila calendar day", () => {
    expect(manilaDayKeyFromMs(Date.UTC(2026, 5, 30, 15, 59, 59))).toBe("2026-06-30");
    expect(manilaDayKeyFromMs(Date.UTC(2026, 5, 30, 16, 0, 0))).toBe("2026-07-01");
  });

  it("lastNMonthKeysFromMs matches lastNMonthKeys", () => {
    for (const ms of samples) {
      for (const n of [3, 6, 12]) {
        expect(lastNMonthKeysFromMs(n, ms)).toEqual(lastNMonthKeys(n, new Date(ms)));
      }
    }
  });

  it("manilaMonthStartMs matches manilaMonthStart", () => {
    for (const key of ["2026-01", "2026-06", "2025-12"]) {
      expect(manilaMonthStartMs(key)).toBe(manilaMonthStart(key).getTime());
    }
  });
});

describe("manilaDayStartMs", () => {
  it("returns 00:00 Manila for instants on either side of Manila midnight", () => {
    // 2026-06-30 23:59:59 Manila → that day's midnight, 2026-06-29 16:00 UTC
    expect(manilaDayStartMs(Date.UTC(2026, 5, 30, 15, 59, 59))).toBe(Date.UTC(2026, 5, 29, 16, 0, 0));
    // 2026-07-01 00:00:00 Manila is itself a midnight
    expect(manilaDayStartMs(Date.UTC(2026, 5, 30, 16, 0, 0))).toBe(Date.UTC(2026, 5, 30, 16, 0, 0));
    // 2026-01-01 11:00 Manila → 2025-12-31 16:00 UTC
    expect(manilaDayStartMs(Date.UTC(2026, 0, 1, 3, 0, 0))).toBe(Date.UTC(2025, 11, 31, 16, 0, 0));
  });
});
