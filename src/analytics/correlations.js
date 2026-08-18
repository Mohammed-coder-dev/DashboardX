// Pairwise correlation over numeric column pairs.
//
// Every reported relationship carries the evidence needed to judge it: which
// method produced it, how many paired observations survived filtering, what
// share of the dataset that represents, and whether the sample is too small to
// lean on. A coefficient without an `n` is not a finding.
import { coveragePct, pairedNumericValues, round } from "./values.js";

/** Below this many paired observations a coefficient is not reported at all. */
export const MIN_PAIRS = 3;
/** At or below this many pairs, the coefficient carries a small-sample warning. */
export const SMALL_SAMPLE_MAX = 12;
/** Weaker relationships than this are not surfaced as findings. */
export const MIN_REPORTED = 0.3;
/**
 * Gap between |Spearman| and |Pearson| that counts as the two methods telling
 * materially different stories. Used both to pick the headline method and to
 * attach the non-linearity caveat, so the two always agree.
 */
export const METHOD_DISAGREEMENT = 0.2;
const MAX_RESULTS = 10;
/** Pairings at or below this many points travel verbatim; larger ones bin. */
export const MAX_SCATTER_POINTS = 500;
/** Cells per axis of the density grid used for larger pairings. */
export const SCATTER_GRID_BINS = 20;

/**
 * The paired observations behind a reported coefficient, shaped for honest
 * plotting. A small pairing travels verbatim; a large one travels as a 2D
 * density grid in which every pair lands in exactly one cell — so the chart is
 * always an aggregate of the full pairing, never a preview-row sample dressed
 * up as one. Deterministic either way: same input, same cells, same order.
 */
export function scatterData(xs, ys) {
  const n = xs.length;
  if (n === 0) return null;
  if (n <= MAX_SCATTER_POINTS) {
    return { kind: "points", n, points: xs.map((x, i) => [round(x), round(ys[i])]) };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  // A constant axis cannot be reported (no variance, no coefficient), but the
  // guard keeps this total function total if a caller ever bins one anyway.
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const xi = Math.min(SCATTER_GRID_BINS - 1, Math.floor((xs[i] - minX) / spanX * SCATTER_GRID_BINS));
    const yi = Math.min(SCATTER_GRID_BINS - 1, Math.floor((ys[i] - minY) / spanY * SCATTER_GRID_BINS));
    const key = xi * SCATTER_GRID_BINS + yi;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, count]) => [Math.floor(key / SCATTER_GRID_BINS), key % SCATTER_GRID_BINS, count]);
  return {
    kind: "grid", n, bins: SCATTER_GRID_BINS,
    x: { min: round(minX), max: round(maxX) },
    y: { min: round(minY), max: round(maxY) },
    cells,
  };
}

/**
 * Pearson over the centred deviations, in two passes.
 *
 * Not the textbook `n·Σx² − (Σx)²` shortcut. That form subtracts two enormous,
 * nearly equal numbers, and on any column whose values dwarf their own spread —
 * epoch milliseconds, account numbers, amounts in minor units, coordinates —
 * every significant digit of the variance cancels away. Measured on this
 * engine: `1e9 + i` against `1e9 + 2i` (a perfect +1) produced a denominator of
 * exactly 0, read as "constant series" and dropped; other spacings produced a
 * negative radicand, so `Math.sqrt` returned NaN, which compares false against
 * every threshold and travelled into the results as a coefficient of `null`;
 * others survived with the wrong magnitude (0.707 where the answer was 1).
 * Centring first costs one extra pass and makes all three impossible.
 */
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < n; i++) { meanX += xs[i]; meanY += ys[i]; }
  meanX /= n;
  meanY /= n;
  let sumXY = 0, sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sumXY += dx * dy;
    sumXX += dx * dx;
    sumYY += dy * dy;
  }
  // Multiplied after the roots, not before: squared deviations of a large
  // column can overflow to Infinity when multiplied together, which would
  // silently report r = 0.
  const denominator = Math.sqrt(sumXX) * Math.sqrt(sumYY);
  // `> 0` rather than `!== 0`: a zero denominator means at least one series is
  // constant — there is no relationship to report, and 0 would falsely imply
  // "measured, found none" — and the same test rejects a NaN denominator
  // instead of letting it propagate into a finding.
  if (!(denominator > 0)) return null;
  const r = sumXY / denominator;
  if (!Number.isFinite(r)) return null;
  // Floating point can carry an exact ±1 a few ulps past the boundary. A
  // coefficient outside [-1, 1] is not a coefficient.
  return Math.min(1, Math.max(-1, r));
}

