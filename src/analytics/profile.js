import { numericValues } from "./values.js";

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}([T ].*)?$/,          // ISO date / datetime
  /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/, // 12/31/2024, 31-12-24
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? \d{4}$/i,
];

export function classifyValue(value) {
  if (value === null || value === undefined || value === "") return "missing";
  if (value instanceof Date) return "date";
  if (typeof value === "number") return Number.isFinite(value) ? "numeric" : "missing";
  if (typeof value === "boolean") return "boolean";
  const str = String(value).trim();
  if (str === "") return "missing";
  if (str !== "" && !isNaN(Number(str))) return "numeric";
  if (DATE_PATTERNS.some(re => re.test(str))) return "date";
  return "text";
}

function quartile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

export function countOutliers(numbers) {
  if (numbers.length < 8) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const q1 = quartile(sorted, 0.25);
  const q3 = quartile(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr === 0) return 0;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  return numbers.filter(n => n < lo || n > hi).length;
}

export function profileColumn(rawValues) {
  const total = rawValues.length;
  const counts = { numeric: 0, date: 0, text: 0, boolean: 0, missing: 0 };
  const present = [];
  for (const v of rawValues) {
    const kind = classifyValue(v);
    counts[kind]++;
    if (kind !== "missing") present.push(v);
  }
  const presentCount = total - counts.missing;
  const unique = new Set(present.map(String)).size;

  let type = "empty", typeConsistency = 1;
  if (presentCount > 0) {
    const [dominant, dominantCount] = ["numeric", "date", "boolean", "text"]
      .map(k => [k, counts[k]])
      .sort((a, b) => b[1] - a[1])[0];
    typeConsistency = dominantCount / presentCount;
    type = typeConsistency >= 0.8 ? dominant : "mixed";
  }

  // numericValues (not raw Number()) so blanks and booleans never enter the
  // outlier sample as 0 or 1.
  const outliers = type === "numeric" ? countOutliers(numericValues(present)) : 0;

  return {
    type,
    typeConsistency: +typeConsistency.toFixed(3),
    missing: counts.missing,
    missingPct: total === 0 ? 0 : +(counts.missing / total * 100).toFixed(1),
    unique,
    uniquePct: presentCount === 0 ? 0 : +(unique / presentCount * 100).toFixed(1),
    outliers,
  };
}

function healthGrade(score) {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}

export function profileDataset(rows, columns) {
  const total = rows.length;
  const cols = {};
  for (const col of columns) {
    cols[col] = profileColumn(rows.map(r => r[col]));
  }

  const seen = new Set();
  let duplicateRows = 0;
  for (const row of rows) {
    const key = JSON.stringify(columns.map(c => row[c]));
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  const colList = Object.values(cols);
  const avgMissingPct = colList.length ? colList.reduce((s, c) => s + c.missingPct, 0) / colList.length : 0;
  const mixedCols = colList.filter(c => c.type === "mixed").length;
  const emptyCols = colList.filter(c => c.type === "empty").length;
  const duplicatePct = total ? duplicateRows / total * 100 : 0;
  const outlierPct = total
    ? colList.reduce((s, c) => s + c.outliers, 0) / (total * Math.max(1, colList.length)) * 100
    : 0;

  // Weighted penalties: missingness hurts most, then structural problems
  // (mixed/empty columns, duplicates), then statistical noise.
  const score = Math.max(0, Math.round(
    100
    - avgMissingPct * 0.8
    - (colList.length ? (mixedCols + emptyCols) / colList.length * 100 : 0) * 0.25
    - duplicatePct * 0.4
    - outlierPct * 0.5,
  ));

  const issues = [];
  for (const [name, c] of Object.entries(cols)) {
    if (c.missingPct >= 10) issues.push({ severity: c.missingPct >= 40 ? "high" : "medium", message: `"${name}" is missing ${c.missingPct}% of its values` });
    if (c.type === "mixed") issues.push({ severity: "high", message: `"${name}" mixes value types (only ${Math.round(c.typeConsistency * 100)}% consistent)` });
    if (c.type === "empty") issues.push({ severity: "medium", message: `"${name}" is completely empty` });
    if (c.outliers > 0) issues.push({ severity: "low", message: `"${name}" has ${c.outliers} statistical outlier${c.outliers === 1 ? "" : "s"}` });
  }
  if (duplicateRows > 0) {
    issues.push({ severity: duplicatePct >= 5 ? "high" : "medium", message: `${duplicateRows} duplicate row${duplicateRows === 1 ? "" : "s"} (${+duplicatePct.toFixed(1)}%)` });
  }
  const order = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    rows: total,
    columns: cols,
    duplicateRows,
    duplicatePct: +duplicatePct.toFixed(1),
    completeness: +(100 - avgMissingPct).toFixed(1),
    healthScore: score,
    healthGrade: healthGrade(score),
    issues: issues.slice(0, 12),
  };
}

// Compact rendering for the analysis prompt: enough signal for Claude to
// ground insights in data quality without spending tokens on the full object.
export function profileSummaryForPrompt(profile) {
  const cols = Object.entries(profile.columns)
    .map(([name, c]) => `${name}: ${c.type}${c.missingPct > 0 ? `, ${c.missingPct}% missing` : ""}${c.outliers ? `, ${c.outliers} outliers` : ""}`)
    .join(" | ");
  const issues = profile.issues.map(i => i.message).join("; ") || "none";
  return `Health ${profile.healthGrade} (${profile.healthScore}/100), ${profile.rows} rows, ${profile.duplicateRows} duplicate rows. Columns — ${cols}. Issues — ${issues}.`.slice(0, 4000);
}
