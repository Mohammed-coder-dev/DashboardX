import { describe, expect, it } from "vitest";
import { buildProvenance } from "../src/analytics/provenance.js";
import { computeStats } from "../src/analytics/stats.js";

describe("evidence provenance", () => {
  it("accounts for pairwise correlation inclusion and exclusion", () => {
    const rows = [
      { x: 1, y: 2, private: "not included" },
      { x: 2, y: null, private: "not included" },
      { x: "bad", y: 4, private: "not included" },
      { x: 4, y: 8, private: "not included" },
    ];
    const provenance = buildProvenance({ metric: "spearman_rho", columns: ["x", "y"], method: "rank correlation" }, rows);

    expect(provenance.formula).toContain("ranks");
    expect(provenance.includedRows).toBe(2);
    expect(provenance.excludedRows).toBe(2);
    expect(provenance.exclusionReasons).toEqual(expect.arrayContaining([
      { reason: "missing y", count: 1 },
      { reason: "non-numeric x", count: 1 },
    ]));
    expect(provenance.sourceRows.map((row) => row.rowNumber)).toEqual([1, 4]);
    expect(Object.keys(provenance.sourceRows[0].values)).toEqual(["x", "y"]);
    expect(provenance.sourceRows[0].values).not.toHaveProperty("private");
  });

  it("uses flagged observations as the source excerpt for outlier evidence", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 100].map((value) => ({ value }));
    const stats = computeStats(rows, ["value"]);
    const provenance = buildProvenance({ metric: "iqr_outliers", columns: ["value"], method: "IQR" }, rows, stats);

    expect(provenance.includedRows).toBe(9);
    expect(provenance.sourceRowsPolicy).toContain("outlier");
    expect(provenance.sourceRows).toEqual([{ rowNumber: 9, values: { value: 100 } }]);
  });

  it("caps source excerpts while preserving the first and last included rows", () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ status: index % 2 ? "open" : "closed" }));
    const provenance = buildProvenance({ metric: "category_share", columns: ["status"], method: "frequency" }, rows);
    expect(provenance.sourceRows).toHaveLength(10);
    expect(provenance.sourceRows[0].rowNumber).toBe(1);
    expect(provenance.sourceRows.at(-1).rowNumber).toBe(50);
  });
});
