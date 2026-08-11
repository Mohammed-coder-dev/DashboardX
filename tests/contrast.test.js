// Colour contrast is a correctness property, not a matter of taste: text below
// WCAG AA (4.5:1 for the sizes this app uses) is unreadable for a real fraction
// of users. --text-3 sat at 3.84:1 on --surface-2 across 57 rules, and the
// semantic colours were worse, because nothing measured them.
//
// These tests read the shipped stylesheet, so a token edit is checked against
// every surface that token actually lands on. Adding a colour without adding it
// here does not silently escape the gate — TEXT_TOKENS and SURFACES below are
// asserted to cover every token :root defines.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const LANDING = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

function rootTokens(source, label) {
  const root = source.match(/:root\s*\{([\s\S]*?)\n\s*\}/);
  if (!root) throw new Error(`${label} has no :root block`);
  return Object.fromEntries([...root[1].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6});/g)]
    .map((match) => [match[1], match[2].toLowerCase()]));
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const AA = 4.5;
const TOKENS = rootTokens(CSS, "styles.css");

// Backgrounds text actually sits on. --surface-3 is deliberately absent: it is
// defined but never used as a background, and a test below keeps that true.
const NEUTRAL_SURFACES = ["--surface", "--bg", "--surface-2"];

// Every token used as a text colour, with the surfaces it can appear on.
const TEXT_TOKENS = {
  // An uncertain structure note puts body text and its correction buttons on
  // the amber surface, so those pairings are gated too.
  "--text":    [...NEUTRAL_SURFACES, "--amber-bg"],
  "--text-2":  [...NEUTRAL_SURFACES, "--amber-bg"],
  "--text-3":  NEUTRAL_SURFACES,
  "--accent":  [...NEUTRAL_SURFACES, "--accent-bg", "--amber-bg"],
  "--green":   [...NEUTRAL_SURFACES, "--green-bg"],
  "--red":     [...NEUTRAL_SURFACES, "--red-bg"],
  "--amber":   [...NEUTRAL_SURFACES, "--amber-bg"],
  "--purple":  [...NEUTRAL_SURFACES, "--purple-bg"],
  "--teal":    [...NEUTRAL_SURFACES, "--teal-bg"],
  // --text and the hero gradient are ink-family grounds: the summary card and
  // the cross-file card both set on-ink text over them.
  "--on-ink":        ["--ink-surface", "--ink-surface-2", "--ink-hero", "--ink-hero-2", "--text"],
  "--on-ink-muted":  ["--ink-surface", "--ink-surface-2"],
  "--on-ink-accent": ["--ink-surface", "--ink-surface-2"],
  "--on-ink-purple": ["--ink-surface"],
};

// Filled controls put a named foreground token on a solid fill token — the
// pairing is measured by token so retinting either side stays inside the gate.
const ON_FILL = [
  ["--on-fill", "--accent"],
  ["--on-fill", "--accent-hover"],
  ["--signal-ink", "--signal"],
];

