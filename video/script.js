// Single source of truth for the demo video.
//
// Every other stage reads this file: `narrate.js` turns `narration` into audio,
// `capture.js` records one clip per scene, and `build.js` pads each clip to the
// measured length of its narration before concatenating. Editing a line here is
// the only edit needed — durations are derived from the rendered audio, never
// hand-tuned, so the video cannot drift out of sync with what is being said.

// Figures quoted in the cold open. These are not illustrative: they are computed
// from the sample file that ships with the product, and `npm run video:verify`
// recomputes them from that file and fails if this block disagrees. A video whose
// thesis is "numbers are computed, never generated" must not invent its own.
export const COLD_OPEN_FACTS = {
  source: "public/samples/team-sales.csv",
  column: "rating",
  rows: 91,
  blanks: 10,
  n: 81,
  trueMean: 4.04, // blanks excluded
  naiveMean: 3.59, // Number("") === 0 counted as an observation

  // The second fabricated claim in the cold open is a correlation, asserted as a
  // single confident number with no method and no sample size. The truth is more
  // interesting than "it's wrong": the two standard coefficients disagree
  // outright, which means the pattern is non-linear or outlier-driven. Ridge
  // reports both and says so — see the `caveat` on this pair in /api/analyze.
  // A lone "r = 0.94" does not just lack support, it hides a real finding.
  corrPair: ["revenue", "spend"],
  corrN: 90,
  corrSpearman: 0.91,
  corrPearson: -0.09,
};

export const VOICE = {
  // Rachel — calm, mid-paced, reads as documentary rather than advertisement.
  voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
  modelId: "eleven_multilingual_v2",
  settings: { stability: 0.45, similarity_boost: 0.75, style: 0.0, speed: 0.96 },
};

export const CANVAS = { width: 1920, height: 1080, fps: 30 };

// `hold` is dead air appended after a beat's narration, in seconds. It buys the
// viewer a moment to read what is on screen before the next line starts.
export const SCENES = [
  {
    id: "01-cold-open",
    kind: "static", // frame-stepped through window.seek(t) — see capture.js
    source: "scenes/cold-open.html",
    duration: 39.5, // matched to the measured narration; see T in the scene file
    hold: 1.2,
    narration:
      "Ask most AI tools to analyze a spreadsheet, and here is what actually happens. " +
      "A handful of rows go to a language model, and the model is asked to be insightful. " +
      "So it invents statistics it never saw, reports correlations without ever saying how " +
      "many rows they rest on, and it reads an empty cell as a zero. " +
      "That last one is quiet, and it is expensive. Ten blank ratings in ninety-one rows. " +
      "Your satisfaction score reads three point six. The real number is four point oh. " +
      "Nothing looks broken. Nobody catches it.",
  },
  {
    id: "02-inversion",
    kind: "app",
    route: "/",
    duration: 14,
    hold: 1.0,
    narration:
      "Ridge inverts the order. Every number is computed first, deterministically — " +
      "and that is the product. The model comes afterward, and only to explain evidence " +
      "that already exists.",
  },
  {
    id: "03-upload",
    kind: "app",
    route: "/app",
    duration: 14,
    hold: 1.0,
    narration:
      "Drop a file in. No account, no API key. In under two seconds: distributions, " +
      "correlations, data quality diagnostics, and charts that match the numbers underneath them.",
  },
  {
    id: "04-evidence",
    kind: "app",
    route: "/app?sample=1",
    duration: 21,
    hold: 1.2,
    narration:
      "Every correlation reports its method, its sample size and its coverage. And when two " +
      "methods disagree, it says so out loud. Here, Spearman calls revenue and spend very " +
      "strongly related. Pearson calls it nothing at all. Ridge shows you both and flags the " +
      "conflict, because the honest answer is that the pattern is non-linear — which is the " +
      "one thing a single confident number would have hidden from you.",
  },
  {
    id: "05-interpretation",
    kind: "app",
    route: "/app?sample=1",
    duration: 20,
    hold: 1.0,
    // Requires RIDGE_DEMO_ANTHROPIC_KEY at capture time. Without it, capture.js
    // skips this scene rather than faking a response, and build.js drops it.
    requiresKey: true,
    narration:
      "Then, if you want it in plain language, you add your own Anthropic key. " +
      "Claude reads the evidence — it cannot produce a statistic, only explain one. " +
      "Your key never reaches our storage, our logs, or a saved file.",
  },
  {
    id: "06-close",
    kind: "static",
    source: "scenes/close.html",
    duration: 8,
    // The sign-off is five words against an eight-second card. The hold is the
    // scene, not padding on the end of it — let the mark sit before we cut.
    hold: 4.4,
    narration: "Ridge. Answers you can defend.",
  },
];

export const totalNarrationWords = () =>
  SCENES.reduce((sum, s) => sum + s.narration.trim().split(/\s+/).length, 0);
