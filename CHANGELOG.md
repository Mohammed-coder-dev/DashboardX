# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org).

## Unreleased

### Added

- **A chart for every column the engine computed an aggregate for.** The chart
  grid used to stop at one chart per kind and three in total, which read as
  "these three columns matter" when it meant "the renderer stopped". Every
  column with a full-file aggregate now gets its chart — histograms for
  numeric fields, frequency bars for true categories, bucketed trends for
  dates — with the target column first. Wide files stop at twelve cards behind
  a note naming exactly what was held back and where the rest lives; columns
  without a chartable aggregate still produce nothing, because a filler chart
  is decoration, not evidence.
- **The pairing behind every reported correlation, drawn.** Each correlation
  carries `scatter` (payload schema 2.9): the pairwise-complete observations
  verbatim up to 500 pairs, a 20×20 density grid above that, in which every
  pair lands in exactly one cell. The workspace plots it under the
  coefficient. Built from the same pairwise filtering as the number, so the
  plot and the coefficient can never describe different observations; older
  saved analyses carry no pairs and their numbers stand alone.
- **A correlation matrix** over every numeric column pair when a file has
  three or more — blue for pairs rising together, red for pairs moving apart,
  the coefficient printed in every tinted cell so colour never carries the
  value alone. An unreported pair is a dot with the reason on hover: below
  the reporting bar is a different statement from a measured zero.
- **Numeric spread strips.** The Statistical Summary opens with a strip per
  numeric column — 5th–95th percentile line, middle-50% box, median tick,
  mean dot, IQR-fence outlier count — each on its own stated scale.
- **Per-column completeness tracks** in the quality card: valid, missing and
  unparseable drawn as a stacked bar in the status colours, with the counts
  in text and on hover, replacing the compressed `12%∅` chips.
- **A health ring and completeness meter** in the decision snapshot, beside
  their numbers, never instead of them.
- **Any chart downloads as a PNG**, composited onto an opaque surface so it
  survives dark viewers, named after the dataset and the chart.
- **A possibly transposed sheet is declared, not read in silence.** When
  magnitudes agree within each row and span orders of magnitude within each
  column — the condition under which a column mean averages unrelated
  measures — the reading is reported `uncertain` with a warning saying what
  would go wrong and that the columns were computed as-is (structure report
  1.1.0, additive `warnings`). A same-scale transposition still passes, as
  the deliberate limit it is: it is statistically indistinguishable from an
  ordinary table and its means are not nonsense.
- **The workspace leads with the sample path.** A first-visit strip offering
  the finished sample analysis sits above the dropzone; the link, focus and
  save controls share one "Refine the run · all optional" group; the health
  grade and evidence count ride in the dashboard top bar, computed.

### Changed

- Charts are built the first time their canvas nears the viewport instead of
  all at once at render — tier ③ arrives collapsed, and a wide file now
  produces a chart per column.
- Chart colours come from the design tokens at render time. Every Chart.js
  config carried string literals from the pre-Ridge palette, so the rebrand
  that moved every token never reached the charts; a source-level test keeps
  the drifted literals from returning.

- An empty evidence panel is explained rather than removed. When no finding
  cleared the reporting thresholds — which an ordinary small file routinely does
  not — the Evidence panel, the headline of tier ① *What we found*, set itself to
  `display: none` and disappeared without a word. A first-time reader could not
  tell "Ridge found nothing worth claiming" from "Ridge is broken" or "I uploaded
  it wrong". It now states that nothing qualified, why that happens, and that the
  statistics and quality diagnostics below were still computed in full.
  Non-tabular files stay hidden: evidence was never computed for them, so
  reporting that nothing qualified would describe a test that never ran.
- A file read without incident now says so. The structure note was hidden
  whenever nothing unusual was found, which made a file Ridge had checked look
  exactly like a file Ridge had never checked — withholding the one fact the
  reader needed, that the question was asked at all. A clean read now shows a
  quiet dashed confirmation (`Read as-is · header on row 1 · 4 observations`)
  that expands to say what was looked for and not found. Analyses saved before
  structural inference still show nothing, because for those the question really
  was never asked.
- An `includeRows` correction that matches no exclusion is no longer a silent
  no-op. It is reported in `meta.structure.unapplied` with the reason — outside
  the file, at or above the header row, or simply not an excluded row — shown in
  the workspace and the printable report, and it makes the reading `uncertain`,
  because the caller is working from a picture of the file that this one
  contradicts. It is reported rather than raised as an error: the request is well
  formed, and failing the whole analysis would make corrections brittle, since
  changing the header row restates every row number in the file.
