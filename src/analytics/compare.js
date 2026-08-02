import { numericValues, round } from "./values.js";
import { kolmogorovSmirnov, welchMeanDifference } from "./inference.js";

export const COMPARISON_VERSION = "1.1.0";

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, neutral: 3 };

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function delta(current, baseline) {
  const a = finite(current);
  const b = finite(baseline);
  return a === null || b === null ? null : round(a - b);
}

function deltaPct(current, baseline) {
  const a = finite(current);
  const b = finite(baseline);
  return a === null || b === null || b === 0 ? null : round(((a - b) / Math.abs(b)) * 100, 1);
}

function compactSide(field) {
  if (!field) return null;
  const base = {
    type: field.type,
    validCount: field.validCount ?? field.count ?? 0,
    missing: field.missing ?? 0,
    coverage: field.coverage ?? null,
  };
  if (field.type === "numeric") {
    return { ...base, mean: field.mean, median: field.median, min: field.min, max: field.max, std: field.std };
  }
  if (field.type === "categorical") {
    return { ...base, unique: field.unique, top: (field.top || [])[0] || null };
  }
  if (field.type === "date") {
    return { ...base, earliest: field.earliest, latest: field.latest };
  }
  return base;
}

function compareColumn(column, baselineField, currentField, baselineRows = [], currentRows = []) {
  const type = baselineField.type;
  const result = {
    column,
    type,
    baseline: compactSide(baselineField),
    current: compactSide(currentField),
    deltas: { coverage: delta(currentField.coverage, baselineField.coverage) },
  };

  if (type === "numeric") {
    result.deltas.mean = delta(currentField.mean, baselineField.mean);
    result.deltas.meanPct = deltaPct(currentField.mean, baselineField.mean);
    result.deltas.median = delta(currentField.median, baselineField.median);
    const baselineValues = numericValues(baselineRows.map((row) => row?.[column]));
    const currentValues = numericValues(currentRows.map((row) => row?.[column]));
    result.inference = {
      meanDifference: welchMeanDifference(baselineValues, currentValues),
      distributionShift: kolmogorovSmirnov(baselineValues, currentValues),
      exploratory: true,
      multipleComparisonCorrection: "none",
    };
  } else if (type === "categorical") {
    const baselineTop = baselineField.top?.[0] || null;
    const currentTop = currentField.top?.[0] || null;
    result.deltas.unique = delta(currentField.unique, baselineField.unique);
    result.deltas.topShare = baselineTop && currentTop && baselineTop.value === currentTop.value
      ? delta(currentTop.percentage, baselineTop.percentage)
      : null;
    result.dominantChanged = Boolean(baselineTop && currentTop && baselineTop.value !== currentTop.value);
  }
  return result;
}

function makeFinding(severity, title, detail, metric, columns = []) {
  return { severity, title, detail, metric, columns };
}

/**
 * Compare two already-computed deterministic analysis results. "Baseline" is
 * the first file and "current" is the second; no model-generated numbers enter
 * this payload.
 */
