import { describe, expect, it } from "vitest";
import {
  categoricalAssociation, detectLevelShift, kolmogorovSmirnov,
  meanConfidenceInterval, welchMeanDifference,
} from "../src/analytics/inference.js";

describe("deterministic inference", () => {
  it("computes a 95% t interval for a sample mean", () => {
    const interval = meanConfidenceInterval([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(interval.lower).toBeCloseTo(3.334, 2);
    expect(interval.upper).toBeCloseTo(7.666, 2);
    expect(interval.degreesFreedom).toBe(9);
  });

  it("uses Welch's test for unequal samples and reports current minus baseline", () => {
    const result = welchMeanDifference([1, 2, 3, 4, 5], [10, 11, 12, 13, 14, 15]);
    expect(result.difference).toBe(9.5);
    expect(result.confidenceInterval.lower).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(0.001);
    expect(result.significant).toBe(true);
  });

  it("reports Cramér's V for categorical association", () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      plan: index < 20 ? "free" : "paid",
      retained: index < 20 ? "no" : "yes",
    }));
    const result = categoricalAssociation(rows, "plan", "retained");
    expect(result.cramersV).toBe(1);
    expect(result.pValue).toBeLessThan(0.001);
    expect(result.n).toBe(40);
  });

  it("detects two-sample distribution shifts and leaves identical samples alone", () => {
    expect(kolmogorovSmirnov([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toEqual(expect.objectContaining({ statistic: 0, pValue: 1 }));
    const shifted = kolmogorovSmirnov([1, 2, 3, 4, 5, 6], [20, 21, 22, 23, 24, 25]);
    expect(shifted.statistic).toBe(1);
    expect(shifted.pValue).toBeLessThan(0.01);
  });

  it("finds a robust candidate level shift at the segment boundary", () => {
    const values = [...Array(12).fill(10), ...Array(12).fill(30)];
    const result = detectLevelShift(values);
    expect(result.splitIndex).toBe(12);
    expect(result.medianDifference).toBe(20);
    expect(result.robustEffect).toBeGreaterThan(1);
    expect(result.exploratory).toBe(true);
  });
});

describe("critical values beyond the default confidence", () => {
  // The critical value is recovered as margin / standardError, which is what
  // the interval is built from.
  const criticalFor = (n, confidence) => {
    const interval = meanConfidenceInterval(Array.from({ length: n }, (_, i) => i), confidence);
    return interval.margin / interval.standardError;
  };

  it("matches the published t table at 95%", () => {
    expect(criticalFor(2, 0.95)).toBeCloseTo(12.706, 2);
    expect(criticalFor(6, 0.95)).toBeCloseTo(2.571, 2);
    expect(criticalFor(31, 0.95)).toBeCloseTo(2.042, 2);
  });

  it("matches it at 99%, above the old search ceiling", () => {
    // The bisection ran over a fixed [0, 20], so every critical value above 20
    // came back as exactly 20 - and 20 is a plausible-looking number, so the
    // interval was silently about three times too narrow. Too narrow is the
    // dangerous direction: it overstates how much the data pins the mean down.
    expect(criticalFor(2, 0.99)).toBeCloseTo(63.657, 1);
    expect(criticalFor(3, 0.99)).toBeCloseTo(9.925, 2);
  });

  it("widens the interval as the confidence demanded rises", () => {
    const values = [4, 9, 2, 7, 5, 11, 3];
    const ninetyFive = meanConfidenceInterval(values, 0.95);
    const ninetyNine = meanConfidenceInterval(values, 0.99);
    expect(ninetyNine.margin).toBeGreaterThan(ninetyFive.margin);
  });
});
