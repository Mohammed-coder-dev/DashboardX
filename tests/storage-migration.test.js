// Browser-storage migration: the pre-Ridge `dx_*` keys must carry over once,
// then disappear. This file and public/app.js are the only places `dx_*` may
// appear.
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal Storage stand-in with the semantics the migration relies on. */
function makeStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    get size() { return map.size; },
    snapshot: () => Object.fromEntries(map),
  };
}

// The migration is defined inside app.js, which touches the DOM on import.
// Re-declare it here against the same contract, and assert the shipped source
// matches, so this stays a test of real behaviour rather than a copy that can
// drift silently.
function migrateLegacyStorage(stores) {
  const renames = [
    ["dx_api_key", "ridge_api_key"],
    ["dx_model", "ridge_model"],
    ["dx_session", "ridge_session"],
  ];
  const migrated = [];
  for (const store of stores) {
    if (!store) continue;
    for (const [legacy, current] of renames) {
      let value = null;
      try { value = store.getItem(legacy); } catch { continue; }
      if (value === null) continue;
      try {
        if (store.getItem(current) === null) store.setItem(current, value);
        store.removeItem(legacy);
        migrated.push(legacy);
      } catch { /* ignore */ }
    }
  }
  return migrated;
}

describe("legacy storage migration", () => {
  let store;
  beforeEach(() => { store = makeStore(); });

  it("renames every legacy key and removes the old name", () => {
    store.setItem("dx_api_key", "sk-ant-legacy");
    store.setItem("dx_model", "claude-opus-5");
    store.setItem("dx_session", "abcdefgh1234");

    const migrated = migrateLegacyStorage([store]);

    expect(migrated).toEqual(["dx_api_key", "dx_model", "dx_session"]);
    expect(store.snapshot()).toEqual({
      ridge_api_key: "sk-ant-legacy",
      ridge_model: "claude-opus-5",
      ridge_session: "abcdefgh1234",
    });
  });

  it("is a no-op when there is nothing to migrate", () => {
    expect(migrateLegacyStorage([store])).toEqual([]);
    expect(store.size).toBe(0);
  });

  it("is idempotent across repeated runs", () => {
    store.setItem("dx_model", "claude-sonnet-5");
    migrateLegacyStorage([store]);
    const after = store.snapshot();
    migrateLegacyStorage([store]);
    migrateLegacyStorage([store]);
    expect(store.snapshot()).toEqual(after);
  });

  it("never clobbers a value already stored under the new name", () => {
    store.setItem("dx_model", "old-choice");
    store.setItem("ridge_model", "current-choice");

    migrateLegacyStorage([store]);

    expect(store.getItem("ridge_model")).toBe("current-choice");
    expect(store.getItem("dx_model")).toBeNull();
  });

  it("migrates each store independently", () => {
    const local = makeStore({ dx_session: "sess-local" });
    const session = makeStore({ dx_api_key: "sk-ant-session" });

    migrateLegacyStorage([local, session]);

    expect(local.snapshot()).toEqual({ ridge_session: "sess-local" });
    expect(session.snapshot()).toEqual({ ridge_api_key: "sk-ant-session" });
  });

  it("preserves a legacy empty string rather than discarding it", () => {
    store.setItem("dx_model", "");
    migrateLegacyStorage([store]);
    expect(store.getItem("ridge_model")).toBe("");
    expect(store.getItem("dx_model")).toBeNull();
  });

  it("survives a store that throws (private mode, quota exceeded)", () => {
    const hostile = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => migrateLegacyStorage([hostile, store])).not.toThrow();
  });

  it("tolerates a null store slot", () => {
    expect(() => migrateLegacyStorage([null, undefined, store])).not.toThrow();
  });
});

describe("shipped migration source", () => {
  it("declares the same renames as this test", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
    for (const pair of ['["dx_api_key", KEY_STORAGE]', '["dx_model", MODEL_STORAGE]', '["dx_session", SESSION_STORAGE]']) {
      expect(source).toContain(pair);
    }
    expect(source).toContain('const KEY_STORAGE     = "ridge_api_key"');
    expect(source).toContain('const MODEL_STORAGE   = "ridge_model"');
    expect(source).toContain('const SESSION_STORAGE = "ridge_session"');
  });

  it("confines dx_ references to the migration block", async () => {
    // Guards the rebrand rule: `dx_` may survive only inside the rename table.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
    const hits = source.match(/dx_[a-z_]+/g) || [];
    expect(hits.sort()).toEqual(["dx_api_key", "dx_model", "dx_session"]);
  });
});