export function compareAnalyses(baseline, current) {
  const baselineColumns = baseline.columns || [];
  const currentColumns = current.columns || [];
  const baselineSet = new Set(baselineColumns);
  const currentSet = new Set(currentColumns);
  const added = currentColumns.filter((column) => !baselineSet.has(column));
  const removed = baselineColumns.filter((column) => !currentSet.has(column));
  const shared = baselineColumns.filter((column) => currentSet.has(column));
  const typeChanges = shared
    .filter((column) => baseline.stats?.[column]?.type !== current.stats?.[column]?.type)
    .map((column) => ({
      column,
      baseline: baseline.stats?.[column]?.type || "unknown",
      current: current.stats?.[column]?.type || "unknown",
    }));
  const typeChanged = new Set(typeChanges.map((change) => change.column));
  const columns = shared
    .filter((column) => !typeChanged.has(column))
    .map((column) => compareColumn(column, baseline.stats[column], current.stats[column], baseline.rows, current.rows));

  const rowDelta = delta(current.profile?.rows, baseline.profile?.rows);
  const rowDeltaPct = deltaPct(current.profile?.rows, baseline.profile?.rows);
  const healthScoreDelta = delta(current.profile?.healthScore, baseline.profile?.healthScore);
  const completenessDelta = delta(current.profile?.completeness, baseline.profile?.completeness);
  const findings = [];

  if (typeChanges.length) {
    findings.push(makeFinding(
      "high",
      `${typeChanges.length} shared column${typeChanges.length === 1 ? " changed" : "s changed"} type`,
      typeChanges.map((change) => `${change.column}: ${change.baseline} to ${change.current}`).join("; "),
      "schema.type",
      typeChanges.map((change) => change.column),
    ));
  }
  if (added.length) findings.push(makeFinding("medium", `${added.length} column${added.length === 1 ? "" : "s"} added`, added.join(", "), "schema.added", added));
  if (removed.length) findings.push(makeFinding("medium", `${removed.length} column${removed.length === 1 ? "" : "s"} removed`, removed.join(", "), "schema.removed", removed));
  if (rowDeltaPct !== null && Math.abs(rowDeltaPct) >= 10) {
    findings.push(makeFinding("medium", `Row count ${rowDeltaPct > 0 ? "increased" : "decreased"} ${Math.abs(rowDeltaPct)}%`, `${baseline.profile.rows} to ${current.profile.rows} rows.`, "rows"));
  }
  if (healthScoreDelta !== null && Math.abs(healthScoreDelta) >= 5) {
    findings.push(makeFinding(Math.abs(healthScoreDelta) >= 15 ? "high" : "medium", `Data health ${healthScoreDelta > 0 ? "improved" : "declined"} ${Math.abs(healthScoreDelta)} points`, `${baseline.profile.healthScore}/100 to ${current.profile.healthScore}/100.`, "quality.health"));
  }
  if (completenessDelta !== null && Math.abs(completenessDelta) >= 5) {
    findings.push(makeFinding("medium", `Completeness ${completenessDelta > 0 ? "improved" : "declined"} ${Math.abs(completenessDelta)} points`, `${baseline.profile.completeness}% to ${current.profile.completeness}%.`, "quality.completeness"));
  }

  for (const column of columns) {
    if (column.type === "numeric" && column.inference?.meanDifference?.significant) {
      const test = column.inference.meanDifference;
      findings.push(makeFinding(
        "medium",
        `${column.column} mean difference excludes zero at 95% confidence`,
        `${column.baseline.mean} to ${column.current.mean}; difference ${test.difference}, 95% CI ${test.confidenceInterval.lower} to ${test.confidenceInterval.upper}, p=${test.pValue}. Exploratory and unadjusted across columns.`,
        "numeric.mean_shift",
        [column.column],
      ));
    } else if (column.type === "numeric" && column.deltas.meanPct !== null && Math.abs(column.deltas.meanPct) >= 10
      && column.baseline.validCount >= 3 && column.current.validCount >= 3) {
      findings.push(makeFinding(
        "low",
        `${column.column} mean ${column.deltas.meanPct > 0 ? "increased" : "decreased"} ${Math.abs(column.deltas.meanPct)}%`,
        `${column.baseline.mean} to ${column.current.mean}; descriptive change, before significance testing.`,
        "numeric.mean",
        [column.column],
      ));
    }
    if (column.type === "numeric" && column.inference?.distributionShift?.significant
      && column.inference.distributionShift.statistic >= 0.2) {
      const test = column.inference.distributionShift;
      findings.push(makeFinding(
        "medium",
        `${column.column} distribution shifted`,
        `Two-sample KS D=${test.statistic}, p=${test.pValue}. This tests the full distribution and is exploratory and unadjusted across columns.`,
        "numeric.distribution_shift",
        [column.column],
      ));
    }
    if (column.type === "categorical" && column.dominantChanged) {
      findings.push(makeFinding(
        "low",
        `${column.column} has a new leading category`,
        `${column.baseline.top.value} (${column.baseline.top.percentage}%) to ${column.current.top.value} (${column.current.top.percentage}%).`,
        "categorical.dominant",
        [column.column],
      ));
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title));
  if (!findings.length) {
    findings.push(makeFinding("neutral", "No material descriptive changes detected", "Schema, quality, and shared-column summaries stayed within Ridge's reporting thresholds.", "stable"));
  }

  return {
    version: COMPARISON_VERSION,
    deterministic: true,
    labels: { baseline: baseline.filename || "Baseline", current: current.filename || "Current" },
    summary: {
      baselineRows: baseline.profile?.rows ?? 0,
      currentRows: current.profile?.rows ?? 0,
      rowDelta,
      rowDeltaPct,
      baselineColumns: baselineColumns.length,
      currentColumns: currentColumns.length,
      columnDelta: currentColumns.length - baselineColumns.length,
      sharedColumns: shared.length,
      healthScoreDelta,
      completenessDelta,
    },
    schema: { added, removed, shared, typeChanges },
    quality: {
      baseline: { healthScore: baseline.profile?.healthScore ?? null, healthGrade: baseline.profile?.healthGrade ?? null, completeness: baseline.profile?.completeness ?? null, duplicateRows: baseline.profile?.duplicateRows ?? null },
      current: { healthScore: current.profile?.healthScore ?? null, healthGrade: current.profile?.healthGrade ?? null, completeness: current.profile?.completeness ?? null, duplicateRows: current.profile?.duplicateRows ?? null },
      deltas: { healthScore: healthScoreDelta, completeness: completenessDelta, duplicateRows: delta(current.profile?.duplicateRows, baseline.profile?.duplicateRows) },
    },
    columns,
    findings,
  };
}
