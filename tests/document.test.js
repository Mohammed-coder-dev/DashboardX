// PDF parsing had no test of its own: neither the happy path nor what a
// malformed file does, on one of the file types the product advertises.
//
// No module mocking in this file. pdf2json wraps pdfjs and sets up a shared
// worker on first use, and re-importing it mid-suite (vi.resetModules) made
// good parses fail with the previous parse's error. The timeout, which does
// need a mock, lives in document-timeout.test.js so the two never mix.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { PDF_TIMEOUT_MS, parsePDF } from "../src/parsers/document.js";
import { parseFile } from "../src/parsers/index.js";

const fixture = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));
const ridgeTempFiles = () => readdirSync(tmpdir()).filter((name) => name.startsWith("ridge_"));

describe("parsePDF", () => {
  it("extracts the text of a one-page PDF", async () => {
    const parsed = await parsePDF(fixture("minimal.pdf"));
    expect(parsed.fileType).toBe("pdf");
    expect(parsed.isTabular).toBe(false);
    expect(parsed.pages).toBe(1);
    expect(parsed.rawText).toContain("Ridge parseBuffer probe");
    expect(parsed.rows[0]).toEqual({ line: 1, content: "Ridge parseBuffer probe" });
    expect(parsed.columns).toEqual(["line", "content"]);
  });

  it("reports the same text through parseFile", async () => {
    const parsed = await parseFile({ originalname: "doc.pdf", buffer: fixture("minimal.pdf") });
    expect(parsed.fileType).toBe("pdf");
    expect(parsed.rawText).toContain("Ridge parseBuffer probe");
  });

  it("reads a PDF that sits at a non-zero offset in its buffer pool", async () => {
    // Node allocates small buffers out of a shared pool, so a real upload's
    // byteOffset is usually not 0. pdf2json hands the underlying ArrayBuffer
    // to pdfjs without carrying that offset across, so it reads whatever else
    // was in the pool and rejects a perfectly good PDF as having an "Invalid
    // XRef stream header". Whether it happens at all depends on how much the
    // process had already allocated - a failure that passes on a quiet run and
    // appears under load. This fixture is placed at an offset deliberately so
    // the assertion does not depend on the allocator's mood.
    const bytes = fixture("minimal.pdf");
    const pool = Buffer.alloc(bytes.length + 128);
    bytes.copy(pool, 64);
    const pooled = pool.subarray(64, 64 + bytes.length);
    expect(pooled.byteOffset).toBeGreaterThan(0);

    const parsed = await parsePDF(pooled);
    expect(parsed.rawText).toContain("Ridge parseBuffer probe");
  });

  it("turns a malformed PDF into a 422 rather than a crash", async () => {
    await expect(parseFile({ originalname: "broken.pdf", buffer: Buffer.from("%PDF-1.4\nnot really") }))
      .rejects.toMatchObject({ status: 422, code: "parse_failed" });
  });

  it("leaves nothing behind in the temp directory", async () => {
    // The previous implementation wrote the upload to os.tmpdir() and unlinked
    // it inside the two event handlers, so any path reaching neither left the
    // file there - and a warm serverless instance keeps /tmp between
    // invocations.
    const before = ridgeTempFiles();
    await parsePDF(fixture("minimal.pdf"));
    await parseFile({ originalname: "broken.pdf", buffer: Buffer.from("%PDF-1.4\nbroken") }).catch(() => {});
    expect(ridgeTempFiles()).toEqual(before);
  });

  it("bounds the wait well inside the platform's function budget", async () => {
    // 300 s function budget (vercel.json), minus the 120 s an AI round may take
    // after the parse. A longer parse cannot be waited out without risking a
    // platform timeout, which returns no message at all.
    expect(PDF_TIMEOUT_MS).toBeLessThanOrEqual(180_000);
    expect(PDF_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
