import { quantile, round } from "./values.js";

const LANCZOS = [
  0.9999999999998099, 676.5203681218851, -1259.1392167224028,
  771.3234287776531, -176.6150291621406, 12.5073432786869,
  -0.13857109526572, 9.98436957801957e-6, 1.50563273514931e-7,
];

function logGamma(z) {
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  let x = LANCZOS[0];
  const shifted = z - 1;
  for (let index = 1; index < LANCZOS.length; index++) x += LANCZOS[index] / (shifted + index);
  const t = shifted + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a, b, x) {
  const maxIterations = 200;
  const epsilon = 3e-12;
  const floor = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + aa / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + aa / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < epsilon) break;
  }
  return h;
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? factor * betaFraction(a, b, x) / a
    : 1 - factor * betaFraction(b, a, 1 - x) / b;
}

function studentTCdf(t, degreesFreedom) {
  if (!Number.isFinite(t) || degreesFreedom <= 0) return null;
  const x = degreesFreedom / (degreesFreedom + t * t);
  const tail = 0.5 * regularizedBeta(x, degreesFreedom / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

function studentTCritical(degreesFreedom, probability = 0.975) {
  let low = 0;
  let high = 20;
  // The bracket is widened until it actually contains the answer. It used to be
  // a fixed [0, 20], so any critical value above 20 came back as exactly 20 —
  // t(1) at 99% is 63.657, and the interval built from it was about three times
  // too narrow. 20 is a plausible-looking number, so nothing downstream could
  // tell it apart from a real one, and too narrow is the dangerous direction:
  // it claims the data pins the mean down harder than it does.
  for (let widening = 0; widening < 60 && studentTCdf(high, degreesFreedom) < probability; widening++) {
    low = high;
    high *= 2;
  }
  for (let iteration = 0; iteration < 80; iteration++) {
    const mid = (low + high) / 2;
    if (studentTCdf(mid, degreesFreedom) < probability) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function gammaQ(a, x) {
  if (x < 0 || a <= 0) return null;
  if (x === 0) return 1;
  const epsilon = 3e-12;
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    let ap = a;
    for (let index = 1; index <= 200; index++) {
      ap++;
      term *= x / ap;
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * epsilon) break;
    }
    const lower = sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    return Math.max(0, Math.min(1, 1 - lower));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let index = 1; index <= 200; index++) {
    const an = -index * (index - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const step = d * c;
    h *= step;
    if (Math.abs(step - 1) < epsilon) break;
  }
  return Math.max(0, Math.min(1, Math.exp(-x + a * Math.log(x) - logGamma(a)) * h));
}

function sampleSummary(values) {
  const n = values.length;
  if (!n) return { n: 0, mean: null, variance: null, std: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  return { n, mean, variance, std: Math.sqrt(variance) };
}

export function meanConfidenceInterval(values, confidence = 0.95) {
  const summary = sampleSummary(values);
  if (summary.n < 2) return null;
  const standardError = summary.std / Math.sqrt(summary.n);
  const critical = studentTCritical(summary.n - 1, 0.5 + confidence / 2);
  const margin = critical * standardError;
  return {
    method: "Student t interval for the mean",
    confidence,
    lower: round(summary.mean - margin),
    upper: round(summary.mean + margin),
    margin: round(margin),
    standardError: round(standardError),
    degreesFreedom: summary.n - 1,
  };
}

/** Welch comparison where difference is current minus baseline. */
export function welchMeanDifference(baseline, current, confidence = 0.95) {
  const before = sampleSummary(baseline);
  const after = sampleSummary(current);
  if (before.n < 2 || after.n < 2) return null;
  const difference = after.mean - before.mean;
  const beforeTerm = before.variance / before.n;
  const afterTerm = after.variance / after.n;
  const standardError = Math.sqrt(beforeTerm + afterTerm);
  if (standardError === 0) {
    return {
      baselineN: before.n, currentN: after.n,
      baselineMean: round(before.mean), currentMean: round(after.mean), difference: round(difference),
      standardError: 0, t: null, degreesFreedom: before.n + after.n - 2,
      pValue: null, confidenceInterval: null, significant: false, testable: false,
      method: "Welch two-sample t test",
    };
  }
  const degreesFreedom = (beforeTerm + afterTerm) ** 2
    / ((beforeTerm ** 2) / (before.n - 1) + (afterTerm ** 2) / (after.n - 1));
  const t = difference / standardError;
  const pValue = Math.max(0, Math.min(1, 2 * (1 - studentTCdf(Math.abs(t), degreesFreedom))));
  const critical = studentTCritical(degreesFreedom, 0.5 + confidence / 2);
  const margin = critical * standardError;
  return {
    baselineN: before.n,
    currentN: after.n,
    baselineMean: round(before.mean),
    currentMean: round(after.mean),
    difference: round(difference),
    standardError: round(standardError),
    t: round(t),
    degreesFreedom: round(degreesFreedom, 2),
    pValue: round(pValue, 6),
    confidenceInterval: { confidence, lower: round(difference - margin), upper: round(difference + margin) },
    significant: pValue < 1 - confidence,
    testable: true,
    method: "Welch two-sample t test",
  };
}

export function categoricalAssociation(rows, columnA, columnB) {
  const rowLevels = new Map();
  const columnLevels = new Map();
  const observations = [];
  for (const row of rows) {
    const a = row?.[columnA];
    const b = row?.[columnB];
    if (a === null || a === undefined || String(a).trim() === "" || b === null || b === undefined || String(b).trim() === "") continue;
    const left = String(a);
    const right = String(b);
    if (!rowLevels.has(left)) rowLevels.set(left, rowLevels.size);
    if (!columnLevels.has(right)) columnLevels.set(right, columnLevels.size);
    observations.push([left, right]);
  }
  const r = rowLevels.size;
  const c = columnLevels.size;
  const n = observations.length;
  if (n < 4 || r < 2 || c < 2) return null;
  const table = Array.from({ length: r }, () => Array(c).fill(0));
  const rowTotals = Array(r).fill(0);
  const columnTotals = Array(c).fill(0);
  for (const [left, right] of observations) {
    const i = rowLevels.get(left);
    const j = columnLevels.get(right);
    table[i][j]++;
    rowTotals[i]++;
    columnTotals[j]++;
  }
  let chiSquare = 0;
  let expectedMin = Infinity;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const expected = rowTotals[i] * columnTotals[j] / n;
      expectedMin = Math.min(expectedMin, expected);
      if (expected > 0) chiSquare += (table[i][j] - expected) ** 2 / expected;
    }
  }
  const degreesFreedom = (r - 1) * (c - 1);
  const denominator = Math.min(r - 1, c - 1);
  const v = denominator > 0 ? Math.sqrt(chiSquare / (n * denominator)) : 0;
  return {
    n, rows: r, columns: c, chiSquare: round(chiSquare), degreesFreedom,
    pValue: round(gammaQ(degreesFreedom / 2, chiSquare / 2), 6),
    cramersV: round(v), expectedMin: round(expectedMin), sparse: expectedMin < 5,
  };
}

export function kolmogorovSmirnov(baseline, current) {
  if (baseline.length < 4 || current.length < 4) return null;
  const a = [...baseline].sort((x, y) => x - y);
  const b = [...current].sort((x, y) => x - y);
  let i = 0;
  let j = 0;
  let statistic = 0;
  while (i < a.length || j < b.length) {
    const nextA = i < a.length ? a[i] : Infinity;
    const nextB = j < b.length ? b[j] : Infinity;
    const value = Math.min(nextA, nextB);
    while (i < a.length && a[i] <= value) i++;
    while (j < b.length && b[j] <= value) j++;
    statistic = Math.max(statistic, Math.abs(i / a.length - j / b.length));
  }
  if (statistic === 0) return { baselineN: a.length, currentN: b.length, statistic: 0, pValue: 1, significant: false, method: "two-sample KS, asymptotic p-value" };
  const effective = a.length * b.length / (a.length + b.length);
  const root = Math.sqrt(effective);
  const lambda = (root + 0.12 + 0.11 / root) * statistic;
  let pValue = 0;
  for (let k = 1; k <= 100; k++) {
    const term = 2 * (k % 2 ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda);
    pValue += term;
    if (Math.abs(term) < 1e-12) break;
  }
  pValue = Math.max(0, Math.min(1, pValue));
  return {
    baselineN: a.length, currentN: b.length, statistic: round(statistic),
    pValue: round(pValue, 6), significant: pValue < 0.05,
    method: "two-sample KS, asymptotic p-value",
  };
}

function median(values) {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

/** Exploratory robust split detector based on segment medians and global MAD. */
export function detectLevelShift(values, minSegment = 5) {
  if (values.length < Math.max(12, minSegment * 2)) return null;
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  const summary = sampleSummary(values);
  const scale = mad > 0 ? mad * 1.4826 : summary.std;
  if (!scale || !Number.isFinite(scale)) return null;
  let best = null;
  for (let splitIndex = minSegment; splitIndex <= values.length - minSegment; splitIndex++) {
    const before = values.slice(0, splitIndex);
    const after = values.slice(splitIndex);
    const baselineMedian = median(before);
    const currentMedian = median(after);
    const robustEffect = (currentMedian - baselineMedian) / scale;
    const balance = Math.sqrt(Math.min(before.length, after.length) / values.length);
    const score = Math.abs(robustEffect) * balance;
    if (!best || score > best.score) best = { splitIndex, baselineMedian, currentMedian, robustEffect, score, before, after };
  }
  if (!best || Math.abs(best.robustEffect) < 0.5) return null;
  const inference = welchMeanDifference(best.before, best.after);
  return {
    splitIndex: best.splitIndex,
    baselineMedian: round(best.baselineMedian),
    currentMedian: round(best.currentMedian),
    medianDifference: round(best.currentMedian - best.baselineMedian),
    robustEffect: round(best.robustEffect),
    score: round(best.score),
    inference,
    exploratory: true,
  };
}
