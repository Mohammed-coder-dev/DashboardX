import { expect, test } from "@playwright/test";

// Runs only under the "mobile" project (Pixel 5 viewport, touch enabled).

test("the application is usable on a phone viewport", async ({ page }) => {
  await page.goto("/app");
  await expect(page.locator("#dropzone")).toBeVisible();
  await expect(page.locator("#analyzeBtn")).toBeVisible();

  // Nothing may overflow horizontally — the classic mobile regression.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

});

test("the dashboard renders and stays within the viewport", async ({ page }) => {
  await page.goto("/app");
  await page.locator("#sampleBtn").tap();
  await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 25_000 });
  await expect(page.locator("#evidenceSection")).toBeVisible();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Column profiles live in tier ③, which arrives collapsed. The jump buttons
  // that open it are the first thing a phone visitor has to hit, so they meet
  // the same 44px floor as the controls they reveal.
  for (const control of ['[data-tier-jump="statsSection"]', "#tierDataToggle"]) {
    const box = await page.locator(control).boundingBox();
    expect(box.height, `${control} touch target`).toBeGreaterThanOrEqual(44);
  }
  await page.locator('[data-tier-jump="statsSection"]').tap();
  await expect(page.locator("#statsSection")).toBeVisible();

  await page.locator('[data-column="revenue"]').tap();
  await expect(page.locator("#columnInspector")).toBeVisible();
  const closeButton = await page.locator("#columnInspectorClose").boundingBox();
  expect(closeButton.height).toBeGreaterThanOrEqual(44);
  const inspectorOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(inspectorOverflow).toBeLessThanOrEqual(1);
  await page.locator("#columnInspectorClose").tap();
  await expect(page.locator("#columnInspector")).toBeHidden();
});

test("the overview cards stack single-column on a phone", async ({ page }) => {
  await page.goto("/app");
  await page.locator("#sampleBtn").tap();
  await expect(page.locator("#overviewSection")).toBeVisible({ timeout: 25_000 });

  // Every card takes the full row: dense grid on desktop, one column here.
  const stacked = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".overview-card")];
    const xs = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().x)));
    return { cards: cards.length, distinctX: xs.size };
  });
  expect(stacked.cards).toBeGreaterThan(0);
  expect(stacked.distinctX).toBe(1);

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the matrix, spread strips and charts stay within a phone viewport", async ({ page }) => {
  await page.goto("/app");
  await page.locator("#sampleBtn").tap();
  await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 25_000 });

  // The correlation matrix renders in tier ② immediately; it must scroll
  // inside its own wrapper, never widen the page.
  await expect(page.locator("#corrMatrix .corr-matrix-table")).toBeVisible();

  // Tier ③ arrives collapsed, so its spread strips and chart grid joined no
  // layout yet — expand it before measuring.
  await page.locator('[data-tier-jump="statsSection"]').tap();
  await expect(page.locator(".spread-row").first()).toBeVisible();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("chart downloads and spread strips are built for touch", async ({ page }) => {
  await page.goto("/app");
  await page.locator("#sampleBtn").tap();
  await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 25_000 });

  await page.locator('[data-tier-jump="chartsSection"]').tap();
  await expect(page.locator(".chart-card canvas").first()).toBeVisible();
  // The download control meets the same 44px floor as every other button.
  const download = await page.locator(".chart-download").first().boundingBox();
  expect(download.height).toBeGreaterThanOrEqual(44);

  // Spread strips reflow to two lines on a phone: the strip row sits below
  // the name rather than squeezing beside it. Sampled in one frame — the
  // tier jump scrolls smoothly, and two boundingBox calls milliseconds apart
  // measure the same elements at different scroll positions.
  const layout = await page.evaluate(() => {
    const row = document.querySelector(".spread-row");
    return {
      nameY: row.querySelector(".spread-name").getBoundingClientRect().y,
      trackY: row.querySelector(".spread-track").getBoundingClientRect().y,
    };
  });
  expect(layout.trackY).toBeGreaterThan(layout.nameY);
});

test("the setup rail collapses into a drawer and still fits", async ({ page }) => {
  await page.goto("/app");
  await page.locator("#sampleBtn").tap();
  await expect(page.locator("#dashboardScreen")).toBeVisible({ timeout: 25_000 });

  // Collapsed by default on a phone, so setup never buries the results.
  await expect(page.locator("#railColumnList")).toBeHidden();
  // The control that reveals the drawer meets the same 44px floor as the
  // controls inside it.
  expect((await page.locator("#railToggle").boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.locator("#railToggle").tap();
  await expect(page.locator("#railColumnList")).toBeVisible();
  await expect(page.locator("#railToggle")).toHaveAttribute("aria-expanded", "true");

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the explain bar stacks instead of squeezing", async ({ page }) => {
  await page.goto("/app");
  await page.locator("#sampleBtn").tap();
  await expect(page.locator("#explainBar")).toBeVisible({ timeout: 25_000 });

  const bar = await page.locator("#explainBar").boundingBox();
  const button = await page.locator("#explainBtn").boundingBox();
  // Stacked layout: the button sits below the text, not beside it.
  expect(button.y).toBeGreaterThan(bar.y);
  expect(button.width).toBeGreaterThan(bar.width * 0.5);
});

test("the landing page fits a phone and reaches the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.getByRole("link", { name: "Open the app" }).first().tap();
  await expect(page.locator("#dropzone")).toBeVisible();
});
