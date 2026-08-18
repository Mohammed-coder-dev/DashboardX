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
import { coveragePct, isMissing, numberFormats, quantile, round, toFiniteNumber } from "./values.js";
import { meanConfidenceInterval } from "./inference.js";

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

/**
 * Flagged rows shipped with the fences, capped so a pathological column
 * cannot balloon the payload. The cap is stated on the report (`rowsCap`)
 * and `count` remains the authority on how many exist, so a truncated list
 * can never present itself as complete.
 */
export const OUTLIER_ROWS_CAP = 200;

/**
 * `observations` pairs each numeric value with its 1-based position among the
 * analyzed data rows — the same row space every provenance `sourceRows` table
 * already reports, so the list and the drilldowns can never disagree about
 * which row is which.
 */
function outlierReport(observations) {
  if (observations.length < OUTLIER_MIN_SAMPLE) {
    return { count: 0, method: "iqr", applied: false, reason: `needs ${OUTLIER_MIN_SAMPLE} values` };
  }
  const sorted = observations.map((observation) => observation.value).sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr === 0) {
    return { count: 0, method: "iqr", applied: false, reason: "zero interquartile range" };
  }
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  // The rows themselves, not just their count: the fences already identified
  // them, so shipping them is releasing information, not computing any.
  // Ordered by distance beyond the fence, ties on row number, so the same
  // file always ships the same list.
  const flagged = observations
    .filter(({ value }) => value < low || value > high)
    .map(({ row, value }) => ({
      row,
      value,
      side: value < low ? "below" : "above",
      beyond: round(value < low ? low - value : value - high),
    }))
    .sort((a, b) => (b.beyond - a.beyond) || (a.row - b.row));
  return {
    count: flagged.length,
    method: "iqr",
    applied: true,
    lowerFence: round(low),
    upperFence: round(high),
    rows: flagged.slice(0, OUTLIER_ROWS_CAP),
    rowsCap: OUTLIER_ROWS_CAP,
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
  // Each parsed value keeps its 1-based data-row position, so the outlier
  // report can name the rows it flags in the row space provenance uses.
  const observations = [];
  for (let index = 0; index < rawValues.length; index++) {
    const raw = rawValues[index];
    if (isMissing(raw)) { missing++; continue; }
    const parsed = toFiniteNumber(raw);
    if (parsed !== null) {
      numbers.push(parsed);
      observations.push({ row: index + 1, value: parsed });
    }
  }
  const present = total - missing;
  const invalid = present - numbers.length;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const variance = numbers.reduce((a, b) => a + (b - mean) ** 2, 0) / numbers.length;
  const outliers = outlierReport(observations);
  // Reading `$48,000` as 48000 is a reading, not a computation — but it is
  // still a reading, so the column says which conventions it was made through.
  // Absent means none were needed, never that the question went unasked.
  const formats = numberFormats(rawValues);

  return {
    type: "numeric",
    ...(formats.length > 0 ? { formats } : {}),
    // `count` keeps its historical meaning (valid numeric observations) so
    // existing consumers and saved analyses stay readable.
    count: numbers.length,
    validCount: numbers.length,
    missing,
    invalid,
    coverage: coveragePct(numbers.length, totalRows),
    // Rounded like every other statistic in this object. Reported raw, they
    // leaked float representation noise into the report — a column whose
    // largest value is 87.6/100 showed `max: 0.8759999999999999` beside
    // `mean: 0.876`, which reads as a mean above the maximum. Rounding is
    // monotonic, so min <= mean <= max survives it.
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(mean),
    meanConfidence95: meanConfidenceInterval(numbers),
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
  // Every column is profiled, including one named `line`. That name used to be
  // skipped as "the synthetic row index the text parsers add" — but those
  // parsers report `isTabular: false`, and both callers of this function only
  // reach it on the tabular path, so their rows never arrive here. The skip
  // protected nothing and silently dropped a real column: invoice line items,
  // log line numbers, production line, line of business. The statistics panel
  // then described a different set of columns than the quality panel, the
  // column produced no evidence when chosen as the target, and a comparison
  // reaching for its type crashed with a 500.
  for (const col of columns) {
    stats[col] = profileField(rows.map((r) => r?.[col]), totalRows);
  }
  return stats;
}
