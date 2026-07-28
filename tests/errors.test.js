import { describe, it, expect } from "vitest";
import { AppError, normalizeError } from "../src/errors.js";

describe("normalizeError", () => {
  it("passes AppError through unchanged", () => {
    const err = new AppError("Nope.", { status: 403, code: "forbidden" });
    expect(normalizeError(err)).toEqual({ status: 403, code: "forbidden", message: "Nope." });
  });

  it("defaults AppError to a 500 internal error", () => {
    expect(normalizeError(new AppError("Boom"))).toEqual({ status: 500, code: "internal_error", message: "Boom" });
  });

  it("maps multer size limits to 413", () => {
    const err = new Error("File too large");
    err.name = "MulterError";
    err.code = "LIMIT_FILE_SIZE";
    expect(normalizeError(err)).toMatchObject({ status: 413, code: "file_too_large" });
  });

  it("maps unknown multer codes to a generic 400", () => {
    const err = new Error("weird");
    err.name = "MulterError";
    err.code = "LIMIT_PART_COUNT";
    expect(normalizeError(err)).toMatchObject({ status: 400, code: "upload_error" });
  });

  it("maps body-parser JSON syntax errors to 400", () => {
    const err = new SyntaxError("Unexpected token");
    err.status = 400;
    expect(normalizeError(err)).toMatchObject({ status: 400, code: "invalid_json" });
  });

  it("hides internals of unknown errors behind a generic 500", () => {
    const normalized = normalizeError(new Error("ECONNREFUSED 10.0.0.5:5432 password=hunter2"));
    expect(normalized.status).toBe(500);
    expect(normalized.message).not.toContain("hunter2");
  });

  it("survives non-Error throwables", () => {
    expect(normalizeError("a string")).toMatchObject({ status: 500 });
    expect(normalizeError(undefined)).toMatchObject({ status: 500 });
  });
});
