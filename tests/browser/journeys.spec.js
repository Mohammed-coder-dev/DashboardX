import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_CSV = path.resolve(here, "../../public/samples/team-sales.csv");
// A title line, the real header on line 3, and a trailing TOTAL: the shape a
// finance export actually arrives in.
const MESSY_CSV = path.resolve(here, "../fixtures/messy-export.csv");
// Clean, tiny, and entirely ordinary — and so clears no reporting threshold.
const THIN_CSV = path.resolve(here, "../fixtures/thin-table.csv");

// The server runs without an Anthropic key, so these journeys exercise the
// deterministic product exactly as a first-time visitor experiences it.

test.describe("landing page at the root", () => {
  test("presents the product, not the upload form", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Ridge/);
    await expect(page.locator("h1")).toContainText(/answers you can defend/i);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /og-ridge\.png$/);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
    // The workspace must not be the first thing a visitor meets.
    await expect(page.locator("#dropzone")).toHaveCount(0);
  });

  test("reaches the working engine in one click", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Analyze a file" }).first().click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("#dropzone")).toBeVisible();
  });

  test("reaches a computed sample analysis in one click", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Run the sample analysis" }).first().click();
    await expect(page).toHaveURL(/\/app\?sample=1$/);
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#evidenceSection")).toBeVisible();
    // Charts were produced; tier ③ keeps them one click away rather than open.
    await expect(page.locator('[data-tier-jump="chartsSection"]')).toBeVisible();
  });

  test("covers problem, audience, trust and a footer", async ({ page }) => {
    await page.goto("/");
    const body = page.locator("body");
    await expect(body).toContainText(/How it works/i);
    await expect(body).toContainText(/Who it's for/i);
    await expect(body).toContainText(/Evidence you can audit/i);
    await expect(body).toContainText(/Know what actually changed/i);
    await expect(body).toContainText(/Deploy around your data boundary/i);
    await expect(body).toContainText(/What happens to your data/i);
    await expect(page.locator("footer")).toContainText(/GitHub/i);
    await expect(page.locator("footer")).toContainText(/Privacy/i);
  });

  test("does not promise a key before the visitor can do anything", async ({ page }) => {
    await page.goto("/");
    // The old copy opened with "Add your Anthropic key" as step 01.
    await expect(page.locator("#how")).not.toContainText(/Add your Anthropic key/i);
    await expect(page.locator("#how")).toContainText(/no API key/i);
  });

  test("links to privacy and docs", async ({ page }) => {
    for (const [label, heading] of [
      ["Privacy", /Saved analyses \(opt-in\)/i],
      ["Docs", /Using the app/i],
    ]) {
      await page.goto("/");
      await page.getByRole("link", { name: label, exact: true }).first().click();
      await expect(page.locator("body")).toContainText(heading);
    }
  });
});

test.describe("the application at /app", () => {
  test("loads without a single console error", async ({ page }) => {
    // A parse error in app.js leaves every control inert but the page looking
    // fine, so failures surface here rather than as a mystery timeout later.
    const errors = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (err) => errors.push(String(err)));
    await page.goto("/app");
    await expect(page.locator("#dropzone")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("offers analysis without asking for a key first", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("#dropzone")).toBeVisible();
    await expect(page.locator("#analyzeBtn")).toHaveText(/Analyze data/);
    await expect(page.locator("#uploadReadiness")).toContainText(/does not need an API key/i);
    await expect(page.locator('[data-analysis-mode="analyze"]')).toHaveAttribute("aria-pressed", "true");
    // The fastest route to a real result is offered before the form asks for
    // anything, and the optional inputs sit in one labelled group.
    await expect(page.locator("#sampleStrip")).toBeVisible();
    await expect(page.locator(".refine-group .refine-label")).toContainText(/all optional/i);
  });

  test("the wordmark returns to the landing page", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: "Ridge home" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a shared root link forwards to the workspace with its query intact", async ({ page }) => {
    // Share links minted before the split were handed out as /?a=<id>.
    await page.goto("/?a=abc123");
    expect(new URL(page.url()).pathname).toBe("/app");
    expect(new URL(page.url()).searchParams.get("a")).toBe("abc123");
  });

  test("/about redirects to the landing page", async ({ page }) => {
    await page.goto("/about");
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("shows honest, cancellable analysis progress", async ({ page }) => {
    await page.route("**/api/analyze", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.continue();
    });
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(SAMPLE_CSV);
    await page.locator("#analyzeBtn").click();

    await expect(page.locator("#loadingScreen")).toBeVisible();
    await expect(page.locator("#loadingTitle")).toContainText("team-sales.csv");
    await expect(page.locator("#step3")).toContainText(/computing evidence/i);
    await expect(page.locator("#loadingScreen")).not.toContainText(/running AI analysis/i);
    await page.locator("#cancelAnalysisBtn").click();
    await expect(page.locator("#uploadScreen")).toBeVisible();
    await expect(page.locator("#errorBox")).toContainText(/cancelled/i);
    await expect(page.locator(".file-chip-name")).toContainText("team-sales.csv");
  });
});

