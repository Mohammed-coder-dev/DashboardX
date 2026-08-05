// Payload-schema migration for structural inference.
//
// Analyses saved before this engine existed carry no `meta.structure`. The
// decision recorded here is that they stay readable and say *nothing* about
// structure — because absent is unknown, not "nothing was excluded". Those
// analyses were computed by an engine that never asked the question, and some
// of their numbers include the aggregate rows this feature exists to remove.
// Rendering them with a reassuring "0 rows excluded" would be a new lie in
// place of the old one.
//
// What makes them legible instead is the version stamp: the analysis record
// panel prints the evidence engine and schema version, so a pre-inference
// result identifies itself as one.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ANALYSIS_SCHEMA_VERSION, EVIDENCE_ENGINE_VERSION } from "../src/analytics/evidence.js";

const APP_SOURCE = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

/**
 * The guard inside `renderStructureNote`, re-declared here against the same
 * contract. `public/app.js` touches the DOM on import and cannot be loaded
 * under vitest, so a test below asserts the shipped source still matches this
 * rather than letting the copy drift.
 *
 * The whole guard is the presence of a structure. A clean read is shown too —
 * hiding it made a checked file and an unchecked one look identical — so the
 * only thing this decides is the pre-inference case.
 */
function worthShowing(structure) {
  return Boolean(structure);
}

describe("an analysis saved before structural inference", () => {
  it("shows no structure note at all", () => {
    expect(worthShowing(undefined)).toBe(false);
    expect(worthShowing(null)).toBe(false);
  });

  it("is distinguishable by the versions it was stamped with", () => {
    // Bumped whenever what an observation *is* changes: first when rows began
    // being excluded from every statistic, then when values written in a
    // spreadsheet's own notation began counting as numbers at all.
    expect(EVIDENCE_ENGINE_VERSION).toBe("1.3.0");
    expect(ANALYSIS_SCHEMA_VERSION).toBe("2.8");
  });
});

describe("a structure the current engine produced", () => {
  it("confirms a clean read rather than saying nothing at all", () => {
    // Previously hidden. A file Ridge checked and found ordinary looked exactly
    // like a file Ridge never checked, which withheld the one fact the reader
    // needed: that the question was asked.
    expect(worthShowing({ confidence: "none", headerRow: 1, headerSource: "detected", excluded: [], restored: [] })).toBe(true);
  });

  it("speaks up as soon as a row was set aside", () => {
    expect(worthShowing({ confidence: "confident", excluded: [{ row: 6, reason: "aggregate" }], restored: [] })).toBe(true);
  });

  it("speaks up when the reading was not settled", () => {
    expect(worthShowing({ confidence: "uncertain", excluded: [], restored: [] })).toBe(true);
  });

  it("speaks up when the caller chose the header, so the choice stays visible", () => {
    expect(worthShowing({ confidence: "confident", headerSource: "specified", excluded: [], restored: [] })).toBe(true);
  });

  it("speaks up when a row was put back, so the override is not invisible", () => {
    expect(worthShowing({ confidence: "confident", excluded: [], restored: [{ row: 9, reason: "aggregate" }] })).toBe(true);
  });
});

describe("the shipped frontend", () => {
  it("guards the structure note on the same condition as this test", () => {
    expect(APP_SOURCE).toContain("const worthShowing = Boolean(structure)");
    expect(APP_SOURCE).toContain("structureNote.hidden = !worthShowing;");
  });

  it("does not repeat the tier's provenance badge on the structure note", () => {
    // Provenance is stated once per tier. The structure note sits inside tier ①,
    // which already says "Computed"; badging the note as well is the duplication
    // that rule exists to prevent.
    const APP_HTML = readFileSync(new URL("../public/app.html", import.meta.url), "utf8");
    const note = APP_HTML.match(/<details id="structureNote"[\s\S]*?<\/details>/)?.[0] ?? "";
    expect(note).not.toContain("prov--");
  });

  it("distinguishes a clean read from an unsettled one in the markup", () => {
    expect(APP_SOURCE).toContain('structureNote.classList.toggle("structure-note--clean", clean)');
    expect(APP_SOURCE).toContain('structureNote.classList.toggle("structure-note--uncertain", uncertain)');
  });

  it("omits the printable report's structure section when there is none", () => {
    expect(APP_SOURCE).toContain("${structure ? `<h2>How this file was read");
  });
});
