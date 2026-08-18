// Its own file because it replaces pdf2json wholesale, and pdf2json keeps
// module-level pdfjs state that a mock must not be mixed into the real parses
// in document.test.js.
import { describe, it, expect, vi } from "vitest";

const destroyed = vi.fn();

vi.mock("pdf2json", () => ({
  default: class {
    on() {}
    parseBuffer() {}                 // emits neither event, ever
    destroy() { destroyed(); }
  },
}));

const { parsePDF } = await import("../src/parsers/document.js");
const { AppError } = await import("../src/errors.js");

describe("parsePDF timeout", () => {
  it("gives up on a parser that never settles", async () => {
    // Without a bound, a parse that neither errors nor completes hangs the
    // request until the platform kills the function, which returns nothing at
    // all - no status, no message, no request id to correlate.
    const error = await parsePDF(Buffer.from("%PDF-1.4"), { timeoutMs: 25 }).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 422, code: "pdf_timeout" });
    expect(error.message).toMatch(/took longer than \d+ second/);
  });

  it("stops the abandoned parser rather than leaving it running", async () => {
    destroyed.mockClear();
    await parsePDF(Buffer.from("%PDF-1.4"), { timeoutMs: 25 }).catch(() => {});
    expect(destroyed).toHaveBeenCalled();
  });
});
