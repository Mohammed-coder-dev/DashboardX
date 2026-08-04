# Analysis workspace + provenance vocabulary

**Date:** 2026-08-04
**Status:** approved, ready for implementation

## Problem

The deterministic engine is the product and it works. The surface around it does
not carry that weight. Three concrete failures:

1. **No workspace.** `public/app.html` renders results as one column of twelve
   equally-weighted cards. Every feature got its own card, so nothing reads as
   primary — the visual signature of a feature list rather than a product.
2. **Trust is asserted, not architected.** The class `ai-badge` carries four
   different meanings in one file: `deterministic` (266), `AI-generated
   interpretation` (271), `deterministic · full dataset` (321), and
   `baseline → current` (210). Two are the opposite of what the class name
   implies. Worse, AI prose is *interleaved* with computed output — `summaryCard`
   sits above Data Quality, `conclusionSection` below Correlations — so the one
   boundary the product rests on is unreadable.
3. **No control over method.** Outside the target select and sheet picker the
   user cannot change anything about how the analysis runs.

## Goals

- The results surface reads as an instrument someone would defend in a meeting.
- The "numbers are computed, never generated" invariant is legible from the
  layout itself, not reassembled from breadcrumbs.
- The user controls what the engine computes over.

## Non-goals

- The landing page (`public/index.html`) — reworked in `d1fac1f`, strongest surface.
- Theme, density, section reordering, saved layout preferences.
- Evidence thresholds, named/annotated runs, saved analysis profiles.
- Accounts — declined in `ROADMAP.md` by construction.

---

## 1. Workspace shell

Upload and loading screens stay centered and single-column. The shell appears
only once there is something to configure.

- `.workspace-rail` — sticky left. **Source**: filename, row/column counts,
  sheet picker, multi-file tabs. **Setup**: target column, column inclusion.
  Re-run pinned at the foot with a dirty-state marker.
- `.workspace-canvas` — right, holding the tiered results.
- Mobile: rail collapses into a drawer off a sticky summary bar, extending the
  responsive work in `97f259f`.

## 2. Four ranked tiers

| Tier | Absorbs | Rationale |
|---|---|---|
| **① What we found** | `overviewSection`, `evidenceSection` | Two cards competing to be the headline; merged they *are* the headline |
| **② How we know** | `qualitySection`, `corrSection`, `analysisRecord` | Support, sample sizes, caveats, record — one place, not three |
| **③ The data** | `chartsSection`, `statsSection`, `topicsSection`, `rawTextSection` | Reference material, collapsed by default |
| **④ Interpretation** | `summaryCard`, `aiDetailGrid`, `conclusionSection`, `askSection` | All model output, contiguous, on its own material |

This also gives `app.js` a seam: the oversized dashboard render splits into four
tier renderers, each independently readable.

### Tier ③ must stay one click away

Collapsed, tier ③ renders as a labeled band with its four subsection names
visible as buttons — *Charts · Statistical summary · Topics · Preview*. Clicking
any name expands the tier scrolled to that subsection. Existing `resultNav`
entries auto-expand before jumping. Contents are named even while collapsed and
never more than one click away.

## 3. Provenance vocabulary

Retire `.ai-badge`. One class `.prov`, three mutually exclusive modifiers:

| Stamp | Means | Applies to |
|---|---|---|
| **Computed** | Measured directly from the cells of the file | row/missing counts, means, medians, min/max, category frequencies, distributions |
| **Derived** | Calculated *from* computed values, not read from the file | correlations, confidence intervals, quality grade, deltas, chi-square, KS, effect sizes |
| **Written** | Model prose; contains no figures of its own, every number quoted | tier ④ in full |

Three values rather than two, deliberately. "Deterministic vs AI" is the
distinction the product believes in, but a reader who sees a correlation stamped
identically to a row count learns nothing about where the statistical
assumptions live. **Derived** is exactly where those assumptions sit, and where
the existing caveats already attach.

**Placement rule — two levels, never more.** A stamp appears on a tier header
(the dominant provenance within) and on an individual claim *only when it
differs* from its tier. This is what prevents the badge soup that exists today.

One legend line sits under the results header stating the rule once. Not a
tooltip, not a modal.

**Strength scale.** Unify *claim strength* only: evidence strength and
correlation strength become one four-step scale with the underlying number
always adjacent. The quality grade stays visually distinct — it measures the
input, not confidence in a claim, and conflating the two would be a regression
in honesty.