test.describe("deterministic analysis without an API key", () => {
  test("try sample data produces evidence and statistics", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();

    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    // The explain CTA stands in for AI, which did not run.
    await expect(page.locator("#explainBar")).toBeVisible();
    await expect(page.locator("#summaryCard")).toBeHidden();

    // The two facts a reader triages first ride in the top bar, computed.
    await expect(page.locator("#dashMeta")).toContainText(/HEALTH [A-F] · \d+\/100/);
    await expect(page.locator("#dashMeta")).toContainText(/\d+ EVIDENCE/);

    // Deterministic sections are populated.
    await expect(page.locator("#evidenceSection")).toBeVisible();
    const evidenceCount = await page.locator(".evidence-item").count();
    expect(evidenceCount).toBeGreaterThan(0);
    await expect(page.locator("#qualitySection")).toBeVisible();
    // Column completeness is drawn, not abbreviated — a stacked track per
    // column, with the counts readable from its label.
    await expect(page.locator(".quality-col-track").first()).toBeVisible();
    await expect(page.locator('.quality-col[title*="valid"]').first()).toBeVisible();
    await expect(page.locator("#overviewSection")).toBeVisible();
    // Provenance is stated once on the tier, not repeated on every card inside it.
    await expect(page.locator("#tierFindings .prov--computed")).toHaveText("Computed");
    await expect(page.locator("#evidenceSection .prov--derived")).toHaveText("Derived");
    await expect(page.locator("#overviewGrid")).toContainText(/data health/i);
    await expect(page.locator("#overviewGrid")).toContainText(/completeness/i);
    // The score is drawn as a ring beside its number, never instead of it.
    await expect(page.locator(".health-ring")).toBeVisible();
    await expect(page.locator(".overview-meter")).toBeVisible();

    await expect(page.locator("#aiDetailGrid")).toBeHidden();
    await expect(page.locator("#resultNav")).toBeVisible();
    await expect(page.locator('#resultNav a[href="#overviewSection"]')).toHaveAttribute("aria-current", "location");
    await expect(page.locator("#resultNav")).toContainText(/Evidence/);
    await expect(page.locator("#resultNav")).toContainText(/Charts/);
    await expect(page.locator("#analysisRecord")).toBeVisible();
    await expect(page.locator("#analysisRecordSummary")).toContainText(/deterministic only/i);
    await page.locator("#analysisRecord summary").click();
    await expect(page.locator("#analysisRecordGrid")).toContainText(/not saved/i);
    await expect(page.locator("#analysisRecordGrid")).toContainText(/request id/i);
    await expect(page.getByRole("link", { name: "Give feedback" })).toHaveAttribute("href", /pilot-feedback\.yml/);
    await page.locator(".evidence-provenance summary").first().click();
    await expect(page.locator(".evidence-provenance").first()).toContainText(/Formula/i);
    await expect(page.locator(".evidence-provenance").first()).toContainText(/Included/i);
    await expect(page.locator(".evidence-source-table").first()).toBeVisible();

    // Tier ③ is reference material: collapsed on arrival, named while collapsed,
    // and never more than one click away. Asserted last because opening it
    // scrolls, which moves the nav's active section off the overview.
    await expect(page.locator("#statsSection")).toBeHidden();
    await expect(page.locator("#tierDataToggle")).toHaveAttribute("aria-expanded", "false");
    await page.locator('[data-tier-jump="statsSection"]').click();
    await expect(page.locator("#statsSection")).toBeVisible();
    await expect(page.locator("#statsSection")).toContainText("95% CI");
    // Three numeric columns produce spread strips: box, whisker line, median
    // tick and mean dot per column, each on its own stated scale.
    expect(await page.locator(".spread-row").count()).toBe(3);
    await expect(page.locator(".spread-head")).toContainText(/middle 50%/);
    await expect(page.locator(".spread-outliers").first()).toBeVisible();
    await expect(page.locator("#chartsSection")).toBeVisible();
    await expect(page.locator("#chartsSection .card-note")).toContainText(/full dataset/i);
    // Every chartable column gets a chart. The sample has three numeric
    // columns, two categories and a date column; the old renderer stopped at
    // one chart per kind and three in total.
    expect(await page.locator(".chart-card").count()).toBeGreaterThan(3);
  });

  test("evidence carries method, sample size and coverage", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#evidenceSection")).toBeVisible({ timeout: 20_000 });

    const meta = await page.locator(".evidence-item .evidence-meta").first().innerText();
    expect(meta).toMatch(/n=\d+/);
    expect(meta).toMatch(/\d+(\.\d+)?% coverage/);
    expect(meta).toMatch(/engine v\d+\.\d+\.\d+/);
    // Evidence and correlations share one strength scale, number alongside.
    const strength = page.locator("#evidenceSection .strength").first();
    await expect(strength).toBeVisible();
    await expect(strength.locator(".strength-dots i.on")).not.toHaveCount(0);
  });

  test("correlations report their sample size", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#corrSection")).toBeVisible();
    await expect(page.locator(".corr-meta").first()).toContainText(/n=\d+/);
    // The same scale the evidence uses, not a second visual language for it.
    await expect(page.locator("#corrSection .strength").first()).toBeVisible();
    // The pairing itself is drawn under the number it produced.
    await expect(page.locator(".corr-scatter canvas").first()).toBeVisible();
    // Three numeric columns produce the at-a-glance matrix, whose legend
    // distinguishes "below the reporting bar" from a measured zero.
    await expect(page.locator("#corrMatrix .corr-matrix-table")).toBeVisible();
    await expect(page.locator("#corrMatrix")).toContainText(/not a zero/);
  });

  test("uploading a file fixture works the same way", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(SAMPLE_CSV);
    await expect(page.locator(".file-chip-name")).toContainText("team-sales.csv");
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#evidenceSection")).toBeVisible();
  });

  test("explains an empty evidence panel instead of removing it", async ({ page }) => {
    // A small, clean, entirely ordinary file — the kind someone tries first —
    // clears no reporting threshold. The panel used to vanish, leaving a
    // first-time reader unable to tell a result from a breakage.
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(THIN_CSV);
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    const evidence = page.locator("#evidenceSection");
    await expect(evidence).toBeVisible();
    await expect(evidence).toContainText(/no finding cleared the reporting thresholds/i);
    await expect(evidence).toContainText(/result, not a failure/i);
    // And it points at what was computed, so the page still has somewhere to go.
    await expect(evidence).toContainText(/column statistics/i);
    await expect(page.locator("#statsSection, [data-tier-jump=\"statsSection\"]").first()).toBeVisible();
  });

  test("confirms an ordinary file was read as-is, rather than saying nothing", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    // A file Ridge checked and found ordinary used to look exactly like a file
    // Ridge never checked.
    const note = page.locator("#structureNote");
    await expect(note).toBeVisible();
    await expect(note).toContainText("Read as-is");
    await expect(note).toContainText("header on row 1");

    await note.locator("summary").click();
    await expect(page.locator("#structureDetail")).toContainText(/no total or subtotal rows/i);
  });

  test("says how a messy file was read, above the numbers it produced", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(MESSY_CSV);
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    const note = page.locator("#structureNote");
    await expect(note).toBeVisible();
    await expect(note).toContainText("Header on row 3");
    await expect(note).toContainText("4 observations");
    await expect(note).toContainText("2 rows excluded");

    // The rows it set aside are shown verbatim, with why.
    await note.locator("summary").click();
    await expect(page.locator("#structureDetail")).toContainText("Row 1");
    await expect(page.locator("#structureDetail")).toContainText("preamble");
    await expect(page.locator("#structureDetail")).toContainText("Row 9");
    await expect(page.locator("#structureDetail")).toContainText("aggregate");
  });

  test("keeps the total row out of the statistics it reports", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(MESSY_CSV);
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    await page.locator('[data-tier-jump="statsSection"]').click();
    await page.locator('[data-column="units"]').click();
    // 110.75 is the mean of the four regions. 177.2 is what including the
    // TOTAL row produced, and it is the number this whole feature exists to
    // stop being reported.
    await expect(page.locator("#columnInspector")).toContainText("110.75");
    await expect(page.locator("#columnInspector")).not.toContainText("177.2");
  });

  test("puts a row back when asked, and still says it did", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(MESSY_CSV);
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    await page.locator("#structureNote summary").click();
    await page.locator('[data-structure-include="9"]').click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    const note = page.locator("#structureNote");
    await expect(note).toContainText("5 observations");
    await expect(note).toContainText("1 put back");
    await page.locator("#structureNote summary").click();
    await expect(page.locator("#structureDetail")).toContainText("Put back at your request");
  });

  test("opens a full deterministic profile for any column", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-tier-jump="statsSection"]').click();
    await expect(page.locator("#statsSection")).toBeVisible();

    await page.locator('[data-column="revenue"]').click();
    await expect(page.locator("#columnInspector")).toBeVisible();
    await expect(page.locator("#columnInspectorTitle")).toHaveText("revenue");
    await expect(page.locator("#columnInspectorMetrics")).toContainText(/95% mean interval/i);
    await expect(page.locator("#columnInspectorVisual")).toContainText(/distribution/i);
    await expect(page.locator("#columnInspector")).toContainText(/full uploaded column/i);

    await page.keyboard.press("Escape");
    await expect(page.locator("#columnInspector")).toBeHidden();
  });

  test("the section nav expands the collapsed tier before jumping into it", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    // An anchor alone cannot reach a collapsed tier, so the nav opens it first.
    await expect(page.locator("#chartsSection")).toBeHidden();
    await page.locator('#resultNav a[href="#chartsSection"]').click();
    await expect(page.locator("#chartsSection")).toBeVisible();
    await expect(page.locator("#tierDataToggle")).toHaveAttribute("aria-expanded", "true");

    await page.locator("#tierDataToggle").click();
    await expect(page.locator("#chartsSection")).toBeHidden();
    await expect(page.locator("#tierDataToggle")).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("deterministic file comparison", () => {
  test("compares a baseline and current file with schema and metric deltas", async ({ page }) => {
    await page.goto("/app");
    await page.locator('[data-analysis-mode="compare"]').click();
    await expect(page.locator("#analysisModeHint")).toContainText(/baseline/i);
    await expect(page.locator("#urlInputWrap")).toBeHidden();
    // The whole sample strip steps aside in compare mode, not just its button.
    await expect(page.locator("#sampleStrip")).toBeHidden();

    await page.locator("#fileInput").setInputFiles([
      { name: "baseline.csv", mimeType: "text/csv", buffer: Buffer.from("region,revenue\nNorth,100\nSouth,120\nNorth,110\nSouth,130\n") },
      { name: "current.csv", mimeType: "text/csv", buffer: Buffer.from("region,revenue,channel\nWest,200,direct\nWest,220,direct\nSouth,210,partner\nWest,230,direct\n") },
    ]);
    await expect(page.locator(".file-chip-role")).toHaveText(["Baseline", "Current"]);
    await expect(page.locator("#uploadReadiness")).toContainText(/ready to compare/i);
    await page.locator("[data-swap-files]").click();
    await expect(page.locator(".file-chip-name")).toHaveText(["current.csv", "baseline.csv"]);
    await page.locator("[data-swap-files]").click();
    await expect(page.locator("#analyzeBtn")).toContainText(/Compare baseline to current/i);
    await page.locator("#analyzeBtn").click();

    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#compareSection")).toBeVisible();
    await expect(page.locator("#fileDashboard")).toBeHidden();
    await expect(page.locator("#compareTitle")).toContainText("baseline.csv → current.csv");
    await expect(page.locator("#compareSchema")).toContainText("channel");
    await expect(page.locator("#compareColumnRows")).toContainText("revenue");
    await expect(page.locator("#compareColumnRows")).toContainText("95% CI");
    await expect(page.locator("#compareColumnRows")).toContainText("KS D=");
    await expect(page.locator("#analysisRecordSummary")).toContainText(/deterministic comparison/i);
  });

  test("explains when no material changes cross reporting thresholds", async ({ page }) => {
    const stable = "region,revenue\nNorth,100\nSouth,120\nNorth,110\nSouth,130\n";
    await page.goto("/app");
    await page.locator('[data-analysis-mode="compare"]').click();
    await page.locator("#fileInput").setInputFiles([
      { name: "baseline.csv", mimeType: "text/csv", buffer: Buffer.from(stable) },
      { name: "current.csv", mimeType: "text/csv", buffer: Buffer.from(stable) },
    ]);
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#compareSection")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#compareFindings")).toContainText(/no material (descriptive )?changes detected/i);
    await expect(page.locator("#compareFindings")).toContainText(/reporting thresholds/i);
  });
});

test.describe("target column selection", () => {
  test("re-runs the analysis focused on a target", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    await expect(page.locator("#targetBar")).toBeVisible();
    await page.locator("#targetSelect").selectOption("revenue");

    // Setup changes are staged, not fired on change — the results are marked
    // stale and the user chooses when to spend the round trip.
    await expect(page.locator("#staleBanner")).toBeVisible();
    await expect(page.locator("#rerunBtn")).toHaveText("Re-run · 1 change");
    await page.locator("#rerunBtn").click();

    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#staleBanner")).toBeHidden();
    await expect(page.locator("#targetSelect")).toHaveValue("revenue");
    const claims = await page.locator(".evidence-claim").allInnerTexts();
    expect(claims.join(" ")).toContain("revenue");
  });

  test("narrowing columns re-runs the engine and discloses the exclusion", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#exclusionNote")).toBeHidden();

    await page.locator('[data-column-toggle="revenue"]').uncheck();
    await expect(page.locator("#staleBanner")).toBeVisible();
    await expect(page.locator("#rerunBtn")).toHaveClass(/is-dirty/);
    await page.locator("#rerunBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    // The exclusion is stated with the findings, not buried in the record.
    await expect(page.locator("#exclusionNote")).toBeVisible();
    await expect(page.locator("#exclusionSummary")).toContainText(/Computed from \d+ of \d+ columns/);
    await page.locator("#exclusionNote summary").click();
    await expect(page.locator("#exclusionList")).toContainText("revenue");
    await expect(page.locator("#staleBanner")).toBeHidden();

    // The engine really did narrow: the dropped column has no profile.
    await page.locator('[data-tier-jump="statsSection"]').click();
    await expect(page.locator("#statsSection")).toBeVisible();
    await expect(page.locator('[data-column="revenue"]')).toHaveCount(0);
  });

  test("refuses to leave the user analyzing nothing", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    // click(), not uncheck(): uncheck() asserts the box ends clear, and the
    // guard deliberately restores the last one.
    const boxes = page.locator("#railColumnList input[type=checkbox]");
    const count = await boxes.count();
    for (let index = 0; index < count; index++) await boxes.nth(index).click();

    // The last box refuses to clear rather than staging an empty analysis.
    expect(await page.locator("#railColumnList input:checked").count()).toBe(1);
  });
});

