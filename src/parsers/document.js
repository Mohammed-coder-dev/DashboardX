import officeParser from "officeparser";
import { AppError } from "../errors.js";

/**
 * How long a single PDF gets before it is abandoned.
 *
 * Chosen against the deployment budget rather than picked round: the function
 * has 300 s (vercel.json), and the AI round that may follow a parse is capped
 * at 120 s, so a parse that has not finished in 45 s cannot be waited out
 * without putting the whole request at risk of a platform timeout — which
 * returns nothing at all instead of a message that says what happened.
 */
export const PDF_TIMEOUT_MS = 45_000;

/**
 * Extract text from a PDF.
 *
 * The buffer is parsed in memory. This used to write the upload to a temp file
 * and unlink it inside the two event handlers, which meant that a parser that
 * neither errored nor completed left the file behind — and on a warm serverless
 * instance /tmp survives between invocations, so repeated malformed PDFs were a
 * slow disk-exhaustion path that would eventually fail every later request for
 * an unrelated-looking reason. Parsing the bytes directly removes the file, the
 * cleanup and the failure mode together.
 *
 * The timeout covers the other half of the same problem: without it, a parser
 * that never settles leaves the request hanging until the platform kills it.
 */
export async function parsePDF(buffer, { timeoutMs = PDF_TIMEOUT_MS } = {}) {
  const PDFParser = (await import("pdf2json")).default;
  const parser = new PDFParser(null, 1);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Stop the work as well as stopping waiting for it, so an abandoned
      // parse is not still holding memory when the next request arrives.
      try { parser.destroy(); } catch { /* already torn down */ }
      reject(new AppError(
        `This PDF took longer than ${Math.max(1, Math.round(timeoutMs / 1000))} seconds to read. Try a smaller file, or one with fewer pages.`,
        { status: 422, code: "pdf_timeout" },
      ));
    }, timeoutMs);
    // Nothing should be kept alive by this timer alone.
    timer.unref?.();

    const settle = (act) => (argument) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      act(argument);
    };

    parser.on("pdfParser_dataError", settle((err) => {
      reject(new Error("PDF parsing failed: " + err.parserError));
    }));

    parser.on("pdfParser_dataReady", settle(() => {
      const fullText = parser.getRawTextContent();
      const lines = fullText.split("\n").filter(l => l.trim());
      resolve({ rows: lines.map((l, i) => ({ line: i + 1, content: l.trim() })), columns: ["line","content"],
        sheetName: "PDF", totalRows: lines.length, fileType: "pdf", isTabular: false,
        rawText: fullText.slice(0, 8000), pages: parser.data?.Pages?.length || 0 });
    }));

    try {
      // new Uint8Array(...), not the Buffer itself. Node allocates small
      // buffers out of a shared pool, so `buffer.byteOffset` is usually not 0,
      // and pdf2json hands the underlying ArrayBuffer to pdfjs without
      // carrying the offset across — so it reads whatever else was in the pool
      // and reports "Invalid XRef stream header" on a perfectly good PDF.
      // Whether it happens depends on how much the process had already
      // allocated, which makes it exactly the kind of failure that passes
      // locally and appears in production. The copy is bounded by the 4 MB
      // upload limit.
      parser.parseBuffer(new Uint8Array(buffer));
    } catch (err) {
      settle(() => reject(err))();
    }
  });
}

export async function parseOfficeFile(buffer, filename, fileType) {
  // officeparser v6 removed parseOfficeAsync(path); parseOffice takes the
  // buffer directly and returns an AST.
  const ast   = await officeParser.parseOffice(buffer);
  const text  = ast.toText();
  const lines = text.split("\n").filter(l => l.trim());
  return { rows: lines.map((l, i) => ({ line: i + 1, content: l.trim() })), columns: ["line","content"],
    sheetName: fileType === "presentation" ? "Presentation" : "Document",
    totalRows: lines.length, fileType, isTabular: false, rawText: text.slice(0, 8000) };
}
