import { describe, it, expect } from "vitest";
import { profileDataset } from "../src/analytics/profile.js";
import {
  classifyCategoricalRole, computeStats, frequencyTable, profileField,
} from "../src/analytics/stats.js";

describe("computeStats — numeric fields", () => {
  it("includes a deterministic 95% confidence interval for the mean", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => ({ x }));
    const interval = computeStats(rows, ["x"]).x.meanConfidence95;
    expect(interval.lower).toBeCloseTo(3.334, 2);
    expect(interval.upper).toBeCloseTo(7.666, 2);
  });

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

  it("ships the flagged rows themselves: position, value, side and distance", () => {
    // Row 3 is missing and row 5 unparseable, so the flagged rows' numbers
    // must still name their 1-based positions among the data rows — the same
    // row space provenance source rows report.
    const rows = [
      { x: 5 }, { x: 6 }, { x: null }, { x: 7 }, { x: "bad" },
      { x: 8 }, { x: 5 }, { x: 6 }, { x: 7 }, { x: 8 },
      { x: 900 }, { x: -400 },
    ];
    const s = computeStats(rows, ["x"]).x;
    expect(s.outliers.count).toBe(2);
    // Ordered by distance beyond the fence, farthest first.
    expect(s.outliers.rows[0]).toMatchObject({ row: 11, value: 900, side: "above" });
    expect(s.outliers.rows[1]).toMatchObject({ row: 12, value: -400, side: "below" });
    expect(s.outliers.rows[0].beyond).toBeCloseTo(900 - s.outliers.upperFence, 3);
    expect(s.outliers.rows[1].beyond).toBeCloseTo(s.outliers.lowerFence - (-400), 3);
  });

  it("caps the shipped rows, keeps the true count, and states the cap", () => {
    // A large central cluster plus more extremes than the cap admits — few
    // enough that the quartiles stay inside the cluster and the fences hold.
    // The extremes grow with their index so the distance ordering is checkable.
    const cluster = Array.from({ length: 900 }, (_, i) => ({ x: (i % 10) + 1 }));
    const extremes = Array.from({ length: 210 }, (_, i) => ({ x: 1_000 + i }));
    const s = computeStats([...cluster, ...extremes], ["x"]).x;
    expect(s.outliers.count).toBe(210);
    expect(s.outliers.rows.length).toBe(200);
    expect(s.outliers.rowsCap).toBe(200);
    // Farthest first means the largest extreme leads and the nearest 10 are
    // the ones cut — a truncated list can never pose as complete because the
    // count still says 210.
    expect(s.outliers.rows[0].value).toBe(1_209);
    expect(s.outliers.rows.at(-1).value).toBe(1_010);
  });

  it("builds a full-field histogram whose bins account for every valid value", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, null, "bad", 100].map((x) => ({ x }));
    const s = computeStats(rows, ["x"]).x;
    expect(s.histogram.method).toBe("iqr-tail-aware");
    expect(s.histogram.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(s.validCount);
    expect(s.histogram.bins.at(-1).count).toBe(1);
    expect(s.histogram.bins.at(-1).kind).toBe("high-tail");
  });

  it("represents a constant numeric field with one stable histogram bin", () => {
    const s = computeStats([{ x: 5 }, { x: 5 }, { x: 5 }], ["x"]).x;
    expect(s.histogram.bins).toEqual([{ start: 5, end: 5, count: 3, kind: "center" }]);
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

describe("a column written in a spreadsheet's own formatting", () => {
  // Before this, "$48,000" was not a number, so a currency column was typed
  // categorical and produced no statistics at all — or kept only the cells that
  // happened to parse and reported a confident mean over part of its data.
  it("is a numeric column, with the mean of what the cells say", () => {
    const field = profileField(["$48,000", "$39,250", "$61,000", "$35,500"]);
    expect(field.type).toBe("numeric");
    expect(field.mean).toBe(45937.5);
    expect(field.coverage).toBe(100);
  });

  it("no longer computes a mean from only the rows without commas", () => {
    // The exact silent failure: two of these four used to be dropped for
    // carrying a thousands separator, and the survivors' mean was reported as
    // if it described the column.
    const field = profileField(["1,200", "950", "1,400", "880"]);
    expect(field.validCount).toBe(4);
    expect(field.mean).toBe(1107.5);
  });

  it("names the conventions it read through", () => {
    expect(profileField(["$48,000", "$39,250"]).formats).toEqual(["currency", "thousands"]);
    expect(profileField(["12.5%", "9.8%", "15.1%"]).formats).toEqual(["percent"]);
  });

  it("says nothing about formatting when a column had none", () => {
    expect(profileField([1, 2, 3]).formats).toBeUndefined();
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

  it("profiles a column named line instead of skipping it", () => {
    // This assertion is the reverse of the one it replaces. `line` was skipped
    // as the synthetic row index the text parsers add - but those parsers set
    // isTabular: false and their rows never reach computeStats, so the skip
    // only ever hit a real column of the same name. Text-parser output is
    // covered where it actually flows, by the route tests for a .txt upload.
    const stats = computeStats([{ line: 1, content: "hi" }], ["line", "content"]);
    expect(stats.line).toBeDefined();
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

describe("columns of very small numbers", () => {
  const rates = [0.000012, 0.000031, 0.000024, 0.000009, 0.000045,
                 0.000018, 0.000027, 0.000033, 0.000015, 0.000021];

  it("reports a mean that lies between the min and the max", () => {
    const field = profileField(rates);
    expect(field.mean).toBeGreaterThan(field.min);
    expect(field.mean).toBeLessThan(field.max);
  });

  it("does not flatten the spread to zero", () => {
    const field = profileField(rates);
    expect(field.median).toBeGreaterThan(0);
    expect(field.std).toBeGreaterThan(0);
    expect(field.quantiles.q1).toBeGreaterThan(0);
    expect(field.quantiles.q3).toBeGreaterThan(field.quantiles.q1);
  });

  it("gives the histogram bins actual edges", () => {
    const bins = profileField(rates).histogram.bins;
    expect(bins.some((bin) => bin.start !== bin.end)).toBe(true);
  });

  it("reports a confidence interval that is not a point at zero", () => {
    const interval = profileField(rates).meanConfidence95;
    expect(interval.lower).toBeGreaterThan(0);
    expect(interval.upper).toBeGreaterThan(interval.lower);
  });
});

describe("min and max are reported like every other statistic", () => {
  it("does not print float noise next to rounded siblings", () => {
    // 87.6/100 is 0.8759999999999999 in binary floating point. Reported raw, a
    // column holding it showed max: 0.8759999999999999 beside mean: 0.876 -
    // which reads as a mean above the maximum.
    const field = profileField([87.6 / 100, 0.4, 0.55]);
    expect(field.max).toBe(0.876);
    expect(String(field.max)).not.toContain("999999");
  });

  it("keeps the mean inside the range it reports", () => {
    const field = profileField([87.6 / 100, 87.6 / 100, 87.6 / 100]);
    expect(field.mean).toBeLessThanOrEqual(field.max);
    expect(field.mean).toBeGreaterThanOrEqual(field.min);
  });

  it("still reports a small minimum rather than rounding it to zero", () => {
    const field = profileField([0.000009, 0.000045, 0.000021]);
    expect(field.min).toBe(0.000009);
    expect(field.max).toBe(0.000045);
  });

  it("leaves ordinary values untouched", () => {
    const field = profileField([100, 205, 48000]);
    expect(field.min).toBe(100);
    expect(field.max).toBe(48000);
  });
});

describe("a column genuinely named \"line\"", () => {
  // "line" is an ordinary header: invoice line items, log line numbers,
  // production line, line of business. computeStats skipped it unconditionally,
  // on the grounds that the text parsers synthesise a `line` index - but those
  // parsers report isTabular: false, so their rows never reach computeStats at
  // all. The skip protected nothing and silently dropped a real column.
  const rows = [
    { line: 1, amount: 120 }, { line: 2, amount: 340 }, { line: 3, amount: 210 },
    { line: 4, amount: 455 }, { line: 5, amount: 180 }, { line: 6, amount: 390 },
  ];

  it("profiles it like any other column", () => {
    const stats = computeStats(rows, ["line", "amount"]);
    expect(Object.keys(stats)).toEqual(["line", "amount"]);
    expect(stats.line.type).toBe("numeric");
    expect(stats.line.validCount).toBe(6);
    expect(stats.line.min).toBe(1);
    expect(stats.line.max).toBe(6);
  });

  it("reports the same column set as the quality profile", () => {
    // The two panels described different columns of the same file: the
    // statistics table had no row for it, the quality table did.
    const stats = computeStats(rows, ["line", "amount"]);
    const profile = profileDataset(rows, ["line", "amount"]);
    expect(Object.keys(stats).sort()).toEqual(Object.keys(profile.columns).sort());
  });
});
