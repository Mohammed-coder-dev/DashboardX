import path from "path";
import fs from "fs";
import os from "os";
import officeParser from "officeparser";

export async function parsePDF(buffer) {
  const PDFParser = (await import("pdf2json")).default;
  const tmpPath   = path.join(os.tmpdir(), `dx_${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath, buffer);
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    parser.on("pdfParser_dataError", (err) => {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      reject(new Error("PDF parsing failed: " + err.parserError));
    });
    parser.on("pdfParser_dataReady", () => {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      const fullText = parser.getRawTextContent();
      const lines    = fullText.split("\n").filter(l => l.trim());
      resolve({ rows: lines.map((l, i) => ({ line: i + 1, content: l.trim() })), columns: ["line","content"],
        sheetName: "PDF", totalRows: lines.length, fileType: "pdf", isTabular: false,
        rawText: fullText.slice(0, 8000), pages: parser.data?.Pages?.length || 0 });
    });
    parser.loadPDF(tmpPath);
  });
}

export async function parseOfficeFile(buffer, filename, fileType) {
  const tmpPath = path.join(os.tmpdir(), `dx_${Date.now()}${path.extname(filename)}`);
  fs.writeFileSync(tmpPath, buffer);
  try {
    const text  = await officeParser.parseOfficeAsync(tmpPath);
    const lines = text.split("\n").filter(l => l.trim());
    return { rows: lines.map((l, i) => ({ line: i + 1, content: l.trim() })), columns: ["line","content"],
      sheetName: fileType === "presentation" ? "Presentation" : "Document",
      totalRows: lines.length, fileType, isTabular: false, rawText: text.slice(0, 8000) };
  } finally { try { fs.unlinkSync(tmpPath); } catch (_) {} }
}
