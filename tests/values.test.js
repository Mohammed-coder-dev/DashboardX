import { describe, it, expect } from "vitest";
import {
  coveragePct, isMissing, numericValues, pairedNumericValues, quantile, round, toFiniteNumber,
} from "../src/analytics/values.js";

describe("isMissing", () => {
  it("treats null, undefined and blank strings as missing", () => {
    for (const value of [null, undefined, "", "   ", "\t", "\n"]) {
      expect(isMissing(value)).toBe(true);
    }
  });

  it("treats non-finite numbers as missing", () => {
    for (const value of [NaN, Infinity, -Infinity]) expect(isMissing(value)).toBe(true);
  });

  it("does NOT treat a genuine zero as missing", () => {
    expect(isMissing(0)).toBe(false);
    expect(isMissing("0")).toBe(false);
  });

  it("keeps false as present data", () => {
    expect(isMissing(false)).toBe(false);
  });
});

describe("toFiniteNumber", () => {
  // The core regression: every one of these coerces to 0 via bare Number().
  it("returns null for missing values instead of zero", () => {
    for (const value of [null, undefined, "", "   ", "\t\n"]) {
      expect(toFiniteNumber(value), `${JSON.stringify(value)} must not become a number`).toBeNull();
    }
  });

  it("preserves a genuine numeric zero", () => {
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber("0")).toBe(0);
    expect(toFiniteNumber("0.00")).toBe(0);
    expect(toFiniteNumber(" 0 ")).toBe(0);
    expect(toFiniteNumber(-0)).toBe(-0);
  });

  it("parses numeric strings with surrounding whitespace", () => {
    expect(toFiniteNumber(" 42.5 ")).toBe(42.5);
    expect(toFiniteNumber("-7")).toBe(-7);
  });

  it("rejects non-numeric text and non-finite numbers", () => {
    for (const value of ["n/a", "abc", "1,2,3", NaN, Infinity, -Infinity]) {
      expect(toFiniteNumber(value)).toBeNull();
    }
  });

  it("does not coerce booleans, so true never becomes 1", () => {
    expect(toFiniteNumber(true)).toBeNull();
    expect(toFiniteNumber(false)).toBeNull();
  });

  it("does not coerce Date objects to epoch numbers", () => {
    expect(toFiniteNumber(new Date("2024-01-01"))).toBeNull();
  });
});

describe("numericValues", () => {
  it("drops missing cells and keeps real zeroes", () => {
    expect(numericValues([1, null, 0, "", 3, "  ", "x"])).toEqual([1, 0, 3]);
  });
});

describe("pairedNumericValues", () => {
  it("excludes a row when either side is missing", () => {
    const rows = [
      { a: 1, b: 10 },
      { a: null, b: 20 },   // a missing -> drop the pair
      { a: 3, b: "" },      // b blank   -> drop the pair
      { a: 4, b: 40 },
    ];
    expect(pairedNumericValues(rows, "a", "b")).toEqual({ xs: [1, 4], ys: [10, 40] });
  });

  it("keeps pairs where a value is a genuine zero", () => {
    const rows = [{ a: 0, b: 0 }, { a: 1, b: 2 }];
    expect(pairedNumericValues(rows, "a", "b")).toEqual({ xs: [0, 1], ys: [0, 2] });
  });

  it("tolerates absent rows and columns", () => {
    expect(pairedNumericValues([null, {}, { a: 1 }], "a", "b")).toEqual({ xs: [], ys: [] });
  });
});

describe("coveragePct", () => {
  it("reports a percentage with one decimal", () => {
    expect(coveragePct(1, 3)).toBe(33.3);
    expect(coveragePct(3, 3)).toBe(100);
  });

  it("returns 0 rather than dividing by zero", () => {
    expect(coveragePct(0, 0)).toBe(0);
  });
});

describe("quantile", () => {
  it("interpolates between neighbours", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3], 0.5)).toBe(2);
  });

  it("handles single-element and empty input", () => {
    expect(quantile([5], 0.9)).toBe(5);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe("round", () => {
  it("preserves null and rejects non-finite input", () => {
    expect(round(null)).toBeNull();
    expect(round(NaN)).toBeNull();
    expect(round(1.23456)).toBe(1.2346);
  });
});
