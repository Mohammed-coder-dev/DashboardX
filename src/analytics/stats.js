// Per-column descriptive statistics.
//
// Two behaviours here are deliberate corrections of earlier bugs:
//
//  1. Nothing reads a cell with bare `Number()`. Blank and whitespace-only
//     cells used to coerce to 0 and land in means, medians and correlations as
//     real observations. All numeric reads go through `toFiniteNumber`.
//  2. Categorical `top` values are ranked by frequency, not by first
//     appearance. The old code took `[...new Set(values)].slice(0, 5)`, which
//     is insertion order — it reported whichever values happened to appear
//     first, labelled as the most common.
import { looksLikeDateColumn, profileDates } from "./dates.js";
import { coveragePct, isMissing, quantile, round, toFiniteNumber } from "./values.js";

/**
 * Share of present values that must parse as numbers for a column to be typed
 * numeric. Retained at 0.5 for output compatibility, but a column that only
 * just clears it now reports `invalid` and `coverage`, so a half-unparseable
 * column can no longer masquerade as clean numeric data.
 */
export const NUMERIC_TYPE_THRESHOLD = 0.5;
const TOP_VALUES = 8;
const OUTLIER_MIN_SAMPLE = 8;
const MAX_HISTOGRAM_BINS = 10;

/**
 * Equal-width histogram over every valid value in a numeric field.
 *
 * The bins travel with the computed statistics so charts never have to infer a
 * distribution from the 100 representative rows included for AI context.
 */
function histogram(numbers, outliers) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of numbers) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) {
    return { method: "equal-width", bins: [{ start: min, end: max, count: numbers.length, kind: "center" }] };
  }

  // Preserve extreme observations without letting them flatten the central
  // distribution into a single unreadable bar.
  const tailAware = outliers?.applied && outliers.count > 0;
  const central = tailAware
    ? numbers.filter((value) => value >= outliers.lowerFence && value <= outliers.upperFence)
    : numbers;
  let centralMin = Infinity;
  let centralMax = -Infinity;
  for (const value of central) {
    if (value < centralMin) centralMin = value;
    if (value > centralMax) centralMax = value;
  }
  if (centralMin === centralMax) {
    const bins = [{ start: centralMin, end: centralMax, count: central.length, kind: "center" }];
    const lowCount = numbers.filter((value) => value < centralMin).length;
    const highCount = numbers.filter((value) => value > centralMax).length;
    if (lowCount) bins.unshift({ start: null, end: centralMin, count: lowCount, kind: "low-tail" });
    if (highCount) bins.push({ start: centralMax, end: null, count: highCount, kind: "high-tail" });
    return { method: tailAware ? "iqr-tail-aware" : "equal-width", bins };
  }

  const binCount = Math.min(MAX_HISTOGRAM_BINS, Math.max(2, Math.ceil(Math.sqrt(central.length))));
  const width = (centralMax - centralMin) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: round(centralMin + index * width),
    end: round(index === binCount - 1 ? centralMax : centralMin + (index + 1) * width),
    count: 0,
    kind: "center",
  }));
  for (const value of central) {
    const index = Math.min(Math.floor((value - centralMin) / width), binCount - 1);
    bins[index].count++;
  }
  if (tailAware) {
    const lowCount = numbers.filter((value) => value < outliers.lowerFence).length;
    const highCount = numbers.filter((value) => value > outliers.upperFence).length;
    if (lowCount) bins.unshift({ start: null, end: outliers.lowerFence, count: lowCount, kind: "low-tail" });
    if (highCount) bins.push({ start: outliers.upperFence, end: null, count: highCount, kind: "high-tail" });
  }
  return { method: tailAware ? "iqr-tail-aware" : "equal-width", bins };
}

function outlierReport(numbers) {
  if (numbers.length < OUTLIER_MIN_SAMPLE) {
    return { count: 0, method: "iqr", applied: false, reason: `needs ${OUTLIER_MIN_SAMPLE} values` };
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr === 0) {
    return { count: 0, method: "iqr", applied: false, reason: "zero interquartile range" };
  }
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  return {
    count: numbers.filter((n) => n < low || n > high).length,
    method: "iqr",
    applied: true,
    lowerFence: round(low),
    upperFence: round(high),
  };
}

