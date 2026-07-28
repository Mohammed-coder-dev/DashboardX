import { describe, it, expect } from "vitest";
import { classifyValue, countOutliers, profileColumn, profileDataset, profileSummaryForPrompt } from "../src/analytics/profile.js";

describe("classifyValue", () => {
  it("classifies numbers and numeric strings", () => {
    expect(classifyValue(42)).toBe("numeric");
    expect(classifyValue("42")).toBe("numeric");
    expect(classifyValue("-3.14")).toBe("numeric");
    expect(classifyValue(" 7 ")).toBe("numeric");
  });

  it("classifies dates in common formats", () => {
    expect(classifyValue("2024-01-31")).toBe("date");
    expect(classifyValue("2024-01-31T10:00:00Z")).toBe("date");
    expect(classifyValue("12/31/2024")).toBe("date");
    expect(classifyValue("31-12-24")).toBe("date");
    expect(classifyValue("Jan 5, 2024")).toBe("date");
    expect(classifyValue(new Date())).toBe("date");
  });

  it("classifies missing values", () => {
    expect(classifyValue(null)).toBe("missing");
    expect(classifyValue(undefined)).toBe("missing");
    expect(classifyValue("")).toBe("missing");
    expect(classifyValue("   ")).toBe("missing");
    expect(classifyValue(NaN)).toBe("missing");
  });

  it("classifies booleans and text", () => {
    expect(classifyValue(true)).toBe("boolean");
    expect(classifyValue("hello world")).toBe("text");
  });
});

describe("countOutliers", () => {
  it("finds IQR outliers", () => {
    expect(countOutliers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100])).toBe(1);
  });

  it("returns 0 for small samples", () => {
    expect(countOutliers([1, 2, 1000])).toBe(0);
  });

  it("returns 0 when there is no spread", () => {
    expect(countOutliers([5, 5, 5, 5, 5, 5, 5, 5, 5])).toBe(0);
  });
});

describe("profileColumn", () => {
  it("measures missingness and uniqueness", () => {
    const p = profileColumn(["a", "b", "a", null, "", "c"]);
    expect(p.missing).toBe(2);
    expect(p.missingPct).toBe(33.3);
    expect(p.unique).toBe(3);
    expect(p.type).toBe("text");
  });

  it("flags mixed-type columns", () => {
    const p = profileColumn([1, 2, 3, "apple", "pear", 6, "kiwi", "x", 9, "y"]);
    expect(p.type).toBe("mixed");
    expect(p.typeConsistency).toBeLessThan(0.8);
  });

  it("marks fully empty columns", () => {
    expect(profileColumn([null, "", undefined]).type).toBe("empty");
  });

  it("counts outliers only for numeric columns", () => {
    const p = profileColumn([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]);
    expect(p.type).toBe("numeric");
    expect(p.outliers).toBe(1);
  });
});

describe("profileDataset", () => {
  const cleanRows = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `item-${i}`, price: 10 + i }));

  it("gives clean data a top grade with no issues", () => {
    const p = profileDataset(cleanRows, ["id", "name", "price"]);
    expect(p.healthScore).toBe(100);
    expect(p.healthGrade).toBe("A");
    expect(p.duplicateRows).toBe(0);
    expect(p.issues).toEqual([]);
    expect(p.completeness).toBe(100);
  });

  it("detects duplicate rows", () => {
    const rows = [...cleanRows, { ...cleanRows[0] }, { ...cleanRows[1] }];
    const p = profileDataset(rows, ["id", "name", "price"]);
    expect(p.duplicateRows).toBe(2);
    expect(p.issues.some(i => i.message.includes("duplicate"))).toBe(true);
  });

  it("penalizes missing and mixed data into a lower grade", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      v: i % 2 === 0 ? null : i,          // 50% missing
      w: i < 10 ? i : `text-${i}`,        // mixed types
    }));
    const p = profileDataset(rows, ["v", "w"]);
    expect(p.healthScore).toBeLessThan(70);
    expect(p.issues.some(i => i.message.includes("missing"))).toBe(true);
    expect(p.issues.some(i => i.message.includes("mixes value types"))).toBe(true);
  });

  it("orders issues by severity", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      bad: i < 12 ? null : "x",                          // high missing
      spiky: i === 0 ? 999 : i,                          // low: outlier
    }));
    const p = profileDataset(rows, ["bad", "spiky"]);
    const severities = p.issues.map(i => i.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a]) - ({ high: 0, medium: 1, low: 2 }[b])));
  });
});

describe("profileSummaryForPrompt", () => {
  it("compacts the profile into one grounded line", () => {
    const p = profileDataset([{ a: 1, b: null }, { a: 2, b: "x" }], ["a", "b"]);
    const s = profileSummaryForPrompt(p);
    expect(s).toContain(`Health ${p.healthGrade}`);
    expect(s).toContain("a: numeric");
    expect(s).toContain("50% missing");
  });
});
