import { expect, test } from "@playwright/test";

// A performance budget, enforced as a blocking check.
//
// This exists because of a regression that shipped and was not noticed: the
// type faces arrived through a render-blocking @import of a third-party host,
// so the product painted nothing at all behind a proxy that dropped the
// request. Nothing measured it, so nothing caught it.
//
// The budgets are the measured cost plus roughly a third, so ordinary
// authoring does not trip them but a new library, an inlined asset or a
// reintroduced remote stylesheet does. Timing gets a deliberately loose
// ceiling: a CI runner is slow and variable, and the failure this guards
// against was not "slightly slower", it was "never painted".
//
// Measured on a warm local server against the current pages:
//   /         7 requests   154 KB   FCP 116ms
//   /app      9 requests   516 KB   FCP 836ms
//   /docs     7 requests   198 KB   FCP  72ms
//   /privacy  7 requests   198 KB   FCP  64ms
// Most of that weight is the bundled type faces, which is the trade made when
// they stopped being fetched from a third party.
const KB = 1024;

const BUDGETS = [
  { route: "/",        requests: 12, bytes: 220 * KB, fcp: 2500, hosts: [] },
  // The chart library is the one third party the privacy page discloses.
  { route: "/app",     requests: 16, bytes: 700 * KB, fcp: 3000, hosts: ["cdn.jsdelivr.net"] },
  { route: "/docs",    requests: 12, bytes: 260 * KB, fcp: 2500, hosts: [] },
  { route: "/privacy", requests: 12, bytes: 260 * KB, fcp: 2500, hosts: [] },
];

for (const budget of BUDGETS) {
  test(`${budget.route} stays inside its performance budget`, async ({ page, baseURL }) => {
    const own = new URL(baseURL).host;
    const foreign = new Set();
    let requests = 0;
    let bytes = 0;

    page.on("response", async (response) => {
      requests += 1;
      const host = new URL(response.url()).host;
      if (host !== own) foreign.add(host);
      // A body that cannot be read (redirect, abort) simply contributes
      // nothing; the budget is an upper bound, so undercounting is safe.
      try {
        bytes += (await response.body()).length;
      } catch {
        /* not part of the transferred weight we can measure */
      }
    });

    await page.goto(budget.route, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const fcp = await page.evaluate(() => {
      const entry = performance.getEntriesByName("first-contentful-paint")[0];
      return entry ? Math.round(entry.startTime) : null;
    });

    expect(requests, `${budget.route} made ${requests} requests`).toBeLessThanOrEqual(budget.requests);
    expect(bytes, `${budget.route} transferred ${(bytes / KB).toFixed(0)} KB`).toBeLessThanOrEqual(budget.bytes);

    // Null would mean nothing was painted at all, which is the failure this
    // whole file exists for — so it is a failure, not a skipped assertion.
    expect(fcp, `${budget.route} never reported a contentful paint`).not.toBeNull();
    expect(fcp, `${budget.route} first paint was ${fcp}ms`).toBeLessThanOrEqual(budget.fcp);

    expect([...foreign].sort(), `${budget.route} contacted ${[...foreign].join(", ") || "nobody"}`)
      .toEqual([...budget.hosts].sort());
  });
}
