// Assembles the finished video from the clips and narration.
//
// The governing rule: narration length decides scene length, never the other
// way round. Each clip is frozen on its last frame (or trimmed) to exactly the
// length of its own narration plus its hold, so re-recording a line and
// rebuilding cannot desynchronise the cut.
//
// Usage:  node video/build.js [--burn]      (--burn hard-bakes the captions)

import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES, CANVAS } from "./script.js";
import { ffmpeg, duration } from "./lib/proc.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const OUT = path.join(here, "out");
const CLIPS = path.join(OUT, "clips");
const AUDIO = path.join(OUT, "audio");
const SEGS = path.join(OUT, "segments");

const burn = process.argv.includes("--burn");

/* ── captions ───────────────────────────────────────────────────── */

const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, "0")}`;
};

// Splits a scene's narration into sentence-sized captions and distributes the
// scene's speech time across them by character count — close enough to real
// delivery to track, without needing word-level timestamps from the TTS.
function captionsFor(scene, startAt, speechSeconds) {
  const parts = scene.narration.match(/[^.?!]+[.?!]+/g) || [scene.narration];
  const chars = parts.reduce((n, p) => n + p.trim().length, 0);
  let cursor = startAt;
  return parts.map((raw) => {
    const text = raw.trim();
    const span = (text.length / chars) * speechSeconds;
    const cue = { start: cursor, end: cursor + span, text };
    cursor += span;
    return cue;
  });
}

/* ── main ───────────────────────────────────────────────────────── */

await mkdir(SEGS, { recursive: true });

// A scene participates only if both halves exist. Scene 05 is legitimately
// absent when no Anthropic key was supplied at capture time.
const usable = [];
for (const scene of SCENES) {
  const clip = path.join(CLIPS, `${scene.id}.mp4`);
  const voice = path.join(AUDIO, `${scene.id}.mp3`);
  if (!existsSync(clip)) {
    console.log(`  skipping ${scene.id}: no clip (run capture.js)`);
    continue;
  }
  if (!existsSync(voice)) {
    console.log(`  skipping ${scene.id}: no narration (run narrate.js)`);
    continue;
  }
  usable.push({ scene, clip, voice });
}
if (!usable.length) throw new Error("nothing to build — no scene has both a clip and narration");

const cues = [];
const segments = [];
let timeline = 0;

for (const { scene, clip, voice } of usable) {
  const speech = await duration(voice);
  const target = speech + scene.hold;
  const seg = path.join(SEGS, `${scene.id}.mp4`);

  // tpad clones the final frame well past the target and apad extends the
  // audio; -t then cuts both to the same instant. This pads a short clip and
  // trims a long one with one code path.
  await ffmpeg([
    "-y",
    "-i", clip,
    "-i", voice,
    "-filter_complex",
    `[0:v]tpad=stop_mode=clone:stop_duration=30,fps=${CANVAS.fps},` +
      `scale=${CANVAS.width}:${CANVAS.height}:flags=lanczos,setsar=1[v];` +
      `[1:a]apad,aresample=48000[a]`,
    "-map", "[v]", "-map", "[a]",
    "-t", target.toFixed(3),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    seg,
  ]);

  cues.push(...captionsFor(scene, timeline, speech));
  segments.push(seg);
  console.log(
    `  ${scene.id}: speech ${speech.toFixed(1)}s + hold ${scene.hold}s = ${target.toFixed(1)}s` +
      `  (starts ${timeline.toFixed(1)}s)`,
  );
  timeline += target;
}

// Concat demuxer needs a manifest; every segment shares one encode profile, so
// the join is exact.
const manifest = path.join(SEGS, "concat.txt");
await writeFile(manifest, segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));

const srt = cues
  .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
  .join("\n");
const srtPath = path.join(OUT, "Ridge-demo.srt");
await writeFile(srtPath, srt, "utf8");

const finalPath = path.join(OUT, "Ridge-demo-1080p.mp4");
const concatArgs = ["-y", "-f", "concat", "-safe", "0", "-i", manifest];

if (burn) {
  await ffmpeg([
    ...concatArgs,
    "-vf",
    `subtitles='${srtPath.replace(/\\/g, "/").replace(/:/g, "\\:")}':force_style=` +
      `'FontName=DM Sans,FontSize=22,PrimaryColour=&H00FFFFFF,BackColour=&H90000000,` +
      `BorderStyle=4,Outline=0,Shadow=0,MarginV=48'`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    finalPath,
  ]);
} else {
  // Nothing to re-encode when captions stay a sidecar; copy the streams through.
  await ffmpeg([...concatArgs, "-c", "copy", "-movflags", "+faststart", finalPath]);
}

const finalDur = await duration(finalPath);
console.log(`\n✓ ${path.relative(repo, finalPath)}  —  ${finalDur.toFixed(1)}s`);
console.log(`✓ ${path.relative(repo, srtPath)}${burn ? "  (also burned in)" : "  (sidecar)"}`);
if (usable.length < SCENES.length) {
  console.log(`\n${SCENES.length - usable.length} scene(s) missing — see notes above.`);
}
