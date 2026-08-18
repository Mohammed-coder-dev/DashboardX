// Date parsing and chronological profiling.
//
// Kept separate from `stats.js` because "is this a date column, and what does
// its timeline look like" is a different question from descriptive statistics,
// and because bare `new Date(string)` is too permissive to use directly:
// `new Date("7")` parses, and so does any loose numeric string. Parsing here is
// pattern-gated first, so a column of small integers is never read as a
// timeline.
import { coveragePct, isMissing } from "./values.js";

const DATE_PATTERNS = [
  /^\d{4}-\d{1,2}-\d{1,2}([T ].*)?$/,          // 2024-01-31, ISO datetime
  /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/,       // 12/31/2024, 31-12-24
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}$/i,
  /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}$/i,
];

const MS_PER_DAY = 86_400_000;

/** Carries its own zone, so it names an absolute instant, not a wall clock. */
const EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
/** ISO date with no time part — the language already reads this one as UTC. */
const ISO_DATE_ONLY = /^\d{4}-\d{1,2}-\d{1,2}$/;

/**
 * Re-read a locally-parsed wall clock in the UTC frame.
 *
 * Built through a leap-year placeholder and an explicit `setUTCFullYear`
 * because `Date.UTC(24, …)` means 1924: a year under 100 would otherwise be
 * silently moved to the twentieth century.
 */
function asUtcWallClock(parsed) {
  const shifted = new Date(Date.UTC(
    2000, parsed.getMonth(), parsed.getDate(),
    parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds(),
  ));
  shifted.setUTCFullYear(parsed.getFullYear());
  return Number.isFinite(shifted.getTime()) ? shifted : null;
}

/**
 * Parse a cell into a Date, or null when it is not recognisably a date.
 *
 * Every shape lands in one frame. JavaScript does not do this on its own:
 * `2024-03-01` is read as UTC midnight, while `03/01/2024`, `Jan 5, 2024` and
 * `2024-03-01 00:30` are read as midnight *in the machine's zone*. Everything
 * downstream formats with `toISOString()`, so east of UTC a US-format date came
 * back as the day before — `03/01/2024` reported as 2024-02-29 in `earliest`,
 * `latest`, every period bucket and every evidence claim quoting them, and a
 * spreadsheet's own `2024-03-01 00:30` reported against February. The same file
 * therefore read differently on a machine in Dubai and on one in London, which
 * a module documented as pure and deterministic must not do.
 *
 * A spreadsheet date has no timezone: the cell means that calendar day. So the
 * naive shapes are re-read in the UTC frame, where the calendar components that
 * come back out are the ones the cell wrote. A value carrying an explicit `Z`
 * or offset is an absolute instant and is left exactly where it is — re-basing
 * it would move it.
 */
export function toDate(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (isMissing(value)) return null;
  // Numbers are not treated as dates: Excel serials are ambiguous with ordinary
  // measurements, and guessing produces timelines that were never in the data.
  if (typeof value === "number" || typeof value === "boolean") return null;
  const str = String(value).trim();
  if (!DATE_PATTERNS.some((re) => re.test(str))) return null;
  const parsed = new Date(str);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (ISO_DATE_ONLY.test(str) || EXPLICIT_ZONE.test(str)) return parsed;
  return asUtcWallClock(parsed);
}