- A trailing row labelled `Total` whose numbers do not add up is now reported as
  an **uncertain** exclusion rather than a confident one. Arithmetic is the
  evidence; the label is a naming convention, and "Total" is a legitimate final
  category in real files. The row is still excluded — the asymmetry that governs
  exclusions has not changed — but it is excluded as an open question. Trailing
  arithmetic that carries no label is unaffected and still settles the question
  on its own.

### Fixed

- A second table sharing a sheet no longer merges into the first in silence. Two
  tables separated by blank rows were read as one: the second table's header
  became an observation and its values joined the first table's statistics,
  under a reading that reported nothing unusual. The second header is now
  detected — it follows a gap, is entirely text, and has numbers beneath it —
  excluded as the header it is, and the reading is reported `uncertain` naming
  the row where the second table starts. Splitting the two into separate
  analyses is deliberately not attempted: deciding which table was meant would
  be a guess, and the rows below are still counted with the first table's.
- **Numbers written in a spreadsheet's own notation are numbers again.**
  `$48,000`, `12.5%`, `1,200` and the accounting `(1,200)` all read as
  non-numeric, so a currency or percentage column was typed categorical and
  produced no statistics whatsoever — or, worse, kept only the cells that
  happened to parse: a column of `1,200 / 950 / 1,400 / 880` reported a mean of
  915, computed from the two values without separators and presented as if it
  described the column. All four notations now parse, and a numeric column
  carries `formats` naming the conventions it was read through, shown in the
  column inspector and the printable report. Two limits are deliberate: a
  percentage reads at the magnitude the cell displays (`12.5%` is 12.5, not
  0.125), and European decimal notation is left unparsed rather than guessed at,
  since `1.234,56` is 1234.56 in much of the world and 1.234 in the rest.
- A title row wide enough to look like a header no longer passes undetected.
  "Q3 Report" in A1 with a date in C1 reaches all three columns, so the span
  test alone could not tell it from the header beneath it, and it was taken as
  the header in silence. Such a row does not *fill* the block, and scores worse
  on the header signals than the row below it; where a later candidate beats a
  sparse first choice, that candidate is preferred and the reading is reported
  as uncertain, with the title offered back as an alternative and excluded as
  preamble rather than quietly becoming the column names.
- **Spreadsheets are read for their shape before anything is computed.** Parsing
  took row 1 as the header and every other row as an observation. On an ordinary
  corporate export — a title in A1, the real header on row 3, a `TOTAL` row at
  the bottom — that produced column names like `__EMPTY`, counted the header as
  data, and folded the total row into the statistics: a mean 60% above the truth,
  reported at 100% coverage, with the total row not even flagged as an outlier.
  Structural inference now locates the header by how far the row reaches across
  the data block, and excludes rows that restate the rows above them, detected by
  label and by column-wise arithmetic. Arithmetic is what catches an *unlabelled*
  total, which no keyword list would.

### Added

- A structure report on every analysis: the header row, the observation count,
  and every row set aside with the reason it was. It travels in `meta.structure`
  through the API response, the saved payload, the JSON export and the printable
  report, and is stated above the findings in the workspace, because it qualifies
  every number below it. When inference cannot settle a reading it says so
  prominently rather than committing quietly — and still excludes what it is
  unsure of, since wrongly keeping an aggregate corrupts every statistic while
  reporting full coverage, whereas wrongly dropping an observation costs one row
  and announces itself.
- Structural corrections: `headerRow` says where the header really is and
  `includeRows` puts an excluded row back. Both re-submit the file rather than
  editing a stored result, and a restored row moves to `structure.restored`
  rather than vanishing — overriding the engine must not make a result less
  auditable than trusting it.
- Column selection: exclude ID, free-text or otherwise irrelevant fields before
  anything is computed, so they stop polluting correlations and evidence. Rows
  are never filtered — excluding a column removes a measurement, not an
  observation. Selections are sent as JSON arrays, never delimited strings,
  because real headers contain commas.
- An analysis workspace: a setup rail holding the source, the target column,
  the column selection and the re-run control, beside the results canvas.
  Setup changes are staged rather than fired on change, and until the analysis
  re-runs the results are marked stale by a filled re-run button counting the
  pending edits, a banner above the findings and a rule across the canvas.
- Full-file deterministic charts for numeric distributions, categorical
  frequencies, and date trends. Charts now work without AI and cover the same
  rows as the reported statistics.
