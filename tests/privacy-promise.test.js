// The privacy documents make a promise about what the server does with an
// uploaded file. Nothing checked that the code kept it, and it did not: the
// blanket claim in README.md ("processed in memory and nothing is retained")
// was contradicted by the PDF parser, which wrote every upload to os.tmpdir()
// and unlinked it in its event handlers — so PRIVACY.md and the privacy page
// carried a carve-out the README never mentioned, and the two documents
// disagreed with each other about the same behaviour.
//
// PDFs are now parsed from the uploaded bytes and there is no temporary file at
// all. These assertions hold the code and the three documents together, in the
// direction that matters: a parser that starts writing to disk again fails
// here, next to the sentence it would falsify.
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

/** Anything that puts bytes on disk. */
const DISK_WRITES = [
  /\bwriteFileSync\b/,
  /\bwriteFile\b/,
  /\bcreateWriteStream\b/,
  /\bappendFileSync?\b/,
  /\bmkdtempSync?\b/,
  /\bos\.tmpdir\b/,
  /\btmpdir\(\)/,
];

describe("the privacy promise and the code that has to keep it", () => {
  it("has no parser that writes an upload to disk", async () => {
    const directory = fileURLToPath(new URL("../src/parsers/", import.meta.url));
    const parsers = readdirSync(directory).filter((name) => name.endsWith(".js"));
    // Non-vacuous: this is the module set the claim is about.
    expect(parsers).toContain("document.js");
    expect(parsers.length).toBeGreaterThan(3);

    for (const name of parsers) {
      const source = await read(`../src/parsers/${name}`);
      for (const pattern of DISK_WRITES) {
        expect(source, `${name} writes to disk (${pattern})`).not.toMatch(pattern);
      }
    }
  });

  it("states the in-memory promise in all three places a reader looks", async () => {
    const readme = await read("../README.md");
    const privacyDoc = await read("../PRIVACY.md");
    const privacyPage = await read("../public/privacy.html");

    expect(readme).toMatch(/processed \*\*in memory\*\*/);
    expect(privacyDoc).toMatch(/held \*\*in memory\*\*/);
    expect(privacyPage).toMatch(/processed <strong>in memory<\/strong>/);
  });

  it("no longer carries the temporary-file carve-out as current behaviour", async () => {
    // The carve-out was honest when it was written. Left in place after the
    // temporary file was removed it would understate the guarantee, which is
    // the same kind of drift in the other direction.
    const privacyDoc = await read("../PRIVACY.md");
    const privacyPage = await read("../public/privacy.html");

    expect(privacyDoc).toMatch(/never written to disk/);
    expect(privacyPage).toMatch(/never written to disk/);
    expect(privacyPage).not.toMatch(/uses a temporary file/);
  });
});
