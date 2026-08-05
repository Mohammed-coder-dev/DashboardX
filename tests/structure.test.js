// Structural inference at ingest.
//
// Every real spreadsheet corpus contains two shapes that the engine currently
// reads as observations: a trailing aggregate row, and a title block sitting
// above the real header. Both produce statistics that are confidently wrong —
// wrong by 60% in the cases below, reported at 100% coverage, with the total
// row not even flagged as an outlier.
//
// These tests pin the two failures directly, and pin the reporting contract
// that goes with the fix: nothing may be excluded from the statistics without
// travelling with the result as an explicit exclusion. A silently dropped row
// is the same class of defect as a silently included one — the user cannot
// audit either.
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { inferStructure } from "../src/parsers/structure.js";
import { parseSpreadsheet } from "../src/parsers/spreadsheet.js";
import { computeStats } from "../src/analytics/stats.js";

const REGION_ROWS = [
  ["North", 120, 48000],
  ["South", 95, 39250],
  ["East", 140, 61000],
  ["West", 88, 35500],
];
const TOTAL_ROW = ["TOTAL", 443, 183750];

// The four regions are the observations. The TOTAL row is a restatement of
// them, so including it inflates every statistic it touches.
const TRUE_UNITS_MEAN = 110.75; // (120 + 95 + 140 + 88) / 4
const TRUE_REVENUE_MEAN = 45937.5; // (48000 + 39250 + 61000 + 35500) / 4

function xlsxBuffer(aoa, sheetName = "Sheet1") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("a trailing aggregate row", () => {
  // Region,Units,Revenue on line 1; four regions; TOTAL on line 6.
  const csv = [["Region", "Units", "Revenue"], ...REGION_ROWS, TOTAL_ROW]
    .map((row) => row.join(","))
    .join("\n");

  it("is kept out of the computed statistics", () => {
    const parsed = parseSpreadsheet(Buffer.from(csv), "sales.csv");
    const stats = computeStats(parsed.rows, parsed.columns);

    expect(stats.Units.mean).toBe(TRUE_UNITS_MEAN);
    expect(stats.Revenue.mean).toBe(TRUE_REVENUE_MEAN);
  });

  it("does not become the reported maximum", () => {
    const parsed = parseSpreadsheet(Buffer.from(csv), "sales.csv");
    const stats = computeStats(parsed.rows, parsed.columns);

    expect(stats.Units.max).toBe(140);
    expect(stats.Revenue.max).toBe(61000);
  });

  it("is reported as an exclusion rather than silently dropped", () => {
    const parsed = parseSpreadsheet(Buffer.from(csv), "sales.csv");

    expect(parsed.structure.excluded).toEqual([
      expect.objectContaining({ row: 6, reason: "aggregate" }),
    ]);
  });

  it("leaves four observations behind", () => {
    const parsed = parseSpreadsheet(Buffer.from(csv), "sales.csv");

    expect(parsed.totalRows).toBe(4);
    expect(parsed.rows.map((r) => r.Region)).toEqual(["North", "South", "East", "West"]);
  });
});

describe("a title block above the header", () => {
  // Row 1 title, row 2 blank, row 3 header, rows 4-7 data, row 8 blank,
  // row 9 TOTAL — the shape of essentially every corporate export.
  const aoa = [
    ["Q3 Regional Revenue Report — CONFIDENTIAL"],
    [],
    ["Region", "Units", "Revenue"],
    ...REGION_ROWS,
    [],
    TOTAL_ROW,
  ];

  it("does not become the column names", () => {
    const parsed = parseSpreadsheet(xlsxBuffer(aoa), "q3.xlsx");

    expect(parsed.columns).toEqual(["Region", "Units", "Revenue"]);
  });

  it("reports where the header was actually found", () => {
    const parsed = parseSpreadsheet(xlsxBuffer(aoa), "q3.xlsx");

    expect(parsed.structure.headerRow).toBe(3);
  });

  it("is reported as an exclusion, alongside the aggregate row", () => {
    const parsed = parseSpreadsheet(xlsxBuffer(aoa), "q3.xlsx");

    expect(parsed.structure.excluded).toEqual([
      expect.objectContaining({ row: 1, reason: "preamble" }),
      expect.objectContaining({ row: 9, reason: "aggregate" }),
    ]);
  });

  it("computes the statistics over the four regions only", () => {
    const parsed = parseSpreadsheet(xlsxBuffer(aoa), "q3.xlsx");
    const stats = computeStats(parsed.rows, parsed.columns);

    expect(parsed.totalRows).toBe(4);
    expect(stats.Units.mean).toBe(TRUE_UNITS_MEAN);
    expect(stats.Revenue.mean).toBe(TRUE_REVENUE_MEAN);
  });
});

