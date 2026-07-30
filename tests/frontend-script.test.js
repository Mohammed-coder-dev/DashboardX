// public/app.js is loaded by the browser as a CLASSIC script
// (<script src="app.js">), not as a module. package.json sets
// "type": "module", so `node --check` parses it as ESM and happily accepts
// module-only syntax that breaks the entire file in the browser — an `export`
// slipped through exactly that way once. These tests parse the shipped file the
// way a browser will.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

describe("public/app.js", () => {
  it("parses as a classic script", () => {
    // vm.Script uses script (non-module) goal, matching <script src=...>.
    expect(() => new vm.Script(SOURCE, { filename: "app.js" })).not.toThrow();
  });

  it("contains no module-only syntax", () => {
    expect(SOURCE).not.toMatch(/^\s*export\s/m);
    expect(SOURCE).not.toMatch(/^\s*import\s+[\w{*]/m);
    expect(SOURCE).not.toMatch(/\bimport\.meta\b/);
  });

  it("registers the storage migration before anything reads a key", () => {
    const migrationAt = SOURCE.indexOf("function migrateLegacyStorage");
    const firstRead = SOURCE.indexOf("sessionStorage.getItem(KEY_STORAGE)");
    expect(migrationAt).toBeGreaterThan(-1);
    expect(firstRead).toBeGreaterThan(migrationAt);
    // And it actually runs at load, not just defined.
    expect(SOURCE).toMatch(/^migrateLegacyStorage\(\);$/m);
  });
});
