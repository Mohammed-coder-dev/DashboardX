import path from "path";
import * as XLSX from "xlsx";
import { inferStructure, isBlankRow } from "./structure.js";
import { AppError } from "../errors.js";

// Excel serial dates arrive as Date objects (cellDates) and are normalized to
// ISO strings so stats/profile/charts see comparable values, not epochs.
//
// A spreadsheet date has no timezone: a cell formatted 2024-01-01 means that
// calendar day and nothing else. SheetJS decodes the serial into calendar
// components and builds the Date in local time, so local getters read back
// exactly what the workbook said. Going through toISOString() instead
// reinterpreted that instant as UTC and moved it across midnight — a real
// workbook storing serial 45292 (2024-01-01) was reported as "2023-12-31
// 20:00" east of UTC, turning a date into a wrong datetime. That never showed
// up because the only fixture wrote its cells through SheetJS on the same
// machine, which encodes the local offset into the serial and cancels the
// error on the way back.
const pad = (value) => String(value).padStart(2, "0");

function localStamp(value) {
  const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const hasTime = value.getHours() || value.getMinutes() || value.getSeconds();
  return hasTime ? `${day} ${pad(value.getHours())}:${pad(value.getMinutes())}` : day;
}

function normalizeDates(row) {
  for (const key of Object.keys(row)) {
    const v = row[key];
    if (v instanceof Date && !isNaN(v)) row[key] = localStamp(v);
  }
  return row;
}

export function parseSpreadsheet(buffer, filename, sheet, overrides = {}) {
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
  const structure = inferStructure(grid, overrides);
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