describe("colour contrast", () => {
  it.each(Object.entries(TEXT_TOKENS).flatMap(([text, surfaces]) =>
    surfaces.map((surface) => [text, surface])))(
    "%s on %s clears WCAG AA",
    (text, surface) => {
      expect(TOKENS[text], `${text} is not defined in :root`).toBeTruthy();
      expect(TOKENS[surface], `${surface} is not defined in :root`).toBeTruthy();
      const ratio = contrastRatio(TOKENS[text], TOKENS[surface]);
      expect(
        Number(ratio.toFixed(2)),
        `${text} (${TOKENS[text]}) on ${surface} (${TOKENS[surface]}) is ${ratio.toFixed(2)}:1, below ${AA}:1`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(ON_FILL)("%s on the %s fill clears WCAG AA", (text, fill) => {
    expect(TOKENS[text], `${text} is not defined in :root`).toBeTruthy();
    expect(TOKENS[fill], `${fill} is not defined in :root`).toBeTruthy();
    const ratio = contrastRatio(TOKENS[text], TOKENS[fill]);
    expect(
      Number(ratio.toFixed(2)),
      `${text} (${TOKENS[text]}) on ${fill} (${TOKENS[fill]}) is ${ratio.toFixed(2)}:1, below ${AA}:1`,
    ).toBeGreaterThanOrEqual(AA);
  });

  it("keeps --surface-3 out of use, since the matrix above excludes it", () => {
    // If it ever becomes a background, it must join NEUTRAL_SURFACES — it is
    // darker than every surface here and would bind every neutral pairing.
    expect(CSS).not.toMatch(/background(-color)?:\s*var\(--surface-3\)/);
  });

  it("measures every colour token :root defines", () => {
    // A new palette colour must be classified, not quietly skipped.
    const classified = new Set([
      ...Object.keys(TEXT_TOKENS),
      ...Object.values(TEXT_TOKENS).flat(),
      ...ON_FILL.flat(),
      // Non-text tokens: borders, dividers, shadows and decorative fills.
      "--surface-3", "--border", "--border-2", "--signal",
      "--accent-border", "--green-border", "--red-border",
      "--amber-border", "--purple-border", "--teal-border",
      "--on-ink-blue", "--on-ink-amber",
    ]);
    const unclassified = Object.keys(TOKENS).filter((token) => !classified.has(token));
    expect(unclassified, `unclassified colour tokens: ${unclassified.join(", ")}`).toEqual([]);
  });

  it("keeps the tertiary text tone distinguishable from the secondary one", () => {
    // Passing AA by collapsing the greys would trade one defect for another.
    expect(relativeLuminance(TOKENS["--text-3"]))
      .toBeGreaterThan(relativeLuminance(TOKENS["--text-2"]));
  });
});

// public/index.html carries its own palette under different names. It had the
// same two defects, which matters more there — it is the first page anyone
// sees, including anyone evaluating the product.
describe("colour contrast on the landing page", () => {
  const LANDING_TOKENS = rootTokens(LANDING, "index.html");

  const LANDING_PAIRS = {
    "--ink":      ["--paper", "--card"],
    "--graphite": ["--paper", "--card"],
    "--faint":    ["--paper", "--card"],
    "--ledger":   ["--paper", "--card"],
    "--moss":     ["--paper", "--card", "--moss-bg"],
    "--amber":    ["--paper", "--card", "--amber-bg"],
  };

  it.each(Object.entries(LANDING_PAIRS).flatMap(([text, surfaces]) =>
    surfaces.map((surface) => [text, surface])))(
    "%s on %s clears WCAG AA",
    (text, surface) => {
      const ratio = contrastRatio(LANDING_TOKENS[text], LANDING_TOKENS[surface]);
      expect(
        Number(ratio.toFixed(2)),
        `${text} (${LANDING_TOKENS[text]}) on ${surface} (${LANDING_TOKENS[surface]}) is ${ratio.toFixed(2)}:1, below ${AA}:1`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each([["#c8c5bc"], ["#a7a39a"], ["#93b4ff"]])(
    "%s on the dark deploy panel clears WCAG AA",
    (colour) => {
      const ratio = contrastRatio(colour, LANDING_TOKENS["--ink"]);
      expect(Number(ratio.toFixed(2)), `${colour} on --ink is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    },
  );

  it("shares the corrected tones with the app rather than drifting from them", () => {
    // One palette under two sets of names; divergence is how the landing page
    // acquired the same defect independently in the first place.
    expect(LANDING_TOKENS["--faint"]).toBe(TOKENS["--text-3"]);
    expect(LANDING_TOKENS["--graphite"]).toBe(TOKENS["--text-2"]);
    expect(LANDING_TOKENS["--moss"]).toBe(TOKENS["--green"]);
    expect(LANDING_TOKENS["--amber"]).toBe(TOKENS["--amber"]);
    expect(LANDING_TOKENS["--ledger"]).toBe(TOKENS["--accent"]);
  });
});
