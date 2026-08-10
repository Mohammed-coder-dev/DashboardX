# Roadmap

Ridge's thesis: **numbers are computed, never generated.** Everything below
either strengthens the deterministic engine or makes its evidence easier to
trust. Anything that would move a statistic into the model's hands is out of
scope by construction.

## Shipped — v2.1.0

- Deterministic engine usable with no API key at all.
- Evidence Mode: structured claims with method, sample size, coverage, strength
  and caveats; optional target column for focused evidence.
- Pairwise-complete correlations (Pearson + Spearman) that never turn a blank
  cell into a zero.
- Frequency-ranked categorical profiles; numeric coverage and invalid counts;
  full date profiling with trend, period-over-period and gap detection.
- Deterministic representative sampling in place of an arbitrary row preview.
- Opt-in persistence, deletable saved analyses, session-scoped keys.
- JSON and printable-report exports carrying schema and engine versions.
- The application at the root URL; `/about`, `/privacy`, `/docs`.
- Full-file deterministic charts for numeric distributions, category frequencies,
  and date trends, available without an API key.

## Shipped after v2.1.0

- **Excel serial dates**, read from the cell's number format rather than guessed
  from the value. A bare number with no date format is still left alone, since
  guessing a timeline from a value is how integer measurements get read as
  dates. The calendar day the workbook states is the day reported, in every
  timezone.
- **Configurable retention** for saved analyses via `RETENTION_DAYS`, enforced
  when a row is read rather than by a scheduled sweep, so the promise holds
  where nothing is scheduled to run. Unset by default.
- **A performance budget as a required check** — per-page ceilings on requests,
  transferred bytes and first contentful paint, plus the list of hosts each page
  may contact. Expressed in Playwright rather than Lighthouse: `@lhci/cli` pulls
  a high-severity advisory into a repository whose CI fails on high.
- **The type faces are served from this origin.** They arrived through a
  render-blocking `@import` of a third-party host, so the product painted
  nothing at all behind a proxy that dropped the request.

- 95% mean intervals, Welch group/file comparisons with explicit unadjusted
  exploratory caveats, categorical chi-square with Cramér's V, two-sample KS
  distribution shifts, and robust candidate level-shift detection.
- Evidence provenance drill-downs with formulas, inclusion/exclusion accounting,
  and bounded source-row excerpts.
- Two-file baseline/current comparison mode with schema and quality deltas.
- Structural inference at ingest: the header located by span against the data
  block, preamble and aggregate rows excluded from every statistic, aggregates
  found by label *and* by column-wise arithmetic so unlabelled totals are caught
  too. Uncertain readings are declared rather than resolved quietly, everything
  excluded is reported, and both the header row and individual rows are
  correctable.
- The visualization layer over the computed aggregates: a chart for every
  column with a full-file aggregate (histogram, frequency or trend), the
  paired observations behind each correlation drawn as a scatter or density
  grid, an at-a-glance correlation matrix, numeric spread strips, per-column
  completeness tracks, a health-score ring — and PNG export of any chart.
  Charts build lazily as they approach the viewport and take their colours
  from the design tokens.
- Transposed-sheet declaration. When magnitudes agree within each row and span
  orders of magnitude within each column — the condition under which a column
  mean averages unrelated measures — the reading is reported `uncertain` with
  a warning naming what would go wrong, instead of `none`.

## Next — strengthening the evidence

- **Structural shapes still out of scope**, with what each currently does when
  run through the real parser:

  | Shape | What happens today | Reported as |
  |---|---|---|
  | Multi-row merged header | Group row excluded as preamble, real header found; the `Q1`/`Q2` grouping is lost to `Units`/`Units_1` | `uncertain` — degrades safely |
  | Two tables in one sheet | The second header is detected and excluded; the rows under it are still counted with the first table's | `uncertain`, naming the row where the second table starts |
  | Transposed sheet | Declared when the scale signature betrays it (magnitudes agree within rows, span orders of magnitude within columns); a same-scale transposition still reads as the ordinary table it is statistically indistinguishable from | `uncertain`, saying what a column mean would average |
  | Grouped/hierarchical subtotals | Each subtotal row is judged on its own; nesting is not modelled | varies |
  | Non-English total labels | Not matched by label; caught only when the arithmetic gives them away | varies |

  No shape reads silently wrong anymore: everything either degrades safely or
  declares itself. Full support for a transposed sheet (re-reading it the
  right way up) remains larger work and remains not attempted — rewriting the
  grid would be a guess about what the sheet means.

  Splitting two tables into two analyses is deliberately not attempted: deciding
  which table the user meant would be a guess. Detecting that a second one is
  present, and saying so, is not.

## Next — the product surface

- **Column drill-down** — the full distribution and outlier list for one field.
- **Saved comparison alerts** — rerun a baseline/current comparison on a
  schedule and notify only when a governed threshold is crossed.

## Considered and declined

- **Natural-language querying of the data.** It would put arithmetic back in
  the model's hands. Follow-up questions stay grounded in computed context.
- **Model-generated statistics of any kind**, including "estimated" values.
- **Accounts and multi-user workspaces.** The product is deliberately
  session-scoped and anonymous; accounts would force a durable identity store.
- **Storing uploads.** Files stay in memory. Only an explicitly saved analysis
  *result* is persisted, never the source file.

## Operational

- Screenshot regeneration in CI so README images cannot drift from the UI.