describe("a file with nothing unusual in it", () => {
  // Structural inference must be invisible on ordinary files. The pre-change
  // ingest call is reproduced here verbatim and used as the contract: no
  // preamble and no aggregate row has to mean no change at all, down to the
  // column names SheetJS invents for duplicate and empty headers.
  function legacyParse(buffer, sheetName = "Sheet1") {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
  }

  it("parses to exactly what object-mode parsing produced before", () => {
    const buffer = xlsxBuffer([["Region", "Units", "Revenue"], ...REGION_ROWS]);

    const parsed = parseSpreadsheet(buffer, "clean.xlsx");

    expect(parsed.rows).toEqual(legacyParse(buffer));
    expect(parsed.columns).toEqual(["Region", "Units", "Revenue"]);
    expect(parsed.totalRows).toBe(4);
  });

  it("reports that it changed nothing", () => {
    const parsed = parseSpreadsheet(xlsxBuffer([["Region", "Units"], ...REGION_ROWS.map((r) => r.slice(0, 2))]), "clean.xlsx");

    expect(parsed.structure.confidence).toBe("none");
    expect(parsed.structure.excluded).toEqual([]);
    expect(parsed.structure.headerRow).toBe(1);
  });

  it("keeps SheetJS's naming for duplicate and empty header cells", () => {
    const buffer = xlsxBuffer([["a", null, "a"], ["1", "2", "3"], ["4", "5", "6"]]);

    const parsed = parseSpreadsheet(buffer, "dup.xlsx");

    expect(parsed.rows).toEqual(legacyParse(buffer));
    expect(parsed.columns).toEqual(["a", "__EMPTY", "a_1"]);
  });

  it("leaves a genuine zero and a blank cell alone", () => {
    // The engine's oldest invariant: a blank is not a zero. Re-pinned here
    // because the ingest path that produces these cells has been rewritten.
    const buffer = xlsxBuffer([["item", "qty"], ["a", 0], ["b", null], ["c", 5]]);

    const parsed = parseSpreadsheet(buffer, "zeros.xlsx");

    expect(parsed.rows).toEqual(legacyParse(buffer));
    expect(parsed.rows[0].qty).toBe(0);
    expect(parsed.rows[1].qty).toBeNull();
  });
});

