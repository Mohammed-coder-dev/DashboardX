import { describe, it, expect } from "vitest";
import { buildTabularPrompt, buildTextPrompt, buildCrossSummaryPrompt } from "../src/prompts.js";

describe("buildTabularPrompt", () => {
  it("includes columns, stats, sample rows, and the question", () => {
    const prompt = buildTabularPrompt(
      ["region", "sales"],
      { sales: { type: "numeric", mean: 5 } },
      [{ colA: "a", colB: "b", r: 0.9 }],
      [{ region: "GCC", sales: 5 }],
      "Which region wins?",
    );
    expect(prompt).toContain("region, sales");
    expect(prompt).toContain('"mean": 5');
    expect(prompt).toContain("GCC");
    expect(prompt).toContain("Which region wins?");
  });

  it("caps sample rows at 5", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ marker: `row-${i}` }));
    const prompt = buildTabularPrompt(["marker"], {}, [], rows, "");
    expect(prompt).toContain("row-4");
    expect(prompt).not.toContain("row-5\"");
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
