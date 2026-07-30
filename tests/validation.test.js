import { describe, it, expect } from "vitest";
import { persistRequested, validateQuestion, validateTarget } from "../src/routes/analyze.js";
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
