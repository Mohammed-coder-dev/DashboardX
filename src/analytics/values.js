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
  return Number.isFinite(parsed) ? parsed : null;
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