test.describe("AI interpretation is optional", () => {
  test("explain prompts for a key when none is configured", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#explainBar")).toBeVisible({ timeout: 20_000 });

    await expect(page.locator("#explainBtn")).toHaveText(/Add API key/);
    await page.locator("#explainBtn").click();
    await expect(page.locator("#settingsPanel")).toBeVisible();
    await expect(page.locator("#apiKeyInput")).toBeVisible();
  });

  test("the key field offers session-only storage by default", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#settingsBtn").click();
    await expect(page.locator("#rememberKeyToggle")).not.toBeChecked();
    await expect(page.locator(".settings-hint")).toContainText(/forwards it to Anthropic/i);
  });

  test("a saved key stays out of localStorage unless remembered", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#settingsBtn").click();
    await page.locator("#apiKeyInput").fill("sk-ant-browser-journey-key-000");
    await page.locator("#saveSettingsBtn").click();

    const stored = await page.evaluate(() => ({
      session: sessionStorage.getItem("ridge_api_key"),
      local: localStorage.getItem("ridge_api_key"),
    }));
    expect(stored.session).toBe("sk-ant-browser-journey-key-000");
    expect(stored.local).toBeNull();
  });

  test("remembering a key moves it to localStorage", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#settingsBtn").click();
    await page.locator("#apiKeyInput").fill("sk-ant-browser-journey-key-000");
    await page.locator("#rememberKeyToggle").check();
    await page.locator("#saveSettingsBtn").click();

    const stored = await page.evaluate(() => ({
      session: sessionStorage.getItem("ridge_api_key"),
      local: localStorage.getItem("ridge_api_key"),
    }));
    expect(stored.local).toBe("sk-ant-browser-journey-key-000");
    expect(stored.session).toBeNull();
  });
});

