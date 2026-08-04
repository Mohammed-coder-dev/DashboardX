// Renders one narration file per scene into video/out/audio/.
//
// Two engines:
//
//   elevenlabs  the real voice. Requires ELEVENLABS_API_KEY. Reproducible from
//               a clean checkout, which an interactive OAuth session is not.
//
//   scratch     Windows SAPI. Robotic and not shippable, but it is speech at
//               roughly the right pace, which is all build.js needs to lay out
//               the timeline. Lets the whole video be assembled and reviewed
//               before the real voice exists.
//
// Usage:  node video/narrate.js [--engine=elevenlabs|scratch] [sceneId ...]

import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES, VOICE } from "./script.js";
import { run, ffmpeg, duration } from "./lib/proc.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const AUDIO = path.join(here, "out", "audio");

const args = process.argv.slice(2);
const engineArg = args.find((a) => a.startsWith("--engine="));
const only = args.filter((a) => !a.startsWith("--"));
const engine = engineArg
  ? engineArg.split("=")[1]
  : process.env.ELEVENLABS_API_KEY
    ? "elevenlabs"
    : "scratch";

/* ── ElevenLabs ─────────────────────────────────────────────────── */

async function renderElevenLabs(scene, outMp3) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE.voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: scene.narration,
        model_id: VOICE.modelId,
        voice_settings: VOICE.settings,
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 401 means the key is wrong; 429 on the free tier means the monthly
    // character quota is spent. Both are worth saying plainly rather than
    // surfacing as an opaque failure three stages later.
    throw new Error(`ElevenLabs ${res.status} for ${scene.id}: ${detail.slice(0, 400)}`);
  }
  await writeFile(outMp3, Buffer.from(await res.arrayBuffer()));
}

/* ── scratch (Windows SAPI) ─────────────────────────────────────── */

async function renderScratch(scene, outMp3) {
  const wav = outMp3.replace(/\.mp3$/, ".scratch.wav");
  // SAPI's default rate lands near 150 wpm, which is the delivery the script is
  // written for. Slowing it further made the scratch track ~40% longer than the
  // real voice will be, which is worse than useless for judging length.
  const ps = `
    Add-Type -AssemblyName System.Speech
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $s.Rate = ${Number(process.env.SCRATCH_RATE ?? 0)}
    $s.SetOutputToWaveFile(${JSON.stringify(wav)})
    $s.Speak(${JSON.stringify(scene.narration)})
    $s.Dispose()
  `;
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { capture: true });
  await ffmpeg(["-y", "-i", wav, "-codec:a", "libmp3lame", "-q:a", "2", outMp3]);
  await rm(wav, { force: true });
}

/* ── main ───────────────────────────────────────────────────────── */

await mkdir(AUDIO, { recursive: true });
const wanted = only.length ? SCENES.filter((s) => only.includes(s.id)) : SCENES;

console.log(`narrating with engine: ${engine}`);
if (engine === "scratch") {
  console.log("  NOTE: scratch is a timing track, not the shipped voice.\n");
}

let total = 0;
for (const scene of wanted) {
  const out = path.join(AUDIO, `${scene.id}.mp3`);
  engine === "elevenlabs" ? await renderElevenLabs(scene, out) : await renderScratch(scene, out);
  const secs = await duration(out);
  total += secs + scene.hold;
  const words = scene.narration.trim().split(/\s+/).length;
  console.log(
    `  ${scene.id}: ${secs.toFixed(1)}s (+${scene.hold}s hold) · ${words} words · ` +
      `${Math.round((words / secs) * 60)} wpm`,
  );
}

console.log(`\nnarration total (with holds): ${total.toFixed(1)}s`);
