import { describe, it, expect } from "vitest";
import {
  coveragePct, isMissing, numberFormats, numericValues, pairedNumericValues, quantile, round, toFiniteNumber,
} from "../src/analytics/values.js";

describe("numbers that arrive wearing their formatting", () => {
  // Real finance exports write 48000 as "$48,000". Before this, every one of
  // these read as non-numeric, so the column either vanished from the analysis
  // entirely or — worse — kept the cells that happened to parse and reported a
  // confident mean over half its data.
  it("reads a thousands separator", () => {
    expect(toFiniteNumber("1,200")).toBe(1200);
    expect(toFiniteNumber("12,345,678")).toBe(12345678);
  });

  it("reads a currency symbol on either side", () => {
    expect(toFiniteNumber("$48,000")).toBe(48000);
    expect(toFiniteNumber("48000 €")).toBe(48000);
    expect(toFiniteNumber("£1,234.56")).toBe(1234.56);
  });

  it("reads a percentage at the magnitude the cell displays", () => {
    // 12.5% reads as 12.5, not 0.125. The cell says 12.5 and so does Ridge;
    // rescaling silently would make the reported number disagree with the file.
    expect(toFiniteNumber("12.5%")).toBe(12.5);
    expect(toFiniteNumber("0%")).toBe(0);
  });

  it("reads the accounting convention for a negative", () => {
    expect(toFiniteNumber("(1,200)")).toBe(-1200);
    expect(toFiniteNumber("($48,000)")).toBe(-48000);
  });

  it("still refuses anything that is not a number wearing formatting", () => {
    for (const value of ["abc", "N/A", "-", "$", "%", "(abc)", "1,2,3", "12,34"]) {
      expect(toFiniteNumber(value)).toBeNull();
    }
  });

  it("leaves European decimal notation alone rather than guessing at it", () => {
    // "1.234,56" is 1234.56 in much of the world and 1.234 in the rest. Guessing
    // wrong is a 1000x error in a reported mean, so it stays unparsed — exactly
    // as it was before — and shows up as an invalid value instead.
    expect(toFiniteNumber("1.234,56")).toBeNull();
  });

  it("does not disturb what already parsed", () => {
    expect(toFiniteNumber("0")).toBe(0);
    expect(toFiniteNumber("0.00")).toBe(0);
    expect(toFiniteNumber(-5)).toBe(-5);
    expect(toFiniteNumber("1e3")).toBe(1000);
    expect(toFiniteNumber("")).toBeNull();
    expect(toFiniteNumber("   ")).toBeNull();
    expect(toFiniteNumber(true)).toBeNull();
  });
});

describe("numberFormats", () => {
  // Reading formatting is still a reading, so it is named rather than assumed.
  it("names every convention it had to look through", () => {
    expect(numberFormats(["$48,000", "$39,250"])).toEqual(["currency", "thousands"]);
    expect(numberFormats(["12.5%", "9.8%"])).toEqual(["percent"]);
    expect(numberFormats(["(1,200)"])).toEqual(["negated parentheses", "thousands"]);
  });

  it("says nothing about plain numbers", () => {
    expect(numberFormats([1, 2, "3", "4.5"])).toEqual([]);
  });
});

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

describe("round on small magnitudes", () => {
  // toFixed counts decimal places, not significant digits. A column of rates,
  // ppm concentrations, probabilities or p-values sits entirely below the
  // fourth decimal, so every statistic computed over it was rounded away to
  // exactly 0 - a mean of 0 for a column containing no zeroes at all, printed
  // next to a min and max that were never rounded and so still showed the real
  // values.
  it("keeps a value the fixed-decimal form would erase", () => {
    expect(round(0.000012)).toBe(0.000012);
    expect(round(-0.000045)).toBe(-0.000045);
    expect(round(1.7e-9, 6)).toBe(1.7e-9);
  });

  it("rounds ordinary magnitudes exactly as before", () => {
    expect(round(1.23456)).toBe(1.2346);
    expect(round(1.23456, 2)).toBe(1.23);
    expect(round(48000)).toBe(48000);
    expect(round(0.5)).toBe(0.5);
    expect(round(-2.71828, 3)).toBe(-2.718);
  });

  it("still reports a genuine zero as zero", () => {
    expect(round(0)).toBe(0);
    expect(Object.is(round(0), 0)).toBe(true);
  });

  it("keeps null for absent and non-finite input", () => {
    expect(round(null)).toBeNull();
    expect(round(undefined)).toBeNull();
    expect(round(NaN)).toBeNull();
    expect(round(Infinity)).toBeNull();
  });
});
