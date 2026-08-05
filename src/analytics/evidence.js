// Deterministic evidence engine.
//
// Every material finding is expressed as a structured evidence object rather
// than prose: what is claimed, the metric behind it, which columns it rests
// on, how it was computed, how many observations support it, what share of
// the dataset that is, how strong it is, and what should temper it. The
// language model may explain these objects; it never manufactures them.
import { computeCorrelations } from "./correlations.js";
import { toDate } from "./dates.js";
import { coveragePct, isMissing, round, toFiniteNumber } from "./values.js";
import { attachEvidenceProvenance } from "./provenance.js";
import { categoricalAssociation, detectLevelShift, welchMeanDifference } from "./inference.js";

/**
 * Bumped when evidence computation changes meaning, not just wording.
 *
 * 1.2.0 — structural inference changed what an observation *is*. A preamble or
 * aggregate row that used to enter every statistic is now excluded from all of
 * them, so evidence computed by 1.1.0 over the same file can legitimately
 * differ from evidence computed by this version.
 *
 * 1.3.0 — numbers written in a spreadsheet's own formatting (`$48,000`,
 * `12.5%`, `(1,200)`) are now read as numbers. A currency column that produced
 * no evidence at all under 1.2.0 produces evidence here, and a column that
 * reported a mean over only the cells without separators now reports it over
 * the whole column.
 */
export const EVIDENCE_ENGINE_VERSION = "1.3.0";
/**
 * Version of the saved/exported analysis payload shape.
 *
 * 2.7 — `meta.structure` carries the header row, the observation count and
 * every excluded or restored row. Absent on payloads written before 2.7, where
 * it means the question was never asked, not that nothing was excluded.
 *
 * 2.8 — `meta.structure.unapplied` records corrections that matched nothing,
 * and a numeric column carries `formats` naming the notation it was read
 * through. Both are present only when they have something to say.
 */
export const ANALYSIS_SCHEMA_VERSION = "2.8";

const MAX_EVIDENCE = 20;
const MIN_GROUP = 3;
const MAX_GROUPS = 6;
const MAX_ASSOCIATION_COLUMNS = 12;

function evidenceObject({ claim, metric, columns, method, sampleSize, coverage, strength, caveat = null, value = null, statistics = null, provenanceContext = null }) {
  return {
    claim,
    metric,
    value,
    columns,
    method,
    sampleSize,
    coverage,
    strength,
    caveat,
    statistics,
    engineVersion: EVIDENCE_ENGINE_VERSION,
    ...(provenanceContext ? { _provenanceContext: provenanceContext } : {}),
  };
}

/** Cohen's-d-style standardized difference between two samples. */
function effectSize(meanA, meanB, stdPooled) {
  if (stdPooled === 0) return null;
  return (meanA - meanB) / stdPooled;
}

function effectStrength(d) {
  const magnitude = Math.abs(d);
  if (magnitude >= 1.2) return "very strong";
  if (magnitude >= 0.8) return "strong";
  if (magnitude >= 0.5) return "moderate";
  if (magnitude >= 0.2) return "weak";
  return "negligible";
}

function meanAndStd(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { n, mean, std: Math.sqrt(variance) };
}

/** Correlation evidence, optionally focused on pairs involving the target. */
function correlationEvidence(rows, columns, stats, target) {
  const options = target ? { minReported: 0.1, limit: 30 } : {};
  const correlations = computeCorrelations(rows, columns, stats, options);
  const relevant = target
    ? correlations.filter((c) => c.columnA === target || c.columnB === target)
    : correlations;
  return relevant.map((c) => {
    const direction = c.coefficient > 0 ? "rise together" : "move in opposite directions";
    return evidenceObject({
      claim: `${c.columnA} and ${c.columnB} ${direction} (${c.method} ${c.coefficient >= 0 ? "+" : ""}${c.coefficient})`,
      metric: c.method === "pearson" ? "pearson_r" : "spearman_rho",
      value: c.coefficient,
      columns: [c.columnA, c.columnB],
      method: `${c.method} correlation, pairwise-complete observations`,
      sampleSize: c.n,
      coverage: c.coverage,
      strength: c.strength,
      caveat: c.caveat,
    });
  });
}

