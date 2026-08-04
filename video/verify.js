// Recomputes every figure the video states out loud, from the file the video
// claims it came from, and fails on any disagreement.
//
// The video's whole argument is that numbers must be computed rather than
// asserted. Hard-coding 4.04 into a narration script and never checking it
// again would be the same failure it accuses other tools of — so this runs in
// the same breath as the build.
//
// Usage:  node video/verify.js

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COLD_OPEN_FACTS, SCENES } from "./script.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

const csv = await readFile(path.join(repo, COLD_OPEN_FACTS.source), "utf8");
const lines = csv.trim().split(/\r?\n/);
const header = lines[0].split(",").map((h) => h.trim());
const idx = header.indexOf(COLD_OPEN_FACTS.column);
if (idx === -1) throw new Error(`column "${COLD_OPEN_FACTS.column}" not in ${COLD_OPEN_FACTS.source}`);

const cells = lines.slice(1).map((l) => (l.split(",")[idx] ?? "").trim());

// The honest reading: blanks are absences, excluded from the sample.
const observed = cells.filter((c) => c !== "" && Number.isFinite(Number(c))).map(Number);
// The failure being dramatised: Number("") === 0, so a gap becomes a datum.
const naive = cells.map((c) => Number(c) || 0);

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round2 = (x) => Math.round(x * 100) / 100;

const actual = {
  rows: cells.length,
  blanks: cells.filter((c) => c === "").length,
  n: observed.length,
  trueMean: round2(mean(observed)),
  naiveMean: round2(mean(naive)),
};

// The cold open also corrects a fabricated correlation with a real one.
const [xName, yName] = COLD_OPEN_FACTS.corrPair;
const xi = header.indexOf(xName);
const yi = header.indexOf(yName);
if (xi === -1 || yi === -1) throw new Error(`correlation columns not in ${COLD_OPEN_FACTS.source}`);

// Pairwise-complete, matching the product's own rule: a row contributes only
// when both of its values are present.
const pairs = lines
  .slice(1)
  .map((l) => l.split(","))
  .map((c) => [(c[xi] ?? "").trim(), (c[yi] ?? "").trim()])
  .filter(([a, b]) => a !== "" && b !== "" && Number.isFinite(Number(a)) && Number.isFinite(Number(b)))
  .map(([a, b]) => [Number(a), Number(b)]);

const pearson = (xs, ys) => {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
};

// Fractional ranks, ties averaged — the standard definition, and the one that
// makes Spearman equal to Pearson-on-ranks.
const ranks = (xs) => {
  const order = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const shared = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = shared;
    i = j + 1;
  }
  return out;
};

const xs = pairs.map((p) => p[0]);
const ys = pairs.map((p) => p[1]);
actual.corrN = pairs.length;
actual.corrPearson = round2(pearson(xs, ys));
actual.corrSpearman = round2(pearson(ranks(xs), ranks(ys)));

const failures = [];
for (const [key, expected] of Object.entries(COLD_OPEN_FACTS)) {
  if (key === "source" || key === "column" || key === "corrPair") continue;
  if (actual[key] !== expected) {
    failures.push(`  ${key}: script.js says ${expected}, ${COLD_OPEN_FACTS.source} says ${actual[key]}`);
  }
}

// The narration speaks the figures aloud; a mismatch there is just as wrong as
// one in the data block.
const spoken = SCENES.find((s) => s.id === "01-cold-open").narration;
const mustSay = [
  [`${COLD_OPEN_FACTS.blanks} blank`, /ten blank/i],
  [`${COLD_OPEN_FACTS.rows} rows`, /ninety-one rows/i],
  [`naive mean ${COLD_OPEN_FACTS.naiveMean}`, /three point six/i],
  [`true mean ${COLD_OPEN_FACTS.trueMean}`, /four point oh/i],
];
for (const [label, re] of mustSay) {
  if (!re.test(spoken)) failures.push(`  narration no longer states: ${label}`);
}

console.log(`checked ${COLD_OPEN_FACTS.source} · column "${COLD_OPEN_FACTS.column}"`);
console.table(actual);

if (failures.length) {
  console.error("\n✗ the video states figures the data does not support:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("\n✓ every figure the video states is reproducible from the sample file");
