import { describe, it, expect } from "vitest";
import { computeStats } from "../src/analytics/stats.js";
import {
  ANALYSIS_SCHEMA_VERSION, buildEvidence, EVIDENCE_ENGINE_VERSION,
} from "../src/analytics/evidence.js";

function evidenceFor(rows, columns, options) {
  return buildEvidence(rows, columns, computeStats(rows, columns), options);
}

const EVIDENCE_KEYS = [
  "claim", "metric", "value", "columns", "method",
  "sampleSize", "coverage", "strength", "caveat", "statistics", "engineVersion", "provenance",
];

// A sales-style dataset with a numeric target, a category, a date column,
// deliberate missing values and one outlier.
function salesRows() {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const region = i % 2 === 0 ? "north" : "south";
    rows.push({
      region,
      // north sells roughly double south, with slight in-group variation
      revenue: (region === "north" ? 200 : 100) + (i % 5),
      spend: 50 + i * 2,
      when: `2024-0${1 + Math.floor(i / 8)}-${String(1 + (i % 8) * 3).padStart(2, "0")}`,
      note: i % 10 === 0 ? null : `n${i}`,
    });
  }
  rows.push({ region: "north", revenue: 5000, spend: 130, when: "2024-05-25", note: "big" });
  return rows;
}

describe("buildEvidence", () => {
  it("returns an empty list for an empty dataset", () => {
    expect(evidenceFor([], [])).toEqual([]);
  });

  it("produces fully structured evidence objects", () => {
    const evidence = evidenceFor(salesRows(), ["region", "revenue", "spend", "when", "note"]);
    expect(evidence.length).toBeGreaterThan(0);
    for (const item of evidence) {
      expect(Object.keys(item).sort()).toEqual([...EVIDENCE_KEYS].sort());
      expect(item.engineVersion).toBe(EVIDENCE_ENGINE_VERSION);
      expect(typeof item.claim).toBe("string");
      expect(item.sampleSize).toBeGreaterThan(0);
      expect(item.coverage).toBeGreaterThan(0);
      expect(Array.isArray(item.columns)).toBe(true);
      expect(item.provenance.formula).toBeTruthy();
      expect(item.provenance.includedRows + item.provenance.excludedRows).toBe(salesRows().length);
      expect(item.provenance.includedRows).toBe(item.sampleSize);
    }
  });

  it("is deterministic for identical input", () => {
    const rows = salesRows();
    const columns = ["region", "revenue", "spend", "when", "note"];
    expect(evidenceFor(rows, columns)).toEqual(evidenceFor(rows, columns));
    expect(evidenceFor(rows, columns, { target: "revenue" }))
      .toEqual(evidenceFor(rows, columns, { target: "revenue" }));
  });

  it("caps the evidence list", () => {
    const evidence = evidenceFor(salesRows(), ["region", "revenue", "spend", "when", "note"], { limit: 4 });
    expect(evidence.length).toBeLessThanOrEqual(4);
  });

  describe("with a numeric target", () => {
    const columns = ["region", "revenue", "spend", "when", "note"];

    it("compares the target across category groups with an effect size", () => {
      const evidence = evidenceFor(salesRows(), columns, { target: "revenue" });
      const group = evidence.find((e) => e.metric === "group_mean_difference");
      expect(group).toBeDefined();
      expect(group.columns).toEqual(["revenue", "region"]);
      expect(group.claim).toContain("north");
      expect(group.claim).toContain("south");
      expect(group.sampleSize).toBeGreaterThan(30);
      expect(["weak", "moderate", "strong", "very strong"]).toContain(group.strength);
      expect(group.statistics.welch.confidenceInterval).toBeDefined();
      expect(group.statistics.multipleComparisonCorrection).toBe("none");
    });

    it("keeps correlation evidence focused on the target", () => {
      const evidence = evidenceFor(salesRows(), columns, { target: "revenue" });
      for (const item of evidence.filter((e) => e.metric.endsWith("_r") || e.metric.endsWith("_rho"))) {
        expect(item.columns).toContain("revenue");
      }
    });

    it("reports missingness impact on the target when the gap is real", () => {
      // Rows missing `flag` have systematically higher outcome values.
      const rows = Array.from({ length: 30 }, (_, i) => ({
        outcome: i < 10 ? 100 + i : 10 + i,
        flag: i < 10 ? null : "ok",
      }));
      const evidence = evidenceFor(rows, ["outcome", "flag"], { target: "outcome" });
      const impact = evidence.find((e) => e.metric === "missingness_mean_difference");
      expect(impact).toBeDefined();
      expect(impact.caveat).toContain("structural");
    });

    it("detects the target trending over time", () => {
      const rows = Array.from({ length: 24 }, (_, i) => ({
        when: `2024-${String(1 + Math.floor(i / 2)).padStart(2, "0")}-1${i % 2}`,
        kpi: 10 + i * 5,
      }));
      const evidence = evidenceFor(rows, ["when", "kpi"], { target: "kpi" });
      const trend = evidence.find((e) => e.metric === "target_time_trend");
      expect(trend).toBeDefined();
      expect(trend.claim).toContain("increases");
      expect(trend.columns).toEqual(["kpi", "when"]);
    });

    it("flags a robust candidate level shift with exploratory inference", () => {
      const rows = Array.from({ length: 24 }, (_, index) => ({
        when: `2024-01-${String(index + 1).padStart(2, "0")}`,
        kpi: index < 12 ? 10 : 30,
      }));
      const evidence = evidenceFor(rows, ["when", "kpi"], { target: "kpi" });
      const shift = evidence.find((item) => item.metric === "candidate_level_shift");
      expect(shift).toBeDefined();
      expect(shift.statistics.boundary).toBe("2024-01-13");
      expect(shift.statistics.exploratory).toBe(true);
      expect(shift.caveat).toContain("unadjusted");
    });

    it("flags anomalies in the target first", () => {
      const evidence = evidenceFor(salesRows(), columns, { target: "revenue" });
      const anomaly = evidence.find((e) => e.metric === "iqr_outliers");
      expect(anomaly).toBeDefined();
      expect(anomaly.columns).toEqual(["revenue"]);
      expect(anomaly.caveat).toContain("inspect");
    });

    it("ignores a target with no usable signal rather than inventing evidence", () => {
      const rows = Array.from({ length: 10 }, () => ({ constant: 5, other: "x" }));
      const evidence = evidenceFor(rows, ["constant", "other"], { target: "constant" });
      expect(evidence.filter((e) => e.metric === "group_mean_difference")).toEqual([]);
    });
  });

  describe("without a target", () => {
    it("reports categorical association with Cramér's V and a chi-square p-value", () => {
      const rows = Array.from({ length: 40 }, (_, index) => ({
        plan: index < 20 ? "free" : "paid",
        retained: index < 20 ? "no" : "yes",
      }));
      const evidence = evidenceFor(rows, ["plan", "retained"]);
      const association = evidence.find((item) => item.metric === "cramers_v");
      expect(association.value).toBe(1);
      expect(association.statistics.pValue).toBeLessThan(0.001);
      expect(association.provenance.includedRows).toBe(40);
    });

    it("reports category dominance with its share", () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        status: i < 21 ? "active" : i < 27 ? "paused" : "closed",
      }));
      const evidence = evidenceFor(rows, ["status"]);
      const share = evidence.find((e) => e.metric === "category_share");
      expect(share).toBeDefined();
      expect(share.value).toBe(70);
      expect(share.claim).toContain("active");
    });

    it("ignores a distribution in a mostly-empty column", () => {
      // 6 values in 91 rows: the 100% share is arithmetically true but says
      // nothing about the dataset, so it must not be reported at all.
      const rows = Array.from({ length: 91 }, (_, i) => ({
        notes: i % 15 === 0 ? "priority account" : null,
      }));
      const evidence = evidenceFor(rows, ["notes"]);
      expect(evidence.filter((e) => e.metric === "category_share")).toEqual([]);
    });

    it("weakens a distribution whose coverage is partial", () => {
      // 60% coverage, and the present values are unanimous: real, but bounded.
      const rows = Array.from({ length: 40 }, (_, i) => ({
        tier: i < 24 ? "gold" : null,
      }));
      const [share] = evidenceFor(rows, ["tier"]).filter((e) => e.metric === "category_share");
      expect(share).toBeDefined();
      expect(share.value).toBe(100);
      // 100% share would be "strong"; 60% coverage drops it one rung.
      expect(share.strength).toBe("moderate");
      expect(share.caveat).toContain("60% of the data");
    });

    it("pluralises the level count correctly", () => {
      const single = Array.from({ length: 20 }, () => ({ flag: "only" }));
      const [share] = evidenceFor(single, ["flag"]).filter((e) => e.metric === "category_share");
      expect(share.claim).toContain("1 level)");
      expect(share.claim).not.toContain("1 levels");
    });

    it("reports chronological volume changes", () => {
      const rows = [];
      for (let m = 1; m <= 6; m++) {
        for (let i = 0; i < m * 2; i++) rows.push({ when: `2024-0${m}-1${i % 3}` });
      }
      const evidence = evidenceFor(rows, ["when"]);
      const metrics = evidence.map((e) => e.metric);
      expect(metrics).toContain("period_volume_trend");
      expect(metrics).toContain("period_over_period_change");
    });
  });

  it("exposes the schema and engine versions for exports", () => {
    expect(ANALYSIS_SCHEMA_VERSION).toMatch(/^\d+\.\d+$/);
    expect(EVIDENCE_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