- Traceable analysis records with request ID, completion time, processing
  duration, engine/schema versions, AI participation, and retention status.
  JSON errors carry the same request ID as the `X-Request-ID` response header.
- Production OCI packaging: a non-root Node 24 image, HTTP health check,
  graceful shutdown, secret-safe build context, and a private-deployment
  runbook with explicit scaling limits.
- One-click sample analysis from the landing page.
- Deterministic two-file comparison mode with baseline/current semantics,
  schema drift, quality movement, row and column deltas, and exportable shared
  column changes. Comparison works without an API key.
- Evidence provenance drill-downs with the exact formula, inclusion rule,
  excluded-row accounting, and bounded source-row excerpts containing only the
  columns used by each finding.
- Deterministic inference: 95% t intervals for numeric means, Welch intervals
  and p-values for group/file mean differences, chi-square with Cramér's V for
  categorical associations, two-sample KS distribution-shift tests, and an
  explicitly exploratory median/MAD level-shift detector for dated targets.
- A five-user pilot playbook, privacy-safe structured feedback issue form, and
  in-product pilot feedback links so validation measures observed reuse instead
  of collecting vague interest.

### Changed

- Results are organised into four ranked tiers — what we found, how we know,
  the data, interpretation — replacing twelve equally-weighted cards that gave
  the reader no way to tell what mattered. All model output is now contiguous
  in the last tier instead of interleaved with computed output.
- Provenance is a closed vocabulary: **Computed** is measured from the file,
  **Derived** is calculated from those measurements, **Written** is model prose
  quoting them. This replaces the `ai-badge` class, which carried four
  different meanings — two of them the opposite of its name. A stamp appears on
  a tier header, and on a claim only when it differs from its tier. The printed
  report uses the same three words.
- Interpretation renders on a distinct dark surface so model prose reads as a
  different substance before a word is parsed; the printed form carries the
  same boundary with a rule, since printers drop backgrounds.
- Evidence and correlations share one claim-strength scale with the underlying
  number alongside. The data-quality grade stays visually distinct: it measures
  the input, not confidence in a claim.
- `ANALYSIS_SCHEMA_VERSION` is 2.6: `meta.activeColumns` and
  `meta.excludedColumns` record what an analysis was computed over. Both are
  optional, and their absence means every column was included.
- Repositioned the landing page around defensible spreadsheet answers for
  finance, operations, and analytics teams, with hosted and self-hosted paths.
- Raised the supported Node.js floor to Node 22; the production container uses
  the current Node 24 LTS line.
- Analysis schema version is now `2.5`, evidence engine `1.1.0`, and comparison
  engine `1.1.0`; inference results and row-level provenance are exportable.

### Fixed

- Text colours now meet WCAG AA (4.5:1) on every surface they appear on. The
  tertiary text tone measured 3.84:1 across 57 rules, and the semantic colours
  were worse — amber at 2.87:1, green at 2.96:1 — because nothing measured
  them. The landing page carried the same two defects in its parallel palette.
  Tokens were darkened rather than the rules edited, and `tests/contrast.test.js`
  now fails the build if any pairing drops below AA.
- HTTPS URL analysis no longer incorrectly requires an Anthropic key. The
  deterministic path works for URL inputs exactly as it does for uploads.

## [2.1.0] — 2026-07-30

The DashboardX → Ridge release. The product is now the deterministic evidence
engine; AI interpretation is an optional layer over it.

### Added

- **Evidence Mode.** Every material finding is a structured object carrying
  `claim`, `metric`, `value`, `columns`, `method`, `sampleSize`, `coverage`,
  `strength`, `caveat` and `engineVersion`. An optional **target column**
  focuses the engine on one outcome: group comparisons with a standardized
  effect size, target correlations, missingness impact, and trends over time.
- **Analysis without an API key.** Parsing, statistics, quality profiling,
  correlations and evidence all run server-side with no model involved.
  Responses report `meta.aiIncluded`.
- **`POST /api/explain`** adds AI interpretation to results already computed, so
  a keyless analysis can be explained without re-uploading.
- **Spearman correlation** alongside Pearson, with averaged tie ranks.
- **Date profiling**: valid/invalid counts, range, bucketed trend,
  period-over-period change, gaps and irregular-interval detection.
- **Representative sampling** — a bounded, deterministic cross-section
  (boundaries, quantiles, rows with missing values, outliers, category
  examples, chronological edges), each row labelled with why it was chosen.
