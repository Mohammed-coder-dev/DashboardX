import { describe, it, expect } from "vitest";
import { computeStats } from "../src/analytics/stats.js";

describe("computeStats", () => {
  it("computes numeric stats for a numeric column", () => {
    const rows = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }];
    const stats = computeStats(rows, ["x"]);
    expect(stats.x).toEqual({ type: "numeric", count: 4, mean: 2.5, median: 2.5, min: 1, max: 4, std: 1.118 });
  });

  it("computes an odd-length median", () => {
    const rows = [{ x: 10 }, { x: 20 }, { x: 90 }];
    expect(computeStats(rows, ["x"]).x.median).toBe(20);
  });

  it("classifies mostly-text columns as categorical with top values", () => {
    const rows = [{ c: "a" }, { c: "b" }, { c: "a" }, { c: "c" }];
    const stats = computeStats(rows, ["c"]);
    expect(stats.c.type).toBe("categorical");
    expect(stats.c.count).toBe(4);
    expect(stats.c.unique).toBe(3);
    expect(stats.c.top).toEqual(["a", "b", "c"]);
  });

  it("treats a column as numeric when at least half the values parse", () => {
    const rows = [{ m: "1" }, { m: "2" }, { m: "n/a" }, { m: "4" }];
    expect(computeStats(rows, ["m"]).m.type).toBe("numeric");
  });

  it("ignores null and empty values", () => {
    const rows = [{ x: 1 }, { x: null }, { x: "" }, { x: 3 }];
    expect(computeStats(rows, ["x"]).x.count).toBe(2);
  });

  it("skips the synthetic line column", () => {
    const stats = computeStats([{ line: 1, content: "hi" }], ["line", "content"]);
    expect(stats.line).toBeUndefined();
    expect(stats.content).toBeDefined();
  });
});