/**
 * Fractional ranks with ties averaged, so Spearman handles repeated values
 * correctly rather than letting input order decide the ranking.
 */
export function rankValues(values) {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => (a.value - b.value) || (a.index - b.index));
  const ranks = new Array(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j++;
    // Ranks are 1-based; tied entries all take the mean of the span they cover.
    const averageRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[indexed[k].index] = averageRank;
    i = j + 1;
  }
  return ranks;
}

export function spearman(xs, ys) {
  return pearson(rankValues(xs), rankValues(ys));
}

export function classifyStrength(coefficient) {
  const magnitude = Math.abs(coefficient);
  if (magnitude >= 0.9) return "very strong";
  if (magnitude >= 0.7) return "strong";
  if (magnitude >= 0.5) return "moderate";
  if (magnitude >= 0.3) return "weak";
  return "negligible";
}

/**
 * Correlate every numeric column pair.
 *
 * `stats` selects which columns are numeric; when a column is absent from
 * `stats` the pair is still attempted and simply fails the MIN_PAIRS floor if
 * it holds no numeric data.
 */
export function computeCorrelations(rows, columns, stats = {}, options = {}) {
  const { method = "both", minReported = MIN_REPORTED, limit = MAX_RESULTS } = options;
  const totalRows = rows.length;
  // A column with no entry in `stats` is attempted rather than assumed
  // non-numeric; it simply fails the MIN_PAIRS floor if it holds no numbers.
  // `line` used to be excluded by name here for the same wrong reason it was
  // skipped in computeStats — the text parsers that synthesise it never reach
  // either function.
  const numericCols = columns.filter((c) => {
    const declared = stats?.[c]?.type;
    return declared === undefined || declared === "numeric";
  });

  const results = [];
  for (let i = 0; i < numericCols.length; i++) {
    for (let j = i + 1; j < numericCols.length; j++) {
      const columnA = numericCols[i];
      const columnB = numericCols[j];
      // Pairwise, not per-column: a row missing either side is excluded from both.
      const { xs, ys } = pairedNumericValues(rows, columnA, columnB);
      const n = xs.length;
      if (n < MIN_PAIRS) continue;

      const pearsonR = pearson(xs, ys);
      const spearmanR = method === "pearson" ? null : spearman(xs, ys);
      if (pearsonR === null && spearmanR === null) continue;
      // Report the method that best characterises the pair, not Pearson by
      // default. A single extreme outlier can drag Pearson to ~0 while the
      // ranks stay almost perfectly ordered; leading with Pearson there would
      // hide a real monotonic relationship rather than describe it. The
      // disagreement itself is surfaced as a caveat below.
      const primaryMethod = pearsonR === null ? "spearman"
        : spearmanR === null ? "pearson"
        : (Math.abs(spearmanR) - Math.abs(pearsonR) >= METHOD_DISAGREEMENT ? "spearman" : "pearson");
      const coefficient = primaryMethod === "pearson" ? pearsonR : spearmanR;
      if (Math.abs(coefficient) < minReported) continue;

      const smallSample = n <= SMALL_SAMPLE_MAX;
      const coverage = coveragePct(n, totalRows);
      const caveats = [];
      if (smallSample) caveats.push(`only ${n} paired observations`);
      if (coverage < 60 && totalRows > 0) caveats.push(`${coverage}% of rows had both values`);
      if (spearmanR !== null && pearsonR !== null
          && Math.abs(Math.abs(spearmanR) - Math.abs(pearsonR)) >= METHOD_DISAGREEMENT) {
        caveats.push("Pearson and Spearman disagree, suggesting a non-linear or outlier-driven pattern");
      }

      results.push({
        columnA,
        columnB,
        method: primaryMethod,
        coefficient: round(coefficient),
        pearson: round(pearsonR),
        spearman: round(spearmanR),
        n,
        coverage,
        rowsConsidered: totalRows,
        strength: classifyStrength(coefficient),
        smallSample,
        caveat: caveats.length ? caveats.join("; ") : null,
        // The pairs the coefficient was computed over, chartable as-is. Built
        // from the same pairwise filtering, so the plot and the number can
        // never describe different observations.
        scatter: scatterData(xs, ys),
      });
    }
  }

  return results
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient)
      || a.columnA.localeCompare(b.columnA)
      || a.columnB.localeCompare(b.columnB))
    .slice(0, limit);
}