/**
 * Classify what a mostly-text column is for, so callers can tell an ID column
 * apart from a genuine category. An identifier is nearly all-unique; a category
 * has few repeated levels; anything in between is free text.
 */
export function classifyCategoricalRole(uniqueCount, validCount) {
  if (validCount === 0) return "empty";
  const ratio = uniqueCount / validCount;
  if (uniqueCount === validCount && validCount > 1) return "identifier";
  if (ratio >= 0.9 && validCount >= 10) return "identifier";
  if (uniqueCount <= 25 && ratio <= 0.5) return "category";
  return "high-cardinality text";
}

/**
 * Frequency table over present values, descending by count.
 *
 * Ties break on the value's string form so the ordering is stable across runs
 * and platforms — otherwise two values with equal counts could swap places
 * between calls and make saved reports flap.
 */
export function frequencyTable(rawValues, limit = TOP_VALUES) {
  const counts = new Map();
  let validCount = 0;
  for (const raw of rawValues) {
    if (isMissing(raw)) continue;
    validCount++;
    const key = raw instanceof Date ? raw.toISOString() : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count, percentage: coveragePct(count, validCount) }));
  return { entries, uniqueCount: counts.size, validCount };
}

function numericField(rawValues, total, totalRows) {
  let missing = 0;
  const numbers = [];
  for (const raw of rawValues) {
    if (isMissing(raw)) { missing++; continue; }
    const parsed = toFiniteNumber(raw);
    if (parsed !== null) numbers.push(parsed);
  }
  const present = total - missing;
  const invalid = present - numbers.length;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const variance = numbers.reduce((a, b) => a + (b - mean) ** 2, 0) / numbers.length;
  const outliers = outlierReport(numbers);

  return {
    type: "numeric",
    // `count` keeps its historical meaning (valid numeric observations) so
    // existing consumers and saved analyses stay readable.
    count: numbers.length,
    validCount: numbers.length,
    missing,
    invalid,
    coverage: coveragePct(numbers.length, totalRows),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: round(mean),
    median: round(quantile(sorted, 0.5)),
    std: round(Math.sqrt(variance)),
    quantiles: {
      p05: round(quantile(sorted, 0.05)),
      q1: round(quantile(sorted, 0.25)),
      q3: round(quantile(sorted, 0.75)),
      p95: round(quantile(sorted, 0.95)),
    },
    histogram: histogram(numbers, outliers),
    outliers,
  };
}

function categoricalField(rawValues, total, totalRows) {
  let missing = 0;
  for (const raw of rawValues) if (isMissing(raw)) missing++;
  const { entries, uniqueCount, validCount } = frequencyTable(rawValues);
  return {
    type: "categorical",
    count: validCount,
    validCount,
    missing,
    invalid: 0,
    coverage: coveragePct(validCount, totalRows),
    unique: uniqueCount,
    role: classifyCategoricalRole(uniqueCount, validCount),
    top: entries,
  };
}

function dateField(rawValues, totalRows) {
  const profile = profileDates(rawValues, totalRows);
  return { type: "date", count: profile.validCount, unique: profile.validCount, top: [], ...profile };
}

/** Profile one column, choosing the field type from its contents. */
export function profileField(rawValues, totalRows = rawValues.length) {
  const total = rawValues.length;
  let missing = 0;
  let numericCount = 0;
  for (const raw of rawValues) {
    if (isMissing(raw)) { missing++; continue; }
    if (toFiniteNumber(raw) !== null) numericCount++;
  }
  const present = total - missing;

  if (present === 0) {
    return {
      type: "empty", count: 0, validCount: 0, missing, invalid: 0,
      coverage: 0, unique: 0, role: "empty", top: [],
    };
  }
  if (numericCount > 0 && numericCount >= present * NUMERIC_TYPE_THRESHOLD) {
    return numericField(rawValues, total, totalRows);
  }
  // Date detection runs only on non-numeric columns, so integer measurements
  // are never reinterpreted as a timeline.
  if (looksLikeDateColumn(rawValues)) return dateField(rawValues, totalRows);
  return categoricalField(rawValues, total, totalRows);
}

export function computeStats(rows, columns) {
  const stats = {};
  const totalRows = rows.length;
  for (const col of columns) {
    // `line` is the synthetic row index added by the text parsers, not data.
    if (col === "line") continue;
    stats[col] = profileField(rows.map((r) => r?.[col]), totalRows);
  }
  return stats;
}
