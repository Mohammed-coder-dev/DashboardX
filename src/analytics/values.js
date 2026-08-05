// Shared value coercion for the deterministic analytics engine.
//
// The single most important rule here: a missing value must never become a
// number. `Number(null)`, `Number("")` and `Number("   ")` all return 0 in
// JavaScript, so any code that reaches for `Number()` and then filters with
// `isNaN` silently converts blanks into real zeroes — which drags means toward
// zero and manufactures correlation. Every numeric read in this engine goes
// through `toFiniteNumber`, which returns `null` for absent data and preserves
// a genuine numeric zero.

/** Values that represent absence rather than data. */
export function isMissing(value) {
  if (value === null || value === undefined) return true;
  // NaN and ±Infinity are not usable observations.
  if (typeof value === "number") return !Number.isFinite(value);
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/**
 * Numbers as they are actually written in exported spreadsheets.
 *
 * `$48,000`, `12.5%` and `(1,200)` are numbers wearing their formatting, and
 * reading them is reading, not computing — the digits are in the cell. Before
 * this, every one of them read as non-numeric, so a currency column either
 * vanished from the analysis or, worse, kept only the cells that happened to
 * parse and reported a confident mean over half its data.
 *
 * Two deliberate limits:
 *
 *  - A percentage reads at the magnitude the cell displays: `12.5%` is 12.5, not
 *    0.125. Rescaling would make every number Ridge reports disagree with the
 *    file it came from.
 *  - Only US-style grouping is recognised — digits in threes, `.` as the decimal
 *    point. `1.234,56` means 1234.56 in much of the world and 1.234 in the rest,
 *    and guessing wrong is a 1000x error in a reported mean. It stays unparsed,
 *    exactly as before, and surfaces as an invalid value.
 */
const FORMATTED_NUMBER =
  /^(\()?\s*([+-])?\s*(\p{Sc})?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(%)?\s*(\p{Sc})?\s*(\))?$/u;

/** Reported in a stable order regardless of the order they were met in. */
const FORMAT_ORDER = ["negated parentheses", "currency", "percent", "thousands"];

function matchFormattedNumber(str) {
  const match = FORMATTED_NUMBER.exec(str.trim());
  if (!match) return null;
  const [, open, sign, symbolBefore, digits, decimals, percent, symbolAfter, close] = match;
  // A half-open bracket is a typo, not a convention; so is a doubled symbol.
  if (Boolean(open) !== Boolean(close)) return null;
  if (open && sign) return null;
  if (symbolBefore && symbolAfter) return null;

  const magnitude = Number(`${digits.replace(/,/g, "")}${decimals ?? ""}`);
  if (!Number.isFinite(magnitude)) return null;
  const negative = Boolean(open) || sign === "-";
  return {
    value: negative ? -magnitude : magnitude,
    kinds: [
      open ? "negated parentheses" : null,
      symbolBefore || symbolAfter ? "currency" : null,
      percent ? "percent" : null,
      digits.includes(",") ? "thousands" : null,
    ].filter(Boolean),
  };
}

function isPlainNumeric(str) {
  return str !== "" && Number.isFinite(Number(str));
}

/**
 * Which formatting conventions had to be read through to make a column numeric.
 *
 * Reading formatting is still a reading, so it is named rather than assumed:
 * a column reported as a mean of percentages should say that is what it is.
 */
export function numberFormats(rawValues) {
  const seen = new Set();
  for (const raw of rawValues) {
    if (typeof raw !== "string") continue;
    const str = raw.trim();
    if (isPlainNumeric(str)) continue;
    const match = matchFormattedNumber(str);
    if (match) for (const kind of match.kinds) seen.add(kind);
  }
  return FORMAT_ORDER.filter((kind) => seen.has(kind));
}

/**
 * Parse a cell into a finite number, or `null` when it is not numeric data.
 *
 * Returns `0` for a genuine zero (`0`, `"0"`, `"0.00"`) and `null` for every
 * flavour of absent value. Booleans are deliberately NOT coerced: `Number(true)`
 * is 1, and silently treating a true/false column as 1/0 would put it into
 * correlations and means where the caller never asked for it. `profileColumn`
 * classifies booleans as their own type instead.
 */
export function toFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return null;
  if (value instanceof Date) return null;
  const str = String(value).trim();
  if (str === "") return null;
  const parsed = Number(str);
  if (Number.isFinite(parsed)) return parsed;
  // Only reached by strings that were not numbers already, so nothing that
  // parsed before can change; this can only turn a previously invalid value
  // into a valid one.
  const formatted = matchFormattedNumber(str);
  return formatted ? formatted.value : null;
}

/** Numeric values from a column, in row order, with absent cells dropped. */
export function numericValues(rawValues) {
  const out = [];
  for (const raw of rawValues) {
    const n = toFiniteNumber(raw);
    if (n !== null) out.push(n);
  }
  return out;
}

/**
 * Pair two columns observation-by-observation, keeping only rows where BOTH
 * sides are numeric. This pairwise (not per-column) filtering is what makes a
 * correlation honest: dropping row 7 because column A is blank must also drop
 * column B's row 7, or the two series stop describing the same observations.
 */
export function pairedNumericValues(rows, columnA, columnB) {
  const xs = [];
  const ys = [];
  for (const row of rows) {
    const x = toFiniteNumber(row?.[columnA]);
    if (x === null) continue;
    const y = toFiniteNumber(row?.[columnB]);
    if (y === null) continue;
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

/** Share of `total` covered by `count`, as a 0-100 percentage with 1 decimal. */
export function coveragePct(count, total) {
  if (!total || total <= 0) return 0;
  return +((count / total) * 100).toFixed(1);
}

/** Linear-interpolated quantile over an ascending-sorted array. */
export function quantile(sortedAsc, q) {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedAsc[base + 1];
  return next === undefined ? sortedAsc[base] : sortedAsc[base] + rest * (next - sortedAsc[base]);
}

/** Round to `digits` decimals, preserving null. */
export function round(value, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return +value.toFixed(digits);
}
