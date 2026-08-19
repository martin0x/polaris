import { describe, expect, it } from "vitest";
import { lastNMonthKeys, manilaMonthKey } from "./months";

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
