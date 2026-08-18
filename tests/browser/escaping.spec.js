// "Everything rendered goes through esc() before innerHTML" is one of this
// project's stated invariants, and nothing tested it. The product's whole job
// is to render the contents of a file someone hands it - column names, cell
// values, category labels, the filename - into markup built with template
// literals, which is exactly the shape that turns a spreadsheet into a script
// tag if one interpolation is missed.
//
// This drives the real browser against a file whose every text field is an
// injection attempt, and asserts two things: nothing executed, and the text is
// still shown as the file wrote it rather than silently swallowed.
import { expect, test } from "@playwright/test";

const IMG = '<img src=x onerror="window.__ridgeXss=(window.__ridgeXss||0)+1">';
const SVG = '<svg onload="window.__ridgeXss=(window.__ridgeXss||0)+1">';
const SCRIPT = '<script>window.__ridgeXss=(window.__ridgeXss||0)+1<\/script>';
const BREAKOUT = '"><img src=x onerror="window.__ridgeXss=(window.__ridgeXss||0)+1">';

// THREE numeric columns, each carrying an injection attempt as its *name*, so
// the correlation panel and the at-a-glance matrix both render - the matrix
// prints column names as its row and column headers, and buildCorrMatrixHtml
// returns "" below three numeric columns. A fixture with fewer never draws it,
// and an earlier version of this test passed with an esc() deleted for exactly
// that reason. The fourth column carries injection attempts as its *values*.
// Values are related but not perfectly, and no row is the sum of another.
const ROWS = [
  [BREAKOUT, SCRIPT, IMG, "category"],
  ["120", "37", "9", SVG],
  ["341", "94", "23", IMG],
  ["213", "61", "14", SVG],
  ["455", "119", "31", IMG],
  ["187", "52", "12", SVG],
  ["392", "101", "27", IMG],
  ["9004", "63", "16", SVG],   // an outlier, so fences and flagged rows render
  ["176", "48", "11", IMG],
  ["268", "77", "19", SVG],
  ["314", "88", "22", IMG],
];

// Supplied as a buffer rather than a real file so the *filename* can carry a
// payload too — Windows will not create a file called `quarterly<img src=x>`,
// and the filename is rendered in the meta chips like everything else.
function maliciousUpload() {
  const quote = (cell) => `"${String(cell).replace(/"/g, '""')}"`;
  const body = ROWS.map((row) => row.map(quote).join(",")).join("\n");
  return {
    name: "quarterly<img src=x onerror=alert(1)>.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(body + "\n", "utf8"),
  };
}

test.describe("file contents are rendered as text, never as markup", () => {
  test("a spreadsheet full of injection attempts executes nothing", async ({ page }) => {
    const dialogs = [];
    page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(maliciousUpload());
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 30_000 });

    // Open every panel that renders file text, so the assertions below cover
    // more than the first screen.
    for (const jump of await page.locator("[data-tier-jump]").all()) {
      await jump.click({ timeout: 5_000 }).catch(() => {});
    }
    for (const summary of await page.locator("details > summary").all()) {
      await summary.click({ timeout: 5_000 }).catch(() => {});
    }

    // 1. Nothing ran.
    expect(await page.evaluate(() => window.__ridgeXss ?? 0)).toBe(0);
    expect(dialogs).toEqual([]);

    // 2. Nothing was injected into the DOM as an element. An escaped payload
    //    is a text node; an unescaped one is an <img>/<svg>/<script>.
    const injected = await page.evaluate(() => ({
      img: document.querySelectorAll("img[src='x']").length,
      svg: document.querySelectorAll("svg[onload]").length,
      script: [...document.querySelectorAll("script")].filter((s) => s.textContent.includes("__ridgeXss")).length,
      handlers: document.querySelectorAll("[onerror],[onload]").length,
    }));
    expect(injected).toEqual({ img: 0, svg: 0, script: 0, handlers: 0 });

    // 3. The payload text is still displayed - escaping must not mean dropping
    //    the value, or a column would silently vanish from the report.
    await expect(page.locator("body")).toContainText("img src=x");

    // 4. The panels that print column names really did render, so the
    //    assertions above had something to be true about. The matrix only
    //    appears at two or more reportable numeric columns.
    await expect(page.locator("#corrMatrix .corr-matrix-table")).toBeVisible();
    await expect(page.locator("#statsSection")).toBeVisible();

    // 5. No script error was thrown while rendering any of it.
    expect(pageErrors).toEqual([]);
  });

  test("comparison mode renders two such files as text too", async ({ page }) => {
    // A different set of render calls: schema drift, per-column deltas and
    // findings, each printing column names that came out of the files.
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto("/app");
    await page.locator('[data-analysis-mode="compare"]').click();

    const baseline = maliciousUpload();
    const current = maliciousUpload();
    // A column present in only one file forces the schema-drift finding, which
    // prints the added column's name.
    current.buffer = Buffer.from(
      current.buffer.toString("utf8").split("\n")
        .map((line, index) => (line ? `${line},${index === 0 ? IMG : `"${SVG}"`}` : line))
        .join("\n"),
      "utf8",
    );
    await page.locator("#fileInput").setInputFiles([
      { ...baseline, name: "baseline<img src=x>.csv" },
      { ...current, name: "current<svg onload=1>.csv" },
    ]);
    await page.locator("#analyzeBtn").click();

    await expect(page.locator("#compareSection")).toBeVisible({ timeout: 30_000 });
    // Non-vacuous: the panels that print those names really rendered.
    await expect(page.locator("#compareSchema")).toBeVisible();
    await expect(page.locator("#compareColumnRows")).toBeVisible();

    expect(await page.evaluate(() => window.__ridgeXss ?? 0)).toBe(0);
    expect(await page.evaluate(() => document.querySelectorAll(
      "img[src='x'],svg[onload],[onerror],[onload]",
    ).length)).toBe(0);
    expect(pageErrors).toEqual([]);
  });
});
