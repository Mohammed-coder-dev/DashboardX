import { describe, it, expect } from "vitest";
import { computeStats } from "../src/analytics/stats.js";
import {
  classifyStrength, computeCorrelations, rankValues, spearman,
} from "../src/analytics/correlations.js";

function correlate(rows, columns, options) {
  return computeCorrelations(rows, columns, computeStats(rows, columns), options);
}

describe("computeCorrelations", () => {
  it("finds a perfect positive correlation with full evidence", () => {
    const rows = [{ a: 1, b: 2 }, { a: 2, b: 4 }, { a: 3, b: 6 }];
    const [result] = correlate(rows, ["a", "b"]);
    expect(result).toMatchObject({
      columnA: "a", columnB: "b", method: "pearson", coefficient: 1,
      n: 3, coverage: 100, strength: "very strong", smallSample: true,
    });
    expect(result.caveat).toContain("3 paired observations");
  });

  it("finds a perfect negative correlation", () => {
    const rows = [{ a: 1, b: 6 }, { a: 2, b: 4 }, { a: 3, b: 2 }];
    expect(correlate(rows, ["a", "b"])[0].coefficient).toBe(-1);
  });

  it("filters out weak correlations below |0.3|", () => {
    const rows = [{ a: 1, b: 1 }, { a: 2, b: 3 }, { a: 3, b: 2 }, { a: 4, b: 1 }];
    expect(correlate(rows, ["a", "b"])).toEqual([]);
  });

  it("skips pairs with fewer than 3 shared numeric points", () => {
    expect(correlate([{ a: 1, b: 2 }, { a: 2, b: 4 }], ["a", "b"])).toEqual([]);
  });

  it("omits a pair entirely when one column has no variance", () => {
    // A constant series has no measurable relationship. Reporting r=0 would
    // claim "measured, found nothing", which is a different statement.
    const rows = [{ a: 1, b: 5 }, { a: 2, b: 5 }, { a: 3, b: 5 }];
    expect(correlate(rows, ["a", "b"])).toEqual([]);
  });

  it("ignores non-numeric columns entirely", () => {
    const rows = [{ a: 1, c: "x" }, { a: 2, c: "y" }, { a: 3, c: "z" }];
    expect(correlate(rows, ["a", "c"])).toEqual([]);
  });

  it("sorts strongest first, caps results, and breaks ties deterministically", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      a: i, strong: i * 2, noisy: i + (i % 3 === 0 ? 15 : -5),
    }));
    const result = correlate(rows, ["a", "strong", "noisy"]);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(Math.abs(result[0].coefficient)).toBeGreaterThanOrEqual(Math.abs(result.at(-1).coefficient));
    expect(result[0]).toMatchObject({ columnA: "a", columnB: "strong", coefficient: 1 });
    // Deterministic across repeated runs on identical input.
    expect(correlate(rows, ["a", "strong", "noisy"])).toEqual(result);
  });

  describe("missing values must never become zeroes", () => {
    // Number(null) === 0 and Number("") === 0, so the previous implementation
    // silently inserted (0, 0) observations. On this dataset a and b rise
    // together for every row where both are present, so the honest answer is a
    // perfect positive correlation over 4 pairs. Injecting zeroes for the blank
    // rows drags the coefficient away from 1.
    const rows = [
      { a: 10, b: 100 },
      { a: null, b: 200 },
      { a: 20, b: null },
      { a: 30, b: 300 },
      { a: "", b: 400 },
      { a: 40, b: "" },
      { a: 50, b: 500 },
      { a: "   ", b: 600 },
      { a: 60, b: 600 },
    ];

    it("reports the correlation over paired observations only", () => {
      const [result] = correlate(rows, ["a", "b"]);
      expect(result.coefficient).toBe(1);
      expect(result.n).toBe(4);
    });

    it("reports coverage against all rows, not just complete ones", () => {
      const [result] = correlate(rows, ["a", "b"]);
      expect(result.rowsConsidered).toBe(9);
      expect(result.coverage).toBe(44.4);
      expect(result.caveat).toContain("44.4% of rows had both values");
    });

    it("gives the same answer as the equivalent dataset with blank rows removed", () => {
      const complete = rows.filter((r) => typeof r.a === "number" && typeof r.b === "number");
      expect(correlate(rows, ["a", "b"])[0].coefficient)
        .toBe(correlate(complete, ["a", "b"])[0].coefficient);
    });

    it("does not invent a relationship from blanks alone", () => {
      // Only two rows have both values, below the MIN_PAIRS floor. Coercing
      // blanks to 0 would manufacture 5 usable pairs and a strong coefficient.
      const sparse = [
        { a: 1, b: 1 }, { a: null, b: null }, { a: "", b: "" },
        { a: null, b: "" }, { a: 2, b: 2 },
      ];
      expect(correlate(sparse, ["a", "b"])).toEqual([]);
    });
  });

  describe("genuine zeroes are real data", () => {
    it("keeps rows whose values are zero", () => {
      const rows = [{ a: 0, b: 0 }, { a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }];
      const [result] = correlate(rows, ["a", "b"]);
      expect(result.coefficient).toBe(1);
      expect(result.n).toBe(4);
    });

    it("distinguishes a zero-filled column from a blank one", () => {
      const zeroed = [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 0, b: 3 }];
      const blank = [{ a: null, b: 1 }, { a: null, b: 2 }, { a: null, b: 3 }];
      // Zeroes are present but constant -> no variance -> no result.
      expect(correlate(zeroed, ["a", "b"])).toEqual([]);
      // Blanks are absent -> not enough pairs -> also no result, different reason.
      expect(correlate(blank, ["a", "b"])).toEqual([]);
      expect(computeStats(zeroed, ["a"]).a.validCount).toBe(3);
      expect(computeStats(blank, ["a"]).a.validCount).toBe(0);
    });
  });

  describe("Spearman", () => {
    it("detects a monotonic but non-linear relationship", () => {
      const rows = Array.from({ length: 15 }, (_, i) => ({ x: i + 1, y: (i + 1) ** 3 }));
      const [result] = correlate(rows, ["x", "y"]);
      expect(result.spearman).toBe(1);
      expect(result.pearson).toBeLessThan(1);
    });

    it("flags disagreement between Pearson and Spearman as a caveat", () => {
      // Exponential growth: perfectly monotonic (Spearman 1) but the last few
      // points dominate Pearson (~0.69), a gap wide enough to warrant a flag.
      const rows = Array.from({ length: 15 }, (_, i) => ({ x: i + 1, y: 2 ** (i + 1) }));
      const [result] = correlate(rows, ["x", "y"]);
      expect(result.caveat).toContain("non-linear");
    });

    it("does not let one outlier hide a monotonic relationship", () => {
      // 24 points rise together, then one extreme x drags Pearson toward zero
      // while the ranks stay almost perfectly ordered. Leading with Pearson
      // would report nothing at all for a genuinely strong relationship.
      const rows = Array.from({ length: 24 }, (_, i) => ({ x: i + 1, y: (i + 1) * 3 }));
      rows.push({ x: 50_000, y: 40 });
      const [result] = correlate(rows, ["x", "y"]);
      expect(result).toBeDefined();
      expect(Math.abs(result.pearson)).toBeLessThan(0.3);
      expect(result.method).toBe("spearman");
      expect(result.coefficient).toBeGreaterThan(0.8);
      expect(result.caveat).toContain("non-linear");
    });

    it("still leads with Pearson when the two broadly agree", () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({ x: i, y: i * 2 + (i % 3) }));
      expect(correlate(rows, ["x", "y"])[0].method).toBe("pearson");
    });

    it("averages tied ranks instead of using input order", () => {
      expect(rankValues([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
      expect(rankValues([5, 5, 5])).toEqual([2, 2, 2]);
    });

    it("returns null when ranks cannot vary", () => {
      expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull();
    });
  });

  describe("scatter pairs travel with every reported coefficient", () => {
    it("sends a small pairing verbatim, in row order", () => {
      const rows = [{ a: 1, b: 2 }, { a: 2, b: 4 }, { a: 3, b: 6 }];
      const [result] = correlate(rows, ["a", "b"]);
      expect(result.scatter).toEqual({ kind: "points", n: 3, points: [[1, 2], [2, 4], [3, 6]] });
    });

    it("keeps blanks out of the scatter exactly as they stay out of the coefficient", () => {
      const rows = [
        { a: 10, b: 100 }, { a: null, b: 200 }, { a: 20, b: 210 },
        { a: "", b: 400 }, { a: 30, b: 300 }, { a: 40, b: "" },
      ];
      const [result] = correlate(rows, ["a", "b"]);
      // Rows missing either side are absent, not plotted at zero.
      expect(result.scatter.points).toEqual([[10, 100], [20, 210], [30, 300]]);
      expect(result.scatter.n).toBe(result.n);
    });

    it("bins a large pairing into a density grid that accounts for every pair", () => {
      const rows = Array.from({ length: 600 }, (_, i) => ({ a: i, b: i * 2 + (i % 5) }));
      const [result] = correlate(rows, ["a", "b"]);
      expect(result.scatter.kind).toBe("grid");
      expect(result.scatter.n).toBe(600);
      expect(result.scatter.x).toEqual({ min: 0, max: 599 });
      // Every pair lands in exactly one cell — the grid is a partition of the
      // pairing, not a sample of it.
      const total = result.scatter.cells.reduce((sum, [, , count]) => sum + count, 0);
      expect(total).toBe(600);
      for (const [xi, yi, count] of result.scatter.cells) {
        expect(xi).toBeGreaterThanOrEqual(0);
        expect(xi).toBeLessThan(result.scatter.bins);
        expect(yi).toBeGreaterThanOrEqual(0);
        expect(yi).toBeLessThan(result.scatter.bins);
        expect(count).toBeGreaterThan(0);
      }
    });

    it("is deterministic across repeated runs", () => {
      const rows = Array.from({ length: 700 }, (_, i) => ({ a: i, b: i * 3 + (i % 11) }));
      const first = correlate(rows, ["a", "b"]);
      // Non-vacuous: the pairing is reported and binned before being compared.
      expect(first[0].scatter.kind).toBe("grid");
      expect(correlate(rows, ["a", "b"])).toEqual(first);
    });
  });

  it("classifies strength by magnitude", () => {
    expect(classifyStrength(0.95)).toBe("very strong");
    expect(classifyStrength(-0.75)).toBe("strong");
    expect(classifyStrength(0.55)).toBe("moderate");
    expect(classifyStrength(-0.35)).toBe("weak");
    expect(classifyStrength(0.1)).toBe("negligible");
  });

  it("marks samples above the small-sample threshold as sturdy", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ a: i, b: i * 3 }));
    const [result] = correlate(rows, ["a", "b"]);
    expect(result.n).toBe(40);
    expect(result.smallSample).toBe(false);
    expect(result.caveat).toBeNull();
  });

