import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import * as XLSX from "xlsx";
import { getFileType, parseFile } from "../src/parsers/index.js";
import { parseSpreadsheet } from "../src/parsers/spreadsheet.js";
import { parseJSON, parseText, flattenObject } from "../src/parsers/structured.js";
import { parseOfficeFile } from "../src/parsers/document.js";
import { AppError } from "../src/errors.js";

describe("getFileType", () => {
  it("maps extensions to file types", () => {
    expect(getFileType("a.xlsx")).toBe("spreadsheet");
    expect(getFileType("a.XLS")).toBe("spreadsheet");
    expect(getFileType("a.csv")).toBe("spreadsheet");
    expect(getFileType("a.json")).toBe("json");
    expect(getFileType("a.md")).toBe("text");
    expect(getFileType("a.pdf")).toBe("pdf");
    expect(getFileType("a.pptx")).toBe("presentation");
    expect(getFileType("a.docx")).toBe("document");
    expect(getFileType("a.exe")).toBe("unknown");
  });
});

describe("parseSpreadsheet", () => {
  it("parses a CSV buffer", () => {
    const parsed = parseSpreadsheet(Buffer.from("name,revenue\nA,100\nB,200\n"), "sales.csv");
    expect(parsed.columns).toEqual(["name", "revenue"]);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.rows[1]).toEqual({ name: "B", revenue: 200 });
    expect(parsed.isTabular).toBe(true);
  });

  it("parses a real xlsx workbook buffer", () => {
    const ws = XLSX.utils.json_to_sheet([{ city: "Muscat", temp: 41 }, { city: "La Jolla", temp: 22 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Weather");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const parsed = parseSpreadsheet(buffer, "weather.xlsx");
    expect(parsed.sheetName).toBe("Weather");
    expect(parsed.sheets).toEqual(["Weather"]);
    expect(parsed.columns).toEqual(["city", "temp"]);
    expect(parsed.rows[0].city).toBe("Muscat");
  });

  function multiSheetWorkbook() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ q: "Q1", rev: 10 }]), "Revenue");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ dept: "Eng", n: 7 }, { dept: "Sales", n: 4 }]), "Headcount");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  it("lists all sheets and defaults to the first", () => {
    const parsed = parseSpreadsheet(multiSheetWorkbook(), "book.xlsx");
    expect(parsed.sheets).toEqual(["Revenue", "Headcount"]);
    expect(parsed.sheetName).toBe("Revenue");
  });

  it("parses a requested sheet by name", () => {
    const parsed = parseSpreadsheet(multiSheetWorkbook(), "book.xlsx", "Headcount");
    expect(parsed.sheetName).toBe("Headcount");
    expect(parsed.totalRows).toBe(2);
    expect(parsed.columns).toEqual(["dept", "n"]);
  });

  it("rejects unknown sheet names with a 400 that lists options", () => {
    expect(() => parseSpreadsheet(multiSheetWorkbook(), "book.xlsx", "Nope"))
      .toThrowError(expect.objectContaining({ status: 400, code: "unknown_sheet" }));
  });

  it("normalizes Excel date cells to ISO strings", () => {
    const ws = XLSX.utils.json_to_sheet([
      { day: new Date(Date.UTC(2024, 0, 15)), sales: 100 },
      { day: new Date(Date.UTC(2024, 0, 16, 9, 30)), sales: 120 },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true });
    const parsed = parseSpreadsheet(buffer, "dates.xlsx");
    expect(parsed.rows[0].day).toBe("2024-01-15");
    expect(parsed.rows[1].day).toMatch(/^2024-01-16 09:3\d$/);
  });
});

describe("parseJSON", () => {
  it("parses an array of objects into rows", () => {
    const parsed = parseJSON(Buffer.from(JSON.stringify([{ a: 1, b: 2 }, { a: 3, c: 4 }])));
    expect(parsed.columns.sort()).toEqual(["a", "b", "c"]);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.isTabular).toBe(true);
  });

  it("flattens a nested object into a single row", () => {
    const parsed = parseJSON(Buffer.from(JSON.stringify({ user: { name: "M", tags: [1, 2] } })));
    expect(parsed.totalRows).toBe(1);
    expect(parsed.rows[0]["user.name"]).toBe("M");
    expect(parsed.rows[0]["user.tags"]).toBe("[1,2]");
  });

  it("wraps scalars in a value row", () => {
    const parsed = parseJSON(Buffer.from("42"));
    expect(parsed.rows).toEqual([{ value: "42" }]);
    expect(parsed.isTabular).toBe(false);
  });
});

describe("parseText", () => {
  it("splits text into non-empty numbered lines", () => {
    const parsed = parseText(Buffer.from("first\n\n  \nsecond\n"));
    expect(parsed.totalRows).toBe(2);
    expect(parsed.rows[1]).toEqual({ line: 2, content: "second" });
    expect(parsed.isTabular).toBe(false);
  });
});

describe("flattenObject", () => {
  it("flattens nested keys with dot paths", () => {
    expect(flattenObject({ a: { b: { c: 1 } }, d: 2 })).toEqual({ "a.b.c": 1, d: 2 });
  });
});

describe("parseOfficeFile", () => {
  it("parses a real docx buffer into numbered lines", async () => {
    const buffer = readFileSync(fileURLToPath(new URL("./fixtures/minimal.docx", import.meta.url)));
    const parsed = await parseOfficeFile(buffer, "minimal.docx", "document");
    expect(parsed.columns).toEqual(["line", "content"]);
    expect(parsed.sheetName).toBe("Document");
    expect(parsed.fileType).toBe("document");
    expect(parsed.isTabular).toBe(false);
    expect(parsed.totalRows).toBe(2);
    expect(parsed.rows[0]).toEqual({ line: 1, content: "Quarterly revenue grew 12 percent." });
    expect(parsed.rawText).toContain("Quarterly revenue grew 12 percent.");
  });
});

describe("parseFile", () => {
  it("rejects unsupported extensions with a 400 AppError", async () => {
    await expect(parseFile({ originalname: "virus.exe", buffer: Buffer.from("") }))
      .rejects.toMatchObject({ status: 400, code: "unsupported_file_type" });
  });

  it("wraps parser crashes in a 422 AppError", async () => {
    await expect(parseFile({ originalname: "broken.json", buffer: Buffer.from("{not json") }))
      .rejects.toMatchObject({ status: 422, code: "parse_failed" });
  });

  it("keeps AppError instances intact", async () => {
    const err = await parseFile({ originalname: "x.exe", buffer: Buffer.from("") }).catch(e => e);
    expect(err).toBeInstanceOf(AppError);
  });
});
