// Property-based tests over adversarially generated spreadsheets.
//
// The example-based suites elsewhere check that specific inputs produce
// specific numbers. These check that *no* input, however malformed, can make
// the deterministic engine violate what it promises: that a blank never becomes
// an observation, that a mean lies between its own min and max, that a
// coefficient is a coefficient, that a histogram accounts for every value, and
// that nothing in the pipeline throws.
//
// The generator is seeded and the seed is printed with any failure, so a
// failing case is reproducible rather than a story about a run nobody has.
// Hand-rolled rather than pulled from a library: it costs one small PRNG and
// leaves the dependency tree of a project that ships unchanged.
import { describe, it, expect } from "vitest";
import { parseSpreadsheet } from "../src/parsers/spreadsheet.js";
import { computeStats, profileField } from "../src/analytics/stats.js";
import { computeCorrelations } from "../src/analytics/correlations.js";
import { profileDataset } from "../src/analytics/profile.js";
import { buildEvidence } from "../src/analytics/evidence.js";
import { representativeSample } from "../src/analytics/sample.js";
import { isMissing, toFiniteNumber } from "../src/analytics/values.js";

/** mulberry32: tiny, seeded, and identical on every platform. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every cell shape that has caused trouble here, plus the ones that should be
// uneventful, so the mix is a bad export rather than pure noise.
const CELL_SHAPES = [
  () => "",
  () => "   ",
  () => "0",
  () => "-0",
  () => "NaN",
  () => "Infinity",
  () => "null",
  () => "N/A",
  () => "1e309",
  () => "1e-320",
  (r) => String(Math.floor(r() * 1000) - 500),
  (r) => (r() * 2e12 - 1e12).toFixed(2),
  (r) => (r() * 1e-6).toExponential(3),
  (r) => "$" + (Math.floor(r() * 900000) + 1000).toLocaleString("en-US"),
  (r) => (r() * 100).toFixed(1) + "%",
  (r) => "(" + (Math.floor(r() * 9000) + 100) + ")",
  (r) => "2024-" + String(Math.floor(r() * 12) + 1).padStart(2, "0") + "-" + String(Math.floor(r() * 28) + 1).padStart(2, "0"),
  (r) => (Math.floor(r() * 12) + 1) + "/" + (Math.floor(r() * 28) + 1) + "/2024",
  (r) => "2024-01-0" + (Math.floor(r() * 9) + 1) + " 00:" + String(Math.floor(r() * 59)).padStart(2, "0"),
  (r) => ["north", "south", "east", "west"][Math.floor(r() * 4)],
  (r) => ["true", "false"][Math.floor(r() * 2)],
  (r) => "text-" + Math.floor(r() * 1e6).toString(36),
  () => "Unicode check ,;\"",
  () => "x".repeat(300),
  () => "Total",
  () => "=1+1",
];

const HEADER_SHAPES = [
  (r, i) => "col" + i,
  (r, i) => ["region", "revenue", "spend", "when", "id"][i % 5],
  () => "",
  () => "dup",
  () => "Column D",
  () => "a,b",
  () => "  spaced  ",
];

function quote(cell) {
  const text = String(cell);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/** A CSV a real export could plausibly produce, only worse. */
function generateCsv(random) {
  const columns = 1 + Math.floor(random() * 6);
  const rows = Math.floor(random() * 40);
  const lines = [];

  if (random() < 0.25) lines.push(quote("Quarterly export"));
  if (random() < 0.15) lines.push("");

  const headers = Array.from({ length: columns }, (unused, i) =>
    HEADER_SHAPES[Math.floor(random() * HEADER_SHAPES.length)](random, i));
  lines.push(headers.map(quote).join(","));

  for (let row = 0; row < rows; row++) {
    if (random() < 0.08) { lines.push(""); continue; }
    // Ragged on purpose: real exports drop and add trailing fields.
    const width = random() < 0.12
      ? Math.max(1, columns + (random() < 0.5 ? -1 : 1))
      : columns;
    const cells = Array.from({ length: width }, () =>
      CELL_SHAPES[Math.floor(random() * CELL_SHAPES.length)](random));
    lines.push(cells.map(quote).join(","));
  }
  if (random() < 0.1) lines.push(["Total", "999"].map(quote).join(","));

  const body = lines.join(random() < 0.2 ? "\r\n" : "\n") + "\n";
  // A leading byte-order mark, the way Excel writes UTF-8 CSV.
  return random() < 0.15 ? "﻿" + body : body;
}

