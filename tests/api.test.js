// API integration tests: exercise the real Express app over HTTP on an
// ephemeral port. The Anthropic SDK is mocked, so the suite never needs a real
// key and never makes a network call.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Raise the per-IP limiter before the app imports its config: this suite drives
// far more requests from one address than a real client would.
process.env.RATE_LIMIT_POINTS = "10000";
process.env.RATE_LIMIT_ASK_POINTS = "10000";

const createMessage = vi.fn();
const saveAnalysisMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {}
  class BadRequestError extends APIError {}
  class APIConnectionError extends APIError {}
  // Must be constructible: the service does `new Anthropic(...)`.
  class Anthropic {
    constructor() {
      this.messages = { create: createMessage };
    }
  }
  Object.assign(Anthropic, {
    APIError, AuthenticationError, PermissionDeniedError,
    RateLimitError, BadRequestError, APIConnectionError,
  });
  return { default: Anthropic };
});

// History is exercised through the route boundary; Supabase itself is stubbed
// so the suite needs no database.
vi.mock("../src/services/history.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    historyEnabled: () => true,
    saveAnalysis: (...args) => saveAnalysisMock(...args),
  };
});

const { createApp } = await import("../src/app.js");

const CSV = "region,revenue,spend\nnorth,200,90\nsouth,100,45\nnorth,210,95\nsouth,,50\nnorth,205,92\n";
const ANALYSIS = {
  summary: "s", insights: [], variables: [], charts: [], topics: [], conclusion: "c",
};
const FAKE_KEY = "sk-ant-test-not-a-real-key-000000";

let server;
let base;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

afterEach(() => {
  createMessage.mockReset();
  saveAnalysisMock.mockReset();
});

function csvForm(extra = {}, { field = "file", name = "data.csv", body = CSV } = {}) {
  const form = new FormData();
  form.append(field, new File([body], name, { type: "text/csv" }));
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return form;
}

function mockAnalysisResponse(payload = ANALYSIS) {
  createMessage.mockResolvedValue({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(payload) }],
  });
}

describe("GET /api/health", () => {
  it("reports status, key presence and the model catalogue", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.serverKey).toBe("boolean");
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0]).toHaveProperty("label");
    expect(body.models[0]).toHaveProperty("note");
    expect(body.defaultModel).toBe("claude-sonnet-5");
  });
});

describe("upload validation", () => {
  it("rejects a request with no file", async () => {
    const res = await fetch(`${base}/api/analyze`, { method: "POST", body: new FormData() });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("no_file");
  });

  it("rejects an unsupported file type", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      body: csvForm({}, { name: "virus.exe", body: "x" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unsupported_file_type");
  });

  it("rejects an aggregate upload larger than the request budget", async () => {
    // Each file is under the per-file limit; together they exceed the request
    // budget that Vercel enforces before the function ever runs.
    const chunk = "a".repeat(3 * 1024 * 1024);
    const form = new FormData();
    form.append("files", new File([chunk], "one.csv", { type: "text/csv" }));
    form.append("files", new File([chunk], "two.csv", { type: "text/csv" }));
    const res = await fetch(`${base}/api/analyze-multi`, { method: "POST", body: form });
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("upload_too_large");
  });

  it("rejects an empty file", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      body: csvForm({}, { name: "empty.csv", body: "" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("empty_file");
  });
});

describe("deterministic analysis without a key", () => {
  it("returns full statistics and evidence with analysis null", async () => {
    const res = await fetch(`${base}/api/analyze`, { method: "POST", body: csvForm() });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.analysis).toBeNull();
    expect(body.meta.aiIncluded).toBe(false);
    expect(body.stats.revenue.type).toBe("numeric");
    expect(body.stats.revenue.missing).toBe(1);
    expect(body.meta.schemaVersion).toBeTruthy();
    expect(body.meta.evidenceEngine).toBeTruthy();
    expect(Array.isArray(body.evidence)).toBe(true);
    // No key was supplied, so the provider must never have been called.
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("never turns a blank cell into a zero", async () => {
    const res = await fetch(`${base}/api/analyze`, { method: "POST", body: csvForm() });
    const { stats } = await res.json();
    expect(stats.revenue.validCount).toBe(4);
    expect(stats.revenue.min).toBe(100);
  });

  it("accepts a target column and reports it", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ target: "revenue" }),
    });
    expect((await res.json()).meta.target).toBe("revenue");
  });

  it("rejects a target that is not a column", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ target: "nonexistent" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unknown_target");
  });
});

describe("AI analysis with a mocked provider", () => {
  it("includes interpretation when a key is supplied", async () => {
    mockAnalysisResponse();
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "x-anthropic-key": FAKE_KEY },
      body: csvForm(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis).toMatchObject({ summary: "s", conclusion: "c" });
    expect(body.meta.aiIncluded).toBe(true);
    expect(createMessage).toHaveBeenCalledOnce();
  });

  it("passes the computed evidence into the prompt", async () => {
    mockAnalysisResponse();
    await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "x-anthropic-key": FAKE_KEY },
      body: csvForm({ target: "revenue" }),
    });
    const prompt = createMessage.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("DETERMINISTIC EVIDENCE");
    expect(prompt).toContain("REPRESENTATIVE ROWS");
    expect(prompt).toContain("selectedBecause");
  });

  it("rejects a malformed key before contacting the provider", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "x-anthropic-key": "not-a-key" },
      body: csvForm(),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_api_key_format");
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("rejects an unsupported model", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ model: "gpt-9" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unsupported_model");
  });
});