/** Mean of a numeric target per level of a categorical column. */
function groupComparisonEvidence(rows, target, stats, categoricalColumn) {
  const groups = [];
  const levels = (stats[categoricalColumn]?.top ?? []).slice(0, MAX_GROUPS);
  for (const level of levels) {
    const values = [];
    for (const row of rows) {
      if (isMissing(row?.[categoricalColumn])) continue;
      if (String(row[categoricalColumn]) !== level.value) continue;
      const v = toFiniteNumber(row?.[target]);
      if (v !== null) values.push(v);
    }
    if (values.length >= MIN_GROUP) groups.push({ level: level.value, ...meanAndStd(values), values });
  }
  if (groups.length < 2) return null;

  // Compare the highest-mean and lowest-mean groups; ties break on level name.
  const ordered = [...groups].sort((a, b) => (b.mean - a.mean) || a.level.localeCompare(b.level));
  const top = ordered[0];
  const bottom = ordered[ordered.length - 1];
  const pooledStd = Math.sqrt(
    (top.n * top.std ** 2 + bottom.n * bottom.std ** 2) / (top.n + bottom.n),
  );
  const d = effectSize(top.mean, bottom.mean, pooledStd);
  if (d === null || Math.abs(d) < 0.2) return null;

  const sampleSize = groups.reduce((s, g) => s + g.n, 0);
  const caveats = [];
  if (top.n <= 8 || bottom.n <= 8) caveats.push(`small groups (${bottom.n} and ${top.n} observations)`);
  return evidenceObject({
    claim: `${target} averages ${round(top.mean, 2)} for ${categoricalColumn}=${top.level} vs ${round(bottom.mean, 2)} for ${categoricalColumn}=${bottom.level}`,
    metric: "group_mean_difference",
    value: round(d, 3),
    columns: [target, categoricalColumn],
    method: `group means over ${groups.length} levels, standardized difference (Cohen's d) between extremes`,
    sampleSize,
    coverage: coveragePct(sampleSize, rows.length),
    strength: effectStrength(d),
    caveat: caveats.length ? caveats.join("; ") : null,
    statistics: {
      effectSize: round(d, 4),
      welch: welchMeanDifference(bottom.values, top.values),
      exploratory: true,
      multipleComparisonCorrection: "none",
    },
    provenanceContext: { retainedLevels: groups.map((group) => group.level) },
  });
}

function associationStrength(value) {
  if (value >= 0.5) return "strong";
  if (value >= 0.3) return "moderate";
  if (value >= 0.1) return "weak";
  return "negligible";
}

/** Pairwise categorical associations using chi-square and Cramér's V. */
function categoricalAssociationEvidence(rows, columns, stats, target) {
  let candidates = columns.filter((column) => stats[column]?.type === "categorical"
    && stats[column].role === "category" && stats[column].unique >= 2);
  if (target && candidates.includes(target)) candidates = [target, ...candidates.filter((column) => column !== target)];
  candidates = candidates.slice(0, MAX_ASSOCIATION_COLUMNS);
  const out = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex++) {
      const columnA = candidates[leftIndex];
      const columnB = candidates[rightIndex];
      if (target && columnA !== target && columnB !== target) continue;
      const association = categoricalAssociation(rows, columnA, columnB);
      if (!association || association.cramersV < 0.1) continue;
      const caveats = ["exploratory pairwise test; p-value is not adjusted for multiple comparisons"];
      if (association.sparse) caveats.push(`sparse contingency table (minimum expected count ${association.expectedMin})`);
      if (association.pValue >= 0.05) caveats.push("not statistically distinguishable from independence at the 5% level");
      out.push(evidenceObject({
        claim: `${columnA} and ${columnB} have ${associationStrength(association.cramersV)} categorical association (Cramér's V ${association.cramersV})`,
        metric: "cramers_v",
        value: association.cramersV,
        columns: [columnA, columnB],
        method: "chi-square contingency test with Cramér's V effect size",
        sampleSize: association.n,
        coverage: coveragePct(association.n, rows.length),
        strength: associationStrength(association.cramersV),
        caveat: caveats.join("; "),
        statistics: association,
      }));
    }
  }
  return out;
}

/** Does the target differ where another column is missing vs present? */
function missingnessImpactEvidence(rows, target, column) {
  const whenMissing = [];
  const whenPresent = [];
  for (const row of rows) {
    const targetValue = toFiniteNumber(row?.[target]);
    if (targetValue === null) continue;
    (isMissing(row?.[column]) ? whenMissing : whenPresent).push(targetValue);
  }
  if (whenMissing.length < MIN_GROUP || whenPresent.length < MIN_GROUP) return null;

  const missing = meanAndStd(whenMissing);
  const present = meanAndStd(whenPresent);
  const pooledStd = Math.sqrt(
    (missing.n * missing.std ** 2 + present.n * present.std ** 2) / (missing.n + present.n),
  );
  const d = effectSize(missing.mean, present.mean, pooledStd);
  if (d === null || Math.abs(d) < 0.3) return null;

  const sampleSize = missing.n + present.n;
  return evidenceObject({
    claim: `rows missing ${column} average ${round(missing.mean, 2)} ${target}, vs ${round(present.mean, 2)} when ${column} is present`,
    metric: "missingness_mean_difference",
    value: round(d, 3),
    columns: [target, column],
    method: "mean comparison between missing/present partitions, standardized difference",
    sampleSize,
    coverage: coveragePct(sampleSize, rows.length),
    strength: effectStrength(d),
    caveat: `missingness may be structural rather than causal; ${missing.n} rows lack ${column}`,
  });
}