test.describe("persistence is opt-in", () => {
  test("the save toggle is off by default and explains itself", async ({ page }) => {
    await page.goto("/app");
    await expect(page.locator("#saveToggle")).not.toBeChecked();
    await expect(page.locator("#saveToggleHint")).toBeHidden();

    await page.locator("#saveToggle").check();
    await expect(page.locator("#saveToggleHint")).toBeVisible();
    await expect(page.locator("#saveToggleHint")).toContainText(/stored server-side/i);
  });

  test("an unsaved analysis shows no share control", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#shareBtn")).toBeHidden();
  });
});

test.describe("exports", () => {
  test("exports the analysis as JSON", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    const download = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#exportJsonBtn").click(),
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toMatch(/-analysis\.json$/);
  });

  test("downloads any chart as an image", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-tier-jump="chartsSection"]').click();
    await expect(page.locator(".chart-card canvas").first()).toBeVisible();
    // The canvas exists before its Chart instance does; wait for the instance
    // the download reads from.
    await page.waitForFunction(() =>
      window.Chart && Chart.getChart(document.querySelector(".chart-card canvas")));

    const download = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".chart-download").first().click(),
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(download.suggestedFilename()).toContain("team-sales");
  });

  test("opens a printable report stamped with the provenance vocabulary", async ({ page, context }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    const [report] = await Promise.all([
      context.waitForEvent("page"),
      page.locator("#exportReportBtn").click(),
    ]);
    await expect(report.locator("h1")).toContainText("Analysis report");
    // The report speaks the same three words as the app.
    await expect(report.locator("body")).toContainText("Computed");
    await expect(report.locator("body")).toContainText("Derived");
    await expect(report.locator("body")).toContainText("Written");
    // No key was configured, so the report says so rather than implying AI ran.
    await expect(report.locator("body")).toContainText(/ran deterministically without an API key/i);
  });
});

