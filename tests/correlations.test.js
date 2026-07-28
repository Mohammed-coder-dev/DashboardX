import { describe, it, expect } from "vitest";
import { computeStats } from "../src/analytics/stats.js";
import { computeCorrelations } from "../src/analytics/correlations.js";

function correlate(rows, columns) {
  return computeCorrelations(rows, columns, computeStats(rows, columns));
}

describe("computeCorrelations", () => {
  it("finds a perfect positive correlation", () => {
    const rows = [{ a: 1, b: 2 }, { a: 2, b: 4 }, { a: 3, b: 6 }];
    expect(correlate(rows, ["a", "b"])).toEqual([{ colA: "a", colB: "b", r: 1 }]);
  });

  it("finds a perfect negative correlation", () => {
    const rows = [{ a: 1, b: 6 }, { a: 2, b: 4 }, { a: 3, b: 2 }];
    expect(correlate(rows, ["a", "b"])[0].r).toBe(-1);
  });

  it("filters out weak correlations below |0.3|", () => {
    const rows = [{ a: 1, b: 1 }, { a: 2, b: 3 }, { a: 3, b: 2 }, { a: 4, b: 1 }];
    expect(correlate(rows, ["a", "b"])).toEqual([]);
  });

  it("skips pairs with fewer than 3 shared numeric points", () => {
    const rows = [{ a: 1, b: 2 }, { a: 2, b: 4 }];
    expect(correlate(rows, ["a", "b"])).toEqual([]);
  });

  it("returns r=0 (filtered) when one column has no variance", () => {
    const rows = [{ a: 1, b: 5 }, { a: 2, b: 5 }, { a: 3, b: 5 }];
    expect(correlate(rows, ["a", "b"])).toEqual([]);
  });

  it("ignores non-numeric columns entirely", () => {
    const rows = [{ a: 1, c: "x" }, { a: 2, c: "y" }, { a: 3, c: "z" }];
    expect(correlate(rows, ["a", "c"])).toEqual([]);
  });

  it("sorts strongest correlations first and caps at 10", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      a: i, strong: i * 2, noisy: i + (i % 3 === 0 ? 15 : -5),
    }));
    const result = correlate(rows, ["a", "strong", "noisy"]);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(Math.abs(result[0].r)).toBeGreaterThanOrEqual(Math.abs(result[result.length - 1].r));
    expect(result[0]).toMatchObject({ colA: "a", colB: "strong", r: 1 });
  });
});
