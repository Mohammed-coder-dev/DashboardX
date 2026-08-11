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
// A grouping row above the real header gives two plausible header rows, so the
// read comes back uncertain rather than merely messy.
const AMBIGUOUS_CSV = path.resolve(here, "../fixtures/ambiguous-header.csv");
// Five months of shipments with March entirely absent — the shape where a
// timeline that plots only populated buckets hides the gap.
const GAPPED_CSV = path.resolve(here, "../fixtures/gapped-timeline.csv");
// A monotone pair with one extreme opposing outlier: Pearson and Spearman
// tell materially different stories, and the engine's caveat says so.
const DISAGREEING_CSV = path.resolve(here, "../fixtures/disagreeing-pair.csv");

// The server runs without an Anthropic key, so these journeys exercise the
// deterministic product exactly as a first-time visitor experiences it.

test.describe("landing page at the root", () => {
  test("presents the product, not the upload form", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Ridge/);
    await expect(page.locator("h1")).toContainText(/answers you can defend/i);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /og-ridge-v2\.png$/);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
    // The workspace must not be the first thing a visitor meets.
    await expect(page.locator("#dropzone")).toHaveCount(0);
    // The hero demo speaks the product's own evidence vocabulary — a
    // coefficient with its sample size and coverage, not marketing numbers.
    await expect(page.locator(".demo-evidence")).toContainText(/n=\d+/);
    await expect(page.locator(".demo-evidence")).toContainText(/coverage/);
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
    await expect(page.locator("#overviewGrid")).toContainText(/quality/i);
    await expect(page.locator("#overviewGrid")).toContainText(/% complete/);
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
    // The mean never stands as a lone dot: its computed 95% interval is a
    // band on the same scale, and the legend names it.
    await expect(page.locator(".spread-ci").first()).toBeVisible();
    await expect(page.locator(".spread-head")).toContainText(/95% interval/);
    // Where a column has outliers, the IQR fences are drawn, not just counted.
    expect(await page.locator(".spread-fence").count()).toBeGreaterThanOrEqual(2);
    await expect(page.locator("#chartsSection")).toBeVisible();
    await expect(page.locator("#chartsSection .card-note")).toContainText(/full dataset/i);
    // Every chartable column gets a chart. The sample has three numeric
    // columns, two categories and a date column; the old renderer stopped at
    // one chart per kind and three in total.
    expect(await page.locator(".chart-card").count()).toBeGreaterThan(3);
  });

  test("the overview is a grid of self-contained cards routing into detail", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#overviewSection")).toBeVisible({ timeout: 20_000 });

    // Seven cards for the sample: file, quality, distribution, findings,
    // strongest, unsettled, worst columns. Every one is a computed answer.
    expect(await page.locator(".overview-card").count()).toBe(7);

    // The file card and the structure note may never disagree about scope.
    await expect(page.locator(".overview-card--file")).toContainText("Full dataset");
    await expect(page.locator(".overview-card--file")).toContainText(/read as-is/i);

    // The file card carries marks, not only sentences: a column-kinds segment
    // bar whose text names every segment, and the timeline as a sparkline
    // with its endpoints labelled.
    const kinds = page.locator(".overview-card--file .segbar");
    await expect(kinds).toBeVisible();
    await expect(kinds).toHaveAttribute("aria-label", /\d+ columns: .*numeric/);
    const spark = page.locator(".overview-card--file .overview-spark");
    await expect(spark).toBeVisible();
    await expect(spark).toContainText("2024-01-02");
    await expect(spark.locator(".sparkline")).toHaveAttribute("aria-label", /rows per month/);

    // The quality card says what it could NOT assess, or that it could
    // assess everything — either is an answer, so one must be present.
    await expect(page.locator(".overview-card--quality")).toContainText(/could not assess|every column was assessable/i);

    // Findings by family: a family the file cannot support says what it
    // needed, at the same weight as a counted one — never silently absent.
    await expect(page.locator(".overview-card--findings")).toContainText(/not tested — needs a numeric target/);
    await expect(page.locator(".overview-card--findings .overview-family-track").first()).toBeVisible();

    // The strongest findings carry their support inline — n and the effect
    // travel with the claim, not only in the detail view. The rank coefficient
    // is spelled "rho": the ρ glyph reads as a Latin p at this size, and a
    // coefficient misread as a p-value is the worst confusion possible here.
    await expect(page.locator(".overview-vitals").first()).toContainText(/n=\d+/);
    await expect(page.locator(".overview-vitals").first()).not.toContainText("ρ");

    // Family labels fit their column instead of truncating.
    await expect(page.locator(".overview-card--findings")).toContainText("Associations");

    // The target column's shape is actually visible, not a number about it.
    expect(await page.locator(".overview-dist-bar").count()).toBeGreaterThan(1);

    // A card routes into the section holding the full detail; a details
    // target opens itself so the jump never lands on a folded note.
    await page.locator('.overview-card--file [data-overview-jump="structureNote"]').click();
    await expect(page.locator("#structureNote")).toHaveAttribute("open", "");
  });

  test("each card has one dominant headline numeral", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#overviewSection")).toBeVisible({ timeout: 20_000 });

    // Three text tiers: the headline reads from across the room (~3× body),
    // the label stays quiet, and nothing else on the card competes.
    const tiers = await page.evaluate(() => {
      const card = document.querySelector(".overview-card--findings");
      const px = (selector) => parseFloat(getComputedStyle(card.querySelector(selector)).fontSize);
      return { headline: px(".overview-card-value"), label: px(".overview-card-label"), body: px(".overview-family-name") };
    });
    expect(tiers.headline / tiers.body).toBeGreaterThanOrEqual(2.5);
    expect(tiers.label).toBeLessThan(tiers.body);
    // Every card has exactly one headline value.
    const cards = await page.locator(".overview-card").count();
    expect(await page.locator(".overview-card .overview-card-value").count()).toBe(cards);
  });

  test("uncertainty sits in the grid at the same visual weight as certainty", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#overviewSection")).toBeVisible({ timeout: 20_000 });

    // The unsettled card is always present — its empty state ("nothing left
    // unsettled") is as real an answer as a list of open questions.
    const unsettled = page.locator(".overview-card--unsettled");
    await expect(unsettled).toBeVisible();
    await expect(unsettled).toContainText(/open question|nothing left unsettled/i);

    // Same chrome as the confident cards: identical label typography and an
    // identical surface — not an amber warning, not a demoted footnote.
    const weights = await page.evaluate(() => {
      const styleOf = (selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return { font: style.fontSize, background: style.backgroundColor };
      };
      return {
        unsettled: styleOf(".overview-card--unsettled .overview-card-label"),
        findings: styleOf(".overview-card--findings .overview-card-label"),
        unsettledCard: styleOf(".overview-card--unsettled"),
        findingsCard: styleOf(".overview-card--findings"),
      };
    });
    expect(weights.unsettled.font).toBe(weights.findings.font);
    expect(weights.unsettledCard.background).toBe(weights.findingsCard.background);
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

  test("a finding's interval and p-value travel with the claim, not only the drilldown", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    // Targeting revenue makes the engine compare its mean across the category
    // levels, which ships a Welch test with an interval and a p-value. Setup
    // changes are staged, so the re-run button fires the new analysis.
    await page.locator("#targetSelect").selectOption("revenue");
    await page.locator("#rerunBtn").click();
    await expect(page.locator(".evidence-inference").first()).toBeVisible({ timeout: 20_000 });

    // Visible without opening any drilldown: effect size, the interval as a
    // range (never a lone number), the p-value, and that it is unadjusted.
    const inference = await page.locator(".evidence-inference").first().innerText();
    expect(inference).toMatch(/d=-?\d/);
    expect(inference).toMatch(/95% CI .+ to |interval unavailable/);
    expect(inference).toMatch(/p=|unavailable/);
    expect(inference).toMatch(/unadjusted|unavailable/);
    // The drilldown stayed closed — the statistics did not require it.
    await expect(page.locator(".evidence-provenance[open]")).toHaveCount(0);
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

  test("a disagreeing correlation shows both computed coefficients", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(DISAGREEING_CSV);
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#corrSection")).toBeVisible();

    // Both coefficients were always in the payload; when the methods tell
    // different stories, showing only the leader hid the disagreement's size.
    const meta = await page.locator(".corr-meta").first().innerText();
    expect(meta).toMatch(/pearson [+-]\d/);
    expect(meta).toMatch(/spearman [+-]\d/);
    await expect(page.locator(".corr-caveat").first()).toContainText(/pearson and spearman disagree/i);
  });

  test("uploading a file fixture works the same way", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(SAMPLE_CSV);
    await expect(page.locator(".file-chip-name")).toContainText("team-sales.csv");
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#evidenceSection")).toBeVisible();
  });

  test("histogram outlier tails render hollow, apart from the central shape", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    // Charts build lazily as they approach the viewport, so open tier ③ and
    // bring the grid on screen before reading the rendered configuration.
    await page.locator('[data-tier-jump="chartsSection"]').click();
    await expect(page.locator(".chart-card canvas").first()).toBeVisible();
    await page.locator("#chartsGrid").scrollIntoViewIfNeeded();

    // The sample has a column with IQR outliers, so its histogram carries a
    // tail bin — drawn transparent inside its accent border, never as one
    // more solid bar of the central shape.
    await expect
      .poll(async () => page.evaluate(() => {
        return [...document.querySelectorAll(".chart-canvas")].some((canvas) => {
          const chart = Chart.getChart(canvas);
          const fill = chart?.data?.datasets?.[0]?.backgroundColor;
          return Array.isArray(fill) && fill.includes("transparent");
        });
      }), { timeout: 10_000 }).toBe(true);
    await expect(page.locator(".chart-reason", { hasText: /drawn hollow/ }).first()).toBeVisible();
  });

  test("a timeline shows its empty periods instead of compressing them away", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(GAPPED_CSV);
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    // The trend chart's stated basis names the gap it drew as zero, so a
    // month with no shipments never looks like a month that never happened.
    await page.locator('[data-tier-jump="chartsSection"]').click();
    await expect(page.locator(".chart-reason", { hasText: /empty period/ })).toBeVisible();
    await expect(page.locator(".chart-reason", { hasText: /shown as zero/ })).toBeVisible();

    // The column inspector's timeline restores the same gap as a labelled
    // zero-count bucket rather than skipping the month.
    await page.locator('[data-column="shipped"]').click();
    await expect(page.locator("#columnInspector")).toBeVisible();
    await expect(page.locator("#columnInspectorVisual")).toContainText(/empty period/);
    await expect(page.locator('.column-inspector-bar[title="2024-03: 0"]')).toBeVisible();
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

    // The overview says the same thing in its cards: zero findings is an
    // answer, and a family this file cannot support says what it needed —
    // two text columns support none of the seven evidence families.
    await expect(page.locator(".overview-card--strongest")).toContainText(/no finding cleared the reporting thresholds/i);
    expect(await page.locator(".overview-card--findings .overview-family-na").count()).toBe(7);
    await expect(page.locator(".overview-card--columns")).toContainText(/complete and consistently typed/i);
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

    // Nothing was set aside, so the headline tile may say so.
    await expect(page.locator("#overviewGrid")).toContainText("Full dataset");
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

  test("an unsettled read opens its own reasoning; a confident one stays folded", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(AMBIGUOUS_CSV);
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    // Two plausible header rows. The caveat and the rows set aside are the
    // reader's first business, so they are not left behind a summary line.
    const note = page.locator("#structureNote");
    await expect(note).toHaveAttribute("open", "");
    await expect(page.locator("#structureDetail")).toContainText(/could not settle this from the file alone/i);
    await expect(page.locator("#structureDetail")).toBeVisible();

    // A file Ridge did settle keeps its detail folded away.
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#structureNote")).not.toHaveAttribute("open", "");
  });

  test("the rows tile counts the exclusions instead of claiming the full dataset", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(MESSY_CSV);
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    // The tile a reader sees first and the provenance note underneath it
    // describe the same read, in the same words. Claiming the full dataset on a
    // file whose title block and TOTAL row were deliberately dropped is the one
    // thing this summary must never do.
    const overview = page.locator("#overviewGrid");
    await expect(overview).toContainText("2 rows excluded");
    await expect(overview).not.toContainText("Full dataset");
    await expect(page.locator("#structureNote")).toContainText("2 rows excluded");
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
    // The median moved too, and it was always computed — say so in the cell.
    await expect(page.locator("#compareColumnRows")).toContainText(/median [+-]/);

    // The distribution shift is drawn, not just tabulated: both sides' five-
    // number summaries on one shared scale, identity carried by row labels.
    const shift = page.locator(".compare-shift").first();
    await expect(shift).toBeVisible();
    await expect(shift).toContainText("revenue");
    await expect(shift.locator(".compare-shift-row--baseline")).toBeVisible();
    await expect(shift).toContainText("Current");
    await expect(shift).toContainText(/KS D=|KS not testable/);
    await expect(shift).toContainText("shared scale");
    // The interval bands ride on the strips: the mean is never a lone dot.
    expect(await shift.locator(".spread-ci").count()).toBe(2);

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

    // Opening from here has to leave the same state the toolbar button does:
    // announced as expanded, with focus in the field it just revealed. This
    // route used to report a collapsed panel and strand focus at the foot of
    // the results.
    await expect(page.locator("#settingsBtn")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#apiKeyInput")).toBeFocused();
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

  test("does not blame the file size for a server fault it cannot explain", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(SAMPLE_CSV);
    await page.route("**/api/analyze*", (route) =>
      route.fulfill({ status: 500, contentType: "text/html", body: "<html>Internal Server Error</html>" }));
    await page.locator("#analyzeBtn").click();

    const error = page.locator("#errorBox");
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText("500");
    // The upload is a few kilobytes and the readiness line said so a moment
    // earlier. Guessing at size here sends the reader after the wrong cause.
    await expect(error).not.toContainText(/too large/i);
  });

  test("names the size limit when the server is the one reporting it", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(SAMPLE_CSV);
    await page.route("**/api/analyze*", (route) =>
      route.fulfill({ status: 413, contentType: "text/html", body: "<html>Payload Too Large</html>" }));
    await page.locator("#analyzeBtn").click();

    const error = page.locator("#errorBox");
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText(/too large/i);
    await expect(error).toContainText(/https link/i);
  });

  test("explains a dropped connection in its own words, not the browser's", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(SAMPLE_CSV);
    // The request never reaches the server at all — what an offline visitor or
    // a dropped mobile connection actually produces.
    await page.route("**/api/analyze*", (route) => route.abort("internetdisconnected"));
    await page.locator("#analyzeBtn").click();

    const error = page.locator("#errorBox");
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText(/could not reach the server/i);
    await expect(error).toContainText(/try again/i);
    // "Failed to fetch" is Chrome's internal phrasing for a rejected fetch. It
    // names no cause and suggests no action, so it must never be the message.
    await expect(error).not.toContainText(/failed to fetch/i);
  });
});

