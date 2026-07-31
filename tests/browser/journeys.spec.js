import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_CSV = path.resolve(here, "../../public/samples/team-sales.csv");

// The server runs without an Anthropic key, so these journeys exercise the
// deterministic product exactly as a first-time visitor experiences it.

test.describe("landing page at the root", () => {
  test("presents the product, not the upload form", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Ridge/);
    await expect(page.locator("h1")).toContainText(/Evidence-backed analysis for spreadsheets/i);
    // The workspace must not be the first thing a visitor meets.
    await expect(page.locator("#dropzone")).toHaveCount(0);
  });

  test("reaches the working engine in one click", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Open the app" }).first().click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("#dropzone")).toBeVisible();
  });

  test("covers problem, audience, trust and a footer", async ({ page }) => {
    await page.goto("/");
    const body = page.locator("body");
    await expect(body).toContainText(/How it works/i);
    await expect(body).toContainText(/Who it's for/i);
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
});

test.describe("deterministic analysis without an API key", () => {
  test("try sample data produces evidence and statistics", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();

    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    // The explain CTA stands in for AI, which did not run.
    await expect(page.locator("#explainBar")).toBeVisible();
    await expect(page.locator("#summaryCard")).toBeHidden();

    // Deterministic sections are populated.
    await expect(page.locator("#evidenceSection")).toBeVisible();
    const evidenceCount = await page.locator(".evidence-item").count();
    expect(evidenceCount).toBeGreaterThan(0);
    await expect(page.locator("#statsSection")).toBeVisible();
    await expect(page.locator("#qualitySection")).toBeVisible();
  });

  test("evidence carries method, sample size and coverage", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#evidenceSection")).toBeVisible({ timeout: 20_000 });

    const meta = await page.locator(".evidence-item .evidence-meta").first().innerText();
    expect(meta).toMatch(/n=\d+/);
    expect(meta).toMatch(/\d+(\.\d+)?% coverage/);
    expect(meta).toMatch(/engine v\d+\.\d+\.\d+/);
    await expect(page.locator(".evidence-strength").first()).toBeVisible();
  });

  test("correlations report their sample size", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#corrSection")).toBeVisible();
    await expect(page.locator(".corr-meta").first()).toContainText(/n=\d+/);
  });

  test("uploading a file fixture works the same way", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#fileInput").setInputFiles(SAMPLE_CSV);
    await expect(page.locator(".file-chip-name")).toContainText("team-sales.csv");
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#evidenceSection")).toBeVisible();
  });
});

test.describe("target column selection", () => {
  test("re-runs the analysis focused on a target", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    await expect(page.locator("#targetBar")).toBeVisible();
    await page.locator("#targetSelect").selectOption("revenue");

    // The re-run returns to the dashboard with the target applied.
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#targetSelect")).toHaveValue("revenue");
    const claims = await page.locator(".evidence-claim").allInnerTexts();
    expect(claims.join(" ")).toContain("revenue");
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

  test("opens a printable report labelling deterministic and AI sections", async ({ page, context }) => {
    await page.goto("/app");
    await page.locator("#sampleBtn").click();
    await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 20_000 });

    const [report] = await Promise.all([
      context.waitForEvent("page"),
      page.locator("#exportReportBtn").click(),
    ]);
    await expect(report.locator("h1")).toContainText("Analysis report");
    await expect(report.locator("body")).toContainText("deterministic");
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
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#errorBox")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#errorBox")).toContainText(/Unsupported file type/i);
  });

  test("rejects an invalid URL", async ({ page }) => {
    await page.goto("/app");
    await page.locator("#urlInput").fill("http://127.0.0.1/secret.csv");
    await page.locator("#analyzeBtn").click();
    await expect(page.locator("#errorBox")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("keyboard navigation", () => {
  test("the primary controls are reachable and operable by keyboard", async ({ page }) => {
    await page.goto("/app");
    // The settings button opens on Enter without a pointer.
    await page.locator("#settingsBtn").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#settingsPanel")).toBeVisible();

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
