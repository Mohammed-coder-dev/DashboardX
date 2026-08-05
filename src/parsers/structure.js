// Structural inference over a raw spreadsheet grid.
//
// The rest of the engine is careful about what a *number* means. This module is
// careful about what a *row* means, and it runs before any statistic exists.
// It answers two questions — where the header actually starts, and which rows
// restate other rows instead of being observations of their own — and it
// answers them out loud.
//
// The reporting is not decoration. A row excluded from the statistics without
// the user being able to see it is the same class of defect as a row wrongly
// included: in both cases a number changes and nobody can audit why. So the
// report is built to be self-describing — `headerRow` and `excluded` between
// them fully determine which rows survived, which is why the caller
// reconstructs the data rows from the report rather than from a private field.
//
// Everything here is pure: a grid of cells in, a report out.
import { isMissing, toFiniteNumber } from "../analytics/values.js";

export const STRUCTURE_VERSION = "1.0.0";

/**
 * A header reaches roughly as far across as the data block beneath it. A title
 * in A1 of a three-column sheet reaches one column; a real header reaches all
 * three. That single signal separates the two cleanly, so detection gates on it
 * before looking at anything else.
 *
 * The measure is the row's *span* — how far right its last value sits — and not
 * how many cells it fills. Headers legitimately contain gaps: an unlabelled
 * index column is ordinary, and counting cells would read `["a", null, "a"]` as
 * a title and step straight over a real header.
 */
const HEADER_SPAN_THRESHOLD = 0.8;

/** Rows examined while looking for a header before giving up. */
const MAX_HEADER_SCAN = 25;

/**
 * Rows that must contribute before "equals the sum above" counts as evidence.
 * With a single contributing row, equalling the sum above is just equalling the
 * row above — a coincidence, not an aggregate.
 */
const MIN_SUM_CONTRIBUTORS = 2;

/** Rows below a candidate sampled when judging type contrast and width. */
const CONTRAST_SAMPLE = 10;

/** Longest excerpt kept for a preview cell in the report. */
const MAX_PREVIEW_CHARS = 60;

const AGGREGATE_LABEL = /^\s*(grand\s+)?(totals?|sub-?totals?|sums?|overall)\b/i;

function cellsOf(row) {
  return Array.isArray(row) ? row : [];
}

function presentCells(row) {
  return cellsOf(row).filter((cell) => !isMissing(cell));
}

/**
 * A row holding no values. `sheet_to_json` renders these as all-null arrays
 * rather than empty ones, so this tests contents, not length.
 */
export function isBlankRow(row) {
  return presentCells(row).length === 0;
}

const isBlank = isBlankRow;

function preview(row) {
  return presentCells(row).map((cell) => String(cell).trim().slice(0, MAX_PREVIEW_CHARS));
}

/** How far right the row's last value sits, counting from column 1. */
function span(row) {
  const cells = cellsOf(row);
  for (let index = cells.length - 1; index >= 0; index--) {
    if (!isMissing(cells[index])) return index + 1;
  }
  return 0;
}

/**
 * The width of the sheet's main data block, taken as the most common non-blank
 * row span. Ties break wide: a two-column table carrying a one-column title is
 * not a one-column table.
 */
