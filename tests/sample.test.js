import { describe, it, expect } from "vitest";
import { computeStats } from "../src/analytics/stats.js";
import { representativeSample } from "../src/analytics/sample.js";

function sampleOf(rows, columns, options) {
  return representativeSample(rows, columns, computeStats(rows, columns), options);
}

describe("representativeSample", () => {
  it("returns an empty sample for an empty dataset", () => {
    expect(sampleOf([], ["a"])).toEqual({ rows: [], selections: [], totalRows: 0 });
  });

  it("always includes the first and last rows", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ v: i }));
    const sample = sampleOf(rows, ["v"]);
    expect(sample.rows[0]).toEqual({ v: 0 });
    expect(sample.rows.at(-1)).toEqual({ v: 29 });
    expect(sample.selections[0].reasons).toContain("first row");
    expect(sample.selections.at(-1).reasons).toContain("last row");
  });

  it("includes median, quartile and extreme observations of the primary numeric column", () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ v: i }));
    const sample = sampleOf(rows, ["v"]);
    const reasons = sample.selections.flatMap((s) => s.reasons);
    expect(reasons.some((r) => r.startsWith("median"))).toBe(true);
    expect(reasons.some((r) => r.startsWith("minimum"))).toBe(true);
    expect(reasons.some((r) => r.startsWith("maximum"))).toBe(true);
    const medianRow = sample.rows[sample.selections.findIndex((s) => s.reasons.some((r) => r.startsWith("median")))];
    expect(medianRow.v).toBe(50);
  });

  it("includes rows containing missing values, labelled with the blank columns", () => {
    const rows = [
      { a: 1, b: 1 }, { a: 2, b: 2 }, { a: null, b: 3 }, { a: 4, b: "" }, { a: 5, b: 5 },
    ];
    const sample = sampleOf(rows, ["a", "b"]);
    const reasons = sample.selections.flatMap((s) => s.reasons);
    expect(reasons.some((r) => r.startsWith("missing"))).toBe(true);
  });

  it("includes an outlier row when one exists", () => {
    const rows = [...Array.from({ length: 20 }, (_, i) => ({ v: 50 + i })), { v: 100000 }];
    const sample = sampleOf(rows, ["v"]);
    const reasons = sample.selections.flatMap((s) => s.reasons);
    expect(reasons.some((r) => r.startsWith("outlier"))).toBe(true);
  });

  it("includes an example row for leading category levels", () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({
      region: i % 3 === 0 ? "north" : i % 3 === 1 ? "south" : "east",
      sales: i,
    }));
    const sample = sampleOf(rows, ["region", "sales"]);
    const reasons = sample.selections.flatMap((s) => s.reasons);
    expect(reasons.some((r) => r.startsWith("region ="))).toBe(true);
  });

  it("includes chronological boundary rows for date columns", () => {
    const rows = [
      { when: "2024-06-15", v: 1 },
      { when: "2024-01-01", v: 2 },  // earliest, not first
      { when: "2024-03-10", v: 3 },
      { when: "2024-12-31", v: 4 },  // latest, not last
      { when: "2024-07-04", v: 5 },
    ];
    const sample = sampleOf(rows, ["when", "v"]);
    const reasons = sample.selections.flatMap((s) => s.reasons);
    expect(reasons.some((r) => r.startsWith("earliest"))).toBe(true);
    expect(reasons.some((r) => r.startsWith("latest"))).toBe(true);
  });

  it("respects the row budget", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ v: i }));
    expect(sampleOf(rows, ["v"], { limit: 10 }).rows.length).toBeLessThanOrEqual(10);
  });

  it("is deterministic: same input, same sample, every time", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      v: (i * 37) % 100, c: i % 4 === 0 ? "x" : "y", d: i % 7 === 0 ? null : i,
    }));
    const first = sampleOf(rows, ["v", "c", "d"]);
    expect(sampleOf(rows, ["v", "c", "d"])).toEqual(first);
  });

  it("preserves original row order in the output", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ v: 50 - i }));
    const sample = sampleOf(rows, ["v"]);
    const indices = sample.selections.map((s) => s.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("merges reasons when one row satisfies several criteria", () => {
    // Single row: it is simultaneously first, last, min, max and median.
    const sample = sampleOf([{ v: 5 }], ["v"]);
    expect(sample.rows).toHaveLength(1);
    expect(sample.selections[0].reasons.length).toBeGreaterThan(1);
  });
});
