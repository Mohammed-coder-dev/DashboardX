// Records one video clip per scene in script.js.
//
// Two capture strategies, chosen per scene:
//
//   kind: "static"  frame-stepped. The scene exposes window.seek(t); we set the
//                   clock, screenshot, advance. Output is a lossless PNG
//                   sequence, so timing is exact and nothing depends on how
//                   fast this machine happens to be.
//
//   kind: "app"     the real product, driven live and recorded by Playwright.
//                   Wall-clock dependent by nature, which is why build.js pads
//                   or trims each clip to its narration rather than trusting it.
//
// Usage:  node video/capture.js [sceneId ...]      (default: all scenes)

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, rm, readdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES, CANVAS } from "./script.js";
import { run, ffmpeg } from "./lib/proc.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const OUT = path.join(here, "out", "clips");
const FRAMES = path.join(here, "out", "frames");
const PORT = process.env.VIDEO_PORT || "3410";
const BASE = `http://127.0.0.1:${PORT}`;

// App scenes are laid out at 720p and upscaled to the 1080p canvas. The app's
// base font is 14px, which at a true 1920-wide viewport is unreadable once the
// video is played in anything smaller than fullscreen. Rendering narrow and
// scaling up by 1.5 costs a little sharpness and buys legibility, which is the
// right trade for a demo. Static scenes are authored at 1080p and unaffected.
const APP_VIEWPORT = { width: 1280, height: 720 };

/* ── server ─────────────────────────────────────────────────────── */

async function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repo,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT,
      // The deterministic engine needs no key; scene 05 supplies one through the
      // UI exactly as a visitor would, so the server never holds it.
      ANTHROPIC_API_KEY: "",
      RATE_LIMIT_POINTS: "10000",
      RATE_LIMIT_ASK_POINTS: "10000",
    },
  });
  child.stdout.on("data", () => {});
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

/* ── shared browser helpers ─────────────────────────────────────── */

const settle = (page, ms = 400) => page.waitForTimeout(ms);

// Scrolls over time instead of jumping, so the recording reads as camera
// movement rather than a cut. Duration is in seconds.
//
// The element is resolved by Playwright and passed in as a handle rather than
// re-queried inside the page: that keeps Playwright's selector engine
// available here (`:has-text()`, `text=`) instead of limiting callers to what
// document.querySelector understands.
async function glide(page, selector, seconds = 2.2, block = "center") {
  const handle = await page.locator(selector).first().elementHandle({ timeout: 10_000 });
  if (!handle) return;
  await page.evaluate(
    ([el, dur, blk]) =>
      new Promise((resolve) => {
        if (!el) return resolve();
        const rect = el.getBoundingClientRect();
        const target =
          window.scrollY +
          rect.top -
          (blk === "center" ? (window.innerHeight - rect.height) / 2 : 80);
        const from = window.scrollY;
        const delta = target - from;
        const t0 = performance.now();
        const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
        (function step(now) {
          const k = Math.min(1, (now - t0) / (dur * 1000));
          window.scrollTo(0, from + delta * ease(k));
          k < 1 ? requestAnimationFrame(step) : resolve();
        })(t0);
      }),
    [handle, seconds, block],
  );
  await handle.dispose();
}

/* ── static scenes ──────────────────────────────────────────────── */

async function captureStatic(scene) {
  const dir = path.join(FRAMES, scene.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: CANVAS.width, height: CANVAS.height },
    deviceScaleFactor: 1,
  });
  await page.goto("file://" + path.join(here, scene.source).replace(/\\/g, "/"));
  // Webfonts arrive over the network; a frame captured before they land would
  // show fallback metrics and jump on the very next frame.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  const total = Math.round(scene.duration * CANVAS.fps);
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.seek(t), f / CANVAS.fps);
    await page.screenshot({
      path: path.join(dir, String(f).padStart(5, "0") + ".png"),
      animations: "disabled",
    });
  }
  await browser.close();

  const out = path.join(OUT, `${scene.id}.mp4`);
  await ffmpeg([
    "-y", "-framerate", String(CANVAS.fps),
    "-i", path.join(dir, "%05d.png"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "16",
    "-pix_fmt", "yuv420p", out,
  ]);
  console.log(`  ${scene.id}: ${total} frames → ${path.relative(repo, out)}`);
  return out;
}

/* ── app scenes ─────────────────────────────────────────────────── */

