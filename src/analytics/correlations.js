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
const MAX_RESULTS = 10;

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i];
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; sumY2 += y * y;
  }
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
  // A zero denominator means at least one series is constant. There is no
  // relationship to report, and 0 would falsely imply "measured, found none".
  if (denominator === 0) return null;
  return numerator / denominator;
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
  const numericCols = columns.filter((c) => {
    const declared = stats?.[c]?.type;
    return declared === undefined ? c !== "line" : declared === "numeric";
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
      // Spearman is the fallback when Pearson is undefined (a constant series)
      // but ranks still vary; otherwise Pearson is the headline coefficient.
      const primaryMethod = pearsonR !== null ? "pearson" : (spearmanR !== null ? "spearman" : null);
      if (primaryMethod === null) continue;
      const coefficient = primaryMethod === "pearson" ? pearsonR : spearmanR;
      if (Math.abs(coefficient) < minReported) continue;

      const smallSample = n <= SMALL_SAMPLE_MAX;
      const coverage = coveragePct(n, totalRows);
      const caveats = [];
      if (smallSample) caveats.push(`only ${n} paired observations`);
      if (coverage < 60 && totalRows > 0) caveats.push(`${coverage}% of rows had both values`);
      if (spearmanR !== null && pearsonR !== null && Math.abs(spearmanR - pearsonR) >= 0.2) {
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
      });
    }
  }

  return results
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient)
      || a.columnA.localeCompare(b.columnA)
      || a.columnB.localeCompare(b.columnB))
    .slice(0, limit);
}
