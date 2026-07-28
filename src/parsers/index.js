import path from "path";
import { parseSpreadsheet } from "./spreadsheet.js";
import { parseJSON, parseText } from "./structured.js";
import { parsePDF, parseOfficeFile } from "./document.js";

export const ALLOWED_EXTENSIONS = [".xlsx",".xls",".csv",".json",".txt",".md",".pdf",".pptx",".ppt",".docx",".doc"];

export function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if ([".xlsx",".xls",".csv"].includes(ext)) return "spreadsheet";
  if (ext === ".json")                        return "json";
  if ([".txt",".md"].includes(ext))           return "text";
  if (ext === ".pdf")                         return "pdf";
  if ([".pptx",".ppt"].includes(ext))         return "presentation";
  if ([".docx",".doc"].includes(ext))         return "document";
  return "unknown";
}

export async function parseFile(file) {
  const fileType = getFileType(file.originalname);
  switch (fileType) {
    case "spreadsheet": return parseSpreadsheet(file.buffer, file.originalname);
    case "json":        return parseJSON(file.buffer);
    case "text":        return parseText(file.buffer);
    case "pdf":         return await parsePDF(file.buffer);
    case "presentation":
    case "document":    return await parseOfficeFile(file.buffer, file.originalname, fileType);
    default:            throw new Error(`Unsupported file type: ${file.originalname}`);
  }
}