function modalWidth(grid) {
  const counts = new Map();
  for (const row of grid) {
    const width = span(row);
    if (width === 0) continue;
    counts.set(width, (counts.get(width) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [width, count] of counts) {
    if (count > bestCount || (count === bestCount && width > best)) {
      best = width;
      bestCount = count;
    }
  }
  return best;
}

function rowsBelow(grid, index) {
  const out = [];
  for (let i = index + 1; i < grid.length && out.length < CONTRAST_SAMPLE; i++) {
    if (!isBlank(grid[i])) out.push(grid[i]);
  }
  return out;
}

function textualShare(cells) {
  if (cells.length === 0) return 0;
  return cells.filter((cell) => toFiniteNumber(cell) === null).length / cells.length;
}

/**
 * Score a candidate header row on the four signals that distinguish a header
 * from the data under it: how much of the block's width it fills, how much more
 * textual it is than what follows, how distinct its own cells are, and how
 * consistently the rows below agree on the block width.
 */
function scoreCandidate(grid, index, dataWidth) {
  const present = presentCells(grid[index]);
  const below = rowsBelow(grid, index);
  const belowCells = below.flatMap((row) => presentCells(row));

  const reach = dataWidth > 0 ? Math.min(1, span(grid[index]) / dataWidth) : 0;
  const distinct = present.length
    ? new Set(present.map((cell) => String(cell).trim().toLowerCase())).size / present.length
    : 0;
  const contrast = Math.max(0, textualShare(present) - textualShare(belowCells));
  const agreement = below.length
    ? below.filter((row) => span(row) === dataWidth).length / below.length
    : 0;

  return { index, reach, distinct, contrast, agreement, score: reach + distinct + contrast + agreement };
}

/**
 * Locate the header.
 *
 * The first non-blank row that fills the block's width is the header — that is
 * true of very nearly every real file, and second-guessing it would turn the
 * common case into a judgement call. Only when that row is *too narrow* to be a
 * header have we actually made a choice, and only then is the choice examined:
 * if the row we land on shows no type contrast with the rows beneath it, it
 * reads like data rather than a header, and we say we are unsure instead of
 * committing quietly.
 */
function findHeader(grid, dataWidth) {
  const limit = Math.min(grid.length, MAX_HEADER_SCAN);
  const candidates = [];
  for (let index = 0; index < limit; index++) {
    if (isBlank(grid[index])) continue;
    candidates.push(scoreCandidate(grid, index, dataWidth));
  }
  if (candidates.length === 0) return null;

  const viable = candidates.filter((candidate) => candidate.reach >= HEADER_SPAN_THRESHOLD);
  if (viable.length === 0) {
    const best = [...candidates].sort((a, b) => b.score - a.score || a.index - b.index)[0];
    return { chosen: best, certain: false, others: candidates.filter((c) => c !== best) };
  }

  const first = viable[0];
  // Reaching across the block is necessary but not sufficient. A title carrying
  // a date in the last column reaches exactly as far as the header beneath it,
  // so width alone cannot separate the two. What separates them is that such a
  // row does not *fill* the block, and scores worse on the header signals than
  // the row below it. Where a later candidate beats a sparse first choice,
  // prefer it — defaulting to the title is not neutral, only wrong in a
  // different way — and report the reading as unsettled either way.
  const sparse = presentCells(grid[first.index]).length < dataWidth;
  const better = sparse
    ? viable.find((candidate) => candidate.index > first.index && candidate.score > first.score)
    : null;

  const chosen = better || first;
  const steppedOver = chosen.index > candidates[0].index;
  // Ambiguity is only possible where a choice was made. If the first non-blank
  // row fills the width outright, it is the header and there is nothing to weigh.
  const certain = (!steppedOver || chosen.contrast > 0) && !better;
  return { chosen, certain, others: viable.filter((candidate) => candidate !== chosen) };
}

function aggregateLabel(row) {
  for (const cell of cellsOf(row)) {
    if (isMissing(cell)) continue;
    if (toFiniteNumber(cell) !== null) continue;
    const text = String(cell).trim();
    return AGGREGATE_LABEL.test(text) ? text : null;
  }
  return null;
}

function closeEnough(a, b) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 1e-9 * scale;
}

/**
 * Does this row restate the rows above it?
 *
 * Checked column by column against the rows that have not themselves been
 * flagged as aggregates. A single matching column among many is coincidence, so
 * the matching columns must be at least half of those that could be compared.
 * This is the one signal that finds an *unlabelled* total, which no keyword list
 * ever will.
 */
function arithmeticMatch(row, priors, columnNames) {
  const width = Math.max(cellsOf(row).length, ...priors.map((p) => cellsOf(p).length), 0);
  let comparable = 0;
  const matched = [];
  for (let column = 0; column < width; column++) {
    const value = toFiniteNumber(cellsOf(row)[column]);
    if (value === null) continue;
    const contributors = [];
    for (const prior of priors) {
      const n = toFiniteNumber(cellsOf(prior)[column]);
      if (n !== null) contributors.push(n);
    }
    if (contributors.length < MIN_SUM_CONTRIBUTORS) continue;
    comparable++;
    if (closeEnough(value, contributors.reduce((a, b) => a + b, 0))) {
      matched.push(columnNames[column] ?? `column ${column + 1}`);
    }
  }
  if (matched.length === 0 || matched.length * 2 < comparable) return null;
  return { matched, comparable };
}

function joinNames(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Classify each data row, in order, as an observation or an aggregate.
 *
 * Label and arithmetic are independent signals. Together they are conclusive.
 * Alone, in the last row, they are still strong — a trailing summary row is
 * what spreadsheets do. Alone, anywhere else, the row is genuinely ambiguous,
 * and it is excluded and flagged rather than quietly kept: wrongly keeping an
 * aggregate corrupts every statistic it touches and reports full coverage while
 * doing it, whereas wrongly excluding an observation costs one row and says so.
 */
function detectAggregates(grid, dataIndexes, columnNames) {
  const excluded = [];
  const kept = [];
  for (let position = 0; position < dataIndexes.length; position++) {
    const index = dataIndexes[position];
    const row = grid[index];
    const label = aggregateLabel(row);
    const arithmetic = arithmeticMatch(row, kept.map((i) => grid[i]), columnNames);
    const trailing = position === dataIndexes.length - 1;

    // Arithmetic is the evidence; the label is a naming convention. So the two
    // signals do not carry equal weight: arithmetic in the trailing position
    // settles the question on its own, whereas a trailing "Total" whose numbers
    // refuse to add up is exactly the case where a legitimate final category
    // gets mistaken for a summary. That row is still excluded — the asymmetry
    // has not changed — but it is excluded as an open question, not a finding.
    let confidence = null;
    if (label && arithmetic) confidence = "certain";
    else if (arithmetic) confidence = trailing ? "confident" : "uncertain";
    else if (label) confidence = "uncertain";

    if (!confidence) {
      kept.push(index);
      continue;
    }

    const contributors = kept.map((i) => i + 1);
    const detail = arithmetic
      ? `${joinNames(arithmetic.matched)} ${arithmetic.matched.length > 1 ? "equal" : "equals"} the sum of rows ${contributors[0]}–${contributors[contributors.length - 1]}`
      : `labelled "${label}"${trailing ? " in the final row" : ""}`;

    excluded.push({ row: index + 1, reason: "aggregate", confidence, detail, label: label ?? null, cells: preview(row) });
  }
  return { excluded, kept };
}

/**
 * Infer the structure of a raw grid.
 *
 * Overrides are corrections, not configuration: the caller re-submits the file
 * saying where the header really is, or which rows to put back. What they
 * override still travels in the report — a row the caller restored appears
 * under `restored`, so the result stays as auditable as the one inference
 * produced on its own.
 *
 * @param {Array<Array<unknown>>} grid rows of cells, in source order
 * @param {{headerRow?: number|null, includeRows?: number[]}} [overrides]
 * @returns {{
 *   headerRow: number|null, headerSource: "detected"|"specified",
 *   confidence: "none"|"confident"|"uncertain", observations: number,
 *   excluded: Array<object>, restored: Array<object>,
 *   alternatives: Array<object>, version: string,
 * }} 1-indexed to match what the user sees in their spreadsheet
 */
export function inferStructure(grid, overrides = {}) {
  const rows = Array.isArray(grid) ? grid : [];
  const empty = {
    headerRow: null, headerSource: "detected", confidence: "none", observations: 0,
    excluded: [], restored: [], alternatives: [], version: STRUCTURE_VERSION,
  };
  if (rows.length === 0) return empty;

  const specified = Number.isInteger(overrides.headerRow) && overrides.headerRow >= 1 && overrides.headerRow <= rows.length
    ? overrides.headerRow
    : null;
  const includeRows = new Set(Array.isArray(overrides.includeRows) ? overrides.includeRows : []);

  const dataWidth = modalWidth(rows);
  const header = specified === null
    ? findHeader(rows, dataWidth)
    : { chosen: { index: specified - 1 }, certain: true, others: [] };
  if (!header) return empty;

  const headerIndex = header.chosen.index;
  const columnNames = cellsOf(rows[headerIndex]).map((cell) => (isMissing(cell) ? "" : String(cell).trim()));

  // Non-blank rows above the header are a title block, not observations. Blank
  // rows are not reported: nothing is being set aside, there is nothing there.
  const excluded = [];
  for (let index = 0; index < headerIndex; index++) {
    if (isBlank(rows[index])) continue;
    excluded.push({
      row: index + 1,
      reason: "preamble",
      confidence: header.certain ? "confident" : "uncertain",
      detail: "above the header row",
      cells: preview(rows[index]),
    });
  }

  const dataIndexes = [];
  for (let index = headerIndex + 1; index < rows.length; index++) {
    if (!isBlank(rows[index])) dataIndexes.push(index);
  }

  // Only aggregates can be put back. A preamble row sits above the header, so
  // "include it as data" has no meaning — the correction for that is to say
  // where the header really is.
  const restored = [];
  for (const entry of detectAggregates(rows, dataIndexes, columnNames).excluded) {
    if (includeRows.has(entry.row)) restored.push({ ...entry, restoredBy: "caller" });
    else excluded.push(entry);
  }

  const uncertain = !header.certain || excluded.some((entry) => entry.confidence === "uncertain");
  const untouched = headerIndex === 0 && excluded.length === 0 && restored.length === 0 && specified === null;

  return {
    headerRow: headerIndex + 1,
    headerSource: specified === null ? "detected" : "specified",
    confidence: uncertain ? "uncertain" : untouched ? "none" : "confident",
    observations: dataIndexes.length - excluded.filter((entry) => entry.reason === "aggregate").length,
    excluded,
    restored,
    alternatives: header.certain ? [] : header.others.map((c) => ({ headerRow: c.index + 1, cells: preview(rows[c.index]) })),
    version: STRUCTURE_VERSION,
  };
}