test.describe("the pages stand on their own", () => {
  // The type faces used to arrive through a render-blocking @import of
  // fonts.googleapis.com. Behind a proxy that drops that request rather than
  // refusing it, nothing painted at all: the landing page showed its nav and no
  // hero, and the workspace showed a bare top bar and no dropzone.
  for (const [route, marker] of [["/", "h1"], ["/app", "#dropzoneTitle"]]) {
    test(`${route} renders with every external host unreachable`, async ({ page }) => {
      for (const host of ["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net"]) {
        await page.route(`**://${host}/**`, (route) => route.abort());
      }
      await page.goto(route);
      await expect(page.locator(marker)).toBeVisible();
      await expect(page.locator(marker)).not.toBeEmpty();
    });
  }

  test("the landing page contacts no other host at all", async ({ page, baseURL }) => {
    const own = new URL(baseURL).host;
    const hosts = new Set();
    page.on("request", (r) => {
      if (!r.url().startsWith("data:")) hosts.add(new URL(r.url()).host);
    });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    expect([...hosts], `hosts contacted: ${[...hosts].join(", ")}`).toEqual([own]);
  });

  test("the workspace loads its type faces from this origin", async ({ page, baseURL }) => {
    const fontHosts = [];
    page.on("request", (r) => {
      if (r.resourceType() === "font") fontHosts.push(new URL(r.url()).host);
    });
    await page.goto("/app");
    await page.evaluate(() => document.fonts.ready);
    expect(fontHosts.length).toBeGreaterThan(0);
    expect([...new Set(fontHosts)]).toEqual([new URL(baseURL).host]);

    // DM Sans ships as one variable file per subset, so the weight axis has to
    // interpolate — otherwise 500 and 600 silently render as 400.
    const widths = await page.evaluate(() =>
      [400, 500, 600, 700].map((weight) => {
        const probe = document.createElement("span");
        probe.textContent = "Handgloves 2026";
        probe.style.cssText = `position:absolute;visibility:hidden;font-size:40px;font-family:'DM Sans';font-weight:${weight};`;
        document.body.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return Math.round(width * 100);
      }));
    expect(new Set(widths).size, `weights rendered at widths ${widths}`).toBe(4);
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

  // Every route the navigation links to, not just the workspace. The landing
  // page made a keyboard visitor walk the whole nav before reaching the hero.
  for (const route of ["/app", "/", "/docs", "/privacy"]) {
    test(`the first Tab stop on ${route} skips past the chrome to the content`, async ({ page }) => {
      await page.goto(route);
      await page.keyboard.press("Tab");
      await expect(page.locator(".skip-link")).toBeFocused();
      await page.keyboard.press("Enter");
      expect(new URL(page.url()).hash).toBe("#main");
      await expect(page.locator("#main")).toBeVisible();
    });
  }

  test("reduced motion never hides the results", async ({ page }) => {
    // The tier entry animations start from opacity: 0. With animations
    // disabled, nothing else ever showed the tiers — reduced-motion users got
    // a blank dashboard. Pinned against the media query, not the bug.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#evidenceSection")).toBeVisible();
    const opacity = await page.locator("#tierFindings")
      .evaluate((element) => getComputedStyle(element).opacity);
    expect(opacity).toBe("1");
  });
});
