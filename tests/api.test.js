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

  it("returns a stable request ID for operational correlation", async () => {
    const requestId = "ridge-test-request-123";
    const res = await fetch(`${base}/api/health`, { headers: { "x-request-id": requestId } });
    expect(res.headers.get("x-request-id")).toBe(requestId);
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
    expect(body.meta.requestId).toBe(res.headers.get("x-request-id"));
    expect(Number.isFinite(body.meta.processingMs)).toBe(true);
    expect(Number.isFinite(Date.parse(body.meta.generatedAt))).toBe(true);
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

  it("computes over only the selected columns", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ columns: JSON.stringify(["region", "revenue"]) }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Object.keys(body.stats).sort()).toEqual(["region", "revenue"]);
    // Rows are never filtered — excluding a column drops a measurement, not an
    // observation, so the surviving column keeps its full record.
    expect(body.stats.revenue.validCount).toBe(4);
    expect(body.meta.totalRows).toBe(5);
  });

  it("discloses the exclusion rather than absorbing it", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ columns: JSON.stringify(["region", "revenue"]) }),
    });
    const body = await res.json();
    expect(body.meta.activeColumns).toEqual(["region", "revenue"]);
    expect(body.meta.excludedColumns).toEqual(["spend"]);
    // The full column list still travels, so the picker can offer what was dropped.
    expect(body.columns).toEqual(["region", "revenue", "spend"]);
  });

  it("reports no exclusions when every column is kept", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ columns: JSON.stringify(["region", "revenue", "spend"]) }),
    });
    expect((await res.json()).meta.excludedColumns).toEqual([]);
  });

  it("rejects selecting a column the file does not have", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ columns: JSON.stringify(["revenue", "profit"]) }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unknown_column");
  });
});