/** Minimum non-missing values before a distribution is worth reporting. */
const MIN_DISTRIBUTION_SAMPLE = 8;
/** Below this coverage a distribution describes a sliver, not the dataset. */
const MIN_DISTRIBUTION_COVERAGE = 25;

const STRENGTH_LADDER = ["very strong", "strong", "moderate", "weak", "negligible"];

/**
 * Weaken a strength rating by `steps` rungs. Used where a headline number is
 * real but rests on a small or unrepresentative slice — a level holding 100% of
 * six values in a 93%-empty column is not a strong finding about the dataset.
 */
function weaken(strength, steps) {
  const index = STRENGTH_LADDER.indexOf(strength);
  if (index === -1 || steps <= 0) return strength;
  return STRENGTH_LADDER[Math.min(STRENGTH_LADDER.length - 1, index + steps)];
}

/** Share of the leading level for prominent categorical columns. */
function distributionEvidence(rows, columns, stats, target) {
  const out = [];
  const candidates = target ? [target] : columns;
  for (const column of candidates) {
    const s = stats[column];
    if (s?.type !== "categorical" || s.role !== "category" || !s.top?.length) continue;
    // A mostly-empty column has no distribution worth claiming.
    if (s.validCount < MIN_DISTRIBUTION_SAMPLE || s.coverage < MIN_DISTRIBUTION_COVERAGE) continue;
    const leader = s.top[0];
    if (leader.percentage < 20) continue;

    const base = leader.percentage >= 60 ? "strong" : leader.percentage >= 35 ? "moderate" : "weak";
    // Coverage bounds confidence: the share is exact, but it only describes the
    // rows that actually had a value.
    const strength = weaken(base, s.coverage < 50 ? 2 : s.coverage < 80 ? 1 : 0);
    const levels = `${s.unique} level${s.unique === 1 ? "" : "s"}`;

    out.push(evidenceObject({
      claim: `${column} is dominated by "${leader.value}" (${leader.percentage}% of ${s.validCount} values across ${levels})`,
      metric: "category_share",
      value: leader.percentage,
      columns: [column],
      method: "frequency count over non-missing values",
      sampleSize: s.validCount,
      coverage: s.coverage,
      strength,
      caveat: s.missing > 0
        ? `${s.missing} of ${rows.length} rows have no ${column}, so this describes ${s.coverage}% of the data`
        : null,
    }));
  }
  return out;
}