describe("large-magnitude columns", () => {
  // The textbook sum-of-squares form of Pearson computes n·Σx² − (Σx)², a
  // difference between two enormous, nearly equal numbers. On columns whose
  // values are large relative to their spread — epoch milliseconds, account
  // numbers, amounts in minor units — that difference loses every significant
  // digit: it collapses to 0 (read as "constant series, no relationship"), or
  // goes negative (√negative = NaN, which slipped past the |r| < minReported
  // filter and was reported as a null coefficient), or survives with the wrong
  // magnitude entirely.
  it("reports a perfect relationship between columns offset by a billion", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      a: 1_000_000_000 + i,
      b: 1_000_000_000 + i * 2,
    }));
    const [result] = correlate(rows, ["a", "b"]);
    expect(result.method).toBe("pearson");
    expect(result.pearson).toBe(1);
    expect(result.coefficient).toBe(1);
  });

  it("correlates epoch milliseconds against a small counter", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      recordedAt: 1_700_000_000_000 + i * 1000,
      sequence: i * 7 + 3,
    }));
    const [result] = correlate(rows, ["recordedAt", "sequence"]);
    expect(result.pearson).toBe(1);
  });

  it("keeps the sign of a negative relationship at large magnitudes", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      a: 1e12 + i * 0.5,
      b: 1e12 - i * 0.5,
    }));
    const [result] = correlate(rows, ["a", "b"]);
    expect(result.pearson).toBe(-1);
    expect(result.coefficient).toBeLessThan(0);
  });

  // NaN is not a coefficient. It compares false against every threshold, so an
  // unguarded NaN passes the |r| >= minReported filter and lands in the results
  // as `coefficient: null` — a finding with no number in it.
  it("never emits a null or non-finite coefficient", () => {
    const shapes = [
      Array.from({ length: 10 }, (_, i) => ({ a: 1e8 + i * 0.01, b: 1e8 + i * 0.02 })),
      Array.from({ length: 10 }, (_, i) => ({ a: 1e9 + i * 0.001, b: 1e9 - i * 0.002 })),
      Array.from({ length: 10 }, (_, i) => ({ a: 1e14 + i, b: 1e14 + i * 3 })),
    ];
    for (const rows of shapes) {
      for (const result of correlate(rows, ["a", "b"])) {
        expect(Number.isFinite(result.coefficient)).toBe(true);
        expect(Math.abs(result.coefficient)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("agrees with the shifted-by-a-constant form of the same data", () => {
    // Correlation is invariant under translation, so the coefficient for the
    // small values and the coefficient for the same values plus a billion are
    // the same number. Any disagreement is arithmetic, not data.
    const base = [7, 13, 2, 19, 5, 23, 11, 31, 17, 3, 29, 41];
    const other = [12, 9, 26, 4, 33, 8, 21, 2, 6, 37, 3, 1];
    // minReported: 0 so the assertion is about the arithmetic, not about which
    // side of the reporting threshold the pair lands on.
    const options = { minReported: 0 };
    const small = correlate(base.map((a, i) => ({ a, b: other[i] })), ["a", "b"], options);
    const shifted = correlate(base.map((a, i) => ({ a: a + 1e9, b: other[i] + 1e9 })), ["a", "b"], options);
    expect(small[0].pearson).not.toBe(0);
    expect(shifted[0].pearson).toBeCloseTo(small[0].pearson, 9);
  });
});
});
