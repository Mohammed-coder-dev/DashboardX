# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org).

## Unreleased

### Added

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

### Changed

- Repositioned the landing page around defensible spreadsheet answers for
  finance, operations, and analytics teams, with hosted and self-hosted paths.
- Raised the supported Node.js floor to Node 22; the production container uses
  the current Node 24 LTS line.
- Analysis schema version is now `2.3`; numeric histograms separate IQR outlier
  tails so the central distribution remains readable without dropping values.

### Fixed

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
