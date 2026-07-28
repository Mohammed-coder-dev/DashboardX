import { describe, it, expect } from "vitest";
import { validateContext, validatePriorQA } from "../src/routes/ask.js";
import { buildFollowUpPrompt } from "../src/prompts.js";

describe("validateContext", () => {
  it("rejects missing or malformed context", () => {
    for (const bad of [undefined, null, "str", 42, []]) {
      expect(() => validateContext(bad)).toThrowError(expect.objectContaining({ code: "invalid_context" }));
    }
  });

  it("requires columns or a document excerpt", () => {
    expect(() => validateContext({})).toThrowError(expect.objectContaining({ code: "invalid_context" }));
    expect(validateContext({ columns: ["a"] }).columns).toEqual(["a"]);
    expect(validateContext({ rawText: "some document" }).rawText).toBe("some document");
  });

  it("caps sizes and coerces shapes", () => {
    const ctx = validateContext({
      filename: "x".repeat(500),
      columns: Array.from({ length: 300 }, (_, i) => i),
      correlations: Array.from({ length: 50 }, () => ({})),
      sampleRows: Array.from({ length: 100 }, () => ({})),
      rawText: "y".repeat(10000),
      stats: [1, 2],
    });
    expect(ctx.filename.length).toBe(200);
    expect(ctx.columns.length).toBe(200);
    expect(ctx.columns[0]).toBe("0");
    expect(ctx.correlations.length).toBe(10);
    expect(ctx.sampleRows.length).toBe(20);
    expect(ctx.rawText.length).toBe(4000);
    expect(ctx.stats).toEqual({});
  });
});

describe("validatePriorQA", () => {
  it("keeps only the last six complete pairs", () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));
    const qa = validatePriorQA(raw);
    expect(qa.length).toBe(6);
    expect(qa[0].q).toBe("q4");
  });

  it("drops incomplete pairs and non-arrays", () => {
    expect(validatePriorQA([{ q: "only q" }, { a: "only a" }, { q: "ok", a: "ok" }])).toHaveLength(1);
    expect(validatePriorQA("nope")).toEqual([]);
    expect(validatePriorQA(undefined)).toEqual([]);
  });
});

describe("buildFollowUpPrompt", () => {
  it("includes context, prior Q&A, and the question", () => {
    const prompt = buildFollowUpPrompt(
      { filename: "sales.csv", columns: ["region", "rev"], stats: { rev: { mean: 5 } },
        correlations: [], sampleRows: [{ region: "GCC" }], profileSummary: "Health A (100/100)" },
      "Which region leads?",
      [{ q: "How many rows?", a: "20 rows." }],
    );
    expect(prompt).toContain("sales.csv");
    expect(prompt).toContain("Health A");
    expect(prompt).toContain("Q: How many rows?");
    expect(prompt).toContain("Which region leads?");
  });

  it("includes the document excerpt for non-tabular sources", () => {
    const prompt = buildFollowUpPrompt(
      { filename: "memo.pdf", columns: [], stats: {}, correlations: [], sampleRows: [], rawText: "the memo body" },
      "Summarize the risks", [],
    );
    expect(prompt).toContain("DOCUMENT EXCERPT: the memo body");
  });
});
