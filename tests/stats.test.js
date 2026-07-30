import { describe, it, expect } from "vitest";
import {
  classifyCategoricalRole, computeStats, frequencyTable, profileField,
} from "../src/analytics/stats.js";

describe("computeStats — numeric fields", () => {
  it("computes descriptive statistics with coverage", () => {
    const rows = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }];
    const s = computeStats(rows, ["x"]).x;
    expect(s).toMatchObject({
      type: "numeric", count: 4, validCount: 4, missing: 0, invalid: 0,
      coverage: 100, min: 1, max: 4, mean: 2.5, median: 2.5, std: 1.118,
    });
    expect(s.quantiles).toMatchObject({ q1: 1.75, q3: 3.25 });
  });

  it("computes an odd-length median", () => {
    expect(computeStats([{ x: 10 }, { x: 20 }, { x: 90 }], ["x"]).x.median).toBe(20);
  });

  it("excludes missing values from every statistic", () => {
    // Bare Number() would turn null, "" and "  " into 0, pulling the mean from
    // 2 down to 0.8 and reporting count 5.
    const rows = [{ x: 1 }, { x: null }, { x: "" }, { x: "   " }, { x: 3 }];
    const s = computeStats(rows, ["x"]).x;
    expect(s.validCount).toBe(2);
    expect(s.missing).toBe(3);
    expect(s.mean).toBe(2);
    expect(s.min).toBe(1);
  });

  it("counts a genuine zero as an observation", () => {
    const s = computeStats([{ x: 0 }, { x: 0 }, { x: 6 }], ["x"]).x;
    expect(s.validCount).toBe(3);
    expect(s.min).toBe(0);
    expect(s.mean).toBe(2);
  });

  it("reports coverage against total rows, not just present values", () => {
    const rows = [{ x: 1 }, { x: 2 }, { x: null }, { x: null }];
    expect(computeStats(rows, ["x"]).x.coverage).toBe(50);
  });

  it("makes a half-invalid numeric column's unparseable values visible", () => {
    // Still typed numeric for output compatibility, but invalid/coverage now
    // expose that half the column could not be parsed.
    const rows = [{ m: "1" }, { m: "2" }, { m: "n/a" }, { m: "oops" }];
    const s = computeStats(rows, ["m"]).m;
    expect(s.type).toBe("numeric");
    expect(s.validCount).toBe(2);
    expect(s.invalid).toBe(2);
    expect(s.coverage).toBe(50);
  });

  it("reports outliers with the method used", () => {
    // Varied values so the IQR is non-zero; the last value sits far outside it.
    const rows = [...Array.from({ length: 12 }, (_, i) => ({ x: i + 1 })), { x: 10_000 }];
    const s = computeStats(rows, ["x"]).x;
    expect(s.outliers).toMatchObject({ count: 1, method: "iqr", applied: true });
    expect(s.outliers.upperFence).toBeGreaterThan(12);
  });

  it("declines to compute IQR outliers when the IQR is zero", () => {
    const rows = [...Array.from({ length: 12 }, () => ({ x: 10 })), { x: 10_000 }];
    const s = computeStats(rows, ["x"]).x;
    expect(s.outliers).toMatchObject({ count: 0, applied: false, reason: "zero interquartile range" });
  });

  it("declines to judge outliers on a tiny sample", () => {
    const s = computeStats([{ x: 1 }, { x: 2 }, { x: 900 }], ["x"]).x;
    expect(s.outliers).toMatchObject({ count: 0, applied: false });
    expect(s.outliers.reason).toContain("8");
  });
});

describe("computeStats — categorical fields", () => {
  it("ranks top values by frequency, not first appearance", () => {
    // Insertion order here is rare, common, common... The old implementation
    // used [...new Set(values)] and reported "rare" as the leading value.
    const rows = [
      { c: "rare" },
      { c: "common" }, { c: "common" }, { c: "common" }, { c: "common" },
      { c: "middle" }, { c: "middle" },
    ];
    const s = computeStats(rows, ["c"]).c;
    expect(s.type).toBe("categorical");
    expect(s.top.map((t) => t.value)).toEqual(["common", "middle", "rare"]);
    expect(s.top[0]).toEqual({ value: "common", count: 4, percentage: 57.1 });
  });

  it("reports value, count and percentage for each level", () => {
    const rows = [{ c: "a" }, { c: "a" }, { c: "b" }, { c: "b" }];
    for (const entry of computeStats(rows, ["c"]).c.top) {
      expect(entry).toEqual({ value: expect.any(String), count: 2, percentage: 50 });
    }
  });

  it("breaks frequency ties deterministically by value", () => {
    const rows = [{ c: "zebra" }, { c: "apple" }, { c: "mango" }];
    const first = computeStats(rows, ["c"]).c.top.map((t) => t.value);
    expect(first).toEqual(["apple", "mango", "zebra"]);
    // Same input, same order, every time.
    expect(computeStats(rows, ["c"]).c.top.map((t) => t.value)).toEqual(first);
  });

  it("counts missing values and coverage", () => {
    const rows = [{ c: "a" }, { c: null }, { c: "" }, { c: "b" }];
    const s = computeStats(rows, ["c"]).c;
    expect(s).toMatchObject({ validCount: 2, missing: 2, coverage: 50, unique: 2 });
  });

  it("classifies the field's role", () => {
    expect(classifyCategoricalRole(3, 30)).toBe("category");
    expect(classifyCategoricalRole(30, 30)).toBe("identifier");
    expect(classifyCategoricalRole(28, 30)).toBe("identifier");
    expect(classifyCategoricalRole(0, 0)).toBe("empty");
    const highCardinality = Array.from({ length: 40 }, (_, i) => ({
      note: i < 30 ? `unique-${i}` : "repeated",
    }));
    expect(computeStats(highCardinality, ["note"]).note.role).toBe("high-cardinality text");
  });
});

describe("computeStats — general behaviour", () => {
  it("marks an entirely empty column as empty rather than numeric", () => {
    const s = computeStats([{ x: null }, { x: "" }, { x: "  " }], ["x"]).x;
    expect(s.type).toBe("empty");
    expect(s.missing).toBe(3);
    expect(s.coverage).toBe(0);
  });

  it("skips the synthetic line column", () => {
    const stats = computeStats([{ line: 1, content: "hi" }], ["line", "content"]);
    expect(stats.line).toBeUndefined();
    expect(stats.content).toBeDefined();
  });

  it("does not read booleans as numbers", () => {
    const s = computeStats([{ flag: true }, { flag: false }, { flag: true }], ["flag"]).flag;
    expect(s.type).toBe("categorical");
  });

  it("tolerates missing row objects", () => {
    expect(() => computeStats([null, undefined, { x: 1 }], ["x"])).not.toThrow();
  });
});

describe("frequencyTable", () => {
  it("returns unique and valid counts alongside the ranking", () => {
    const table = frequencyTable(["a", "a", "b", null, ""]);
    expect(table.uniqueCount).toBe(2);
    expect(table.validCount).toBe(3);
    expect(table.entries[0]).toEqual({ value: "a", count: 2, percentage: 66.7 });
  });

  it("respects the requested limit", () => {
    expect(frequencyTable(["a", "b", "c", "d"], 2).entries).toHaveLength(2);
  });
});

describe("profileField", () => {
  it("can be called directly on a raw column", () => {
    expect(profileField([1, 2, 3]).type).toBe("numeric");
    expect(profileField(["x", "y"]).type).toBe("categorical");
  });
});
