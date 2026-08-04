import { describe, it, expect } from "vitest";
import { persistRequested, resolveColumns, validateColumns, validateQuestion, validateTarget } from "../src/routes/analyze.js";
import { validSessionId } from "../src/services/history.js";

describe("persistRequested", () => {
  it("treats only an explicit affirmative as consent", () => {
    expect(persistRequested(true)).toBe(true);
    expect(persistRequested("true")).toBe(true);
    expect(persistRequested("1")).toBe(true);
    expect(persistRequested("on")).toBe(true);
  });

  it("defaults to no persistence for everything else", () => {
    for (const value of [undefined, null, "", false, "false", "0", "off", "yes", 1, {}]) {
      expect(persistRequested(value), `${JSON.stringify(value)} must not opt in`).toBe(false);
    }
  });
});

describe("validateTarget", () => {
  it("returns null when no target was chosen", () => {
    expect(validateTarget(undefined)).toBeNull();
    expect(validateTarget(null)).toBeNull();
    expect(validateTarget("")).toBeNull();
  });

  it("passes through a plausible column name", () => {
    expect(validateTarget("revenue")).toBe("revenue");
  });

  it("rejects non-strings and oversized names", () => {
    expect(() => validateTarget(42)).toThrowError(expect.objectContaining({ code: "invalid_target" }));
    expect(() => validateTarget("x".repeat(201))).toThrowError(expect.objectContaining({ code: "invalid_target" }));
  });
});

describe("validateColumns", () => {
  it("returns null when no selection was made", () => {
    expect(validateColumns(undefined)).toBeNull();
    expect(validateColumns(null)).toBeNull();
    expect(validateColumns("")).toBeNull();
  });

  it("accepts a JSON array and an already-parsed array alike", () => {
    expect(validateColumns('["revenue","region"]')).toEqual(["revenue", "region"]);
    expect(validateColumns(["revenue", "region"])).toEqual(["revenue", "region"]);
  });

  it("never splits on commas, because header names contain them", () => {
    // "Revenue, USD" is one column. Splitting would analyze two that don't exist.
    expect(() => validateColumns("Revenue, USD")).toThrowError(
      expect.objectContaining({ code: "invalid_columns" }),
    );
    expect(validateColumns('["Revenue, USD"]')).toEqual(["Revenue, USD"]);
  });

  it("trims, drops blanks and de-duplicates", () => {
    expect(validateColumns('[" revenue ","revenue","","region"]')).toEqual(["revenue", "region"]);
  });

  it("treats a selection of nothing as no selection", () => {
    expect(validateColumns("[]")).toBeNull();
    expect(validateColumns('["  "]')).toBeNull();
  });

  it("rejects non-arrays, non-string members and oversized selections", () => {
    for (const bad of ['{"a":1}', "42", '["ok",7]', JSON.stringify(Array.from({ length: 513 }, (_, i) => `c${i}`))]) {
      expect(() => validateColumns(bad), `${bad.slice(0, 24)} must be rejected`)
        .toThrowError(expect.objectContaining({ code: "invalid_columns" }));
    }
  });
});

describe("resolveColumns", () => {
  const columns = ["region", "revenue", "notes"];

  it("passes every column through when nothing was selected", () => {
    expect(resolveColumns(null, columns)).toEqual({ active: columns, excluded: [] });
  });

  it("reports what was excluded, not just what survived", () => {
    expect(resolveColumns(["region", "revenue"], columns)).toEqual({
      active: ["region", "revenue"],
      excluded: ["notes"],
    });
  });

  it("keeps parsed order so identical selections give identical output", () => {
    expect(resolveColumns(["revenue", "region"], columns).active).toEqual(["region", "revenue"]);
  });

  it("rejects a selection naming a column the file does not have", () => {
    expect(() => resolveColumns(["revenue", "profit"], columns))
      .toThrowError(expect.objectContaining({ code: "unknown_column" }));
  });

  it("refuses to analyze nothing", () => {
    expect(() => resolveColumns([], columns)).toThrowError(
      expect.objectContaining({ code: "no_columns_selected" }),
    );
  });
});

describe("validateQuestion", () => {
  it("returns empty string for absent questions", () => {
    expect(validateQuestion(undefined)).toBe("");
    expect(validateQuestion(null)).toBe("");
    expect(validateQuestion("")).toBe("");
  });

  it("trims valid questions", () => {
    expect(validateQuestion("  why?  ")).toBe("why?");
  });

  it("rejects non-string questions", () => {
    expect(() => validateQuestion(42)).toThrowError(expect.objectContaining({ code: "invalid_question" }));
    expect(() => validateQuestion({})).toThrowError(expect.objectContaining({ code: "invalid_question" }));
  });

  it("rejects questions over 2000 characters", () => {
    expect(() => validateQuestion("x".repeat(2001)))
      .toThrowError(expect.objectContaining({ status: 400, code: "question_too_long" }));
    expect(validateQuestion("x".repeat(2000))).toBe("x".repeat(2000));
  });
});

describe("validSessionId", () => {
  it("accepts url-safe ids between 8 and 64 chars", () => {
    expect(validSessionId("abcd1234")).toBe("abcd1234");
    expect(validSessionId("a".repeat(64))).toBe("a".repeat(64));
    expect(validSessionId("with_underscore-and-dash1")).toBe("with_underscore-and-dash1");
  });

  it("rejects short, long, or unsafe ids", () => {
    expect(validSessionId("short")).toBeNull();
    expect(validSessionId("a".repeat(65))).toBeNull();
    expect(validSessionId("<script>alert(1)</script>")).toBeNull();
    expect(validSessionId(null)).toBeNull();
    expect(validSessionId(42)).toBeNull();
  });
});