export function looksLikeDateColumn(rawValues) {
  let present = 0;
  let dates = 0;
  for (const value of rawValues) {
    if (isMissing(value)) continue;
    present++;
    if (toDate(value) !== null) dates++;
  }
  return present > 0 && dates / present >= 0.8;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function bucketKey(date, granularity) {
  const iso = date.toISOString();
  if (granularity === "day") return iso.slice(0, 10);
  if (granularity === "month") return iso.slice(0, 7);
  return iso.slice(0, 4);
}

/** Pick a bucket size that yields a readable number of periods. */
function chooseGranularity(rangeDays) {
  if (rangeDays <= 92) return "day";
  if (rangeDays <= 1100) return "month";
  return "year";
}

function describeTrend(buckets) {
  if (buckets.length < 3) return null;
  // Compare the mean of the first and last thirds rather than just endpoints,
  // so one unusual period does not decide the direction.
  const third = Math.max(1, Math.floor(buckets.length / 3));
  const head = buckets.slice(0, third);
  const tail = buckets.slice(-third);
  const avg = (list) => list.reduce((s, b) => s + b.count, 0) / list.length;
  const first = avg(head);
  const last = avg(tail);
  if (first === 0) return last > 0 ? "increasing" : "flat";
  const change = (last - first) / first;
  if (change >= 0.15) return "increasing";
  if (change <= -0.15) return "decreasing";
  return "flat";
}

/**
 * Full chronological profile for a column of dates.
 *
 * `rawValues` is the column as read; `totalRows` is the dataset row count so
 * coverage is reported against the whole table, not just parsed rows.
 */
export function profileDates(rawValues, totalRows = rawValues.length) {
  const total = rawValues.length;
  let missing = 0;
  const dates = [];
  for (const value of rawValues) {
    if (isMissing(value)) { missing++; continue; }
    const date = toDate(value);
    if (date === null) continue;
    dates.push(date);
  }
  const validCount = dates.length;
  const present = total - missing;
  const invalid = present - validCount;

  const base = {
    validCount,
    missing,
    invalid,
    coverage: coveragePct(validCount, totalRows),
    earliest: null,
    latest: null,
    rangeDays: null,
    granularity: null,
    periods: [],
    trend: null,
    periodOverPeriod: null,
    gaps: [],
    irregularIntervals: false,
  };
  if (validCount === 0) return base;

  const sorted = [...dates].sort((a, b) => a - b);
  const earliest = sorted[0];
  const latest = sorted[sorted.length - 1];
  const rangeDays = Math.round((latest - earliest) / MS_PER_DAY);
  const granularity = chooseGranularity(rangeDays);

  const counts = new Map();
  for (const date of sorted) {
    const key = bucketKey(date, granularity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const periods = [...counts.entries()]
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period.localeCompare(b.period));

  // Period-over-period on the two most recent buckets that both exist.
  let periodOverPeriod = null;
  if (periods.length >= 2) {
    const current = periods[periods.length - 1];
    const previous = periods[periods.length - 2];
    const delta = current.count - previous.count;
    periodOverPeriod = {
      granularity,
      current: current.period,
      currentCount: current.count,
      previous: previous.period,
      previousCount: previous.count,
      delta,
      changePct: previous.count === 0 ? null : +((delta / previous.count) * 100).toFixed(1),
    };
  }

  // Gaps: buckets with no observations between the first and last populated one.
  const gaps = [];
  if (granularity !== "year" && periods.length >= 2) {
    const populated = new Set(periods.map((p) => p.period));
    const cursor = new Date(earliest.getTime());
    const end = latest.getTime();
    let guard = 0;
    while (cursor.getTime() <= end && guard++ < 5000) {
      const key = bucketKey(cursor, granularity);
      if (!populated.has(key)) gaps.push(key);
      if (granularity === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  // Irregular spacing: compare the spread of consecutive gaps to their median.
  let irregularIntervals = false;
  if (sorted.length >= 4) {
    const deltas = [];
    for (let i = 1; i < sorted.length; i++) deltas.push((sorted[i] - sorted[i - 1]) / MS_PER_DAY);
    const ascending = [...deltas].sort((a, b) => a - b);
    const median = ascending[Math.floor(ascending.length / 2)];
    const max = ascending[ascending.length - 1];
    irregularIntervals = median > 0 && max > median * 5;
  }

  return {
    ...base,
    earliest: isoDay(earliest),
    latest: isoDay(latest),
    rangeDays,
    granularity,
    periods: periods.slice(0, 60),
    trend: describeTrend(periods),
    periodOverPeriod,
    gaps: gaps.slice(0, 20),
    irregularIntervals,
  };
}
