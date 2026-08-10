// Retention is enforced when rows are read, not by a scheduled sweep, because
// a serverless deployment has nowhere to put a cron. These tests pin that: the
// window has to bound what comes back out of the query, and an unset window has
// to leave every existing deployment exactly as it was.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { config } = await import("../src/config.js");

// A Supabase query builder is a chain that resolves at the end. This records
// every link so a test can assert which filters were applied, and to what.
function stubClient(rows = []) {
  const calls = [];
  const builder = {
    calls,
    from(table) { calls.push(["from", table]); return builder; },
    select(cols) { calls.push(["select", cols]); return builder; },
    eq(col, val) { calls.push(["eq", col, val]); return builder; },
    gte(col, val) { calls.push(["gte", col, val]); return builder; },
    lt(col, val) { calls.push(["lt", col, val]); return builder; },
    delete() { calls.push(["delete"]); return builder; },
    insert(row) { calls.push(["insert", row]); return builder; },
    order(col, opts) { calls.push(["order", col, opts]); return builder; },
    limit(n) { calls.push(["limit", n]); return Promise.resolve({ data: rows, error: null }); },
    maybeSingle() { calls.push(["maybeSingle"]); return Promise.resolve({ data: rows[0] ?? null, error: null }); },
    single() { calls.push(["single"]); return Promise.resolve({ data: { id: "new-id" }, error: null }); },
  };
  return builder;
}

// The service memoizes its client, so the mock hands back a proxy that reads
// whichever stub the current test installed rather than the first one created.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => new Proxy({}, { get: (_target, prop) => globalThis.__stub[prop] }),
}));

const history = await import("../src/services/history.js");

const originalRetention = config.retentionDays;
const originalUrl = config.supabaseUrl;
const originalKey = config.supabaseKey;

beforeEach(() => {
  config.retentionDays = originalRetention;
  config.supabaseUrl = "https://example.supabase.co";
  config.supabaseKey = "service-key";
  globalThis.__stub = stubClient();
});

describe("retentionCutoff", () => {
  it("is null when no window is configured, so existing rows keep their meaning", () => {
    config.retentionDays = null;
    expect(history.retentionCutoff()).toBeNull();
  });

  it("is the instant exactly one window back", () => {
    config.retentionDays = 30;
    const now = Date.parse("2026-03-31T12:00:00.000Z");
    expect(history.retentionCutoff(now)).toBe("2026-03-01T12:00:00.000Z");
  });

  it("treats zero and nonsense as no expiry rather than as instant expiry", () => {
    // A misread env var must never delete everything the moment it is read.
    for (const value of [0, -5, Number.NaN, null, undefined]) {
      config.retentionDays = value;
      expect(history.retentionCutoff(), `retentionDays=${String(value)}`).toBeNull();
    }
  });

  it("moves forward with the clock", () => {
    config.retentionDays = 7;
    const early = history.retentionCutoff(Date.parse("2026-03-01T00:00:00.000Z"));
    const later = history.retentionCutoff(Date.parse("2026-03-02T00:00:00.000Z"));
    expect(Date.parse(later)).toBeGreaterThan(Date.parse(early));
  });
});

describe("reads are bounded by the window", () => {
  it("filters the listing in the query", async () => {
    config.retentionDays = 14;
    await history.listAnalyses("session-abc");
    const gte = globalThis.__stub.calls.find(([fn]) => fn === "gte");
    expect(gte, "no created_at lower bound was applied").toBeTruthy();
    expect(gte[1]).toBe("created_at");
    expect(Date.parse(gte[2])).toBeLessThan(Date.now());
  });

  it("applies no bound at all when retention is unset", async () => {
    config.retentionDays = null;
    await history.listAnalyses("session-abc");
    expect(globalThis.__stub.calls.some(([fn]) => fn === "gte")).toBe(false);
  });

  it("hides an expired analysis behind the same 404 as one that never existed", async () => {
    config.retentionDays = 1;
    globalThis.__stub = stubClient([]);   // the bounded query returns nothing
    await expect(history.getAnalysis("11111111-2222-3333-4444-555555555555"))
      .rejects.toMatchObject({ status: 404, code: "not_found" });
    // The bound was in the query, so nothing about the row reached this code.
    expect(globalThis.__stub.calls.some(([fn, col]) => fn === "gte" && col === "created_at")).toBe(true);
  });

  it("still serves an analysis inside the window", async () => {
    config.retentionDays = 30;
    const row = { id: "11111111-2222-3333-4444-555555555555", created_at: new Date().toISOString(), payload: { ok: true } };
    globalThis.__stub = stubClient([row]);
    await expect(history.getAnalysis(row.id)).resolves.toMatchObject({ id: row.id });
  });
});

describe("saving sweeps what has expired", () => {
  it("deletes this session's expired rows after a save", async () => {
    config.retentionDays = 10;
    await history.saveAnalysis({ sessionId: "session-abc", kind: "analysis", filename: "f.csv", payload: {} });
    const { calls } = globalThis.__stub;
    expect(calls.some(([fn]) => fn === "delete")).toBe(true);
    const lt = calls.find(([fn]) => fn === "lt");
    expect(lt?.[1]).toBe("created_at");
  });

  it("sweeps nothing when retention is unset", async () => {
    config.retentionDays = null;
    await history.saveAnalysis({ sessionId: "session-abc", kind: "analysis", filename: "f.csv", payload: {} });
    expect(globalThis.__stub.calls.some(([fn]) => fn === "delete")).toBe(false);
  });
});
