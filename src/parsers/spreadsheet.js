import path from "path";
import * as XLSX from "xlsx";
import { inferStructure, isBlankRow } from "./structure.js";
import { AppError } from "../errors.js";

// Excel serial dates arrive as Date objects (cellDates) and are normalized
// to ISO strings so stats/profile/charts see comparable values, not epochs.
function normalizeDates(row) {
  for (const key of Object.keys(row)) {
    const v = row[key];
    if (v instanceof Date && !isNaN(v)) {
      const iso = v.toISOString();
      row[key] = iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
    }
  }
  return row;
}

export function parseSpreadsheet(buffer, filename, sheet) {
  const ext      = path.extname(filename).toLowerCase();
  const input    = ext === ".csv" ? buffer.toString("utf-8") : buffer;
  const workbook = XLSX.read(input, { type: ext === ".csv" ? "string" : "buffer", cellDates: true });
  const sheets   = workbook.SheetNames;

  let sheetName = sheets[0];
  if (sheet) {
    if (!sheets.includes(sheet)) {
      throw new AppError(`No sheet named "${sheet}" — available: ${sheets.join(", ")}.`, { status: 400, code: "unknown_sheet" });
    }
    sheetName = sheet;
  }

  const worksheet = workbook.Sheets[sheetName];

  // Read the raw grid first. Going straight to object mode is what used to make
  // this wrong: it takes the first row as the header before anything has had a
  // chance to ask whether it is one.
  const grid = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, blankrows: true });
  const structure = inferStructure(grid);
  const headerIndex = structure.headerRow === null ? 0 : structure.headerRow - 1;

  // Object mode is still what builds the rows, now pointed at the header we
  // found. `range` keeps SheetJS's own column naming — duplicate headers, the
  // `__EMPTY` fallback, date coercion — rather than reimplementing it here, and
  // `range: 0` is byte-for-byte what this function did before.
  //
  // `blankrows` makes the mapping linear: entry j is grid row headerIndex+1+j,
  // which is what lets excluded rows be dropped by source row number.
  const objectRows = XLSX.utils.sheet_to_json(worksheet, { defval: null, range: headerIndex, blankrows: true });
  const excludedRows = new Set(structure.excluded.map((entry) => entry.row));

  const rows = [];
  for (let offset = 0; offset < objectRows.length; offset++) {
    const rowNumber = headerIndex + 2 + offset;
    if (excludedRows.has(rowNumber)) continue;
    if (isBlankRow(grid[rowNumber - 1])) continue;
    rows.push(normalizeDates(objectRows[offset]));
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns, sheetName, sheets, totalRows: rows.length, fileType: "spreadsheet", isTabular: true, structure };
}