describe("persistence is opt-in", () => {
  it("does not save when the save flag is absent", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "x-ridge-session": "session-abcdefgh" },
      body: csvForm(),
    });
    const body = await res.json();
    expect(saveAnalysisMock).not.toHaveBeenCalled();
    expect(body.analysisId).toBeNull();
    expect(body.meta.saved).toBe(false);
  });

  it("does not save when the save flag is explicitly false", async () => {
    await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "x-ridge-session": "session-abcdefgh" },
      body: csvForm({ save: "false" }),
    });
    expect(saveAnalysisMock).not.toHaveBeenCalled();
  });

  it("saves only when the request explicitly opts in", async () => {
    saveAnalysisMock.mockResolvedValue("11111111-2222-3333-4444-555555555555");
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "x-ridge-session": "session-abcdefgh" },
      body: csvForm({ save: "true" }),
    });
    const body = await res.json();
    expect(saveAnalysisMock).toHaveBeenCalledOnce();
    expect(body.analysisId).toBe("11111111-2222-3333-4444-555555555555");
    expect(body.meta.saved).toBe(true);
  });

  it("never includes the API key in the saved payload", async () => {
    saveAnalysisMock.mockResolvedValue("11111111-2222-3333-4444-555555555555");
    mockAnalysisResponse();
    await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "x-ridge-session": "session-abcdefgh", "x-anthropic-key": FAKE_KEY },
      body: csvForm({ save: "true" }),
    });
    const saved = JSON.stringify(saveAnalysisMock.mock.calls[0][0]);
    expect(saved).not.toContain(FAKE_KEY);
    expect(saved).not.toContain("sk-ant-");
  });
});

describe("follow-up questions", () => {
  it("requires an API key", async () => {
    const res = await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "why?", context: { columns: ["a"] } }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("missing_api_key");
  });

  it("requires a question", async () => {
    const res = await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anthropic-key": FAKE_KEY },
      body: JSON.stringify({ context: { columns: ["a"] } }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("missing_question");
  });

  it("requires usable dataset context", async () => {
    const res = await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anthropic-key": FAKE_KEY },
      body: JSON.stringify({ question: "why?", context: {} }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_context");
  });

  it("answers with a mocked provider", async () => {
    createMessage.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Because revenue rose." }],
    });
    const res = await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anthropic-key": FAKE_KEY },
      body: JSON.stringify({ question: "why?", context: { columns: ["revenue"] } }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).answer).toBe("Because revenue rose.");
  });
});

describe("POST /api/explain", () => {
  it("requires an API key", async () => {
    const res = await fetch(`${base}/api/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { columns: ["a"] } }),
    });
    expect(res.status).toBe(401);
  });

  it("adds interpretation to already-computed results", async () => {
    mockAnalysisResponse();
    const res = await fetch(`${base}/api/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-anthropic-key": FAKE_KEY },
      body: JSON.stringify({
        context: {
          columns: ["revenue"],
          stats: { revenue: { type: "numeric", mean: 5 } },
          evidence: [{ claim: "x", metric: "m", sampleSize: 4, coverage: 80 }],
        },
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).analysis).toMatchObject({ summary: "s" });
  });
});

describe("URL ingestion safety", () => {
  it("rejects non-https schemes", async () => {
    const res = await fetch(`${base}/api/analyze-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "file:///etc/passwd" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await res.text()).not.toContain("passwd");
  });

  it("rejects private network addresses", async () => {
    for (const url of ["http://127.0.0.1/x.csv", "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/a.csv"]) {
      const res = await fetch(`${base}/api/analyze-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      expect(res.status, url).toBeGreaterThanOrEqual(400);
    }
  });
});

describe("safe errors", () => {
  it("returns a stable { error, code } shape and never a stack trace", async () => {
    const res = await fetch(`${base}/api/analyze`, { method: "POST", body: new FormData() });
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["code", "error"]);
    expect(JSON.stringify(body)).not.toMatch(/at .*\.js:\d+/);
  });

  it("rejects malformed JSON without leaking the parser error", async () => {
    const res = await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_json");
  });

  it("404s unknown API routes as JSON", async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
  });

  it("never echoes the API key back in an error response", async () => {
    // Provider rejects the key; the message must describe the failure without
    // reproducing the credential.
    const { AuthenticationError } = (await import("@anthropic-ai/sdk")).default;
    createMessage.mockRejectedValue(new AuthenticationError("bad key"));
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "x-anthropic-key": FAKE_KEY },
      body: csvForm(),
    });
    const text = await res.text();
    expect(res.status).toBe(401);
    expect(text).not.toContain(FAKE_KEY);
    expect(text).not.toContain("sk-ant-");
  });
});

describe("routing", () => {
  it("serves the application at the root", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("dropzone");
  });

  it("redirects /app to / preserving the query string", async () => {
    const res = await fetch(`${base}/app?a=abc123`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?a=abc123");
  });

  it("serves the about, privacy and docs pages", async () => {
    for (const path of ["/about", "/privacy", "/docs"]) {
      const res = await fetch(`${base}${path}`);
      expect(res.status, path).toBe(200);
    }
  });

  it("serves the sample dataset", async () => {
    const res = await fetch(`${base}/samples/team-sales.csv`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("region");
  });

  it("sets security headers on every response", async () => {
    const res = await fetch(`${base}/`);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
