import path from "path";
import * as XLSX from "xlsx";

export function parseSpreadsheet(buffer, filename) {
  const ext      = path.extname(filename).toLowerCase();
  const input    = ext === ".csv" ? buffer.toString("utf-8") : buffer;
  const workbook = XLSX.read(input, { type: ext === ".csv" ? "string" : "buffer" });
  const sheetName = workbook.SheetNames[0];
  const rows     = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
  const columns  = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns, sheetName, totalRows: rows.length, fileType: "spreadsheet", isTabular: true };
}
