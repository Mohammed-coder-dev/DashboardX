import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { getFileType, parseFile } from "../src/parsers/index.js";
import { parseSpreadsheet } from "../src/parsers/spreadsheet.js";
import { parseJSON, parseText, flattenObject } from "../src/parsers/structured.js";
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
    expect(parsed.columns).toEqual(["city", "temp"]);
    expect(parsed.rows[0].city).toBe("Muscat");
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