/** Run one generated case through everything the analyze route runs. */
function pipeline(csv) {
  const parsed = parseSpreadsheet(Buffer.from(csv, "utf8"), "generated.csv");
  const { rows, columns } = parsed;
  const stats = computeStats(rows, columns);
  const correlations = computeCorrelations(rows, columns, stats);
  const profile = profileDataset(rows, columns);
  const target = columns.find((c) => stats[c]?.type === "numeric") ?? null;
  const evidence = buildEvidence(rows, columns, stats, { target });
  const sample = representativeSample(rows, columns, stats);
  return { parsed, rows, columns, stats, correlations, profile, evidence, sample };
}

const CASES = 250;

/** Runs `check` over every generated case, reporting the seed that broke it. */
function forEachCase(check) {
  for (let seed = 1; seed <= CASES; seed++) {
    const csv = generateCsv(rng(seed));
    try {
      check(pipeline(csv), csv, seed);
    } catch (error) {
      error.message = "seed " + seed + "\n--- input ---\n" + csv.slice(0, 900)
        + "\n--- failure ---\n" + error.message;
      throw error;
    }
  }
}

describe("properties that hold for any spreadsheet", () => {
  it("never throws, whatever the file looks like", () => {
    forEachCase(() => {});
  });

  it("accounts for every cell exactly once", () => {
    // missing + invalid + valid is the whole column. A cell outside that sum is
    // one the report never mentions.
    forEachCase(({ rows, columns, stats }) => {
      for (const column of columns) {
        const field = stats[column];
        if (!field || field.type === "date" || field.type === "empty") continue;
        expect(field.missing + field.invalid + field.validCount).toBe(rows.length);
      }
    });
  });

  it("never turns a blank into an observation", () => {
    // The engine's oldest invariant: Number("") is 0, and toFiniteNumber is the
    // reason a blank cell cannot drag a mean toward zero.
    forEachCase(({ rows, columns, stats }) => {
      for (const column of columns) {
        if (stats[column]?.type !== "numeric") continue;
        const parsable = rows.filter((row) => toFiniteNumber(row?.[column]) !== null).length;
        const blank = rows.filter((row) => isMissing(row?.[column])).length;
        expect(stats[column].validCount).toBe(parsable);
        expect(stats[column].missing).toBe(blank);
      }
    });
  });

  it("keeps every summary statistic inside the data's own range", () => {
    forEachCase(({ columns, stats }) => {
      for (const column of columns) {
        const field = stats[column];
        if (field?.type !== "numeric" || !field.validCount) continue;
        expect(field.mean).toBeGreaterThanOrEqual(field.min);
        expect(field.mean).toBeLessThanOrEqual(field.max);
        expect(field.median).toBeGreaterThanOrEqual(field.min);
        expect(field.median).toBeLessThanOrEqual(field.max);
        expect(field.std).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it("orders the quantiles it reports", () => {
    forEachCase(({ columns, stats }) => {
      for (const column of columns) {
        const field = stats[column];
        if (field?.type !== "numeric" || !field.validCount) continue;
        const { p05, q1, q3, p95 } = field.quantiles;
        expect(q1).toBeGreaterThanOrEqual(p05);
        expect(field.median).toBeGreaterThanOrEqual(q1);
        expect(q3).toBeGreaterThanOrEqual(field.median);
        expect(p95).toBeGreaterThanOrEqual(q3);
      }
    });
  });

  it("puts every valid value in exactly one histogram bin", () => {
    forEachCase(({ columns, stats }) => {
      for (const column of columns) {
        const field = stats[column];
        if (field?.type !== "numeric" || !field.histogram) continue;
        const binned = field.histogram.bins.reduce((sum, bin) => sum + bin.count, 0);
        expect(binned).toBe(field.validCount);
      }
    });
  });

  it("only flags outliers that are actually outside the fences", () => {
    forEachCase(({ columns, stats }) => {
      for (const column of columns) {
        const outliers = stats[column]?.outliers;
        if (!outliers?.applied) continue;
        expect(outliers.count).toBeLessThanOrEqual(stats[column].validCount);
        expect(outliers.lowerFence).toBeLessThanOrEqual(outliers.upperFence);
        for (const flagged of outliers.rows ?? []) {
          const outside = flagged.value < outliers.lowerFence || flagged.value > outliers.upperFence;
          expect(outside).toBe(true);
          expect(flagged.side).toBe(flagged.value < outliers.lowerFence ? "below" : "above");
        }
      }
    });
  });

  it("reports coefficients that are coefficients", () => {
    forEachCase(({ rows, correlations }) => {
      for (const correlation of correlations) {
        expect(Number.isFinite(correlation.coefficient)).toBe(true);
        expect(Math.abs(correlation.coefficient)).toBeLessThanOrEqual(1);
        expect(correlation.n).toBeGreaterThan(0);
        expect(correlation.n).toBeLessThanOrEqual(rows.length);
        expect(correlation.coverage).toBeGreaterThanOrEqual(0);
        expect(correlation.coverage).toBeLessThanOrEqual(100);
        expect(correlation.columnA).not.toBe(correlation.columnB);
      }
    });
  });

  it("supports every piece of evidence with observations it actually has", () => {
    forEachCase(({ rows, evidence }) => {
      for (const item of evidence) {
        expect(item.sampleSize).toBeGreaterThan(0);
        expect(item.sampleSize).toBeLessThanOrEqual(rows.length);
        expect(item.coverage).toBeGreaterThanOrEqual(0);
        expect(item.coverage).toBeLessThanOrEqual(100);
        expect(item.claim).toBeTruthy();
        // Asserted on the value rather than on the claim text: a column can
        // legitimately be named "NaN" - a generated file produced exactly that
        // - so searching the sentence for it flags the column name, not a
        // number that failed to render.
        if (typeof item.value === "number") {
          expect(Number.isFinite(item.value)).toBe(true);
        }
        expect(item.value).not.toBeUndefined();
      }
    });
  });

  it("keeps provenance arithmetic consistent with the rows it read", () => {
    forEachCase(({ rows, evidence }) => {
      for (const { provenance } of evidence) {
        expect(provenance.inputRows).toBe(rows.length);
        expect(provenance.includedRows + provenance.excludedRows).toBe(rows.length);
        expect(provenance.sourceRows.length).toBeLessThanOrEqual(10);
        for (const source of provenance.sourceRows) {
          expect(source.rowNumber).toBeGreaterThanOrEqual(1);
          expect(source.rowNumber).toBeLessThanOrEqual(rows.length);
        }
      }
    });
  });

  it("reports quality percentages on the scale it claims", () => {
    forEachCase(({ rows, profile }) => {
      expect(profile.rows).toBe(rows.length);
      expect(profile.healthScore).toBeGreaterThanOrEqual(0);
      expect(profile.healthScore).toBeLessThanOrEqual(100);
      expect(profile.duplicateRows).toBeLessThanOrEqual(rows.length);
      for (const column of Object.values(profile.columns)) {
        expect(column.missingPct).toBeGreaterThanOrEqual(0);
        expect(column.missingPct).toBeLessThanOrEqual(100);
        expect(column.unique).toBeLessThanOrEqual(rows.length);
      }
    });
  });

  it("samples real rows and explains each one", () => {
    forEachCase(({ rows, sample }) => {
      expect(sample.rows.length).toBe(sample.selections.length);
      for (const selection of sample.selections) {
        expect(selection.index).toBeGreaterThanOrEqual(0);
        expect(selection.index).toBeLessThan(rows.length);
        expect(selection.reasons.length).toBeGreaterThan(0);
      }
      // Strictly ascending, so a row can never be sampled twice.
      const indexes = sample.selections.map((s) => s.index);
      expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
      expect(new Set(indexes).size).toBe(indexes.length);
    });
  });

  it("produces the same output twice for the same input", () => {
    // The whole product rests on this: run it again, get the same numbers.
    forEachCase((first, csv) => {
      const second = pipeline(csv);
      expect(second.stats).toEqual(first.stats);
      expect(second.correlations).toEqual(first.correlations);
      expect(second.profile).toEqual(first.profile);
      expect(second.evidence).toEqual(first.evidence);
    });
  });
});

describe("properties that hold for any column", () => {
  it("classifies and counts a column of arbitrary cells consistently", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const random = rng(seed * 7919);
      const values = Array.from({ length: Math.floor(random() * 30) + 1 }, () =>
        CELL_SHAPES[Math.floor(random() * CELL_SHAPES.length)](random));
      const field = profileField(values);
      try {
        expect(field.coverage).toBeGreaterThanOrEqual(0);
        expect(field.coverage).toBeLessThanOrEqual(100);
        if (field.type === "numeric") {
          expect(field.validCount).toBe(values.filter((v) => toFiniteNumber(v) !== null).length);
        }
        if (field.type === "categorical") {
          const shares = field.top.reduce((sum, entry) => sum + entry.percentage, 0);
          expect(shares).toBeLessThanOrEqual(100.5);   // rounding headroom
        }
      } catch (error) {
        error.message = "seed " + seed + "\nvalues: " + JSON.stringify(values) + "\n" + error.message;
        throw error;
      }
    }
  });
});
