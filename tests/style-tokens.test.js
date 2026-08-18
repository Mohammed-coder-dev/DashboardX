// "CSS variables only — nothing hardcoded outside :root" is a house rule, and
// this stylesheet has 53 colour literals that break it. That figure has been
// carried as prose in CLAUDE.md since 2026-08-14, and prose does not notice
// when a number moves: the same debt was recorded as an undated 62 in the
// machine-global rules before it was measured here.
//
// This does not fix the 53. Converting shadows and translucent surfaces to
// tokens is a visual change that wants eyes on the result, and nothing in this
// suite renders pixels. What it does is stop the number growing while that
// waits: the count is measured the way CLAUDE.md describes it, and the ceiling
// is a ratchet. Lower it when literals are removed; never raise it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

/**
 * Colour literals that sit outside a `:root` (or `[data-theme]`) block.
 *
 * Brace-depth tracking rather than a regex over the whole file, so a literal
 * inside a token definition is correctly not counted and one inside a media
 * query is.
 */
export function literalsOutsideRoot(css = CSS) {
  const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;
  const found = [];
  let depth = 0;
  let inRoot = false;
  let rootDepth = 0;

  css.split("\n").forEach((line, index) => {
    const startsRoot = /\{/.test(line) && /:root|\[data-theme/.test(line);
    if (!inRoot) {
      for (const match of line.matchAll(COLOUR)) {
        found.push({ line: index + 1, literal: match[0], text: line.trim().slice(0, 80) });
      }
    }
    for (const character of line) {
      if (character === "{") {
        depth++;
        if (startsRoot && !inRoot) { inRoot = true; rootDepth = depth; }
      } else if (character === "}") {
        if (inRoot && depth === rootDepth) inRoot = false;
        depth--;
      }
    }
  });
  return found;
}

/** Lower this as literals are tokenised. Never raise it. */
const CEILING = 53;

describe("colour literals outside :root", () => {
  it("does not grow past the recorded debt", () => {
    const found = literalsOutsideRoot();
    expect(
      found.length,
      `${found.length} literals (ceiling ${CEILING}). Newest sites:\n` +
        found.slice(-8).map((f) => `  line ${f.line}: ${f.text}`).join("\n"),
    ).toBeLessThanOrEqual(CEILING);
  });

  it("measures what CLAUDE.md says it measures", () => {
    // Non-vacuous in both directions: the counter must actually find the
    // literals that are there, and must not count the ones inside :root.
    const found = literalsOutsideRoot();
    expect(found.length).toBeGreaterThan(0);

    const insideRootOnly = ":root {\n  --a: #ffffff;\n  --b: rgba(1,2,3,.5);\n}\n";
    expect(literalsOutsideRoot(insideRootOnly)).toEqual([]);

    const outside = insideRootOnly + ".card { box-shadow: 0 1px 2px rgba(4,5,6,.1); }\n";
    expect(literalsOutsideRoot(outside)).toHaveLength(1);
  });

  it("keeps the figure in CLAUDE.md honest", () => {
    // The number lives in two places by necessity — one a document a person
    // reads, one a gate a machine runs. They must not disagree.
    const claudeMd = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");
    const stated = claudeMd.match(/(\d+) hardcoded color literals/);
    expect(stated, "CLAUDE.md no longer states a literal count").not.toBeNull();
    expect(Number(stated[1])).toBe(literalsOutsideRoot().length);
  });
});
