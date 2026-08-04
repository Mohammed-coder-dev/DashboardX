// Thin wrappers around the external binaries the pipeline shells out to.
// Kept separate so capture/narrate/build never deal with process plumbing.

import { spawn } from "node:child_process";

export function run(cmd, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let out = "";
    let err = "";
    if (capture) {
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
    }
    child.on("error", (e) =>
      reject(new Error(`${cmd} could not be started: ${e.message}. Is it installed and on PATH?`)),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(new Error(`${cmd} exited ${code}${err ? `\n${err.slice(-2000)}` : ""}`)),
    );
  });
}

// ffmpeg is chatty on stderr even when healthy, so its output is swallowed
// unless it actually fails — at which point the tail is surfaced by run().
export const ffmpeg = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { capture: true });

export const ffprobe = (args) => run("ffprobe", ["-hide_banner", "-loglevel", "error", ...args], { capture: true });

/** Duration of a media file in seconds. */
export async function duration(file) {
  const out = await ffprobe([
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const secs = Number.parseFloat(out);
  if (!Number.isFinite(secs)) throw new Error(`could not read duration of ${file}`);
  return secs;
}
