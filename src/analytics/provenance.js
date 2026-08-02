import { toDate } from "./dates.js";
import { isMissing, toFiniteNumber } from "./values.js";

export const PROVENANCE_VERSION = "1.0.0";
const MAX_SOURCE_ROWS = 10;
const MAX_CELL_CHARS = 160;

const FORMULAS = {
  pearson_r: "r = covariance(x, y) / (standard deviation(x) × standard deviation(y))",
  spearman_rho: "ρ = Pearson correlation of the paired value ranks",
  group_mean_difference: "d = (mean of highest group − mean of lowest group) / pooled standard deviation",
  missingness_mean_difference: "d = (mean where comparison field is missing − mean where present) / pooled standard deviation",
  category_share: "share = count of leading category / count of non-missing values × 100",
  period_volume_trend: "compare mean row count in the first third of periods with the last third",
  period_over_period_change: "change % = (current period count − previous period count) / previous period count × 100",
  target_time_trend: "ρ = rank correlation between the numeric target and chronological row order",
  iqr_outliers: "outlier when value < Q1 − 1.5 × IQR or value > Q3 + 1.5 × IQR",
  cramers_v: "V = √(χ² / (n × min(rows − 1, columns − 1)))",
  candidate_level_shift: "scan valid splits; compare segment medians and scale their difference by the global median absolute deviation",
};

function numericRequirement(row, column) {
  const value = row?.[column];
  if (isMissing(value)) return { ok: false, reason: `missing ${column}` };
  if (toFiniteNumber(value) === null) return { ok: false, reason: `non-numeric ${column}` };
  return { ok: true };
}

function dateRequirement(row, column) {
  const value = row?.[column];
  if (isMissing(value)) return { ok: false, reason: `missing ${column}` };
  if (toDate(value) === null) return { ok: false, reason: `invalid date ${column}` };
  return { ok: true };
}

function presentRequirement(row, column) {
  return isMissing(row?.[column]) ? { ok: false, reason: `missing ${column}` } : { ok: true };
}

function retainedLevelRequirement(row, column, levels) {
  if (isMissing(row?.[column])) return { ok: false, reason: `missing ${column}` };
  return levels.includes(String(row[column]))
    ? { ok: true }
    : { ok: false, reason: `${column} outside retained groups` };
}

function periodKey(date, granularity) {
  const iso = date.toISOString();
  if (granularity === "day") return iso.slice(0, 10);
  if (granularity === "month") return iso.slice(0, 7);
  return iso.slice(0, 4);
}

function retainedPeriodRequirement(row, column, context) {
  const date = toDate(row?.[column]);
  if (date === null) return { ok: false, reason: `invalid date ${column}` };
  return context.periods.includes(periodKey(date, context.granularity))
    ? { ok: true }
    : { ok: false, reason: `${column} outside compared periods` };
}

function requirementsFor(evidence) {
  const [first, second] = evidence.columns || [];
  switch (evidence.metric) {
    case "pearson_r":
    case "spearman_rho":
      return { rule: `Rows where ${first} and ${second} are both finite numbers`, checks: [[numericRequirement, first], [numericRequirement, second]] };
    case "cramers_v":
      return { rule: `Rows where ${first} and ${second} are both non-missing`, checks: [[presentRequirement, first], [presentRequirement, second]] };
    case "group_mean_difference":
      return evidence._provenanceContext?.retainedLevels
        ? { rule: `Rows with a finite ${first} in one of ${evidence._provenanceContext.retainedLevels.length} retained ${second} groups`, checks: [[numericRequirement, first], [(row, column) => retainedLevelRequirement(row, column, evidence._provenanceContext.retainedLevels), second]] }
        : { rule: `Rows with a finite ${first} and a non-missing ${second} group`, checks: [[numericRequirement, first], [presentRequirement, second]] };
    case "missingness_mean_difference":
      return { rule: `Rows with a finite ${first}; ${second} is retained to define missing and present partitions`, checks: [[numericRequirement, first]] };
    case "category_share":
      return { rule: `Rows where ${first} is non-missing`, checks: [[presentRequirement, first]] };
    case "period_volume_trend":
      return { rule: `Rows with a valid ${first} date`, checks: [[dateRequirement, first]] };
    case "period_over_period_change":
      return evidence._provenanceContext?.periods
        ? { rule: `Rows in the two compared ${evidence._provenanceContext.granularity} periods (${evidence._provenanceContext.periods.join(" and ")})`, checks: [[dateRequirement, first], [(row, column) => retainedPeriodRequirement(row, column, evidence._provenanceContext), first]] }
        : { rule: `Rows with a valid ${first} date`, checks: [[dateRequirement, first]] };
    case "target_time_trend":
    case "candidate_level_shift":
      return { rule: `Rows with a finite ${first} and valid ${second} date`, checks: [[numericRequirement, first], [dateRequirement, second]] };
    case "iqr_outliers":
      return { rule: `Rows where ${first} is a finite number; fences are computed over all included values`, checks: [[numericRequirement, first]] };
    default:
      return { rule: `Rows with non-missing values for ${evidence.columns.join(" and ")}`, checks: evidence.columns.map((column) => [presentRequirement, column]) };
  }
}

function safeCell(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const text = serialized === undefined ? String(value) : serialized;
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS - 1)}…` : text;
}

function evenlySpaced(items, limit) {
  if (items.length <= limit) return items;
  const selected = [];
  const used = new Set();
  for (let index = 0; index < limit; index++) {
    const position = Math.round(index * (items.length - 1) / (limit - 1));
    if (!used.has(position)) {
      used.add(position);
      selected.push(items[position]);
    }
  }
  return selected;
}

function sourceCandidates(evidence, included, stats) {
  if (evidence.metric !== "iqr_outliers") return included;
  const [column] = evidence.columns;
  const fences = stats?.[column]?.outliers;
  if (!fences?.applied) return included;
  return included.filter(({ row }) => {
    const value = toFiniteNumber(row?.[column]);
    return value !== null && (value < fences.lowerFence || value > fences.upperFence);
  });
}

/** Attach bounded, deterministic row-level traceability to one evidence item. */
export function buildProvenance(evidence, rows, stats = {}) {
  const requirement = requirementsFor(evidence);
  const included = [];
  const reasonCounts = new Map();
  rows.forEach((row, index) => {
    const reasons = requirement.checks
      .map(([check, column]) => check(row, column))
      .filter((result) => !result.ok)
      .map((result) => result.reason);
    if (reasons.length === 0) included.push({ row, index });
    else for (const reason of new Set(reasons)) reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  });

  const candidates = sourceCandidates(evidence, included, stats);
  const sourceRows = evenlySpaced(candidates.length ? candidates : included, MAX_SOURCE_ROWS).map(({ row, index }) => ({
    rowNumber: index + 1,
    values: Object.fromEntries((evidence.columns || []).map((column) => [column, safeCell(row?.[column])])),
  }));

  return {
    version: PROVENANCE_VERSION,
    formula: FORMULAS[evidence.metric] || evidence.method,
    inclusionRule: requirement.rule,
    inputRows: rows.length,
    includedRows: included.length,
    excludedRows: rows.length - included.length,
    exclusionReasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    sourceRowsPolicy: evidence.metric === "iqr_outliers"
      ? "Flagged outlier rows, capped at 10"
      : "Up to 10 evenly spaced included rows",
    sourceRows,
  };
}

export function attachEvidenceProvenance(evidence, rows, stats = {}) {
  return evidence.map((item) => {
    const { _provenanceContext, ...publicItem } = item;
    return { ...publicItem, provenance: buildProvenance(item, rows, stats) };
  });
}
