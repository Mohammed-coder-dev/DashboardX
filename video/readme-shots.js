// Recaptures the README's dashboard screenshots from the running product.
//
// The two images sit side by side in README.md's screenshot table, so their
// pixel dimensions are a layout contract: 2272x1362 for evidence.png and
// 2272x564 for quality.png — a 1136px-wide viewport at deviceScaleFactor 2.
// The script asserts the output sizes, so a capture that would shift the
// README layout fails instead of landing.
//
// The server is started keyless, exactly as video/capture.js starts it: the
// screenshots must show what a visitor gets on the no-key path.
//
// Usage:  node video/readme-shots.js

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const PORT = process.env.SHOTS_PORT || "3510";
const BASE = `http://127.0.0.1:${PORT}`;

const SHOTS = [
  { file: "evidence.png", selector: "#evidenceSection", viewport: { width: 1136, height: 681 } },
  { file: "quality.png", selector: "#qualitySection", viewport: { width: 1136, height: 282 } },
];

/* ── server ─────────────────────────────────────────────────────── */

async function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repo,
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...process.env,
      PORT,
      ANTHROPIC_API_KEY: "",
      RATE_LIMIT_POINTS: "10000",
      RATE_LIMIT_ASK_POINTS: "10000",
    },
  });
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error(`server did not become healthy at ${BASE} within 30s`);
}

function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/* ── capture ────────────────────────────────────────────────────── */

const server = await startServer();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: SHOTS[0].viewport,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.click("#sampleBtn");
  await page.waitForSelector("#dashboardScreen", { state: "visible", timeout: 25_000 });
  await page.waitForSelector("#evidenceSection", { state: "visible", timeout: 15_000 });

  // Charts build lazily as they approach the viewport; walk the whole page
  // once so everything exists before any framing begins.
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1000);

  for (const shot of SHOTS) {
    await page.setViewportSize(shot.viewport);
    // scrollIntoView honours the sections' scroll-margin-top, which is how
    // the app itself keeps a jumped-to section clear of the sticky header
    // and result nav. A manual scrollTo would put both over the first card.
    await page.evaluate((sel) => {
      document.querySelector(sel).scrollIntoView({ block: "start", behavior: "instant" });
    }, shot.selector);
    await page.waitForTimeout(600);

    const out = path.join(repo, "docs", "images", shot.file);
    await page.screenshot({ path: out, animations: "disabled" });

    const { width, height } = pngSize(await readFile(out));
    const want = { width: shot.viewport.width * 2, height: shot.viewport.height * 2 };
    if (width !== want.width || height !== want.height) {
      throw new Error(`${shot.file}: got ${width}x${height}, expected ${want.width}x${want.height}`);
    }
    console.log(`  ${shot.file}: ${width}x${height}`);
  }
} finally {
  await browser.close();
  server.kill();
}

console.log("done — review both images before committing them");