describe("structural inference over the API", () => {
  // A title line, the real header on line 3, and a trailing total: the shape
  // that made the engine report a mean it could not defend.
  const MESSY = "Q3 Report\n\nregion,revenue\nnorth,200\nsouth,100\nTOTAL,300\n";

  it("reports the header it found and the rows it set aside", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({}, { body: MESSY }),
    });
    const body = await res.json();
    expect(body.meta.structure.headerRow).toBe(3);
    expect(body.meta.structure.excluded).toEqual([
      expect.objectContaining({ row: 1, reason: "preamble" }),
      expect.objectContaining({ row: 6, reason: "aggregate" }),
    ]);
    expect(body.meta.totalRows).toBe(2);
    expect(body.columns).toEqual(["region", "revenue"]);
  });

  it("computes the statistics over the observations only", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({}, { body: MESSY }),
    });
    const body = await res.json();
    expect(body.stats.revenue.mean).toBe(150);
    expect(body.stats.revenue.max).toBe(200);
  });

  it("carries the structure into the saved payload", async () => {
    saveAnalysisMock.mockResolvedValue("saved-id");
    await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "x-ridge-session": "session-abcdefgh" },
      body: csvForm({ save: "true" }, { body: MESSY }),
    });
    const { payload } = saveAnalysisMock.mock.calls[0][0];
    expect(payload.meta.structure.excluded).toHaveLength(2);
    expect(payload.meta.structure.headerRow).toBe(3);
  });

  it("says nothing was set aside for an ordinary file", async () => {
    const res = await fetch(`${base}/api/analyze`, { method: "POST", body: csvForm() });
    const structure = (await res.json()).meta.structure;
    expect(structure.confidence).toBe("none");
    expect(structure.excluded).toEqual([]);
  });

  it("honours a caller-specified header row", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ headerRow: "3" }, { body: MESSY }),
    });
    const body = await res.json();
    expect(body.meta.structure.headerRow).toBe(3);
    expect(body.meta.structure.headerSource).toBe("specified");
    expect(body.columns).toEqual(["region", "revenue"]);
  });

  it("puts back a row the caller asks to include, and still shows it", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ includeRows: JSON.stringify([6]) }, { body: MESSY }),
    });
    const body = await res.json();
    expect(body.meta.structure.excluded).toEqual([
      expect.objectContaining({ row: 1, reason: "preamble" }),
    ]);
    expect(body.meta.structure.restored).toEqual([
      expect.objectContaining({ row: 6, reason: "aggregate" }),
    ]);
    expect(body.meta.totalRows).toBe(3);
  });

  it("says so when a requested row could not be put back", async () => {
    // Row 4 is ordinary data — it was never excluded, so there is nothing to
    // restore. Answering that with silence would leave the caller unable to
    // tell whether their correction took.
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ includeRows: JSON.stringify([4]) }, { body: MESSY }),
    });
    const body = await res.json();
    expect(body.meta.structure.unapplied).toEqual([{ row: 4, reason: "not an excluded row" }]);
    expect(body.meta.structure.confidence).toBe("uncertain");
  });

  it("rejects a header row that is not a positive integer", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ headerRow: "nope" }, { body: MESSY }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_header_row");
  });

  it("rejects an includeRows value that is not a JSON array of row numbers", async () => {
    const res = await fetch(`${base}/api/analyze`, {
      method: "POST", body: csvForm({ includeRows: "6" }, { body: MESSY }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_include_rows");
  });
});

describe("POST /api/compare", () => {
  it("compares exactly two tabular files without invoking the model", async () => {
    const form = new FormData();
    form.append("files", new File(["region,revenue\nNorth,100\nSouth,120\nNorth,110\n"], "baseline.csv", { type: "text/csv" }));
    form.append("files", new File(["region,revenue,channel\nWest,200,direct\nWest,220,direct\nSouth,210,partner\n"], "current.csv", { type: "text/csv" }));
    const res = await fetch(`${base}/api/compare`, { method: "POST", body: form });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.kind).toBe("comparison");
    expect(body.comparison.deterministic).toBe(true);
    expect(body.comparison.schema.added).toEqual(["channel"]);
    expect(body.comparison.columns.find((column) => column.column === "revenue").deltas.mean).toBe(100);
    expect(body.comparison.columns.find((column) => column.column === "revenue").inference.meanDifference.significant).toBe(true);
    expect(body.meta.comparisonVersion).toBeTruthy();
    expect(body.meta.aiIncluded).toBe(false);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("rejects requests that do not contain exactly two files", async () => {
    const res = await fetch(`${base}/api/compare`, { method: "POST", body: csvForm({}, { field: "files" }) });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("comparison_requires_two_files");
  });

  it("persists comparisons only after explicit opt-in", async () => {
    saveAnalysisMock.mockResolvedValue("comparison-id");
    const form = new FormData();
    form.append("files", new File([CSV], "baseline.csv", { type: "text/csv" }));
    form.append("files", new File([CSV], "current.csv", { type: "text/csv" }));
    form.append("save", "true");
    const res = await fetch(`${base}/api/compare`, { method: "POST", headers: { "x-ridge-session": "a".repeat(32) }, body: form });
    const body = await res.json();

    expect(body.analysisId).toBe("comparison-id");
    expect(saveAnalysisMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "comparison" }));
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
    expect(Object.keys(body).sort()).toEqual(["code", "error", "requestId"]);
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
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
  it("serves the landing page at the root", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("answers you can defend");
    // The workspace must not be inlined into the landing page.
    expect(html).not.toContain("dropzone");
  });

  it("serves the application at /app", async () => {
    const res = await fetch(`${base}/app`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("dropzone");
  });

  it("forwards a shared root link to the workspace, query intact", async () => {
    // Share links minted before the landing/app split were `/?a=<id>`.
    const res = await fetch(`${base}/?a=abc123`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app?a=abc123");
  });

  it("leaves the landing page alone when there is no analysis id", async () => {
    const res = await fetch(`${base}/`, { redirect: "manual" });
    expect(res.status).toBe(200);
  });

  it("redirects /about to the landing page it became", async () => {
    const res = await fetch(`${base}/about`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/");
  });

  it("serves the privacy and docs pages", async () => {
    for (const path of ["/privacy", "/docs"]) {
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

  it("permits fonts from this origin only", async () => {
    const csp = (await fetch(`${base}/`)).headers.get("content-security-policy");
    expect(csp).toContain("font-src 'self'");
    // The type faces are bundled, so neither Google host may appear anywhere in
    // the policy — a stylesheet cannot reintroduce the dependency by asking.
    expect(csp).not.toContain("fonts.gstatic.com");
    expect(csp).not.toContain("fonts.googleapis.com");
  });

  it("serves the bundled type faces with their licence", async () => {
    const font = await fetch(`${base}/fonts/dm-sans-latin.woff2`);
    expect(font.status).toBe(200);
    expect(font.headers.get("content-type")).toContain("font/woff2");

    const licence = await fetch(`${base}/fonts/OFL.txt`);
    expect(licence.status).toBe(200);
    expect(await licence.text()).toContain("SIL OPEN FONT LICENSE");
  });

  it("no stylesheet reaches for a remote font", async () => {
    for (const route of ["/", "/app", "/docs", "/privacy", "/styles.css"]) {
      const body = await (await fetch(`${base}${route}`)).text();
      // Only the explanatory comment may name the host; no url() or @import may.
      expect(body, route).not.toMatch(/@import\s+url\(\s*['"]?https:\/\/fonts\.googleapis/);
      expect(body, route).not.toMatch(/url\(\s*['"]?https:\/\/fonts\.gstatic/);
    }
  });
});
