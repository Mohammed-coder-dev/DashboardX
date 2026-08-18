import { describe, it, expect } from "vitest";
import { buildTabularPrompt, buildTextPrompt, buildCrossSummaryPrompt } from "../src/prompts.js";
import { computeStats } from "../src/analytics/stats.js";

describe("buildTabularPrompt", () => {
  it("includes columns, stats, sample rows, and the question", () => {
    const prompt = buildTabularPrompt(
      ["region", "sales"],
      { sales: { type: "numeric", mean: 5 } },
      [{ columnA: "a", columnB: "b", coefficient: 0.9 }],
      [{ region: "GCC", sales: 5 }],
      "Which region wins?",
    );
    expect(prompt).toContain("region, sales");
    expect(prompt).toContain('"mean": 5');
    expect(prompt).toContain("GCC");
    expect(prompt).toContain("Which region wins?");
  });

  it("sends a bounded representative sample, not the first N rows", () => {
    // On a sorted export the first rows are the smallest values of one group;
    // the sample must reach the far end of the dataset instead.
    const rows = Array.from({ length: 200 }, (_, i) => ({ marker: `row-${i}`, v: i }));
    const prompt = buildTabularPrompt(["marker", "v"], {}, [], rows, "");
    expect(prompt).toContain("row-0");
    expect(prompt).toContain("row-199");
    expect(prompt).toContain("selectedBecause");
    // Bounded: nowhere near all 200 rows are embedded.
    const embedded = (prompt.match(/"row-\d+"/g) || []).length;
    expect(embedded).toBeLessThanOrEqual(20);
  });

  it("instructs the model to explain computed evidence, not rediscover it", () => {
    const prompt = buildTabularPrompt(["a"], {}, [], [{ a: 1 }], "");
    expect(prompt).toContain("already computed");
    expect(prompt).toMatch(/never infer a total, average or distribution/);
  });

  it("uses a default question when none is given", () => {
    expect(buildTabularPrompt(["a"], {}, [], [], "")).toContain("Give me a full analysis.");
  });
});

describe("buildTextPrompt", () => {
  it("labels the document type and embeds the content", () => {
    const prompt = buildTextPrompt("pdf", "quarterly filing text", "Summarize risks");
    expect(prompt).toContain("PDF document");
    expect(prompt).toContain("quarterly filing text");
    expect(prompt).toContain("Summarize risks");
  });

  it("falls back to a generic label for unknown types", () => {
    expect(buildTextPrompt("mystery", "x", "")).toContain("analyst");
  });
});

describe("buildCrossSummaryPrompt", () => {
  it("includes each file's summary and top insights", () => {
    const prompt = buildCrossSummaryPrompt([
      { filename: "a.csv", fileType: "spreadsheet",
        analysis: { summary: "S1", conclusion: "C1", insights: [{ title: "T1", detail: "D1" }] } },
      { filename: "b.pdf", fileType: "pdf",
        analysis: { summary: "S2", conclusion: "C2", insights: [] } },
    ], "compare them");
    expect(prompt).toContain('"a.csv"');
    expect(prompt).toContain("T1: D1");
    expect(prompt).toContain("S2");
    expect(prompt).toContain("compare them");
    expect(prompt).toContain("2 files");
  });
});

describe("what the prompt carries and what it leaves behind", () => {
  // The payload a browser receives and the payload a model should read are not
  // the same object. Rendering the first into the prompt made every field added
  // for the UI into prompt content by accident, and two of them grow with the
  // dataset: outliers.rows (up to 200 flagged rows per numeric column, added
  // for the drill-down) and a correlation's scatter (up to 500 paired points,
  // added for plotting).
  const statsWithDrilldown = {
    amount: {
      type: "numeric", validCount: 40, coverage: 100, mean: 210, median: 190,
      min: 3, max: 9000, std: 44,
      histogram: { method: "iqr-tail-aware", bins: [{ start: 0, end: 100, count: 20, kind: "center" }] },
      outliers: {
        count: 3, method: "iqr", applied: true, lowerFence: -50, upperFence: 500, rowsCap: 200,
        rows: [
          { row: 7, value: 9000, side: "above", beyond: 8500 },
          { row: 12, value: 8100, side: "above", beyond: 7600 },
          { row: 31, value: 7050, side: "above", beyond: 6550 },
        ],
      },
    },
  };
  const correlationsWithScatter = [{
    columnA: "amount", columnB: "spend", method: "pearson", coefficient: 0.82,
    pearson: 0.82, spearman: 0.8, n: 40, coverage: 100, strength: "strong",
    smallSample: false, caveat: "only 40 paired observations",
    scatter: { kind: "points", n: 3, points: [[1, 2], [3, 4], [5, 6]] },
  }];

  const prompt = buildTabularPrompt(
    ["amount", "spend"], statsWithDrilldown, correlationsWithScatter,
    [{ amount: 1, spend: 2 }], "why?", "Health A", [],
  );

  it("leaves out the flagged rows and the scatter points", () => {
    expect(prompt).not.toContain('"beyond"');
    expect(prompt).not.toContain("8500");
    expect(prompt).not.toContain('"points"');
    expect(prompt).not.toContain('"scatter"');
  });

  it("keeps everything the model is asked to reason about", () => {
    expect(prompt).toContain('"count": 3');           // how many outliers
    expect(prompt).toContain('"upperFence": 500');    // and where the fence is
    expect(prompt).toContain('"coefficient": 0.82');
    expect(prompt).toContain('"n": 40');
    expect(prompt).toContain('"coverage": 100');
    expect(prompt).toContain("only 40 paired observations");
    expect(prompt).toContain('"histogram"');
    expect(prompt).toContain('"median": 190');
  });

  it("says how many flagged rows exist without listing them", () => {
    expect(prompt).toContain('"rowsReported": 3');
  });

  it("does not mutate the caller's stats or correlations", () => {
    // The same objects go on to the HTTP response; the trim is for the prompt.
    expect(statsWithDrilldown.amount.outliers.rows).toHaveLength(3);
    expect(correlationsWithScatter[0].scatter.points).toHaveLength(3);
  });

  it("stays bounded as the file grows", () => {
    // Before the trim the prompt grew with the number of rows, because every
    // flagged row was serialised into it. It should now scale with the number
    // of columns instead.
    const build = (rowCount) => {
      const rows = Array.from({ length: rowCount }, (unused, i) => ({ v: i % 7 === 0 ? i * 900 : i }));
      const stats = computeStats(rows, ["v"]);
      return buildTabularPrompt(["v"], stats, [], rows, "", "", []).length;
    };
    const small = build(300);
    const large = build(6000);
    expect(large).toBeLessThan(small * 1.5);
  });
});