// One choreography per app scene. Each is given `page` and should spend roughly
// scene.duration seconds showing the product; build.js reconciles the rest.
const CHOREO = {
  "02-inversion": async (page) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await settle(page, 2800);
    await glide(page, "#how", 2.6, "top");
    await settle(page, 2600);
    await glide(page, "#trust", 2.4, "top");
    await settle(page, 2400);
  },

  "03-upload": async (page) => {
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await settle(page, 1600);
    await page.setInputFiles("#fileInput", path.join(repo, "public/samples/team-sales.csv"));
    await settle(page, 900);
    const analyze = page.locator("#analyzeBtn");
    if (await analyze.isVisible().catch(() => false)) await analyze.click();
    await page.waitForSelector("#dashboardScreen", { state: "visible", timeout: 25_000 });
    await settle(page, 2000);
    // Past the setup form, which is a dense block of checkboxes and reads badly
    // on camera, and onto the headline result.
    await glide(page, "#overviewSection", 2.4, "top");
    await settle(page, 4200);
  },

  "04-evidence": async (page) => {
    // Uploaded rather than loaded via ?sample=1, which would retitle the run
    // "team-sales-sample.csv" and contradict the filename scene 03 just showed.
    // Same data either way; this keeps it one continuous session on screen.
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    await page.setInputFiles("#fileInput", path.join(repo, "public/samples/team-sales.csv"));
    const analyze = page.locator("#analyzeBtn");
    if (await analyze.isVisible().catch(() => false)) await analyze.click();
    await page.waitForSelector("#dashboardScreen", { state: "visible", timeout: 25_000 });
    await page.evaluate(() => document.fonts.ready);
    await settle(page, 1400);
    await glide(page, "#evidenceSection", 2.2, "top");
    // The headline card is the spearman/pearson disagreement the narration is
    // describing; hold long enough for n, coverage and the caveat to be read.
    await settle(page, 4200);
    // Opening the provenance drawer is the "show your working" beat.
    await page.locator("details.evidence-provenance > summary").first().click();
    await settle(page, 4600);
    await glide(page, "#corrSection", 2.2, "top");
    await settle(page, 3800);
    await glide(page, "#qualitySection", 2.2, "top");
    await settle(page, 3400);
  },

  "05-interpretation": async (page) => {
    const key = process.env.RIDGE_DEMO_ANTHROPIC_KEY;
    await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    await page.setInputFiles("#fileInput", path.join(repo, "public/samples/team-sales.csv"));
    const analyze = page.locator("#analyzeBtn");
    if (await analyze.isVisible().catch(() => false)) await analyze.click();
    await page.waitForSelector("#dashboardScreen", { state: "visible", timeout: 25_000 });
    await page.evaluate(() => document.fonts.ready);
    await settle(page, 1200);

    // The key is typed into the product's own masked field, which is where a
    // visitor would put it. It is never written to disk and never rendered.
    await page.click("#settingsBtn");
    await settle(page, 900);
    await page.fill("#apiKeyInput", key);
    await settle(page, 700);
    await page.click("#saveSettingsBtn");
    await settle(page, 1100);

    await glide(page, "#explainBar", 1.8);
    await page.click("#explainBtn");
    // The model call is the one genuinely slow beat; give it room.
    await page.waitForSelector("#conclusionSection", { state: "visible", timeout: 60_000 });
    await settle(page, 4200);
    await glide(page, "#conclusionSection", 2.0);
    await settle(page, 3000);
  },
};

async function captureApp(scene) {
  const raw = path.join(FRAMES, scene.id + "-raw");
  await rm(raw, { recursive: true, force: true });
  await mkdir(raw, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: APP_VIEWPORT,
    deviceScaleFactor: 2, // render at 2x so the 1.5x upscale still resolves crisply
    recordVideo: { dir: raw, size: APP_VIEWPORT },
  });
  const page = await context.newPage();
  try {
    await CHOREO[scene.id](page);
  } finally {
    await context.close(); // flushes the webm
    await browser.close();
  }

  const [webm] = (await readdir(raw)).filter((f) => f.endsWith(".webm"));
  if (!webm) throw new Error(`no video produced for ${scene.id}`);

  const out = path.join(OUT, `${scene.id}.mp4`);
  await ffmpeg([
    "-y", "-i", path.join(raw, webm),
    "-r", String(CANVAS.fps),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-vf", `scale=${CANVAS.width}:${CANVAS.height}:flags=lanczos`,
    out,
  ]);
  console.log(`  ${scene.id}: recorded → ${path.relative(repo, out)}`);
  return out;
}

/* ── main ───────────────────────────────────────────────────────── */

const only = process.argv.slice(2);
const wanted = only.length ? SCENES.filter((s) => only.includes(s.id)) : SCENES;

await mkdir(OUT, { recursive: true });
await mkdir(FRAMES, { recursive: true });

const needsServer = wanted.some((s) => s.kind === "app");
const server = needsServer ? await startServer() : null;
if (server) console.log(`server up at ${BASE}`);

try {
  for (const scene of wanted) {
    if (scene.requiresKey && !process.env.RIDGE_DEMO_ANTHROPIC_KEY) {
      // Deliberately not faked. A demo that stages the model's output would be
      // the exact failure the video accuses other tools of.
      console.log(`  ${scene.id}: SKIPPED — set RIDGE_DEMO_ANTHROPIC_KEY to record it`);
      continue;
    }
    console.log(`capturing ${scene.id} (${scene.kind})`);
    scene.kind === "static" ? await captureStatic(scene) : await captureApp(scene);
  }
} finally {
  if (server) server.kill();
}

console.log("\nclips in", path.relative(repo, OUT));
