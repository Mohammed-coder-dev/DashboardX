import { expect, test } from "@playwright/test";

// Runs only under the "mobile" project (Pixel 5 viewport, touch enabled).

test("the application is usable on a phone viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#dropzone")).toBeVisible();
  await expect(page.locator("#analyzeBtn")).toBeVisible();

  // Nothing may overflow horizontally — the classic mobile regression.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the dashboard renders and stays within the viewport", async ({ page }) => {
  await page.goto("/");
  await page.locator("#sampleBtn").tap();
  await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator("#evidenceSection")).toBeVisible();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the explain bar stacks instead of squeezing", async ({ page }) => {
  await page.goto("/");
  await page.locator("#sampleBtn").tap();
  await expect(page.locator("#explainBar")).toBeVisible({ timeout: 25_000 });

  const bar = await page.locator("#explainBar").boundingBox();
  const button = await page.locator("#explainBtn").boundingBox();
  // Stacked layout: the button sits below the text, not beside it.
  expect(button.y).toBeGreaterThan(bar.y);
  expect(button.width).toBeGreaterThan(bar.width * 0.5);
});