/** Chronological evidence: target trend over a date column, or event volume. */
function dateEvidence(rows, columns, stats, target) {
  const dateColumn = columns.find((c) => stats[c]?.type === "date" && stats[c].validCount >= 6);
  if (!dateColumn) return [];
  const out = [];
  const dateStats = stats[dateColumn];

  if (dateStats.trend && dateStats.trend !== "flat") {
    out.push(evidenceObject({
      claim: `activity by ${dateColumn} is ${dateStats.trend} across ${dateStats.periods.length} ${dateStats.granularity} periods (${dateStats.earliest} to ${dateStats.latest})`,
      metric: "period_volume_trend",
      value: dateStats.trend,
      columns: [dateColumn],
      method: `row counts bucketed by ${dateStats.granularity}, first-third vs last-third comparison`,
      sampleSize: dateStats.validCount,
      coverage: dateStats.coverage,
      strength: "moderate",
      caveat: dateStats.gaps.length ? `${dateStats.gaps.length} empty ${dateStats.granularity} period(s) in the range` : null,
    }));
  }

  if (dateStats.periodOverPeriod && dateStats.periodOverPeriod.changePct !== null) {
    const p = dateStats.periodOverPeriod;
    out.push(evidenceObject({
      claim: `${p.current} has ${p.currentCount} rows vs ${p.previousCount} in ${p.previous} (${p.changePct >= 0 ? "+" : ""}${p.changePct}%)`,
      metric: "period_over_period_change",
      value: p.changePct,
      columns: [dateColumn],
      method: `row counts for the two most recent ${p.granularity} periods`,
      sampleSize: p.currentCount + p.previousCount,
      coverage: coveragePct(p.currentCount + p.previousCount, rows.length),
      strength: Math.abs(p.changePct) >= 50 ? "strong" : Math.abs(p.changePct) >= 20 ? "moderate" : "weak",
      caveat: "the latest period may be incomplete",
      provenanceContext: { periods: [p.previous, p.current], granularity: p.granularity },
    }));
  }

  // With a numeric target: does the target move with time?
  if (target && stats[target]?.type === "numeric") {
    const pairs = [];
    for (const row of rows) {
      const value = toFiniteNumber(row?.[target]);
      if (value === null) continue;
      const date = toDate(row?.[dateColumn]);
      if (date === null) continue;
      pairs.push({ time: date.getTime(), value });
    }
    if (pairs.length >= 6) {
      const ordered = pairs.map((p, i) => ({ order: i, ...p })).sort((a, b) => a.time - b.time || a.order - b.order);
      const trendRows = ordered.map((p, i) => ({ t: i, v: p.value }));
      const [trend] = computeCorrelations(trendRows, ["t", "v"], { t: { type: "numeric" }, v: { type: "numeric" } }, { minReported: 0.3, limit: 1 });
      if (trend) {
        out.push(evidenceObject({
          claim: `${target} ${trend.coefficient > 0 ? "increases" : "decreases"} over ${dateColumn} (${trend.method} ${trend.coefficient >= 0 ? "+" : ""}${trend.coefficient})`,
          metric: "target_time_trend",
          value: trend.coefficient,
          columns: [target, dateColumn],
          method: `${trend.method} correlation of ${target} against chronological order`,
          sampleSize: trend.n,
          coverage: coveragePct(trend.n, rows.length),
          strength: trend.strength,
          caveat: trend.caveat,
        }));
      }
      const shift = detectLevelShift(ordered.map((point) => point.value));
      if (shift) {
        const boundary = new Date(ordered[shift.splitIndex].time).toISOString().slice(0, 10);
        out.push(evidenceObject({
          claim: `${target} has a candidate level shift near ${boundary} (median ${shift.baselineMedian} to ${shift.currentMedian})`,
          metric: "candidate_level_shift",
          value: shift.robustEffect,
          columns: [target, dateColumn],
          method: "robust split scan using segment medians and global median absolute deviation",
          sampleSize: ordered.length,
          coverage: coveragePct(ordered.length, rows.length),
          strength: effectStrength(shift.robustEffect),
          caveat: "exploratory candidate selected after scanning possible splits; the reported Welch interval and p-value are unadjusted and require confirmation",
          statistics: { ...shift, boundary },
        }));
      }
    }
  }
  return out;
}

/** Outlier evidence for numeric columns, target first. */
function anomalyEvidence(rows, columns, stats, target) {
  const ordered = target ? [target, ...columns.filter((c) => c !== target)] : columns;
  const out = [];
  for (const column of ordered) {
    const s = stats[column];
    if (s?.type !== "numeric" || !s.outliers?.applied || s.outliers.count === 0) continue;
    out.push(evidenceObject({
      claim: `${column} has ${s.outliers.count} value(s) outside the IQR fences (${round(s.outliers.lowerFence, 2)} to ${round(s.outliers.upperFence, 2)})`,
      metric: "iqr_outliers",
      value: s.outliers.count,
      columns: [column],
      method: "interquartile-range fences at 1.5×IQR",
      sampleSize: s.validCount,
      coverage: s.coverage,
      strength: s.outliers.count / s.validCount >= 0.05 ? "moderate" : "weak",
      caveat: "outliers may be data errors or genuine extremes; inspect before removing",
    }));
    if (out.length >= 3) break;
  }
  return out;
}

const STRENGTH_ORDER = { "very strong": 0, strong: 1, moderate: 2, weak: 3, negligible: 4 };

/**
 * Build the evidence list for a dataset, optionally centred on a target column.
 *
 * Deterministic: same rows, columns, stats and target produce the same list in
 * the same order.
 */
export function buildEvidence(rows, columns, stats, { target = null, limit = MAX_EVIDENCE } = {}) {
  if (!rows.length || !columns.length) return [];
  const evidence = [...correlationEvidence(rows, columns, stats, target)];

  if (target && stats[target]?.type === "numeric") {
    for (const column of columns) {
      if (column === target) continue;
      if (stats[column]?.type === "categorical" && stats[column].role === "category") {
        const comparison = groupComparisonEvidence(rows, target, stats, column);
        if (comparison) evidence.push(comparison);
      }
      const missingness = missingnessImpactEvidence(rows, target, column);
      if (missingness) evidence.push(missingness);
    }
  }

  evidence.push(...categoricalAssociationEvidence(rows, columns, stats, target));
  evidence.push(...distributionEvidence(rows, columns, stats, target));
  evidence.push(...dateEvidence(rows, columns, stats, target));
  evidence.push(...anomalyEvidence(rows, columns, stats, target));

  const selected = evidence
    .sort((a, b) =>
      (STRENGTH_ORDER[a.strength] ?? 5) - (STRENGTH_ORDER[b.strength] ?? 5)
      || Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0)
      || a.claim.localeCompare(b.claim))
    .slice(0, limit);
  return attachEvidenceProvenance(selected, rows, stats);
}