## 4. AI on its own material

Tier ④ renders full-bleed on `--ink-surface` using `--on-ink`,
`--on-ink-muted`, `--on-ink-border`, `--on-ink-accent`. All four already exist
in `:root`; this is reuse, not new tokens.

- **Contrast:** each ink pairing is measured against WCAG AA and the token
  adjusted if it falls short. Not assumed.
- **Print:** the print report cannot rely on a dark fill — printers drop
  backgrounds. Tier ④ prints with a heavy left rule plus the Written stamp, so
  the distinction survives the artifact most likely to reach a stranger.

## 5. Column selection

Server (`src/routes/analyze.js`):

- `validateColumns(raw)` beside `validateTarget`/`validateSheet`. Accepts a JSON
  array or comma-separated string; rejects non-string members and over-long input.
- `resolveColumns(requested, parsedColumns)` intersects with the parsed columns,
  rejects an empty resulting selection (`no_columns_selected`) and unknown names
  (`unknown_column`), returns `{ active, excluded }`.
- `analyzeParsedFile` filters `columns` before `computeStats`,
  `computeCorrelations`, `profileDataset` and `buildEvidence`. Rows untouched.
  Both `/analyze` and `/analyze-url` inherit this from the shared funnel.

Response shape:

- `body.columns` stays the **full** parsed list — the rail needs it to render the
  picker.
- `meta.columns` stays the full parsed count — unchanged meaning, so saved
  analyses keep rendering.
- `meta.activeColumns` (array) and `meta.excludedColumns` (array) are new.

Client: the rail lists every column with its type and coverage, a checkbox each,
and an "8 of 11 included" summary. Changing the set marks results stale.

### Exclusion is disclosure

This is the one place the two goals collide. Column exclusion is a way to make
evidence *look* cleaner by removing inconvenient data; silent, it would
undermine the thesis the product rests on. Therefore:

- `meta.excludedColumns` is recorded server-side.
- It is carried into the analysis record, the JSON export, the print report and
  the share link.
- Tier ① states *"Computed from 8 of 11 columns"* whenever the set is
  incomplete, with the excluded names one click away.

Exclusion is built as an act of disclosure, never concealment.

## 6. Stale results must be unmistakable

When configuration changes after a result exists, three simultaneous signals:

1. Rail button becomes filled/primary and counts pending changes —
   *"Re-run · 2 changes"*.
2. Persistent banner at the top of tier ①: *"Showing results for 11 columns.
   Your setup has changed — re-run to update."*
3. An amber rule across the top of the canvas marking the result superseded,
   with an `aria-live` announcement.

No opacity or desaturation on stale results. Degrading contrast to signal state
fails exactly the users most likely to be harmed by misreading it.

## 7. Files and tests

| File | Change |
|---|---|
| `public/app.html` | Shell structure, four tiers, `.prov` stamps |
| `public/styles.css` | Rail/canvas layout, tiers, `.prov`, ink tier, stale state, print rules |
| `public/app.js` | Four tier renderers, rail state, column selection, dirty tracking — stays a classic script |
| `src/routes/analyze.js` | `validateColumns`, `resolveColumns`, filtering, `meta.excludedColumns` |

Tests:

- `validateColumns` / `resolveColumns` units: empty selection, unknown column,
  non-array input, comma-separated parsing, full-selection no-op.
- Provenance guard: `ai-badge` absent from `app.html`; every `.prov` element
  carries exactly one of the three modifiers.
- Playwright journey: exclude a column → results marked stale → re-run →
  exclusion disclosed in tier ① and in the exported JSON.

## 8. Commit sequence

Each builds and passes alone; server first so the client has something to call.

1. `feat(analyze): support column selection`
2. `refactor(results): restructure the dashboard into ranked tiers`
3. `feat(ui): add the analysis workspace rail`
4. `refactor(ui): replace ad-hoc badges with a provenance vocabulary`

## Risks

- `public/app.js` is 1777 lines and the dashboard render is the largest function
  in it. The tier split is the natural seam; if the refactor threatens behavior,
  tiers land as four renderers called in sequence from the existing entry point
  rather than as a rewrite of the data flow.
- Saved analyses predate `meta.activeColumns`. All new fields are optional and
  the client must treat their absence as "all columns included".
