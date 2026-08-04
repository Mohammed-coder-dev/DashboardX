// The product's core claim is that numbers are computed, never generated. That
// claim is only legible if provenance is a closed vocabulary rendered the same
// way everywhere. `ai-badge` used to carry four different meanings in one file
// — including "deterministic", the opposite of what its name implied — which is
// how a trust signal decays into decoration. These tests keep the vocabulary
// closed.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const HTML = readFileSync(new URL("../public/app.html", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const APP_JS = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

const STAMPS = ["computed", "derived", "written"];
// The legend names all three by definition, so stamp counts are taken from the
// document without it.
const LEGEND = /<p class="prov-legend">[\s\S]*?<\/p>/;
const BODY = HTML.replace(LEGEND, "");

describe("provenance vocabulary", () => {
  it("has retired the overloaded ai-badge class", () => {
    for (const source of [HTML, CSS, APP_JS]) {
      expect(source).not.toMatch(/\bai-badge\b/);
    }
  });

  it("gives every stamp exactly one of the three modifiers", () => {
    const stamps = [...HTML.matchAll(/class="prov\s+([^"]*)"/g)].map((match) => match[1]);
    expect(stamps.length).toBeGreaterThan(0);
    for (const modifiers of stamps) {
      const found = STAMPS.filter((stamp) => modifiers.includes(`prov--${stamp}`));
      expect(found, `"prov ${modifiers}" must carry exactly one modifier`).toHaveLength(1);
    }
  });

  it("defines all three modifiers and nothing beyond them", () => {
    const defined = [...CSS.matchAll(/\.prov--(\w+)\s*\{/g)].map((match) => match[1]);
    expect(defined.sort()).toEqual([...STAMPS].sort());
  });

  it("labels every word the model wrote as Written, and only those", () => {
    // Tier ④ is the only place model prose appears, so it is the only Written
    // stamp. A second one would mean prose leaked into a computed band.
    expect(BODY.match(/prov--written/g)).toHaveLength(1);
    const interpretationAt = BODY.indexOf('id="tierInterpretationTitle"');
    const writtenAt = BODY.indexOf("prov--written");
    expect(interpretationAt).toBeGreaterThan(-1);
    expect(writtenAt).toBeGreaterThan(interpretationAt);
  });

  it("states the rule once, in a legend", () => {
    const legend = HTML.match(LEGEND);
    expect(legend).not.toBeNull();
    for (const stamp of STAMPS) {
      expect(legend[0]).toContain(`prov--${stamp}`);
    }
  });

  it("keeps the printed report speaking the same three words", () => {
    // The report is the artifact most likely to reach someone who never saw
    // the app, so the vocabulary has to survive the export.
    for (const word of ["Computed", "Derived", "Written"]) {
      expect(APP_JS).toContain(`<span class="badge">${word}</span>`);
    }
    expect(APP_JS).not.toMatch(/<span class="badge">deterministic<\/span>/);
  });

  it("renders claim strength through one shared scale", () => {
    expect(APP_JS).toMatch(/function strengthScale\(/);
    // Evidence and correlations both go through it; neither hand-rolls a pill.
    expect(APP_JS.match(/strengthScale\(/g).length).toBeGreaterThanOrEqual(3);
    expect(CSS).not.toMatch(/\.evidence-strength\b/);
  });
});
