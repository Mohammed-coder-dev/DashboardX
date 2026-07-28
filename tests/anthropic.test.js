import { describe, it, expect } from "vitest";
import { resolveModel, resolveApiKey, SUPPORTED_MODELS, DEFAULT_MODEL } from "../src/services/anthropic.js";
import { config } from "../src/config.js";

function reqWith(headers = {}) {
  return { get: (name) => headers[name.toLowerCase()] };
}

describe("resolveModel", () => {
  it("falls back to the default model", () => {
    expect(resolveModel(undefined)).toBe(DEFAULT_MODEL);
    expect(resolveModel("")).toBe(DEFAULT_MODEL);
    expect(resolveModel(null)).toBe(DEFAULT_MODEL);
  });

  it("accepts every whitelisted model", () => {
    for (const id of Object.keys(SUPPORTED_MODELS)) expect(resolveModel(id)).toBe(id);
  });

  it("rejects unknown models with a 400", () => {
    expect(() => resolveModel("gpt-4")).toThrowError(expect.objectContaining({ status: 400, code: "unsupported_model" }));
    expect(() => resolveModel(123)).toThrowError(expect.objectContaining({ code: "unsupported_model" }));
  });
});

describe("resolveApiKey", () => {
  it("uses the request header key when present", () => {
    expect(resolveApiKey(reqWith({ "x-anthropic-key": " sk-ant-abc123 " }))).toBe("sk-ant-abc123");
  });

  it("throws 401 when no key is available anywhere", () => {
    const saved = config.anthropicApiKey;
    config.anthropicApiKey = null;
    try {
      expect(() => resolveApiKey(reqWith())).toThrowError(expect.objectContaining({ status: 401, code: "missing_api_key" }));
    } finally {
      config.anthropicApiKey = saved;
    }
  });

  it("falls back to the server key when the header is absent", () => {
    const saved = config.anthropicApiKey;
    config.anthropicApiKey = "sk-ant-server-key";
    try {
      expect(resolveApiKey(reqWith())).toBe("sk-ant-server-key");
    } finally {
      config.anthropicApiKey = saved;
    }
  });

  it("rejects keys that do not look like Anthropic keys", () => {
    expect(() => resolveApiKey(reqWith({ "x-anthropic-key": "hello" })))
      .toThrowError(expect.objectContaining({ status: 400, code: "invalid_api_key_format" }));
  });
});
