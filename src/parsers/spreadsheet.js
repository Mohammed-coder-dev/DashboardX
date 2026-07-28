import path from "path";
import * as XLSX from "xlsx";
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

  const rows    = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }).map(normalizeDates);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns, sheetName, sheets, totalRows: rows.length, fileType: "spreadsheet", isTabular: true };
}