- **Exports**: JSON, and a printable HTML report that labels every section as
  deterministic or AI-generated and carries the schema and engine versions.
- **Try sample data** — a bundled 91-row dataset so a first visit needs no
  upload and no key.
- **Deleting a saved analysis** (`DELETE /api/history/:id`), scoped to the
  session that saved it.
- `/about`, `/privacy` and `/docs` pages; `PRIVACY.md`, `SECURITY.md`,
  `docs/API.md` and `docs/RELEASING.md`.
- Configurable rate limits via `RATE_LIMIT_POINTS` and `RATE_LIMIT_ASK_POINTS`.

### Changed

- **The root URL is now the application**, not a marketing page. The former
  landing page moved to `/about`; `/app` redirects to `/` preserving the query
  string, so existing shared links keep working.
- **Persistence is opt-in per analysis** and off by default. A configured
  Supabase no longer causes every successful analysis to be stored.
- **API keys default to session storage**, cleared with the tab, with an
  explicit *Remember this key on this device* opt-in for local storage. The
  wording now states plainly that the key is sent to the backend and forwarded
  to Anthropic per request, rather than claiming it never leaves the browser.
- Default model is **Claude Sonnet 5** (balanced); the picker labels each model
  by capability, speed and cost.
- Correlations report the method that actually characterises the pair, choosing
  Spearman when it exceeds Pearson by the same margin that triggers the
  non-linearity caveat.
- Categorical `top` values are `{ value, count, percentage }` objects.
- The analysis prompt receives computed evidence and a labelled representative
  sample, and is instructed to explain rather than rediscover, to carry caveats
  forward, and to label any offered explanation as a hypothesis.

### Fixed

- **Missing values no longer become zeroes.** `Number(null)`, `Number("")` and
  `Number("   ")` all return `0`, so blank cells were entering means, medians
  and correlations as real observations. All numeric reads now go through a
  shared coercion that returns null for absence and preserves a genuine zero,
  and correlations filter pairwise before computing.
- **Categorical `top` values are ranked by frequency**, not first appearance.
  The previous implementation used `Set` insertion order and presented whichever
  value happened to appear first as the most common.
- Correlations no longer report `r=0` for a constant series; the pair is omitted
  rather than implying "measured, found nothing".
- Distribution evidence is bounded by coverage: a 93%-empty column can no longer
  yield a "strong" finding from a handful of values.
- Numeric fields expose `invalid` and `coverage`, so a half-unparseable column
  can no longer pass as clean numeric data.
- Aggregate upload size is enforced server-side. Ten 4 MB files previously
  passed per-file validation and then failed at Vercel's request limit with an
  opaque error; they now return `413 upload_too_large`.
- Multi-file "success" means "parsed", so keyless batches report accurate counts
  and skip cross-file synthesis instead of failing.

### Migration

- Browser storage keys `dx_api_key`, `dx_model` and `dx_session` migrate once to
  `ridge_api_key`, `ridge_model` and `ridge_session`, in whichever store held
  them. An existing value under the new name is never overwritten; the migration
  is idempotent and survives a storage that throws. The session header is now
  `x-ridge-session`.
- Saved analyses created before this release still open. The dashboard reads
  both the current correlation shape and the legacy `colA`/`colB`/`r` fields.
- `/app` links redirect to `/`.

### Verification

249 unit and API integration tests, plus 24 Playwright journeys across desktop
and a Pixel 5 viewport. The Anthropic SDK is mocked throughout; no test requires
a key or makes a provider call.

### Known limitations

- Group comparisons use a standardized mean difference; no significance test or
  confidence interval is reported yet.
- Date parsing is pattern-gated and does not interpret Excel serial numbers as
  dates.
- Charts are rendered client-side from up to 100 sample rows, so they visualise
  a slice while the statistics above them cover the whole file.
- Saved analyses have no automatic expiry.

## [2.0.0] — 2026-07-29

Released as DashboardX.

- Layered architecture: routes → services → parsers/analytics.
- BYOK with a model picker; structured JSON outputs.
- Deterministic data-quality profiling with a weighted health grade.
- Multi-sheet workbooks, URL ingestion with SSRF guards, follow-up questions.
- Supabase-backed history and share links.
- Vitest suite and CI.

[2.1.0]: https://github.com/MohammedAlkindi/Ridge/releases/tag/v2.1.0
[2.0.0]: https://github.com/MohammedAlkindi/Ridge/releases/tag/v2.0.0