test.describe("error states", () => {
  test("rejects an unsupported file type with a readable message", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles({
      name: "notes.exe", mimeType: "application/octet-stream", buffer: Buffer.from("x"),
    });
    await expect(page.locator("#errorBox")).toBeVisible();
    await expect(page.locator("#errorBox")).toContainText(/Unsupported file type/i);
    await expect(page.locator("#analyzeBtn")).toBeDisabled();
  });

  test("rejects an invalid URL", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#urlInput").fill("http://127.0.0.1/secret.csv");
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#errorBox")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#errorBox")).toContainText(/https/i);
    // URL analysis uses the same deterministic pipeline as uploads. A missing
    // Anthropic key must not divert the user into AI settings first.
    await expect(page.locator("#settingsPanel")).toBeHidden();
  });
});

test.describe("keyboard navigation", () => {
  test("the primary controls are reachable and operable by keyboard", async ({ page }) => {
    await page.goto("/app");
    // The settings button opens on Enter without a pointer.
    await page.locator("#settingsBtn").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#settingsPanel")).toBeVisible();
    await expect(page.locator("#settingsBtn")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#apiKeyInput")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#settingsPanel")).toBeHidden();
    await expect(page.locator("#settingsBtn")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#settingsBtn")).toBeFocused();

    // The save toggle is a real checkbox: focusable and space-togglable.
    await page.locator("#saveToggle").focus();
    await expect(page.locator("#saveToggle")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator("#saveToggle")).toBeChecked();
  });

  test("the sample button runs from the keyboard", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
  });
});
