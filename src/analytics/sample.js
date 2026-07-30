// Deterministic representative row sampling for model context.
//
// The prompt used to carry `rows.slice(0, 5)`. That is an arbitrary window: on
// a sorted export the first five rows share a single category and the smallest
// values, so the model was invited to "discover" statistics from a biased
// preview instead of explaining the computed evidence. This module picks rows
// that actually characterise the dataset — boundaries, central values, missing
// cells, outliers, category examples — and labels why each was chosen.
//
// Selection is deterministic: candidates are considered in a fixed order and
// ties always resolve to the lowest row index, so the same input yields the
// same sample on every run and in every environment.
import { isMissing, quantile, toFiniteNumber } from "./values.js";
import { toDate } from "./dates.js";

const DEFAULT_LIMIT = 14;

function primaryNumericColumn(columns, stats) {
  // Highest coverage wins, then column order — never Object key order alone.
  let best = null;
  for (const col of columns) {
    const s = stats?.[col];
    if (s?.type !== "numeric" || !s.validCount) continue;
    if (best === null || s.coverage > stats[best].coverage) best = col;
  }
  return best;
}

function firstDateColumn(columns, stats) {
  for (const col of columns) if (stats?.[col]?.type === "date" && stats[col].validCount) return col;
  return null;
}

function nearestIndexByValue(rows, column, target) {
  let bestIndex = null;
  let bestDistance = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const value = toFiniteNumber(rows[i]?.[column]);
    if (value === null) continue;
    const distance = Math.abs(value - target);
    // Strictly-less keeps the lowest index on ties.
    if (distance < bestDistance) { bestDistance = distance; bestIndex = i; }
  }
  return bestIndex;
}

/**
 * Choose up to `limit` representative rows.
 *
 * Returns the selected rows in original row order plus a parallel list of
 * `{ index, reasons }` so callers can explain the sample rather than presenting
 * it as a plain preview.
 */
export function representativeSample(rows, columns, stats = {}, options = {}) {
  const { limit = DEFAULT_LIMIT } = options;
  const reasonsByIndex = new Map();
  const add = (index, reason) => {
    if (index === null || index === undefined || index < 0 || index >= rows.length) return;
    const existing = reasonsByIndex.get(index);
    if (existing) { if (!existing.includes(reason)) existing.push(reason); return; }
    reasonsByIndex.set(index, [reason]);
  };

  if (rows.length === 0) return { rows: [], selections: [], totalRows: 0 };

  add(0, "first row");
  if (rows.length > 1) add(rows.length - 1, "last row");

  const numericCol = primaryNumericColumn(columns, stats);
  if (numericCol) {
    const s = stats[numericCol];
    add(nearestIndexByValue(rows, numericCol, s.median), `median ${numericCol}`);
    if (s.quantiles) {
      add(nearestIndexByValue(rows, numericCol, s.quantiles.q1), `lower quartile ${numericCol}`);
      add(nearestIndexByValue(rows, numericCol, s.quantiles.q3), `upper quartile ${numericCol}`);
    }
    add(nearestIndexByValue(rows, numericCol, s.min), `minimum ${numericCol}`);
    add(nearestIndexByValue(rows, numericCol, s.max), `maximum ${numericCol}`);
  }

  // Rows carrying missing cells, so the model sees incompleteness directly.
  let missingAdded = 0;
  for (let i = 0; i < rows.length && missingAdded < 2; i++) {
    const blanks = columns.filter((c) => isMissing(rows[i]?.[c]));
    if (blanks.length === 0) continue;
    add(i, `missing ${blanks.slice(0, 3).join(", ")}`);
    missingAdded++;
  }

  // Outlier rows, using the fences already computed per numeric column.
  let outliersAdded = 0;
  for (const col of columns) {
    if (outliersAdded >= 2) break;
    const s = stats?.[col];
    if (s?.type !== "numeric" || !s.outliers?.applied || !s.outliers.count) continue;
    for (let i = 0; i < rows.length; i++) {
      const value = toFiniteNumber(rows[i]?.[col]);
      if (value === null) continue;
      if (value < s.outliers.lowerFence || value > s.outliers.upperFence) {
        add(i, `outlier in ${col}`);
        outliersAdded++;
        break;
      }
    }
  }

  // One example per leading category level of the most informative category column.
  const categoryCol = columns.find((c) => stats?.[c]?.type === "categorical" && stats[c].role === "category");
  if (categoryCol) {
    for (const entry of (stats[categoryCol].top || []).slice(0, 3)) {
      const index = rows.findIndex((r) => !isMissing(r?.[categoryCol]) && String(r[categoryCol]) === entry.value);
      add(index, `${categoryCol} = ${entry.value}`);
    }
  }

  // Chronological boundaries when a real date column exists.
  const dateCol = firstDateColumn(columns, stats);
  if (dateCol) {
    let earliest = null, latest = null;
    let earliestAt = null, latestAt = null;
    for (let i = 0; i < rows.length; i++) {
      const date = toDate(rows[i]?.[dateCol]);
      if (date === null) continue;
      const time = date.getTime();
      if (earliest === null || time < earliest) { earliest = time; earliestAt = i; }
      if (latest === null || time > latest) { latest = time; latestAt = i; }
    }
    add(earliestAt, `earliest ${dateCol}`);
    add(latestAt, `latest ${dateCol}`);
  }

  // Fill any remaining budget with evenly spaced rows so a wide table is not
  // represented by boundaries alone.
  if (reasonsByIndex.size < limit && rows.length > reasonsByIndex.size) {
    const step = Math.max(1, Math.floor(rows.length / (limit + 1)));
    for (let i = step; i < rows.length && reasonsByIndex.size < limit; i += step) {
      add(i, "spread sample");
    }
  }

  const indices = [...reasonsByIndex.keys()].sort((a, b) => a - b).slice(0, limit);
  return {
    rows: indices.map((i) => rows[i]),
    selections: indices.map((i) => ({ index: i, reasons: reasonsByIndex.get(i) })),
    totalRows: rows.length,
  };
}

/** Quantile helper re-exported so prompt builders can describe the sample. */
export { quantile };
