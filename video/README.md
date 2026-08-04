# Demo video

A ~2 minute product video, built from source. Everything under `video/` is
tracked; everything it renders into `video/out/` is gitignored and reproducible.

```bash
npm run video          # verify → capture → narrate → build
```

## What it does

Opens on the failure the product exists to prevent, using figures computed from
the sample file that ships in this repo, then shows the real application
computing the same numbers correctly.

| Scene | Source | Shows |
|---|---|---|
| `01-cold-open` | `scenes/cold-open.html` | A generic assistant asserting two unsupported claims, and what they cost |
| `02-inversion` | live app `/` | The landing page — evidence first, model second |
| `03-upload` | live app `/app` | A file dropped in, evidence in under two seconds |
| `04-evidence` | live app `/app` | Sample size, coverage, caveats, and the provenance drawer |
| `05-interpretation` | live app `/app` | The optional Claude layer, using a visitor-supplied key |
| `06-close` | `scenes/close.html` | Sign-off |

## The pipeline

```
script.js ──> verify.js    recomputes every stated figure from the CSV; fails on drift
          ├─> capture.js   one clip per scene → out/clips/
          ├─> narrate.js   one narration per scene → out/audio/
          └─> build.js     pads each clip to its narration, concatenates → out/
```

`script.js` is the only file worth editing to change the video. Narration text,
scene order, hold lengths and the voice all live there. **Scene length is derived
from the measured length of its narration** — never hand-tuned — so rewriting a
line and rebuilding cannot put the cut out of sync.

Static scenes expose `window.seek(t)` and are captured frame by frame rather
than recorded in real time, so their timing does not depend on how fast the
machine rendering them happens to be.

## Requirements

| | |
|---|---|
| `ffmpeg` / `ffprobe` | on `PATH` (tested against 8.1.2) |
| Playwright Chromium | `npx playwright install chromium` |
| `ELEVENLABS_API_KEY` | for the shipped voice — otherwise a scratch track is used |
| `RIDGE_DEMO_ANTHROPIC_KEY` | to record scene 05 — otherwise it is skipped |

Neither key is read from, or written to, any tracked file. The Anthropic key is
typed into the application's own masked field exactly as a visitor would enter
it, so the server never holds it and it never appears on camera.

## Narration

```bash
npm run video:narrate                          # ElevenLabs if the key is set
node video/narrate.js --engine=scratch         # local SAPI timing track
```

The scratch engine is Windows' built-in speech synthesiser. It is not shippable
— it exists so the full video can be assembled, timed and reviewed before the
real voice is recorded. `build.js` treats both identically.

## Why `verify.js` runs first

The video's argument is that numbers must be computed rather than asserted. It
quotes seven figures out loud. `verify.js` recomputes all of them from
`public/samples/team-sales.csv` — including both correlation coefficients, using
its own independent implementation — and fails the build if any has drifted or
if the narration stops stating them. A hard-coded `4.04` that nobody rechecks
would be the same failure the video is about.

## Output

| File | |
|---|---|
| `out/Ridge-demo-1080p.mp4` | 1920×1080, 30fps, H.264 + AAC |
| `out/Ridge-demo.srt` | sidecar captions, timed per sentence |

Pass `--burn` to `build.js` to hard-bake the captions instead — worth doing for
places that autoplay muted.
