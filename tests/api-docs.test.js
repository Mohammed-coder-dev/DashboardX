// The API reference opens by promising that every failure returns a stable
// `code`, and callers are told to match on it. Nothing checked that the
// reference actually listed them: 39 of the 54 codes the server can emit
// appeared nowhere in it, so a caller writing error handling from the document
// had no way to learn about most of the failures they would meet.
//
// This is the drift check, not a one-time cleanup. A new code added to src
// without a row in the table fails here, next to the promise it breaks.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (entry.name.endsWith(".js")) found.push(full);
  }
  return found;
}

const SOURCES = sourceFiles(path.join(root, "src"))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const REFERENCE = readFileSync(path.join(root, "docs", "API.md"), "utf8");

/** Every `code: "..."` the server can put in an error response. */
function emittedCodes() {
  return new Set([...SOURCES.matchAll(/code:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
}

/** Every code with its own row in one of the reference's tables. */
function documentedCodes() {
  return new Set([...REFERENCE.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|\s*(\d{3})\s*\|/gm)].map((m) => m[1]));
}

describe("docs/API.md against the code that has to match it", () => {
  it("documents every error code the server can emit", () => {
    const emitted = emittedCodes();
    // Non-vacuous: if this ever reads zero, the extraction broke rather than
    // the source becoming error-free.
    expect(emitted.size).toBeGreaterThan(40);

    const documented = documentedCodes();
    const missing = [...emitted].filter((code) => !documented.has(code)).sort();
    expect(missing, `undocumented error codes: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not document codes the server cannot emit", () => {
    // The other direction of the same drift: a code removed from the source
    // leaves a row promising a failure that can no longer happen.
    const emitted = emittedCodes();
    const stale = [...documentedCodes()].filter((code) => !emitted.has(code)).sort();
    expect(stale, `documented but unreachable: ${stale.join(", ")}`).toEqual([]);
  });

  it("gives each code the status the source actually uses", () => {
    const rows = [...REFERENCE.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|\s*(\d{3})\s*\|/gm)];
    expect(rows.length).toBeGreaterThan(40);

    const mismatched = [];
    for (const [, code, documentedStatus] of rows) {
      // Both orderings appear in the source's AppError options.
      const pattern = new RegExp(
        `status:\\s*(\\d{3}),\\s*code:\\s*"${code}"|code:\\s*"${code}",\\s*status:\\s*(\\d{3})`,
      );
      const found = SOURCES.match(pattern);
      if (!found) continue;                       // declared elsewhere, e.g. a lookup table
      const actual = found[1] ?? found[2];
      if (actual !== documentedStatus) mismatched.push(`${code}: documented ${documentedStatus}, emits ${actual}`);
    }
    expect(mismatched).toEqual([]);
  });
});
