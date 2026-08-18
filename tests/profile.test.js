import { describe, it, expect } from "vitest";
import { classifyValue, countOutliers, profileColumn, profileDataset, profileSummaryForPrompt } from "../src/analytics/profile.js";
import { computeStats } from "../src/analytics/stats.js";

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

describe("rows that are not objects", () => {
  // A JSON export with a null element - `[{"a":1}, null, {"a":2}]` - is a
  // valid file and reaches the analytics layer as a row of `null`. Every other
  // module reads cells with `row?.[column]` and counts such a row as one whose
  // values are all missing; profileDataset reached in with `row[column]` and
  // threw a TypeError, which surfaced as a 500 on a file nothing was wrong with.
  const rows = [{ a: 1, b: "x" }, null, { a: 2, b: "y" }, { a: 3, b: "z" }];

  it("treats a null row as a row with every value missing", () => {
    const p = profileDataset(rows, ["a", "b"]);
    expect(p.rows).toBe(4);
    expect(p.columns.a.missing).toBe(1);
    expect(p.columns.a.missingPct).toBe(25);
    expect(p.columns.a.type).toBe("numeric");
  });

  it("counts it once, not as a duplicate of a populated row", () => {
    expect(profileDataset(rows, ["a", "b"]).duplicateRows).toBe(0);
  });

  it("agrees with computeStats about how many values are missing", () => {
    const profile = profileDataset(rows, ["a", "b"]);
    const stats = computeStats(rows, ["a", "b"]);
    expect(profile.columns.a.missing).toBe(stats.a.missing);
  });

  it("survives an undefined row too", () => {
    expect(() => profileDataset([{ a: 1 }, undefined], ["a"])).not.toThrow();
  });
});

describe("numbers written in a spreadsheet's own formatting", () => {
  // values.js is the coercion layer everything numeric goes through, and it has
  // read `$48,000`, `12.5%` and `(1,200)` as numbers since the evidence engine
  // hit 1.3.0. classifyValue still reached for bare Number(), so the quality
  // profile called a currency column "text" while the statistics panel beside
  // it reported a mean - two readings of one column, disagreeing on screen.
  it("classifies formatted numbers as numeric", () => {
    expect(classifyValue("$48,000")).toBe("numeric");
    expect(classifyValue("12.5%")).toBe("numeric");
    expect(classifyValue("(1,200)")).toBe("numeric");
    expect(classifyValue("1,234.56")).toBe("numeric");
  });

  it("still calls text text", () => {
    expect(classifyValue("hello world")).toBe("text");
    expect(classifyValue("555-1234")).toBe("text");
    expect(classifyValue("N/A")).toBe("text");
    // Not a finite observation, so not a number the engine can use.
    expect(classifyValue("Infinity")).toBe("text");
  });

  it("agrees with computeStats on a currency column's type", () => {
    const rows = [
      { region: "north", revenue: "$48,000" }, { region: "south", revenue: "$52,300" },
      { region: "east", revenue: "$41,900" }, { region: "west", revenue: "$63,150" },
      { region: "north", revenue: "$37,420" }, { region: "south", revenue: "$59,880" },
    ];
    const columns = ["region", "revenue"];
    const profile = profileDataset(rows, columns);
    const stats = computeStats(rows, columns);
    expect(stats.revenue.type).toBe("numeric");
    expect(profile.columns.revenue.type).toBe(stats.revenue.type);
  });

  // The damaging case: a column where only some cells wear a thousands
  // separator split numeric/text, fell under the 0.8 consistency bar, and was
  // reported as a high-severity "mixes value types" issue against a column
  // that holds nothing but numbers.
  it("does not report a partly-formatted numeric column as mixed", () => {
    const values = ["1,200", "980", "1,450", "760", "1,010", "890", "1,340", "1,120", "705", "1,275"];
    const p = profileColumn(values);
    expect(p.type).toBe("numeric");
    expect(p.typeConsistency).toBe(1);
  });

  it("counts outliers in a currency column", () => {
    // countOutliers only runs on a column typed numeric, so a currency column
    // reported zero outliers however extreme its values were.
    const values = ["$10", "$12", "$11", "$13", "$9", "$14", "$10", "$12", "$5,000"];
    expect(profileColumn(values).outliers).toBe(1);
  });
});
