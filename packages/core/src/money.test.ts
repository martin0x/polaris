import { describe, expect, it } from "vitest";
import { formatCentavos, parsePesoInput, validatePesoInput } from "./money";

describe("parsePesoInput", () => {
  it("parses whole pesos", () => expect(parsePesoInput("123")).toBe(12300));
  it("parses one decimal", () => expect(parsePesoInput("12.5")).toBe(1250));
  it("parses two decimals", () => expect(parsePesoInput("12.34")).toBe(1234));
  it("strips commas", () => expect(parsePesoInput("1,234.50")).toBe(123450));
  it("trims whitespace", () => expect(parsePesoInput(" 99 ")).toBe(9900));
  it("accepts zero", () => expect(parsePesoInput("0")).toBe(0));
  it("rejects three decimals", () => expect(parsePesoInput("12.345")).toBeNull());
  it("rejects empty", () => expect(parsePesoInput("")).toBeNull());
  it("rejects non-numeric", () => expect(parsePesoInput("abc")).toBeNull());
  it("rejects bare dot-fraction", () => expect(parsePesoInput(".5")).toBeNull());
  it("rejects negatives", () => expect(parsePesoInput("-5")).toBeNull());
});

describe("formatCentavos", () => {
  it("formats with peso sign and two decimals", () =>
    expect(formatCentavos(123450)).toBe("₱1,234.50"));
  it("formats zero", () => expect(formatCentavos(0)).toBe("₱0.00"));
  it("formats sub-peso amounts", () => expect(formatCentavos(5)).toBe("₱0.05"));
});

describe("validatePesoInput", () => {
  it("accepts valid amounts", () => {
    expect(validatePesoInput("89.50")).toEqual({ ok: true, centavos: 8950 });
    expect(validatePesoInput("1,000")).toEqual({ ok: true, centavos: 100_000 });
    expect(validatePesoInput("1000000.00")).toEqual({ ok: true, centavos: 100_000_000 });
  });
  it("rejects malformed input as format errors", () => {
    for (const raw of ["", "abc", "1.234", "-5", "1..2"]) {
      expect(validatePesoInput(raw)).toEqual({ ok: false, reason: "format" });
    }
  });
  it("rejects amounts over the backend cap", () => {
    expect(validatePesoInput("1000000.01")).toEqual({ ok: false, reason: "max" });
    expect(validatePesoInput("9999999")).toEqual({ ok: false, reason: "max" });
  });
});