describe("inferStructure", () => {
  it("reports nothing unusual for a grid whose first row is the header", () => {
    const report = inferStructure([
      ["Region", "Units"],
      ["North", 120],
      ["South", 95],
    ]);

    expect(report.headerRow).toBe(1);
    expect(report.confidence).toBe("none");
    expect(report.excluded).toEqual([]);
    expect(report.observations).toBe(2);
  });

  it("steps over a title too narrow to be a header for the block below", () => {
    const report = inferStructure([
      ["Q3 Regional Revenue Report"],
      [],
      ["Region", "Units", "Revenue"],
      ["North", 120, 48000],
      ["South", 95, 39250],
    ]);

    expect(report.headerRow).toBe(3);
    expect(report.confidence).toBe("confident");
    expect(report.observations).toBe(2);
  });

  it("reports the preamble it stepped over, but not the blank rows", () => {
    const report = inferStructure([
      ["Q3 Regional Revenue Report"],
      [],
      ["Region", "Units", "Revenue"],
      ["North", 120, 48000],
      ["South", 95, 39250],
    ]);

    expect(report.excluded).toEqual([
      expect.objectContaining({ row: 1, reason: "preamble" }),
    ]);
  });

  it("treats a labelled row whose numbers restate the rows above as certain", () => {
    const report = inferStructure([
      ["Item", "Qty"],
      ["A", 10],
      ["B", 20],
      ["Total", 30],
    ]);

    expect(report.excluded).toEqual([
      expect.objectContaining({ row: 4, reason: "aggregate", confidence: "certain" }),
    ]);
    expect(report.observations).toBe(2);
  });

  it("catches an unlabelled trailing row that restates the rows above", () => {
    // No keyword list would ever find this one — the arithmetic is the evidence.
    const report = inferStructure([
      ["Item", "Qty"],
      ["A", 10],
      ["B", 20],
      ["Combined", 30],
    ]);

    expect(report.excluded).toEqual([
      expect.objectContaining({ row: 4, reason: "aggregate", confidence: "confident" }),
    ]);
  });

  describe("a title row that reaches as far as the header below it", () => {
    // The gap the span gate leaves open: a title with a date in the last column
    // reaches all three columns, so width alone cannot tell it from a header.
    const grid = [
      ["Q3 Report", null, "2026-09-30"],
      ["Region", "Units", "Revenue"],
      ["North", 120, 48000],
      ["South", 95, 39250],
    ];

    it("is beaten by the real header rather than taken at face value", () => {
      expect(inferStructure(grid).headerRow).toBe(2);
    });

    it("is reported as an uncertain reading, not a settled one", () => {
      expect(inferStructure(grid).confidence).toBe("uncertain");
    });

    it("offers itself back as the alternative it is", () => {
      expect(inferStructure(grid).alternatives).toContainEqual(
        expect.objectContaining({ headerRow: 1 }),
      );
    });

    it("does not disappear — it is excluded, and said to be", () => {
      expect(inferStructure(grid).excluded).toContainEqual(
        expect.objectContaining({ row: 1, reason: "preamble", confidence: "uncertain" }),
      );
    });

    it("leaves the real column names in place", () => {
      const parsed = parseSpreadsheet(xlsxBuffer(grid), "q3.xlsx");
      expect(parsed.columns).toEqual(["Region", "Units", "Revenue"]);
      expect(parsed.totalRows).toBe(2);
    });
  });

  it("says it is unsure when the row it lands on reads like data", () => {
    // Nothing here fills the block's width except the data itself, so picking a
    // header is a genuine judgement call rather than a reading of the file.
    const report = inferStructure([
      ["Report"],
      ["A", 1],
      ["B", 2],
    ]);

    expect(report.confidence).toBe("uncertain");
    expect(report.alternatives).toContainEqual(expect.objectContaining({ headerRow: 3 }));
  });

  it("does not silently resolve a labelled row that the arithmetic contradicts", () => {
    // "Total" is a legitimate category name. Mid-table, with the numbers
    // refusing to add up, the honest answer is that we cannot tell.
    const report = inferStructure([
      ["Category", "Score"],
      ["Alpha", 5],
      ["Beta", 9],
      ["Total", 3],
      ["Gamma", 2],
    ]);

    expect(report.excluded).toEqual([
      expect.objectContaining({ row: 4, reason: "aggregate", confidence: "uncertain" }),
    ]);
    expect(report.confidence).toBe("uncertain");
  });

  it("does not silently resolve an unlabelled row that only the arithmetic accuses", () => {
    const report = inferStructure([
      ["Item", "Qty"],
      ["A", 10],
      ["B", 20],
      ["Snapshot", 30],
      ["C", 5],
    ]);

    expect(report.excluded).toEqual([
      expect.objectContaining({ row: 4, reason: "aggregate", confidence: "uncertain" }),
    ]);
  });

  it("still excludes what it is unsure about, having said so", () => {
    // The asymmetry the design turns on: wrongly keeping an aggregate corrupts
    // every statistic and reports full coverage doing it; wrongly dropping an
    // observation costs one row and announces itself.
    const report = inferStructure([
      ["Category", "Score"],
      ["Alpha", 5],
      ["Beta", 9],
      ["Total", 3],
      ["Gamma", 2],
    ]);

    expect(report.observations).toBe(3);
  });

  it("does not let a trailing label stand in for arithmetic it does not have", () => {
    // "Total" in the last row is suggestive, but the numbers refuse to add up.
    // Arithmetic is the evidence; a label alone is a naming convention, and
    // "Total" is a legitimate final category in plenty of real files.
    const report = inferStructure([
      ["Category", "Score"],
      ["Alpha", 5],
      ["Beta", 9],
      ["Total", 3],
    ]);

    expect(report.excluded).toEqual([
      expect.objectContaining({ row: 4, reason: "aggregate", confidence: "uncertain" }),
    ]);
    expect(report.confidence).toBe("uncertain");
  });

  it("still trusts trailing arithmetic that carries no label", () => {
    // The reverse case, unchanged: the numbers are the evidence, so their
    // presence settles it even when nothing is labelled.
    const report = inferStructure([
      ["Item", "Qty"],
      ["A", 10],
      ["B", 20],
      ["Combined", 30],
    ]);

    expect(report.excluded).toEqual([
      expect.objectContaining({ row: 4, confidence: "confident" }),
    ]);
  });

  describe("a correction that cannot be applied", () => {
    // Silently doing nothing is the one response ruled out. A caller who asks
    // for a row back and is answered with silence cannot tell whether it worked,
    // and the numbers change either way.
    const grid = [
      ["Q3 Report"],
      ["Item", "Qty"],
      ["A", 10],
      ["B", 20],
      ["Total", 30],
    ];

    it("names a row that was never excluded", () => {
      const report = inferStructure(grid, { includeRows: [3] });
      expect(report.unapplied).toEqual([{ row: 3, reason: "not an excluded row" }]);
    });

    it("names a row past the end of the file", () => {
      const report = inferStructure(grid, { includeRows: [99] });
      expect(report.unapplied).toEqual([{ row: 99, reason: "outside the file" }]);
    });

    it("names a row at or above the header, which cannot become data", () => {
      const report = inferStructure(grid, { includeRows: [1] });
      expect(report.unapplied).toEqual([{ row: 1, reason: "at or above the header row" }]);
    });

    it("keeps a request that did apply out of the unapplied list", () => {
      const report = inferStructure(grid, { includeRows: [5] });
      expect(report.restored).toEqual([expect.objectContaining({ row: 5 })]);
      expect(report.unapplied).toEqual([]);
    });

    it("makes the reading uncertain, since the caller believes something was applied", () => {
      expect(inferStructure(grid, { includeRows: [3] }).confidence).toBe("uncertain");
    });
  });

  describe("a second table sharing the sheet", () => {
    // Two tables separated by blank rows read as one: the second table's header
    // became an observation and its values joined the first table's statistics,
    // under a reading that claimed nothing unusual was found. Splitting the
    // tables is larger work; refusing to claim certainty is not.
    const grid = [
      ["Region", "Units"],
      ["North", 120],
      ["South", 95],
      [],
      [],
      ["Product", "Price"],
      ["Widget", 9.99],
      ["Gadget", 14.5],
    ];

    it("stops reporting the sheet as read without incident", () => {
      expect(inferStructure(grid).confidence).toBe("uncertain");
    });

    it("names the row where a second table appears to begin", () => {
      expect(inferStructure(grid).excluded).toContainEqual(
        expect.objectContaining({ row: 6, reason: "second header", confidence: "uncertain" }),
      );
    });

    it("does not let the second header count as an observation", () => {
      const parsed = parseSpreadsheet(xlsxBuffer(grid), "two-tables.xlsx");
      expect(parsed.rows.map((row) => row.Region)).not.toContain("Product");
      expect(parsed.totalRows).toBe(4);
    });

    it("leaves an ordinary blank row inside one table alone", () => {
      const report = inferStructure([
        ["Region", "Units"],
        ["North", 120],
        [],
        ["South", 95],
      ]);
      expect(report.excluded).toEqual([]);
      expect(report.confidence).toBe("none");
    });
  });

  it("will not call a lone row above a candidate an arithmetic match", () => {
    // With one contributing row, "equals the sum above" is just "equals the row
    // above" — a coincidence, not evidence of an aggregate.
    const report = inferStructure([
      ["Item", "Qty"],
      ["A", 10],
      ["B", 10],
    ]);

    expect(report.excluded).toEqual([]);
    expect(report.observations).toBe(2);
  });
});
