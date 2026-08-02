import { describe, expect, it } from "vitest";
import { compareAnalyses } from "../src/analytics/compare.js";
import { computeStats } from "../src/analytics/stats.js";
import { profileDataset } from "../src/analytics/profile.js";

function analyzed(filename, rows, columns) {
  return { filename, rows, columns, stats: computeStats(rows, columns), profile: profileDataset(rows, columns) };
}

describe("compareAnalyses", () => {
  it("reports schema, quality, and numeric changes with first-file baseline semantics", () => {
    const baselineRows = [
      { region: "North", revenue: 100, legacy: "a" },
      { region: "South", revenue: 110, legacy: "b" },
      { region: "North", revenue: 120, legacy: "c" },
    ];
    const currentRows = [
      { region: "West", revenue: 200, channel: "direct" },
      { region: "West", revenue: 210, channel: "direct" },
      { region: "South", revenue: 220, channel: "partner" },
      { region: "West", revenue: 230, channel: "direct" },
    ];
    const comparison = compareAnalyses(
      analyzed("baseline.csv", baselineRows, ["region", "revenue", "legacy"]),
      analyzed("current.csv", currentRows, ["region", "revenue", "channel"]),
    );

    expect(comparison.deterministic).toBe(true);
    expect(comparison.labels).toEqual({ baseline: "baseline.csv", current: "current.csv" });
    expect(comparison.schema.added).toEqual(["channel"]);
    expect(comparison.schema.removed).toEqual(["legacy"]);
    expect(comparison.summary.rowDelta).toBe(1);
    expect(comparison.columns.find((column) => column.column === "revenue").deltas.mean).toBe(105);
    expect(comparison.findings.some((finding) => finding.metric === "numeric.mean")).toBe(true);
    expect(comparison.findings.some((finding) => finding.metric === "categorical.dominant")).toBe(true);
  });

  it("isolates type changes instead of comparing incompatible metrics", () => {
    const baseline = analyzed("before.csv", [{ amount: 1 }, { amount: 2 }], ["amount"]);
    const current = analyzed("after.csv", [{ amount: "low" }, { amount: "high" }], ["amount"]);
    const comparison = compareAnalyses(baseline, current);

    expect(comparison.schema.typeChanges).toEqual([{ column: "amount", baseline: "numeric", current: "categorical" }]);
    expect(comparison.columns).toEqual([]);
    expect(comparison.findings[0].severity).toBe("high");
  });

  it("returns an explicit stable finding when thresholds are not crossed", () => {
    const rows = [{ a: 1 }, { a: 2 }, { a: 3 }];
    const comparison = compareAnalyses(analyzed("a.csv", rows, ["a"]), analyzed("b.csv", rows, ["a"]));
    expect(comparison.findings).toEqual([expect.objectContaining({ severity: "neutral", metric: "stable" })]);
  });
});
